# M.GAO · 高铭泽的个人网站

以蓝色 ASCII 海洋为背景的个人网站：和铭泽的 AI 代表聊天、浏览个人简介与 Token 活动、在留言板留下消息并回复其他访客。无需注册账号。

发布目标：[mingegaard.github.io/mingze-personal-site](https://mingegaard.github.io/mingze-personal-site/)。

## 目录与数据

| 目录 | 内容 |
| --- | --- |
| `public-site/` | 独立 React / Vite 网站入口、侧栏和语言／外观设置 |
| `personal-ocean/src/` | 共用聊天、项目、简介、留言板、磨砂样式与波纹组件 |
| `personal-ocean/prompts/mingze.txt` | 个人 AI 的资料与行为设定 |
| `ascii-sharks/src/` | ASCII 鲨鱼与鱼群动画 |
| `supabase/` | 数据库结构、匿名留言和 AI 聊天的 Edge Functions |

GitHub Pages 托管静态页面，Supabase 保存留言、回复和匿名访客标识。首次发言时自动生成访客 ID 与头像；浏览器保存随机身份令牌，数据库只保存令牌摘要。清除浏览器数据会获得新身份。

项目和对话记录保存在当前浏览器中；模型请求经过 Supabase 服务端。网站不需要本地文件夹、Harness 进程或 DeepSeek 登录态。语言、主题和侧栏状态也保存在当前浏览器中。

## 本地开发

使用 Node.js 24 与 npm，在仓库根目录执行：

```sh
cd public-site
cp .env.example .env.local
npm ci
npm run dev
```

在 `.env.local` 填写 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。它们是公开浏览器配置；不要填入模型密钥、Supabase secret key 或 service role key。

开发地址为 `http://127.0.0.1:4173`。云端 `ALLOWED_ORIGINS` 需要包含此 Origin 才能从本地访问留言板和模型服务。

```sh
npm run build
npm run preview
```

构建输出在 `public-site/dist/`，预览地址为 `http://127.0.0.1:4174`。Vite 使用相对资源路径；简介和留言板采用 hash 路由，适配 GitHub Pages 的仓库子目录。

## GitHub Pages 发布

仓库为 `Mingegaard/mingze-personal-site`，工作流位于 `.github/workflows/pages.yml`。

1. 在仓库 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。
2. 在 **Settings → Secrets and variables → Actions → Variables** 中配置两个 Repository variables：

   | 变量 | 内容 |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Supabase 项目的 HTTPS URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | 同一项目的 publishable key |

3. 将网站改动推送到 `main`，或在 Actions 中手动运行 **Deploy personal website to GitHub Pages**。

工作流使用锁文件执行 `npm ci` 和 `npm run build`，仅上传 `public-site/dist/`。构建作业只读源码，发布作业通过 `github-pages` 环境获得 Pages 与 OIDC 权限。无需在仓库保存个人 GitHub token。

修改 Repository variables 后需要重新运行工作流，公开配置才会进入新的页面产物。模型密钥与其他服务器秘密只保存在 Supabase 中。

该流程依据 [GitHub Pages 自定义工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)，使用官方 [checkout](https://github.com/actions/checkout)、[setup-node](https://github.com/actions/setup-node)、configure-pages、upload-pages-artifact 与 deploy-pages Actions。

## Supabase 配置与维护

数据库与函数的详细部署说明见 [supabase/README.md](supabase/README.md)。应先部署数据库与 `guestbook`、`personal-chat` 函数，再发布依赖这些服务的页面。

函数配置使用 Supabase 的服务端 secrets：

| 名称 | 用途 |
| --- | --- |
| `ALLOWED_ORIGINS` | 允许访问的网页 Origin；线上为 `https://mingegaard.github.io`，不要加仓库路径 |
| `REQUEST_HASH_SALT` | 至少 32 字符的随机秘密，用于请求来源摘要 |
| `PERSONAL_MAAS_API_KEY` | 模型网关密钥，只存服务端 |
| `AI_DAILY_REQUEST_LIMIT` | 全站每日模型请求上限 |
| `AI_DAILY_TOKEN_LIMIT` | 全站每日保守 Token 预算 |

平台自动注入 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。留言写入和模型调用校验匿名访客令牌；没有开放匿名客户端直接写表。系统包含访客、来源和全站限流以及模型预算限制，具体数值和错误行为见服务说明。

个人 AI 资料更新后，在仓库根目录运行：

```sh
node supabase/sync-prompt.mjs
```

然后重新部署 `personal-chat` 函数。前端发布工作流不会自动修改数据库、函数或服务端秘密。

留言管理可在 Supabase 中将 `site_messages.visible` 设为 `false` 隐藏内容，或将 `site_visitors.blocked` 设为 `true` 禁止该访客继续发言。管理权限不暴露到公开网页。

## 日常修改与检查

- 网站外壳、侧栏、主题与语言：`public-site/src/`。
- 聊天、项目与留言板：`personal-ocean/src/`；保持各语言字典同步。
- 公开 Token 统计：`public-site/public/profile-usage.json`。只提交有意公开的聚合快照；它不连接个人账号，设为 `null` 会显示暂无数据。
- API、权限或限流修改：在 Supabase 部署后验证真实服务，同时保留本地模拟测试。

前端改动完成后运行 `npm run build`。服务端测试从仓库根目录执行：

```sh
npm --prefix supabase/tests ci
npm --prefix supabase/tests test
```

这些测试使用模拟请求与本地数据库，不调用付费模型。发布后检查首页、项目管理、简介、语言／主题切换，以及留言和展开回复。

## 致谢

ASCII 鲨鱼动画基于 [stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks)，保留其 [MIT 许可证](ascii-sharks/LICENSE)。网站交互从原本的 DeepSeek Harness 本地界面逐步改造为独立网页。
