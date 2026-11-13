-- Draft schema for review. Create the committed migration with `supabase migration new`.
-- All visitor credentials and quotas are server-only. No Supabase Auth accounts required.
begin;

create table public.site_visitors (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_seed text not null,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.site_messages (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.site_visitors(id),
  request_id uuid not null,
  parent_id uuid references public.site_messages(id) on delete cascade,
  reply_to_id uuid references public.site_messages(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_seed text not null,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  check (parent_id is distinct from id),
  check (reply_to_id is distinct from id),
  check (parent_id is not null or reply_to_id is null),
  unique (visitor_id, request_id)
);
create index site_messages_roots on public.site_messages(created_at desc, id desc) where parent_id is null and visible;
create index site_messages_replies on public.site_messages(parent_id, created_at, id) where parent_id is not null and visible;
create index site_messages_reply_to on public.site_messages(reply_to_id) where reply_to_id is not null;
create index site_messages_visitor on public.site_messages(visitor_id, created_at desc);

create table public.site_rate_limits (
  bucket_key text not null,
  bucket_start timestamptz not null,
  hits integer not null default 1 check (hits > 0),
  primary key (bucket_key, bucket_start)
);
create index site_rate_limits_cleanup on public.site_rate_limits(bucket_start);

create table public.site_ai_requests (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.site_visitors(id),
  reserved_tokens integer not null check (reserved_tokens between 1 and 250000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 minutes'),
  finished_at timestamptz
);
create index site_ai_requests_daily on public.site_ai_requests(created_at);
create index site_ai_requests_visitor on public.site_ai_requests(visitor_id, created_at desc);
create index site_ai_requests_active on public.site_ai_requests(expires_at) where finished_at is null;

alter table public.site_visitors enable row level security;
alter table public.site_messages enable row level security;
alter table public.site_rate_limits enable row level security;
alter table public.site_ai_requests enable row level security;
revoke all on public.site_visitors, public.site_messages, public.site_rate_limits, public.site_ai_requests from public, anon, authenticated;
grant all on public.site_visitors, public.site_messages, public.site_rate_limits, public.site_ai_requests to service_role;
-- Public data access only. Visitors never receive credential hashes or quota records.
grant select(id, parent_id, reply_to_id, display_name, avatar_seed, content, created_at, visible) on public.site_messages to anon, authenticated;
create policy site_messages_public_read on public.site_messages for select to anon, authenticated using (visible);

create function public.site_validate_message() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.parent_id is not null then
    if not exists(select 1 from public.site_messages where id = new.parent_id and parent_id is null and visible) then
      raise exception 'not-found';
    end if;
    if new.reply_to_id is not null and not exists(
      select 1 from public.site_messages where id = new.reply_to_id and visible
      and (id = new.parent_id or parent_id = new.parent_id)
    ) then raise exception 'invalid'; end if;
  end if;
  return new;
end;
$$;
create trigger site_messages_thread_check before insert or update of parent_id, reply_to_id
on public.site_messages for each row execute function public.site_validate_message();

create function public.site_consume_limit(p_key text, p_window_seconds integer, p_limit integer) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_start timestamptz; v_hits integer;
begin
  if char_length(p_key) > 200 or p_window_seconds not between 1 and 86400 or p_limit not between 1 and 100000 then
    raise exception 'invalid';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.site_rate_limits(bucket_key, bucket_start, hits) values(p_key, v_start, 1)
  on conflict (bucket_key, bucket_start) do update set hits = public.site_rate_limits.hits + 1
    where public.site_rate_limits.hits < p_limit
  returning hits into v_hits;
  return v_hits is not null;
end;
$$;

create function public.site_register_visitor(p_token_hash text, p_request_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_name text;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_request_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid'; end if;
  if not public.site_consume_limit('visitor:ip:' || p_request_hash, 3600, 10)
     or not public.site_consume_limit('visitor:global', 86400, 500) then raise exception 'rate-limit'; end if;
  v_name := '访客-' || left(replace(v_id::text, '-', ''), 8);
  insert into public.site_visitors(id, token_hash, display_name, avatar_seed) values(v_id, p_token_hash, v_name, v_id::text);
  delete from public.site_rate_limits where bucket_start < now() - interval '2 days';
  return jsonb_build_object('id', v_id, 'displayName', v_name, 'avatarSeed', v_id::text);
end;
$$;

create function public.site_message_json(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'content', m.content, 'displayName', m.display_name, 'avatarSeed', m.avatar_seed,
    'createdAt', m.created_at, 'parentId', m.parent_id, 'replyToId', m.reply_to_id,
    'replyToDisplayName', target.display_name,
    'replyCount', (select count(*) from public.site_messages reply where reply.parent_id = m.id and reply.visible)
  ) from public.site_messages m left join public.site_messages target on target.id = m.reply_to_id and target.visible
  where m.id = p_id and m.visible;
$$;

create function public.site_list_messages(
  p_parent_id uuid default null, p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 21
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if p_limit not between 1 and 21 or (p_cursor_at is null) <> (p_cursor_id is null) then raise exception 'invalid'; end if;
  if p_parent_id is not null and not exists(select 1 from public.site_messages where id = p_parent_id and parent_id is null and visible) then
    raise exception 'not-found';
  end if;
  select coalesce(jsonb_agg(public.site_message_json(ordered.id) order by ordered.position), '[]'::jsonb) into v_result
  from (
    select id, row_number() over (
      order by case when p_parent_id is null then created_at end desc,
        case when p_parent_id is null then id end desc,
        case when p_parent_id is not null then created_at end asc,
        case when p_parent_id is not null then id end asc
    ) as position
    from public.site_messages
    where visible and parent_id is not distinct from p_parent_id
      and (p_cursor_at is null or
        (p_parent_id is null and (created_at, id) < (p_cursor_at, p_cursor_id)) or
        (p_parent_id is not null and (created_at, id) > (p_cursor_at, p_cursor_id)))
    order by case when p_parent_id is null then created_at end desc,
      case when p_parent_id is null then id end desc,
      case when p_parent_id is not null then created_at end asc,
      case when p_parent_id is not null then id end asc
    limit p_limit
  ) ordered;
  return v_result;
end;
$$;

create function public.site_post_message(p_token_hash text, p_request_hash text, p_content text, p_parent_id uuid default null, p_reply_to_id uuid default null, p_request_id uuid default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_visitor public.site_visitors; v_existing public.site_messages; v_id uuid;
begin
  if p_request_id is null or p_content is null or p_request_hash is null
    or p_request_hash !~ '^[a-f0-9]{64}$' or char_length(btrim(p_content)) not between 1 and 1000 then raise exception 'invalid'; end if;
  select * into v_visitor from public.site_visitors where token_hash = p_token_hash;
  if not found then raise exception 'visitor'; end if;
  if v_visitor.blocked then raise exception 'blocked'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mingze-site-post:' || v_visitor.id::text, 0));
  select * into v_existing from public.site_messages where visitor_id = v_visitor.id and request_id = p_request_id;
  if found then
    if v_existing.content is distinct from btrim(p_content)
      or v_existing.parent_id is distinct from p_parent_id
      or v_existing.reply_to_id is distinct from coalesce(p_reply_to_id, p_parent_id) then raise exception 'conflict'; end if;
    if not v_existing.visible then raise exception 'not-found'; end if;
    return public.site_message_json(v_existing.id);
  end if;
  if not public.site_consume_limit('post:visitor:' || v_visitor.id::text, 10, 1)
    or not public.site_consume_limit('post:visitor:day:' || v_visitor.id::text, 86400, 30)
    or not public.site_consume_limit('post:ip:' || p_request_hash, 3600, 60)
    or not public.site_consume_limit('post:global', 86400, 1000) then raise exception 'rate-limit'; end if;
  insert into public.site_messages(visitor_id, request_id, parent_id, reply_to_id, display_name, avatar_seed, content)
    values(v_visitor.id, p_request_id, p_parent_id, coalesce(p_reply_to_id, p_parent_id), v_visitor.display_name, v_visitor.avatar_seed, btrim(p_content))
    returning id into v_id;
  return public.site_message_json(v_id);
end;
$$;

create function public.site_reserve_ai_request(
  p_token_hash text, p_request_hash text, p_reserved_tokens integer,
  p_daily_requests integer default 50, p_daily_tokens integer default 500000
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_visitor uuid; v_blocked boolean; v_id uuid; v_day timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_count bigint; v_budget bigint;
begin
  if p_request_hash !~ '^[a-f0-9]{64}$' or p_reserved_tokens not between 1 and 250000
    or p_daily_requests not between 1 and 500 or p_daily_tokens not between 1 and 2000000 then raise exception 'invalid'; end if;
  select id, blocked into v_visitor, v_blocked from public.site_visitors where token_hash = p_token_hash;
  if not found then raise exception 'visitor'; end if;
  if v_blocked then raise exception 'blocked'; end if;
  -- A single transaction serializes budget reservations across Edge Function instances.
  perform pg_advisory_xact_lock(hashtextextended('mingze-site-ai-budget', 0));
  select count(*), coalesce(sum(reserved_tokens), 0) into v_count, v_budget from public.site_ai_requests where created_at >= v_day;
  if v_count >= p_daily_requests or v_budget + p_reserved_tokens > p_daily_tokens then raise exception 'daily-limit'; end if;
  if (select count(*) from public.site_ai_requests where finished_at is null and expires_at > now()) >= 3
    or exists(select 1 from public.site_ai_requests where visitor_id = v_visitor and finished_at is null and expires_at > now()) then
    raise exception 'busy';
  end if;
  if not public.site_consume_limit('ai:visitor:' || v_visitor::text, 60, 3)
    or not public.site_consume_limit('ai:visitor:day:' || v_visitor::text, 86400, 15)
    or not public.site_consume_limit('ai:ip:' || p_request_hash, 3600, 30) then raise exception 'rate-limit'; end if;
  insert into public.site_ai_requests(visitor_id, reserved_tokens) values(v_visitor, p_reserved_tokens) returning id into v_id;
  return v_id;
end;
$$;

create function public.site_finish_ai_request(p_id uuid) returns void
language sql security invoker set search_path = '' as $$
  update public.site_ai_requests set finished_at = now() where id = p_id and finished_at is null;
$$;

-- Functions default to PUBLIC EXECUTE; revoke explicitly before committing.
revoke all on function public.site_validate_message() from public, anon, authenticated;
revoke all on function public.site_consume_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.site_register_visitor(text, text) from public, anon, authenticated;
revoke all on function public.site_message_json(uuid) from public, anon, authenticated;
revoke all on function public.site_list_messages(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.site_post_message(text, text, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.site_reserve_ai_request(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.site_finish_ai_request(uuid) from public, anon, authenticated;
grant execute on function public.site_validate_message(), public.site_consume_limit(text, integer, integer),
  public.site_register_visitor(text, text), public.site_message_json(uuid), public.site_list_messages(uuid, timestamptz, uuid, integer),
  public.site_post_message(text, text, text, uuid, uuid, uuid), public.site_reserve_ai_request(text, text, integer, integer, integer),
  public.site_finish_ai_request(uuid) to service_role;
grant execute on function public.site_message_json(uuid), public.site_list_messages(uuid, timestamptz, uuid, integer) to anon, authenticated;

commit;
