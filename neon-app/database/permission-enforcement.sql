-- Phase 7: make scoped assignments authoritative for privileged authorization.
begin;

drop trigger if exists sync_compat_admin_access on public.profiles;

-- Teachers receive an initial school-scoped assignment. New teaching access is managed through assignments.
insert into public.access_assignments(user_id,role_id,scope_type,scope_key,granted_by,reason)
select p.id,'teacher','school',coalesce(p.school_id::text,'unassigned'),p.id,'Migrated teacher access'
from public.profiles p where p.role='teacher'
on conflict do nothing;

create or replace function private.sync_teacher_access()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.role='teacher' then
  insert into public.access_assignments(user_id,role_id,scope_type,scope_key,granted_by,reason)
  values(new.id,'teacher','school',coalesce(new.school_id::text,'unassigned'),new.id,'Teacher onboarding access') on conflict do nothing;
 end if;return new;
end $$;
drop trigger if exists sync_teacher_access on public.profiles;
create trigger sync_teacher_access after insert or update of role,school_id on public.profiles for each row execute function private.sync_teacher_access();

create or replace function private.has_access_role(role_input text,target_type text default 'platform',target_key text default '*')
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.access_assignments a where a.user_id=private.actor_id() and a.role_id=role_input
 and a.revoked_at is null and a.starts_at<=now() and (a.expires_at is null or a.expires_at>now())
 and private.scope_allows(a.scope_type,a.scope_key,target_type,target_key));
$$;

create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select private.has_access_role('super_admin','platform','*'); $$;

create or replace function private.is_school_admin(target_school_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select private.has_access_role('super_admin','platform','*')
 or private.has_access_role('school_admin','school',coalesce(target_school_id::text,'unassigned'))
 or exists(select 1 from public.schools s where s.id=target_school_id and private.has_access_role('division_admin','division',s.division));
$$;

create or replace function private.is_teacher()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.access_assignments a join public.access_role_permissions rp on rp.role_id=a.role_id
 where a.user_id=private.actor_id() and rp.permission_id='classes.manage' and a.revoked_at is null and a.starts_at<=now() and (a.expires_at is null or a.expires_at>now()));
$$;

create or replace function private.is_exam_teacher(target_exam_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.exams e where e.id=target_exam_id and
  (e.teacher_id=private.actor_id() or private.has_permission('assessments.publish','class',e.class_id::text)));
$$;
create or replace function private.can_access_exam(target_exam_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.exams e where e.id=target_exam_id and
  (private.is_exam_teacher(e.id) or private.is_class_member(e.class_id)));
$$;
create or replace function private.can_review_ellna(target_class uuid,target_school uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select private.is_class_teacher(target_class)
 or private.has_permission('ellna.review','class',target_class::text)
 or private.has_permission('ellna.review','school',coalesce(target_school::text,'unassigned'));
$$;

drop policy if exists teacher_class_writes on public.classes;
create policy teacher_class_writes on public.classes as restrictive for insert to authenticated
with check(teacher_id=private.actor_id() and ((school_id is null and private.is_teacher()) or private.has_permission('classes.manage','school',school_id::text)));
drop policy if exists teacher_activity_writes on public.activities;
create policy teacher_activity_writes on public.activities as restrictive for insert to authenticated
with check(teacher_id=private.actor_id() and private.has_permission('assessments.publish','class',class_id::text));

-- Legacy UI may update learner/teacher identity and status, but cannot create administrator authority.
drop function if exists public.admin_update_profile(uuid,text,text,uuid);
create function public.admin_update_profile(target_user_id uuid,new_role text,new_status text,new_school_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target_school uuid;
begin
 select school_id into target_school from public.profiles where id=target_user_id;
 if new_role in ('super_admin','school_admin','division_admin') then raise exception 'Use an approved scoped access request for administrator roles';end if;
 if new_role not in ('student','teacher') then raise exception 'Choose student or teacher identity';end if;
 if not private.has_permission('roles.assign',case when target_school is null then 'platform' else 'school' end,coalesce(target_school::text,'*')) then raise exception 'Role assignment permission required';end if;
 if target_user_id=private.actor_id() then raise exception 'Administrators cannot change their own identity or status';end if;
 update public.profiles set role=new_role,school_id=new_school_id,status=new_status where id=target_user_id;
 if new_role='teacher' then
  insert into public.access_assignments(user_id,role_id,scope_type,scope_key,granted_by,reason)
  values(target_user_id,'teacher','school',coalesce(new_school_id::text,'unassigned'),private.actor_id(),'Teacher identity assignment') on conflict do nothing;
 end if;
 insert into public.audit_logs(actor_id,action,table_name,record_id,after_data) values(private.actor_id(),'profile_identity_updated','profiles',target_user_id,jsonb_build_object('role',new_role,'status',new_status,'school_id',new_school_id));
end $$;

drop function if exists public.admin_create_invite(text,text,uuid,text);
create function public.admin_create_invite(invite_email text,invite_role text,invite_school_id uuid,invite_school_name text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
 raise exception 'Administrator invitations are retired. Create a standard account, then use a scoped access request.';
end $$;

-- Compatibility role values may describe the account but no longer authorize these protected helpers.
comment on column public.profiles.role is 'Identity/display compatibility only. Privileged authorization comes from access_assignments.';

revoke all on function private.has_access_role(text,text,text) from public;
grant execute on function private.has_access_role(text,text,text) to authenticated;
revoke all on function public.admin_update_profile(uuid,text,text,uuid),public.admin_create_invite(text,text,uuid,text) from public;
grant execute on function public.admin_update_profile(uuid,text,text,uuid),public.admin_create_invite(text,text,uuid,text) to authenticated;
commit;
