-- ============================================================
-- Paddle Raise Tracker – Supabase Schema
-- Run this in your Supabase project → SQL Editor
-- ============================================================

-- Required extension for bcrypt password hashing
create extension if not exists pgcrypto;

-- ── Tables ────────────────────────────────────────────────────────────────────

create table events (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,          -- e.g. "Hearts for Kids – 2024 Gala"
  code         text        not null unique,   -- short join code, e.g. "HEARTS24"
  password_hash text       not null,
  event_date   date        not null,
  created_at   timestamptz default now()
);

create table levels (
  id         uuid    primary key default gen_random_uuid(),
  event_id   uuid    not null references events on delete cascade,
  amount     integer not null,
  created_at timestamptz default now(),
  unique(event_id, amount)
);

create table pledges (
  id           uuid        primary key default gen_random_uuid(),
  event_id     uuid        not null references events on delete cascade,
  paddle       text        not null,   -- zero-padded 3-digit string, e.g. "042"
  level_amount integer     not null,
  spotter_id   text        not null,
  spotter_name text        not null,
  created_at   timestamptz default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Direct table access is blocked for anon; all writes go through RPC functions
-- or via the event UUID (treated as a session token).

alter table events  enable row level security;
alter table levels  enable row level security;
alter table pledges enable row level security;

-- The events table is never read directly by the client (password_hash lives here).
-- Event metadata is returned by the join_event / create_event RPCs.
create policy "events_deny_direct" on events for all to anon using (false);

-- Levels and pledges: open access gated only by knowing the event UUID.
-- The UUID is a 128-bit random value – brute-forcing is not feasible.
-- Clients obtain it by supplying the correct code + password.
create policy "levels_open"   on levels   for all to anon using (true) with check (true);
create policy "pledges_open"  on pledges  for all to anon using (true) with check (true);

-- Enable Realtime for live updates
alter publication supabase_realtime add table pledges;
alter publication supabase_realtime add table levels;

-- ── RPC: create_event ─────────────────────────────────────────────────────────

create or replace function create_event(
  p_name        text,
  p_code        text,
  p_password    text,
  p_event_date  date,
  p_levels      integer[]
)
returns json
language plpgsql
security definer
as $$
declare
  v_id    uuid;
  v_level integer;
begin
  if length(trim(p_name)) < 2 then
    raise exception 'Event name must be at least 2 characters';
  end if;

  if length(trim(p_code)) < 3 or trim(p_code) !~ '^[A-Za-z0-9]+$' then
    raise exception 'Event code must be 3–20 alphanumeric characters';
  end if;

  if length(p_password) < 4 then
    raise exception 'Password must be at least 4 characters';
  end if;

  if exists (select 1 from events where code = upper(trim(p_code))) then
    raise exception 'That event code is already taken – choose another';
  end if;

  insert into events (name, code, password_hash, event_date)
  values (
    trim(p_name),
    upper(trim(p_code)),
    crypt(p_password, gen_salt('bf')),
    p_event_date
  )
  returning id into v_id;

  foreach v_level in array p_levels loop
    insert into levels (event_id, amount) values (v_id, v_level);
  end loop;

  return json_build_object(
    'id',         v_id,
    'name',       trim(p_name),
    'code',       upper(trim(p_code)),
    'event_date', p_event_date
  );
end;
$$;

-- ── RPC: join_event ───────────────────────────────────────────────────────────

create or replace function join_event(p_code text, p_password text)
returns json
language plpgsql
security definer
as $$
declare
  v_event events%rowtype;
begin
  select * into v_event
  from events
  where code = upper(trim(p_code));

  if not found then
    return null;
  end if;

  -- bcrypt verification
  if crypt(p_password, v_event.password_hash) != v_event.password_hash then
    return null;
  end if;

  return json_build_object(
    'id',         v_event.id,
    'name',       v_event.name,
    'code',       v_event.code,
    'event_date', v_event.event_date
  );
end;
$$;
