-- Admin dashboard support.
-- Run after production-db-upgrade.sql.

alter table public.profiles
  add column if not exists status text not null default 'active'
    check (status in ('active','suspended','archived')),
  add column if not exists last_admin_action_at timestamptz;

create or replace function public.admin_update_profile(
  target_user_id uuid,
  new_role text,
  new_status text,
  new_school_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  before_row jsonb;
  after_row jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can update user roles or status';
  end if;

  if target_user_id = auth.uid() and new_status <> 'active' then
    raise exception 'You cannot suspend or archive your own admin account';
  end if;

  if new_role not in ('super_admin','school_admin','teacher','student') then
    raise exception 'Invalid role';
  end if;

  if new_status not in ('active','suspended','archived') then
    raise exception 'Invalid status';
  end if;

  select to_jsonb(p.*) into before_row
  from public.profiles p
  where p.id = target_user_id;

  update public.profiles
  set role = new_role,
      status = new_status,
      school_id = coalesce(new_school_id, school_id),
      last_admin_action_at = now(),
      updated_at = now()
  where id = target_user_id;

  select to_jsonb(p.*) into after_row
  from public.profiles p
  where p.id = target_user_id;

  perform public.log_audit('admin_update_profile', 'profiles', target_user_id, before_row, after_row);
end;
$$;

create or replace function public.admin_create_invite(
  invite_email text,
  invite_role text,
  invite_school_id uuid default null,
  invite_school_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can create admin invites';
  end if;

  if invite_role not in ('super_admin','school_admin') then
    raise exception 'Invalid admin invite role';
  end if;

  insert into public.admin_invites (email, role, school_id, school_name, invited_by)
  values (lower(trim(invite_email)), invite_role, invite_school_id, invite_school_name, auth.uid())
  on conflict (email) do update
    set role = excluded.role,
        school_id = excluded.school_id,
        school_name = excluded.school_name,
        invited_by = excluded.invited_by,
        accepted_at = null,
        created_at = now()
  returning id into invite_id;

  perform public.log_audit('admin_create_invite', 'admin_invites', invite_id, null, jsonb_build_object('email', invite_email, 'role', invite_role));
  return invite_id;
end;
$$;

drop policy if exists "super admins insert schools" on public.schools;
create policy "super admins insert schools"
on public.schools for insert
to authenticated
with check (public.is_super_admin());

