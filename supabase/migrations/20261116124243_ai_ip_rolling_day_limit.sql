-- Keep existing reservations intact; their source cannot be reconstructed.
-- The digest is salted in the Edge Function. No raw IP is persisted.
begin;

alter table public.site_ai_requests
  add column request_hash text check (request_hash is null or request_hash ~ '^[a-f0-9]{64}$');
create index site_ai_requests_source_window on public.site_ai_requests(request_hash, created_at);

create or replace function public.site_reserve_ai_request(
  p_token_hash text, p_request_hash text, p_reserved_tokens integer,
  p_daily_requests integer default 50, p_daily_tokens integer default 500000
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_visitor uuid; v_blocked boolean; v_id uuid; v_day timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_count bigint; v_budget bigint;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_reserved_tokens is null or p_reserved_tokens not between 1 and 250000
    or p_daily_requests is null or p_daily_requests not between 1 and 500
    or p_daily_tokens is null or p_daily_tokens not between 1 and 2000000 then raise exception 'invalid'; end if;
  select id, blocked into v_visitor, v_blocked from public.site_visitors where token_hash = p_token_hash;
  if not found then raise exception 'visitor'; end if;
  if v_blocked then raise exception 'blocked'; end if;
  -- A single transaction serializes budget reservations across Edge Function instances.
  perform pg_advisory_xact_lock(hashtextextended('mingze-site-ai-budget', 0));
  -- Count all upstream attempts, including finished/failed/expired requests. A new
  -- visitor identity does not reset the same source's rolling 24-hour allowance.
  if (select count(*) from public.site_ai_requests
      where request_hash = p_request_hash and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'ip-limit';
  end if;
  select count(*), coalesce(sum(reserved_tokens), 0) into v_count, v_budget from public.site_ai_requests where created_at >= v_day;
  if v_count >= p_daily_requests or v_budget + p_reserved_tokens > p_daily_tokens then raise exception 'daily-limit'; end if;
  if (select count(*) from public.site_ai_requests where finished_at is null and expires_at > now()) >= 3
    or exists(select 1 from public.site_ai_requests where visitor_id = v_visitor and finished_at is null and expires_at > now()) then
    raise exception 'busy';
  end if;
  if not public.site_consume_limit('ai:visitor:' || v_visitor::text, 60, 3)
    or not public.site_consume_limit('ai:visitor:day:' || v_visitor::text, 86400, 15)
    or not public.site_consume_limit('ai:ip:' || p_request_hash, 3600, 30) then raise exception 'rate-limit'; end if;
  insert into public.site_ai_requests(visitor_id, request_hash, reserved_tokens)
    values(v_visitor, p_request_hash, p_reserved_tokens) returning id into v_id;
  return v_id;
end;
$$;

-- Preserve the existing server-only reservation API after replacing its body.
revoke all on function public.site_reserve_ai_request(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.site_reserve_ai_request(text, text, integer, integer, integer) to service_role;

commit;
