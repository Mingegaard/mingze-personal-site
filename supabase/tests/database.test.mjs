import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('real PostgreSQL schema: replies, idempotency, RLS, block handling and AI budgets', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;');
  await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const ip = 'f'.repeat(64);
  const hashes = ['1', '2', '3', '4', '5', '6'].map(value => value.repeat(64));
  const run = async (name, arguments_) => (await db.query(`select public.${name}(${arguments_.map((_, i) => '$' + (i + 1)).join(',')}) as value`, arguments_)).rows[0].value;
  const post = (tokenHash, content, parentId = null, replyToId = null, requestId = crypto.randomUUID()) => run('site_post_message', [tokenHash, ip, content, parentId, replyToId, requestId]);
  await db.exec('set role service_role');
  for (const hash of hashes) await run('site_register_visitor', [hash, ip]);
  const requestId = crypto.randomUUID();
  const root = await post(hashes[0], 'First root', null, null, requestId);
  const secondRoot = await post(hashes[1], 'Second root');
  const reply = await post(hashes[2], 'Reply to first', root.id);

  await t.test('thread links stay within their root and include the reply target name', async () => {
    await assert.rejects(() => post(hashes[3], 'Bad thread', root.id, secondRoot.id), /invalid/);
    const nested = await post(hashes[3], 'Reply to reply', root.id, reply.id);
    assert.equal(nested.parentId, root.id);
    assert.equal(nested.replyToId, reply.id);
    assert.equal(nested.replyToDisplayName, reply.displayName);
    const roots = await run('site_list_messages', [null, null, null, 21]);
    assert.equal(roots.length, 2);
    assert.equal(roots.find(row => row.id === root.id).replyCount, 2);
    const replies = await run('site_list_messages', [root.id, null, null, 21]);
    assert.deepEqual(replies.map(row => row.id), [reply.id, nested.id]);
    const after = await run('site_list_messages', [root.id, reply.createdAt, reply.id, 21]);
    assert.deepEqual(after.map(row => row.id), [nested.id]);
  });

  await t.test('same requestId reuses the successful row and does not spend another rate-limit slot', async () => {
    const before = (await db.query('select sum(hits) as hits from public.site_rate_limits')).rows[0].hits;
    const repeat = await post(hashes[0], 'First root', null, null, requestId);
    assert.equal(repeat.id, root.id);
    const after = (await db.query('select sum(hits) as hits from public.site_rate_limits')).rows[0].hits;
    assert.equal(after, before);
    await assert.rejects(() => post(hashes[0], 'Different body', null, null, requestId), /conflict/);
    await assert.rejects(() => post(hashes[0], 'Too soon'), /rate-limit/);
  });

  await t.test('anonymous callers see published content but cannot read identities, accounting, or mutate data', async () => {
    await db.exec('set role anon');
    const roots = await run('site_list_messages', [null, null, null, 21]);
    assert.equal(roots.length, 2);
    assert.equal((await run('site_message_json', [root.id])).id, root.id);
    for (const table of ['site_visitors', 'site_rate_limits', 'site_ai_requests']) {
      await assert.rejects(() => db.query(`select * from public.${table}`), /permission denied/);
    }
    await assert.rejects(() => db.query('select visitor_id from public.site_messages'), /permission denied/);
    await assert.rejects(() => db.query('update public.site_messages set content = $1 where id = $2', ['forged', root.id]), /permission denied/);
    await assert.rejects(() => run('site_register_visitor', ['a'.repeat(64), ip]), /permission denied/);
    await assert.rejects(() => post(hashes[0], 'forged'), /permission denied/);
    await assert.rejects(() => run('site_reserve_ai_request', [hashes[0], ip, 5000, 50, 500000]), /permission denied/);
    await db.exec('reset role');
    await db.query('update public.site_messages set visible = false where id = $1', [secondRoot.id]);
    await db.exec('set role anon');
    assert.equal((await run('site_list_messages', [null, null, null, 21])).length, 1);
    assert.equal(await run('site_message_json', [secondRoot.id]), null);
    await db.exec('set role service_role');
  });

  await t.test('blocked visitors fail with blocked, while missing visitors fail with visitor', async () => {
    await db.query('update public.site_visitors set blocked = true where token_hash = $1', [hashes[4]]);
    await assert.rejects(() => post(hashes[4], 'blocked message'), /blocked/);
    await assert.rejects(() => run('site_reserve_ai_request', [hashes[4], ip, 5000, 50, 500000]), /blocked/);
    await assert.rejects(() => post('0'.repeat(64), 'invalid visitor'), /visitor/);
  });

  await t.test('AI budgets are reserved before calls, concurrent leases are bounded, and finishing does not refund the daily budget', async () => {
    const lease = await run('site_reserve_ai_request', [hashes[5], ip, 5000, 50, 500000]);
    await assert.rejects(() => run('site_reserve_ai_request', [hashes[5], ip, 5000, 50, 500000]), /busy/);
    await run('site_finish_ai_request', [lease]);
    await assert.rejects(() => run('site_reserve_ai_request', [hashes[5], ip, 5000, 1, 500000]), /daily-limit/);
    await assert.rejects(() => run('site_reserve_ai_request', [hashes[5], ip, 5000, 50, 9000]), /daily-limit/);
    const entries = (await db.query('select * from public.site_ai_requests')).rows;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].reserved_tokens, 5000);
    assert.ok(entries[0].finished_at);
  });
});
