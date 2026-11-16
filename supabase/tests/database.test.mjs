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

const migrationUrl = new URL('../migrations/20261116124243_ai_ip_rolling_day_limit.sql', import.meta.url);
for (const install of ['fresh schema', 'upgrade migration']) {
  test(`AI rolling source quota (${install})`, async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;');
    await db.exec(readFileSync(new URL(install === 'fresh schema'
      ? '../schema.sql' : '../migrations/20261113074939_personal_site_guestbook.sql', import.meta.url), 'utf8'));
    const visitors = Array.from({ length: 8 }, (_, i) => ({ id: crypto.randomUUID(), hash: (i + 1).toString(16).repeat(64) }));
    for (const visitor of visitors) await db.query(
      'insert into public.site_visitors(id,token_hash,display_name,avatar_seed) values($1::uuid,$2,$3,$1::text)',
      [visitor.id, visitor.hash, 'Test visitor']);
    if (install === 'upgrade migration') {
      const legacyId = crypto.randomUUID();
      await db.query('insert into public.site_ai_requests(id,visitor_id,reserved_tokens,finished_at) values($1,$2,1234,now())', [legacyId, visitors[0].id]);
      await db.exec(readFileSync(migrationUrl, 'utf8'));
      const preserved = (await db.query('select request_hash,reserved_tokens from public.site_ai_requests where id=$1', [legacyId])).rows[0];
      assert.deepEqual(preserved, { request_hash: null, reserved_tokens: 1234 });
    }
    await db.exec('set role service_role');
    const ipA = 'a'.repeat(64), ipB = 'b'.repeat(64);
    const run = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args)).rows[0].value;
    const reserve = (visitor = 0, hash = ipA, requests = 50) => run('site_reserve_ai_request', [visitors[visitor].hash, hash, 100, requests, 500000]);
    const finish = id => run('site_finish_ai_request', [id]);
    const reset = () => db.exec('delete from public.site_messages; delete from public.site_ai_requests; delete from public.site_rate_limits;');
    const counts = async () => (await db.query(`select
      (select count(*)::integer from public.site_ai_requests) as reservations,
      (select coalesce(sum(hits),0)::integer from public.site_rate_limits) as rate_hits`)).rows[0];
    // SQL fragments below are fixed test fixtures, never external input.
    const seed = (count, hash = ipA, time = "now() - interval '1 hour'", finished = true) => db.query(
      `insert into public.site_ai_requests(visitor_id,request_hash,reserved_tokens,created_at,expires_at,finished_at)
       select $1,$2,100,${time},now() - interval '1 minute',${finished ? 'now()' : 'null'} from generate_series(1,$3::integer)`,
      [visitors[0].id, hash, count]);

    await t.test('five attempts are shared by different visitors; another source keeps its own allowance', async () => {
      await reset();
      for (let i = 0; i < 5; i++) await finish(await reserve(i));
      const before = await counts();
      await assert.rejects(() => reserve(5), /ip-limit/);
      assert.deepEqual(await counts(), before, 'rejection must not reserve or spend a rate-limit slot');
      await finish(await reserve(5, ipB));
      assert.equal((await counts()).reservations, 6);
      const groups = (await db.query('select request_hash,count(*)::integer as count from public.site_ai_requests group by request_hash order by request_hash')).rows;
      assert.deepEqual(groups, [{ request_hash: ipA, count: 5 }, { request_hash: ipB, count: 1 }]);
    });

    await t.test('finished failures and expired leases still consume source quota', async () => {
      await reset();
      await seed(3); // Successful and failed upstream attempts both become finished reservations.
      await seed(2, ipA, "now() - interval '1 hour'", false); // Worker exit before finish; leases have expired.
      await assert.rejects(() => reserve(1), /ip-limit/);
      for (const row of (await db.query('select id from public.site_ai_requests')).rows) await finish(row.id);
      await assert.rejects(() => reserve(2), /ip-limit/);
      assert.equal((await counts()).reservations, 5);
    });

    await t.test('the exact rolling 24-hour boundary expires, while a record just inside remains counted', async () => {
      await reset();
      await db.exec('begin'); // Freeze PostgreSQL now() to test exact rather than approximate boundaries.
      try {
        await seed(4);
        await seed(1, ipA, "now() - interval '24 hours'");
        await seed(1, ipA, "now() - interval '24 hours 1 millisecond'");
        await finish(await reserve(1));
        assert.equal((await db.query("select count(*)::integer as count from public.site_ai_requests where request_hash=$1 and created_at > now()-interval '24 hours'", [ipA])).rows[0].count, 5);
        await db.exec('commit');
      } catch (error) { await db.exec('rollback'); throw error; }
      await assert.rejects(() => reserve(2), /ip-limit/);
      await reset();
      await db.exec('begin');
      try {
        await seed(4);
        await seed(1, ipA, "now() - interval '24 hours' + interval '1 millisecond'");
        await assert.rejects(() => reserve(1), /ip-limit/);
      } finally { await db.exec('rollback'); }
    });

    await t.test('crossing UTC midnight does not restore the rolling allowance', async () => {
      await reset();
      await seed(5, ipA, "(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') - interval '1 millisecond'");
      assert.equal((await db.query("select count(*)::integer as count from public.site_ai_requests where created_at < date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'")).rows[0].count, 5);
      await assert.rejects(() => reserve(1), /ip-limit/);
    });

    await t.test('null and malformed arguments cannot bypass source or global limits', async () => {
      await reset();
      const valid = [visitors[0].hash, ipA, 100, 50, 500000];
      for (let i = 0; i < valid.length; i++) {
        const invalid = [...valid]; invalid[i] = null;
        await assert.rejects(() => run('site_reserve_ai_request', invalid), /invalid/);
      }
      for (const hash of ['', '192.0.2.1', 'A'.repeat(64), 'a'.repeat(63)]) await assert.rejects(() => reserve(0, hash), /invalid/);
      assert.deepEqual(await counts(), { reservations: 0, rate_hits: 0 });
      await assert.rejects(() => seed(1, '192.0.2.1'), /check constraint/);
    });

    await t.test('legacy rows remain in global budgets but do not receive an invented source identity', async () => {
      await reset();
      await seed(5, null, 'now()');
      await assert.rejects(() => reserve(0, ipA, 5), /daily-limit/);
      await finish(await reserve(0));
      assert.equal((await counts()).reservations, 6);
      assert.equal((await db.query('select count(*)::integer as count from public.site_ai_requests where request_hash is null')).rows[0].count, 5);
    });

    await t.test('guestbook posts and replies do not consume AI reservations', async () => {
      await reset();
      let root;
      for (let i = 0; i < 6; i++) {
        const message = await run('site_post_message', [visitors[i].hash, ipA, 'Test message', root?.id ?? null, null, crypto.randomUUID()]);
        root ??= message;
      }
      assert.equal((await counts()).reservations, 0);
      for (let i = 0; i < 5; i++) await finish(await reserve(i));
      await assert.rejects(() => reserve(5), /ip-limit/);
    });

    await t.test('queued submissions cannot take a sixth slot and the global active-lease cap remains three', async () => {
      await reset();
      await seed(4);
      // PGlite serializes one connection: this checks queued outcomes, not real cross-connection locking.
      const finalSlot = await Promise.allSettled([reserve(1), reserve(2)]);
      assert.equal(finalSlot.filter(result => result.status === 'fulfilled').length, 1);
      assert.match(finalSlot.find(result => result.status === 'rejected').reason.message, /ip-limit/);
      assert.equal((await counts()).reservations, 5);
      await reset();
      const leases = await Promise.allSettled([reserve(0), reserve(1), reserve(2), reserve(3)]);
      assert.equal(leases.filter(result => result.status === 'fulfilled').length, 3);
      assert.match(leases.find(result => result.status === 'rejected').reason.message, /busy/);
      for (const result of leases.filter(result => result.status === 'fulfilled')) await finish(result.value);
      await finish(await reserve(4));
      await finish(await reserve(5));
      await assert.rejects(() => reserve(6), /ip-limit/);
    });

    await t.test('reservation RPC and source digests remain inaccessible to both public client roles', async () => {
      await reset();
      await finish(await reserve(0));
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(() => reserve(1), /permission denied/);
        await assert.rejects(() => db.query('select request_hash from public.site_ai_requests'), /permission denied/);
        await assert.rejects(() => db.query('update public.site_ai_requests set request_hash=null'), /permission denied/);
      }
      await db.exec('set role service_role');
      const indexes = (await db.query("select indexdef from pg_indexes where schemaname='public' and indexname='site_ai_requests_source_window'")).rows;
      assert.equal(indexes.length, 1);
      assert.match(indexes[0].indexdef, /\(request_hash, created_at\)/);
    });
  });
}
