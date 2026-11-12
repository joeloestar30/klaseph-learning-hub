-- Phase 6: scoped role and permission management.
begin;

create table if not exists public.access_roles(
 id text primary key, name text not null, rank integer not null check(rank between 1 and 100), privileged boolean not null default false
);
create table if not exists public.access_permissions(
 id text primary key, description text not null, sensitive boolean not null default false
);
create table if not exists public.access_role_permissions(
 role_id text references public.access_roles(id) on delete cascade,
 permission_id text references public.access_permissions(id) on delete cascade,
 primary key(role_id,permission_id)
);
create table if not exists public.access_assignments(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 role_id text not null references public.access_roles(id), scope_type text not null check(scope_type in ('platform','division','school','class')),
 scope_key text not null, granted_by uuid references public.profiles(id), reason text not null,
 starts_at timestamptz not null default now(), expires_at timestamptz, revoked_at timestamptz, revoked_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), check(expires_at is null or expires_at>starts_at)
);
create unique index if not exists uq_active_access_assignment on public.access_assignments(user_id,role_id,scope_type,scope_key) where revoked_at is null;
create table if not exists public.access_requests(
 id uuid primary key default gen_random_uuid(), target_user_id uuid not null references public.profiles(id), role_id text not null references public.access_roles(id),
 scope_type text not null check(scope_type in ('platform','division','school','class')),scope_key text not null,
 reason text not null,requested_by uuid not null references public.profiles(id),status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 expires_at timestamptz,decided_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.access_request_approvals(
 request_id uuid references public.access_requests(id) on delete cascade,approver_id uuid references public.profiles(id),decision text not null check(decision in ('approve','reject')),
 note text,created_at timestamptz not null default now(),primary key(request_id,approver_id)
);
create table if not exists public.access_reviews(
 id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.access_assignments(id),reviewed_by uuid not null references public.profiles(id),
 decision text not null check(decision in ('retain','revoke','modify')),note text,reviewed_at timestamptz not null default now(),next_review_at date
);

insert into public.access_roles values
 ('observer','Auditor / Observer',10,false),('assessment_coordinator','Assessment Coordinator',30,false),('grade_coordinator','Grade / Subject Coordinator',35,false),
 ('teacher','Teacher',40,false),('school_admin','School Administrator',70,true),('division_admin','Division Administrator',80,true),('super_admin','Super Administrator',100,true)
on conflict(id) do update set name=excluded.name,rank=excluded.rank,privileged=excluded.privileged;

insert into public.access_permissions values
 ('users.view','View users in scope',false),('users.manage_status','Suspend or restore users',true),('roles.assign','Assign scoped roles',true),
 ('classes.manage','Manage classes',false),('enrollment.manage','Manage class enrollment',false),('attendance.manage','Manage attendance',false),
 ('assessments.publish','Publish assessments',false),('scores.edit','Edit assessment scores',true),('ellna.review','Review ELLNA records',true),
 ('reports.export','Export scoped reports',true),('audit.view','View audit events',true),('competencies.manage','Manage official competencies',true)
on conflict(id) do nothing;

insert into public.access_role_permissions(role_id,permission_id)
select 'super_admin',id from public.access_permissions on conflict do nothing;
insert into public.access_role_permissions values
 ('division_admin','users.view'),('division_admin','classes.manage'),('division_admin','reports.export'),('division_admin','audit.view'),
 ('school_admin','users.view'),('school_admin','users.manage_status'),('school_admin','roles.assign'),('school_admin','classes.manage'),('school_admin','enrollment.manage'),('school_admin','attendance.manage'),('school_admin','assessments.publish'),('school_admin','scores.edit'),('school_admin','ellna.review'),('school_admin','reports.export'),
 ('teacher','classes.manage'),('teacher','enrollment.manage'),('teacher','attendance.manage'),('teacher','assessments.publish'),('teacher','scores.edit'),('teacher','ellna.review'),('teacher','reports.export'),
 ('assessment_coordinator','users.view'),('assessment_coordinator','assessments.publish'),('assessment_coordinator','scores.edit'),('assessment_coordinator','reports.export'),
 ('grade_coordinator','users.view'),('grade_coordinator','reports.export'),('observer','users.view'),('observer','audit.view')
on conflict do nothing;

alter table public.access_roles enable row level security;alter table public.access_permissions enable row level security;
alter table public.access_role_permissions enable row level security;alter table public.access_assignments enable row level security;
alter table public.access_requests enable row level security;alter table public.access_request_approvals enable row level security;alter table public.access_reviews enable row level security;
revoke all on public.access_roles,public.access_permissions,public.access_role_permissions,public.access_assignments,public.access_requests,public.access_request_approvals,public.access_reviews from authenticated;

create or replace function private.scope_allows(assignment_type text,assignment_key text,target_type text,target_key text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select assignment_type='platform'
 or (assignment_type=target_type and assignment_key=target_key)
 or (assignment_type='school' and target_type='class' and exists(select 1 from public.classes c where c.id::text=target_key and coalesce(c.school_id::text,'unassigned')=assignment_key))
 or (assignment_type='division' and target_type='school' and exists(select 1 from public.schools s where s.id::text=target_key and lower(s.division)=lower(assignment_key)))
 or (assignment_type='division' and target_type='class' and exists(select 1 from public.classes c join public.schools s on s.id=c.school_id where c.id::text=target_key and lower(s.division)=lower(assignment_key)));
$$;
create or replace function private.has_permission(permission_input text,target_type text default 'platform',target_key text default '*')
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.access_assignments aa join public.access_role_permissions rp on rp.role_id=aa.role_id
 where aa.user_id=private.actor_id() and rp.permission_id=permission_input and aa.revoked_at is null and aa.starts_at<=now()
 and (aa.expires_at is null or aa.expires_at>now()) and private.scope_allows(aa.scope_type,aa.scope_key,target_type,target_key));
$$;
create or replace function private.actor_access_rank()
returns integer language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(max(r.rank),0) from public.access_assignments a join public.access_roles r on r.id=a.role_id
 where a.user_id=private.actor_id() and a.revoked_at is null and a.starts_at<=now() and (a.expires_at is null or a.expires_at>now());
$$;

-- Migrate existing compatibility roles. School administrators are scoped; existing super administrators retain platform scope.
insert into public.access_assignments(user_id,role_id,scope_type,scope_key,granted_by,reason)
select p.id,p.role,case when p.role='super_admin' then 'platform' else 'school' end,
 case when p.role='super_admin' then '*' else coalesce(p.school_id::text,'unassigned') end,p.id,'Migrated from legacy profile role'
from public.profiles p where p.role in ('super_admin','school_admin')
on conflict do nothing;

create or replace function private.sync_compat_admin_access()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.role in ('super_admin','school_admin') then
  insert into public.access_assignments(user_id,role_id,scope_type,scope_key,granted_by,reason)
  values(new.id,new.role,case when new.role='super_admin' then 'platform' else 'school' end,
   case when new.role='super_admin' then '*' else coalesce(new.school_id::text,'unassigned') end,new.id,'Synchronized compatibility administrator role')
  on conflict do nothing;
 end if;return new;
end $$;
drop trigger if exists sync_compat_admin_access on public.profiles;
create trigger sync_compat_admin_access after insert or update of role,school_id on public.profiles for each row execute function private.sync_compat_admin_access();

create or replace view public.access_assignment_directory with(security_barrier=true) as
select a.id,a.user_id,p.full_name,p.email,a.role_id,r.name role_name,a.scope_type,a.scope_key,a.starts_at,a.expires_at,a.revoked_at,a.reason
from public.access_assignments a join public.profiles p on p.id=a.user_id join public.access_roles r on r.id=a.role_id
where private.has_permission('users.view',a.scope_type,a.scope_key) or a.user_id=private.actor_id();
create or replace view public.access_request_queue with(security_barrier=true) as
select ar.*,p.full_name,p.email,(select count(*) from public.access_request_approvals ap where ap.request_id=ar.id and ap.decision='approve') approvals
from public.access_requests ar join public.profiles p on p.id=ar.target_user_id
where ar.requested_by=private.actor_id() or ar.target_user_id=private.actor_id() or private.has_permission('roles.assign',ar.scope_type,ar.scope_key);
create or replace view public.access_monitoring with(security_barrier=true) as
select count(*) filter(where revoked_at is null and (expires_at is null or expires_at>now())) active_assignments,
 count(*) filter(where revoked_at is null and expires_at between now() and now()+interval '30 days') expiring_assignments,
 count(*) filter(where revoked_at is null and r.privileged) privileged_assignments,
 count(*) filter(where revoked_at is null and a.starts_at<now()-interval '180 days' and r.privileged) privileged_due_review
from public.access_assignments a join public.access_roles r on r.id=a.role_id where private.has_permission('audit.view','platform','*');
grant select on public.access_roles,public.access_permissions,public.access_role_permissions,public.access_assignment_directory,public.access_request_queue,public.access_monitoring to authenticated;

create or replace function public.request_access(target_user_id_input uuid,role_id_input text,scope_type_input text,scope_key_input text,reason_input text,expires_at_input timestamptz default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 if private.actor_id()<>target_user_id_input and not private.has_permission('roles.assign',scope_type_input,scope_key_input) then raise exception 'Role assignment permission required'; end if;
 if length(trim(coalesce(reason_input,'')))<8 then raise exception 'Provide a detailed business reason'; end if;
 insert into public.access_requests(target_user_id,role_id,scope_type,scope_key,reason,requested_by,expires_at)
 values(target_user_id_input,role_id_input,scope_type_input,scope_key_input,left(reason_input,1000),private.actor_id(),expires_at_input) returning id into result;
 insert into public.audit_logs(actor_id,action,table_name,record_id,after_data) values(private.actor_id(),'access_requested','access_requests',result,jsonb_build_object('role',role_id_input,'scope_type',scope_type_input,'scope_key',scope_key_input));return result;
end $$;

create or replace function public.approve_access_request(request_id_input uuid,decision_input text,note_input text default null)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare req public.access_requests%rowtype;required_approvals integer;approval_count integer;target_rank integer;
begin
 select * into req from public.access_requests where id=request_id_input for update;if req.id is null or req.status<>'pending' then raise exception 'Pending request not found';end if;
 if not private.has_permission('roles.assign',req.scope_type,req.scope_key) then raise exception 'Role assignment permission required';end if;
 if private.actor_id()=req.target_user_id then raise exception 'Users cannot approve their own access';end if;
 select rank into target_rank from public.access_roles where id=req.role_id;if target_rank>=private.actor_access_rank() and req.role_id<>'super_admin' then raise exception 'Cannot grant an equal or higher role';end if;
 insert into public.access_request_approvals(request_id,approver_id,decision,note) values(req.id,private.actor_id(),decision_input,left(note_input,1000));
 if decision_input='reject' then update public.access_requests set status='rejected',decided_at=now() where id=req.id;return 'rejected';end if;
 required_approvals:=case when req.role_id='super_admin' then 2 else 1 end;
 select count(*) into approval_count from public.access_request_approvals where request_id=req.id and decision='approve';
 if approval_count<required_approvals then return 'awaiting_second_approval';end if;
 insert into public.access_assignments(user_id,role_id,scope_type,scope_key,granted_by,reason,expires_at)
 values(req.target_user_id,req.role_id,req.scope_type,req.scope_key,private.actor_id(),req.reason,req.expires_at) on conflict do nothing;
 update public.access_requests set status='approved',decided_at=now() where id=req.id;
 if req.role_id in ('super_admin','school_admin') then update public.profiles set role=req.role_id where id=req.target_user_id;end if;
 insert into public.audit_logs(actor_id,action,table_name,record_id,after_data) values(private.actor_id(),'access_approved','access_requests',req.id,jsonb_build_object('role',req.role_id,'approvals',approval_count));return 'approved';
end $$;

create or replace function public.revoke_access(assignment_id_input uuid,reason_input text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.access_assignments%rowtype;
begin select * into target from public.access_assignments where id=assignment_id_input for update;
 if target.id is null or not private.has_permission('roles.assign',target.scope_type,target.scope_key) then raise exception 'Role assignment permission required';end if;
 if target.role_id='super_admin' and (select count(*) from public.access_assignments where role_id='super_admin' and scope_type='platform' and revoked_at is null and (expires_at is null or expires_at>now()))<=1 then raise exception 'Cannot revoke the final active super administrator';end if;
 update public.access_assignments set revoked_at=now(),revoked_by=private.actor_id(),reason=reason||' | Revoked: '||left(reason_input,500) where id=target.id;
 if target.role_id in ('super_admin','school_admin') and not exists(select 1 from public.access_assignments where user_id=target.user_id and role_id in ('super_admin','school_admin') and revoked_at is null and id<>target.id) then
  update public.profiles set role='teacher' where id=target.user_id;
 end if;
 insert into public.audit_logs(actor_id,action,table_name,record_id) values(private.actor_id(),'access_revoked','access_assignments',target.id);end $$;

create or replace function public.review_access(assignment_id_input uuid,decision_input text,note_input text,next_review_input date default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.access_assignments%rowtype;begin select * into target from public.access_assignments where id=assignment_id_input;
 if target.id is null or not private.has_permission('roles.assign',target.scope_type,target.scope_key) then raise exception 'Role assignment permission required';end if;
 insert into public.access_reviews(assignment_id,reviewed_by,decision,note,next_review_at) values(target.id,private.actor_id(),decision_input,left(note_input,1000),next_review_input);
 if decision_input='revoke' then perform public.revoke_access(target.id,coalesce(note_input,'Access review revocation'));end if;end $$;

create or replace function public.set_user_status(target_user_id uuid,new_status text,reason_input text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target_school uuid;begin select school_id into target_school from public.profiles where id=target_user_id;
 if not private.has_permission('users.manage_status',case when target_school is null then 'platform' else 'school' end,coalesce(target_school::text,'*')) then raise exception 'User status permission required';end if;
 if target_user_id=private.actor_id() then raise exception 'Administrators cannot change their own status';end if;
 update public.profiles set status=new_status where id=target_user_id;insert into public.audit_logs(actor_id,action,table_name,record_id,after_data) values(private.actor_id(),'user_status_changed','profiles',target_user_id,jsonb_build_object('status',new_status,'reason',left(reason_input,500)));end $$;

revoke all on function public.request_access(uuid,text,text,text,text,timestamptz),public.approve_access_request(uuid,text,text),public.revoke_access(uuid,text),public.review_access(uuid,text,text,date),public.set_user_status(uuid,text,text) from public;
grant execute on function public.request_access(uuid,text,text,text,text,timestamptz),public.approve_access_request(uuid,text,text),public.revoke_access(uuid,text),public.review_access(uuid,text,text,date),public.set_user_status(uuid,text,text) to authenticated;
commit;
