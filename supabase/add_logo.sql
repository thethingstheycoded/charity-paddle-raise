-- ============================================================
-- Migration: add logo support to events
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ============================================================

-- 1. Add logo_url column
alter table events add column if not exists logo_url text;

-- 2. Storage bucket for logos (public, 2 MB limit)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos', 'logos', true, 2097152,
  array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']
)
on conflict (id) do nothing;

-- 3. Storage RLS: anyone can read; anyone can upload (gated by knowing the bucket name)
create policy "logos_public_read"
  on storage.objects for select to anon
  using (bucket_id = 'logos');

create policy "logos_public_upload"
  on storage.objects for insert to anon
  with check (bucket_id = 'logos');

-- 4. Update create_event to accept an optional logo URL
create or replace function create_event(
  p_name        text,
  p_code        text,
  p_password    text,
  p_event_date  date,
  p_levels      integer[],
  p_logo_url    text default null
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

  insert into events (name, code, password_hash, event_date, logo_url)
  values (
    trim(p_name),
    upper(trim(p_code)),
    crypt(p_password, gen_salt('bf')),
    p_event_date,
    p_logo_url
  )
  returning id into v_id;

  foreach v_level in array p_levels loop
    insert into levels (event_id, amount) values (v_id, v_level);
  end loop;

  return json_build_object(
    'id',         v_id,
    'name',       trim(p_name),
    'code',       upper(trim(p_code)),
    'event_date', p_event_date,
    'logo_url',   p_logo_url
  );
end;
$$;

-- 5. Update join_event to return logo_url
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

  if not found then return null; end if;
  if crypt(p_password, v_event.password_hash) != v_event.password_hash then return null; end if;

  return json_build_object(
    'id',         v_event.id,
    'name',       v_event.name,
    'code',       v_event.code,
    'event_date', v_event.event_date,
    'logo_url',   v_event.logo_url
  );
end;
$$;
