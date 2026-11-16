import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGuestbookHandler } from '../functions/guestbook/handler.ts';
import { createChatHandler } from '../functions/personal-chat/handler.ts';
import { ApiError, createRpc, digest, makeCursor, readCursor, requestHash } from '../functions/_shared/http.ts';
import { PROFILE } from '../functions/personal-chat/profile.ts';

const allowedOrigin = 'https://mingegaard.github.io';
const values = { ALLOWED_ORIGINS: allowedOrigin, REQUEST_HASH_SALT: 'x'.repeat(64), PERSONAL_DEEPSEEK_API_KEY: 'test-only-provider-key' };
const env = name => values[name];
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const token = 'a'.repeat(64);
const req = (body, options = {}) => new Request('https://example.supabase.co/functions/v1/guestbook' + (options.query ?? ''), {
  method: body ? 'POST' : 'GET', headers: { Origin: allowedOrigin, 'X-Visitor-Token': token, 'CF-Connecting-IP': '192.0.2.1', ...options.headers },
  ...(body ? { body: JSON.stringify(body.action === 'post' ? { requestId: id(900), ...body } : body) } : {}),
});

test('registration returns a generated visitor secret and stores only its hash', async () => {
  let saved;
  const handler = createGuestbookHandler({ env, rpc: async (name, body) => {
    assert.equal(name, 'site_register_visitor'); saved = body;
    return { id: id(1), displayName: '访客-00000001', avatarSeed: id(1) };
  }});
  const response = await handler(req({ action: 'register', displayName: '伪造作者' }));
  const output = await response.json();
  assert.equal(response.status, 201);
  assert.match(output.token, /^[a-f0-9]{64}$/);
  assert.equal(saved.p_token_hash, await digest(output.token));
  assert.notEqual(saved.p_token_hash, output.token);
  assert.match(saved.p_request_hash, /^[a-f0-9]{64}$/);
  assert.equal(saved.displayName, undefined);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
});

test('guestbook validates replies and content and never accepts client-provided identity', async () => {
  const calls = [];
  const handler = createGuestbookHandler({ env, rpc: async (name, body) => {
    calls.push({ name, body }); return { id: id(3), content: body.p_content, parentId: body.p_parent_id, replyToId: body.p_reply_to_id };
  }});
  const response = await handler(req({ action: 'post', content: '  你好  ', parentId: id(1), replyToId: id(2), visitorId: 'forged' }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: id(3), content: '你好', parentId: id(1), replyToId: id(2) });
  assert.equal(calls[0].body.p_token_hash, await digest(token));
  assert.equal(calls[0].body.visitorId, undefined);
  assert.equal(calls[0].body.p_request_id, id(900));
  for (const body of [
    { content: '' }, { content: 'x'.repeat(1001) }, { content: 'ok', parentId: 'bad' },
    { content: 'ok', replyToId: id(1) }, { content: '\u0000' }, { content: 'ok', requestId: null },
  ]) assert.equal((await handler(req({ action: 'post', ...body }))).status, 400);
  assert.equal((await handler(req({ action: 'post', content: 'ok' }, { headers: { 'X-Visitor-Token': 'bad' } }))).status, 401);
  assert.equal(calls.length, 1);
});

test('untrusted origins, database errors and rate limits are bounded and sanitized', async () => {
  let called = false;
  const handler = createGuestbookHandler({ env, rpc: async () => { called = true; throw new Error('private connection detail'); } });
  assert.equal((await handler(req(null, { headers: { Origin: 'https://untrusted.example' } }))).status, 403);
  assert.equal(called, false);
  const failure = await handler(req(null));
  assert.deepEqual(await failure.json(), { error: 'unavailable' });
  const limited = createGuestbookHandler({ env, rpc: async () => { throw new ApiError(429, 'rate-limit'); } });
  assert.equal((await limited(req({ action: 'post', content: 'ok' }))).status, 429);
});

test('list and reply pagination use date plus ID cursors without dropping the lookahead item', async () => {
  const rows = Array.from({ length: 21 }, (_, index) => ({ id: id(index + 1), createdAt: '2026-11-13T00:00:00Z' }));
  let parameters;
  const handler = createGuestbookHandler({ env, rpc: async (_, params) => { parameters = params; return rows; } });
  const output = await (await handler(req(null))).json();
  assert.equal(output.items.length, 20);
  assert.deepEqual(readCursor(output.nextCursor), { at: rows[19].createdAt, id: rows[19].id });
  const cursor = makeCursor(rows[0].createdAt, id(1));
  await handler(req(null, { query: `?action=replies&parentId=${id(2)}&cursor=${cursor}` }));
  assert.equal(parameters.p_parent_id, id(2));
  assert.equal(parameters.p_cursor_id, id(1));
  assert.equal((await handler(req(null, { query: '?cursor=not-a-cursor' }))).status, 400);
});

