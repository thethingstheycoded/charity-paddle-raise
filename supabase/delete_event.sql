-- ============================================================
-- Migration: add delete_event RPC
-- Run this in Supabase SQL Editor
-- ============================================================

create or replace function delete_event(p_code text, p_password text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_event events%rowtype;
begin
  select * into v_event
  from events
  where code = upper(trim(p_code));

  if not found then return false; end if;
  if crypt(p_password, v_event.password_hash) != v_event.password_hash then return false; end if;

  -- Cascade deletes levels and pledges automatically
  delete from events where id = v_event.id;
  return true;
end;
$$;
