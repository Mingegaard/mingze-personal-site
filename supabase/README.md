# 公共网站服务

`guestbook` 和 `personal-chat` 为 Supabase Edge Functions。公开网页只持有项目 URL 和 publishable key；服务端使用 Supabase 注入的 service role key。Supabase Auth 不创建账号，访客首次发言时得到随机 256-bit 令牌，浏览器保存它；数据库只保存令牌 SHA-256。清除浏览器数据会产生新访客身份。

## 部署配置

- `ALLOWED_ORIGINS`：逗号分隔的完整 Origin，例如 `https://gaomingze.com,https://www.gaomingze.com,http://127.0.0.1:3080`；不要包含 URL 路径。
- `REQUEST_HASH_SALT`：至少 32 字符的随机服务端秘密，用于请求来源摘要。
- `PERSONAL_DEEPSEEK_API_KEY`：DeepSeek 官方 API 密钥，只设置为函数秘密。
- `AI_DAILY_REQUEST_LIMIT`：全站每天最多请求数，默认 50，支持 1–500。
- `AI_DAILY_TOKEN_LIMIT`：每天保守 Token 预算，默认 500000，支持 1–2000000。每次按输入 UTF-8 字节数和输出上限预留，失败也保留预留额度，故不是账单的实际 Token 用量。

`SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY` 由平台注入，不写进仓库。`verify_jwt=false` 是针对自定义匿名访客令牌的端点配置；写入和 AI 请求在处理函数内校验 `X-Visitor-Token`，没有公开的匿名写表权限。CORS 不是鉴权机制；数据库事务负责全站硬限制。源 IP 摘要限流作为额外保护，不替代全站限制。

`schema.sql` 是待迁移的完整 schema。使用当前 CLI 的 `migration new` 生成实际 migration 文件，再放入 SQL。部署前后检查 Supabase advisors；用 SQL / Data API 验证匿名用户不能读 `site_visitors`、`site_rate_limits`、`site_ai_requests` 或写 `site_messages`。所有函数使用 `security invoker` 和固定空 search_path；需要管理员权限的 RPC 只授权 service_role。

## 留言接口

- `GET guestbook?action=list&cursor=<optional>`：根留言倒序，每页 20 条。
- `GET guestbook?action=replies&parentId=<uuid>&cursor=<optional>`：该根留言的回复正序，每页 20 条。
- `POST guestbook {action:"register"}`：`{token,visitor:{id,displayName,avatarSeed}}`。
- `POST guestbook {action:"post",requestId,content,parentId?,replyToId?}`：请求头 `X-Visitor-Token`，返回一条 Comment。requestId 是客户端 UUID，同一次提交的重试保留此值；服务器复用已成功的同一条记录，不再次消耗限流计数。相同 requestId 携带不同内容返回 409 `conflict`。
- Comment：`{id,content,displayName,avatarSeed,createdAt,parentId,replyToId,replyToDisplayName,replyCount}`。
- 列表返回 `{items,nextCursor}`；cursor 含时间戳和 UUID，避免同时间戳分页遗漏。回复只能关联同一根留言，数据库 trigger 再次校验。
- 内容 1–1000 Unicode 字符。访客每 10 秒 1 条、每天 30 条；来源每小时 60 条；全站每天 1000 条。访客注册来源每小时 10 次、全站每天 500 次。

管理员可在数据库将 `site_messages.visible` 设为 false 隐藏留言，将 `site_visitors.blocked` 设为 true 禁止该访客继续发帖或调用模型。不要向前端暴露管理员接口。

失效令牌返回 401 `visitor`；被封禁令牌返回 403 `blocked`，前端不得为后一种情况自动创建新身份。无账号访客仍可手动清除浏览器身份，来源和全站限流保留为额外约束。

## AI 接口

`POST personal-chat` 接收原聊天 `{messages,model,reasoningEffort}`，同时带 `X-Visitor-Token`。调用 DeepSeek 官方 `https://api.deepseek.com/chat/completions`，仅使用 `deepseek-flash`，UI 显示名由前端决定；最多 24 条、总计 50000 字符，仅 user/assistant 文本，服务端插入个人 Prompt。支持 off/low/medium/high/max 五档选择，默认 off，输出最多 1024 Token；显式启用其余四档时最多 4096 Token。根据 [DeepSeek 官方映射](https://api-docs.deepseek.com/guides/thinking_mode/)，medium 在服务端明确转为上游 high；两档实际推理强度相同，界面和保存的偏好仍保留用户选择。旧客户端的 `deepseek-v4-flash` 请求兼容为当前模型并强制关闭推理，避免缓存的高强度配置延续费用。

回复 `{content,usage?}`；`usage` 只包含供应商返回的非负安全整数计数：`prompt_tokens`、`completion_tokens`、`total_tokens`、`prompt_cache_hit_tokens`、`prompt_cache_miss_tokens`。110 秒上游超时返回 `timeout` (504)，网络不可达返回 `upstream-unreachable` (502)，不自动重试付费请求或透传供应商错误详情。

全站最多同时 3 个模型请求，单访客 1 个；每访客每分钟 3 次、每天 15 次；来源每小时 30 次。预留账本与并发租约在一个事务内更新，跨多个 Edge Function 实例共享，不能通过并发绕过；租约 3 分钟自动过期。中止请求不保证上游停止计费，因此仍计入当日预算。

`functions/personal-chat/profile.ts` 是 `personal-ocean/prompts/mingze.txt` 生成的纯源码模块。改变个人 Prompt 后运行 `node supabase/sync-prompt.mjs` 并重新部署函数；无需静态文件打包，兼容 Supabase API 部署。

## 验证

先运行 `npm ci --prefix supabase/tests --ignore-scripts` 安装锁定的测试依赖，再运行 `node --test supabase/tests/backend.test.mjs supabase/tests/database.test.mjs`。HTTP 层测试使用模拟模型请求；数据库测试在本地 PGlite PostgreSQL 中执行完整 schema，验证回复关联、游标分页、幂等重试、匿名 RLS 权限、封禁区分及 AI 预算。测试不连接远程 Supabase、不调用付费模型。

部署后仍需检查 Supabase advisors、实际网关/CORS 配置与跨连接并发，不能以本地验证替代上线检查。