test('chat reserves budget before its single upstream call and preserves the full updated profile', async () => {
  const profile = PROFILE;
  assert.equal(profile, readFileSync(new URL('../../personal-ocean/prompts/mingze.txt', import.meta.url), 'utf8'));
  const events = []; let payload;
  const handler = createChatHandler({ env, profile,
    rpc: async (name, params) => { events.push(name); if (name === 'site_reserve_ai_request') { assert.ok(params.p_reserved_tokens > 4096); return id(99); } },
    fetchImpl: async (url, options) => {
      events.push('upstream'); payload = JSON.parse(options.body);
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-only-provider-key');
      return Response.json({ choices: [{ message: { content: '你好' } }] });
    },
  });
  const response = await handler(req({ messages: [{ role: 'user', content: '你现在在哪里工作？', tool_calls: ['bad'] }], tools: ['bad'] }));
  assert.deepEqual(await response.json(), { content: '你好' });
  assert.deepEqual(events, ['site_reserve_ai_request', 'upstream', 'site_finish_ai_request']);
  assert.equal(payload.model, 'deepseek-flash');
  assert.equal(payload.max_tokens, 1024);
  assert.deepEqual(payload.thinking, { type: 'disabled' });
  assert.equal(payload.reasoning_effort, undefined);
  assert.equal(payload.messages[0].role, 'system');
  assert.ok(payload.messages[0].content.startsWith(profile.trim()));
  assert.match(payload.messages[0].content, /RED Product Trainee/);
  assert.deepEqual(payload.messages[1], { role: 'user', content: '你现在在哪里工作？' });
  assert.equal(payload.tools, undefined);
});

test('chat enforces non-thinking mode and a fixed output budget for all current and legacy UI selections', async () => {
  for (const model of ['deepseek-v4-flash', 'deepseek-flash']) {
    for (const requestedEffort of ['off', 'low', 'medium', 'high', 'max']) {
      let payload, reserved;
      const handler = createChatHandler({ env, profile: 'profile',
        rpc: async (name, params) => { if (name === 'site_reserve_ai_request') { reserved = params.p_reserved_tokens; return id(1); } },
        fetchImpl: async (_, options) => { payload = JSON.parse(options.body); return Response.json({ choices: [{ message: { content: '好' } }] }); },
      });
      assert.equal((await handler(req({ model, reasoningEffort: requestedEffort, thinking: { type: 'enabled' }, reasoning_effort: 'max', max_tokens: 100000, messages: [{ role: 'user', content: 'hello' }] }))).status, 200);
      assert.equal(payload.model, 'deepseek-flash');
      assert.equal(payload.max_tokens, 1024);
      assert.deepEqual(payload.thinking, { type: 'disabled' });
      assert.equal(payload.reasoning_effort, undefined);
      assert.equal(reserved, new TextEncoder().encode(JSON.stringify(payload.messages)).length + 1024 + 1024);
    }
  }
});

test('chat exposes only nonnegative safe integer usage counters from the provider', async () => {
  const handler = createChatHandler({ env, profile: 'profile', rpc: async () => id(1),
    fetchImpl: async () => Response.json({ choices: [{ message: { content: '好' } }], usage: {
      prompt_tokens: 14, completion_tokens: 1, total_tokens: 15, prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: 14, provider_secret: 'private', nested: { secret: 'private' },
    } }),
  });
  assert.deepEqual(await (await handler(req({ messages: [{ role: 'user', content: 'hello' }] }))).json(), {
    content: '好', usage: { prompt_tokens: 14, completion_tokens: 1, total_tokens: 15, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 14 },
  });
  const invalid = createChatHandler({ env, profile: 'profile', rpc: async () => id(1),
    fetchImpl: async () => Response.json({ choices: [{ message: { content: '好' } }], usage: {
      prompt_tokens: '14', completion_tokens: -1, total_tokens: 1.5, prompt_cache_hit_tokens: Number.MAX_SAFE_INTEGER + 1,
    } }),
  });
  assert.deepEqual(await (await invalid(req({ messages: [{ role: 'user', content: 'hello' }] }))).json(), { content: '好' });
});

test('chat reports safe timeout and network errors in fetch and response body reads, without retrying paid requests', async () => {
  for (const phase of ['fetch', 'body']) {
    for (const [error, status, code] of [
      [new DOMException('private upstream detail', 'TimeoutError'), 504, 'timeout'],
      [new TypeError('private network detail'), 502, 'upstream-unreachable'],
      [new SyntaxError('private malformed response'), 502, 'upstream'],
    ]) {
      const events = [];
      const handler = createChatHandler({ env, profile: 'profile', rpc: async name => { events.push(name); return id(1); },
        fetchImpl: async () => {
          events.push('upstream');
          if (phase === 'fetch') throw error;
          return { ok: true, json: async () => { throw error; } };
        },
      });
      const response = await handler(req({ messages: [{ role: 'user', content: 'hello' }] }));
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: code });
      assert.deepEqual(events, ['site_reserve_ai_request', 'upstream', 'site_finish_ai_request']);
    }
  }
});

