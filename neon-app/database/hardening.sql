-- All identity and role decisions are made using the authenticated database identity.
create or replace function private.is_active()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.profiles where id = (auth.user_id())::uuid and status = 'active'); $$;

create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.profiles where id = (auth.user_id())::uuid and role = 'super_admin' and status = 'active'); $$;

-- Profile inserts and changes go through scoped RPCs, not self-editable role fields.
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "profiles visible to signed in users" on public.profiles;
create policy "related profiles only" on public.profiles for select to authenticated using (
  id = (auth.user_id())::uuid or private.is_super_admin()
  or exists(select 1 from public.class_members cm where cm.user_id = profiles.id and private.is_class_teacher(cm.class_id))
  or exists(select 1 from public.classes c where c.teacher_id = profiles.id and private.is_class_member(c.id))
  or private.is_school_admin(school_id)
);

create or replace function public.complete_onboarding(metadata jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  actor uuid := (auth.user_id())::uuid;
  account_email text;
  verified boolean;
  chosen_role text := metadata->>'role';
  school uuid;
  invitation public.admin_invites%rowtype;
begin
  if actor is null then raise exception 'Sign in first'; end if;
  select email, "emailVerified" into account_email, verified from neon_auth."user" where id::text = actor::text;
  if account_email is null or not coalesce(verified,false) then raise exception 'Verify your email before continuing'; end if;
  if exists(select 1 from public.profiles where id = actor) then return; end if;
  if chosen_role not in ('student','teacher') or chosen_role is null then raise exception 'Choose teacher or student'; end if;
  if length(trim(coalesce(metadata->>'full_name',''))) = 0 then raise exception 'Full name is required'; end if;
  select id into school from public.schools where name = metadata->>'school_name' limit 1;
  select * into invitation from public.admin_invites where lower(email) = lower(account_email) and accepted_at is null for update;
  insert into public.profiles(id,email,full_name,role,school_name,school_id)
  values(actor,account_email,left(trim(metadata->>'full_name'),200),coalesce(invitation.role,chosen_role),
    coalesce(invitation.school_name,left(metadata->>'school_name',200)),coalesce(invitation.school_id,school));
  if invitation.id is not null then update public.admin_invites set accepted_at = now() where id = invitation.id; end if;
  insert into public.profile_onboarding(user_id,region,division,school_code,school_year,employee_id,position,grade_levels,subjects,advisory_section,lrn,grade_level,section)
  values(actor,metadata->>'region',metadata->>'division',metadata->>'school_code',metadata->>'school_year',
    case when chosen_role='teacher' then metadata->>'employee_id' end,
    case when chosen_role='teacher' then metadata->>'position' end,
    metadata->>'grade_levels',metadata->>'subjects',metadata->>'advisory_section',
    case when chosen_role='student' then metadata->>'lrn' end,metadata->>'grade_level',metadata->>'section');
end; $$;

-- Membership is created through a valid class code, or by the class teacher/admin.
create or replace function private.is_teacher()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.profiles where id=(auth.user_id())::uuid and role in ('teacher','school_admin','super_admin') and status='active'); $$;
create policy teacher_class_writes on public.classes as restrictive for insert to authenticated
with check(private.is_teacher());
create policy teacher_activity_writes on public.activities as restrictive for insert to authenticated
with check(private.is_teacher());
drop policy if exists "students insert own membership" on public.class_members;
create or replace function public.join_class_by_code(code_input text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare target uuid;
begin
  if not private.is_active() or not exists(select 1 from public.profiles where id=(auth.user_id())::uuid and role='student') then raise exception 'An active student account is required'; end if;
  select id into target from public.classes where lower(join_code)=lower(trim(code_input)) and archived_at is null;
  if target is null then raise exception 'Class code not found'; end if;
  insert into public.class_members(class_id,user_id) values(target,(auth.user_id())::uuid) on conflict do nothing;
  return target;
end; $$;

-- Students may update a submission only while they still belong to its class.
drop policy if exists "students update own submissions" on public.submissions;
create policy "students update own submissions" on public.submissions for update to authenticated
using (student_id=(auth.user_id())::uuid and exists(select 1 from public.activities a where a.id=activity_id and private.is_class_member(a.class_id)))
with check (student_id=(auth.user_id())::uuid and exists(select 1 from public.activities a where a.id=activity_id and private.is_class_member(a.class_id)));

-- Global settings are managed only by super administrators.
drop policy if exists "admins manage settings" on public.system_settings;
create policy "admins manage settings" on public.system_settings for all to authenticated
using(private.is_super_admin()) with check(private.is_super_admin());

-- Restrictive policies also block old sessions belonging to suspended accounts.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security',t.tablename);
    execute format('create policy active_account on public.%I as restrictive for all to authenticated using (private.is_active()) with check (private.is_active())',t.tablename);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t.tablename);
  end loop;
end $$;
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;

-- No public-by-default execution on privileged routines.
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
revoke all on all functions in schema public from public;
grant execute on function public.complete_onboarding(jsonb) to authenticated;
grant execute on function public.join_class_by_code(text) to authenticated;
grant execute on function public.list_signup_schools() to authenticated;
grant execute on function public.admin_update_profile(uuid,text,text,uuid) to authenticated;
grant execute on function public.admin_create_invite(text,text,uuid,text) to authenticated;
grant execute on function public.log_audit(text,text,uuid,jsonb,jsonb) to authenticated;

-- Public RPCs require an active account except the initial onboarding RPC.
create or replace function public.log_audit(action_input text,table_name_input text,record_id_input uuid,before_input jsonb default null,after_input jsonb default null)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  if not private.is_active() then raise exception 'Active account required'; end if;
  insert into public.audit_logs(actor_id,school_id,action,table_name,record_id,before_data,after_data)
  select id,school_id,left(action_input,100),left(table_name_input,100),record_id_input,before_input,after_input from public.profiles where id=(auth.user_id())::uuid;
end; $$;