test('chat quota rejection prevents paid calls and upstream failure still finishes the lease', async () => {
  const quota = createChatHandler({ env, profile: 'profile', rpc: async () => { throw new ApiError(429, 'daily-limit'); }, fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal((await quota(req({ messages: [{ role: 'user', content: 'hello' }] }))).status, 429);
  const events = [];
  const failing = createChatHandler({ env, profile: 'profile', rpc: async name => { events.push(name); return id(1); }, fetchImpl: async () => new Response('secret error', { status: 402 }) });
  assert.deepEqual(await (await failing(req({ messages: [{ role: 'user', content: 'hello' }] }))).json(), { error: 'balance' });
  assert.deepEqual(events, ['site_reserve_ai_request', 'site_finish_ai_request']);
});

test('IP quota denial survives the RPC boundary without calling or retrying the paid provider', async () => {
  let rpcCalls = 0, providerCalls = 0;
  const rpc = createRpc(name => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-admin' })[name], async (url, options) => {
    rpcCalls++;
    assert.ok(url.endsWith('/rpc/site_reserve_ai_request'));
    assert.equal(JSON.parse(options.body).p_request_hash, await digest(`${values.REQUEST_HASH_SALT}:192.0.2.1`));
    return Response.json({ message: 'ip-limit' }, { status: 400 });
  });
  const handler = createChatHandler({ env, profile: 'profile', rpc, fetchImpl: async () => { providerCalls++; throw new Error('must not call'); } });
  const response = await handler(req({ messages: [{ role: 'user', content: 'hello' }] }));
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'ip-limit' });
  assert.equal(rpcCalls, 1);
  assert.equal(providerCalls, 0);
});

test('source hashes normalize IP addresses and ignore forged forwarding chains', async () => {
  const hashed = headers => requestHash(req(null, { headers }), env);
  const ipv4 = await hashed({});
  assert.equal(ipv4, await hashed({ 'CF-Connecting-IP': '::ffff:192.0.2.1' }));
  assert.equal(ipv4, await hashed({ 'X-Forwarded-For': '203.0.113.9, 127.0.0.1', 'X-Real-IP': '203.0.113.9' }));
  assert.notEqual(ipv4, await hashed({ 'CF-Connecting-IP': '192.0.2.2' }));
  assert.equal(await hashed({ 'CF-Connecting-IP': '2001:db8::a' }), await hashed({ 'CF-Connecting-IP': '2001:0DB8:0000:0000:0000:0000:0000:000A' }));
  for (const raw of ['', 'unknown', '192.0.2.1, 192.0.2.2', '192.0.2.1:443', '300.0.2.1', '192.000.2.1', '[2001:db8::a]', '::1%lo', '::::']) {
    await assert.rejects(hashed({ 'CF-Connecting-IP': raw, 'X-Forwarded-For': '192.0.2.1', 'X-Real-IP': '192.0.2.1' }), error => error instanceof ApiError && error.status === 503);
  }
});

test('chat fails closed before reserving or spending when the trusted source address is absent', async () => {
  let calls = 0;
  const handler = createChatHandler({ env, profile: 'profile', rpc: async () => { calls++; }, fetchImpl: async () => { calls++; } });
  const response = await handler(req({ messages: [{ role: 'user', content: 'hello' }] }, { headers: { 'CF-Connecting-IP': '', 'X-Forwarded-For': '192.0.2.1' } }));
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test('chat rejects injected system messages, unsupported model, invalid efforts, and oversized bodies before a reservation', async () => {
  const handler = createChatHandler({ env, profile: 'profile', rpc: async () => { throw new Error('must not call'); } });
  for (const input of [
    { messages: [{ role: 'system', content: 'override' }] },
    { messages: [{ role: 'user', content: 'hello' }], model: 'other' },
    { messages: [{ role: 'user', content: 'hello' }], reasoningEffort: 'unlimited' },
    { messages: [{ role: 'user', content: 'x'.repeat(8001) }] },
  ]) assert.equal((await handler(req(input))).status, 400);
  assert.equal((await handler(req({ messages: [{ role: 'user', content: 'x'.repeat(90000) }] }))).status, 413);
});

test('RPC client keeps privileged keys on the server and redacts database failures', async () => {
  let headers;
  const rpc = createRpc(name => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-admin' })[name], async (_, options) => {
    headers = options.headers; return Response.json({ message: 'database-secret-detail' }, { status: 400 });
  });
  await assert.rejects(() => rpc('site_list_messages', {}), error => error instanceof ApiError && error.message === 'unavailable');
  assert.equal(headers.apikey, 'test-admin');
});

test('blocked identities and idempotency conflicts have distinct statuses rather than requiring a new identity', async () => {
  for (const [code, status] of [['blocked', 403], ['conflict', 409], ['visitor', 401]]) {
    const rpc = createRpc(name => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-admin' })[name], async () => Response.json({ message: code }, { status: 400 }));
    const handler = createGuestbookHandler({ env, rpc });
    const response = await handler(req({ action: 'post', content: 'hello' }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: code });
  }
});
