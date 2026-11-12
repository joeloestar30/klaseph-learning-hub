-- Admin-only, read-only preview payload based on the selected account's real
-- class and membership scope. Apply after access-control.sql and
-- permission-enforcement.sql. Compatible with the core classroom schema.
begin;
create or replace function public.admin_preview_user(target_user_id_input uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $$
declare
  target public.profiles%rowtype;
  class_rows jsonb;
  member_rows jsonb;
  activity_rows jsonb;
  submission_rows jsonb;
  announcement_rows jsonb;
begin
  select * into target from public.profiles where id=target_user_id_input;
  if target.id is null or target.role not in ('teacher','student')
     or (to_jsonb(target)->>'status' is not null and to_jsonb(target)->>'status'<>'active') then
    raise exception 'Only active teacher and student accounts can be previewed';
  end if;

  if not exists (
    select 1 from public.access_assignments aa
    join public.access_role_permissions rp on rp.role_id=aa.role_id and rp.permission_id='users.view'
    where aa.user_id=private.actor_id() and aa.revoked_at is null
      and aa.starts_at<=now() and (aa.expires_at is null or aa.expires_at>now())
      and private.scope_allows(aa.scope_type,aa.scope_key,'school',coalesce(to_jsonb(target)->>'school_id','unassigned'))
  ) and not exists (
    select 1 from public.access_assignments aa
    where aa.user_id=private.actor_id() and aa.role_id='super_admin'
      and aa.scope_type='platform' and aa.revoked_at is null
      and aa.starts_at<=now() and (aa.expires_at is null or aa.expires_at>now())
  ) then
    raise exception 'User preview permission required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'subject',c.subject,
    'schedule',c.schedule,'join_code',c.join_code,'teacher_id',c.teacher_id)), '[]'::jsonb)
    into class_rows
  from public.classes c where
    (target.role='teacher' and c.teacher_id=target.id)
    or (target.role='student' and exists(select 1 from public.class_members cm where cm.class_id=c.id and cm.user_id=target.id));

  select coalesce(jsonb_agg(jsonb_build_object('class_id',cm.class_id,'student_id',cm.user_id,'name',p.full_name,'attendance',cm.attendance)), '[]'::jsonb)
    into member_rows
  from public.class_members cm join public.profiles p on p.id=cm.user_id
  where target.role='teacher'
    and exists(select 1 from public.classes c where c.id=cm.class_id and c.teacher_id=target.id)
    and p.role='student'
    and (to_jsonb(p)->>'status' is null or to_jsonb(p)->>'status'='active');

  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'class_id',a.class_id,'teacher_id',a.teacher_id,
    'title',a.title,'type',a.type,'mode',a.mode,'due_date',a.due_date,'status',a.status,
    'instructions',a.instructions,'standard',a.standard,'questions',a.questions)), '[]'::jsonb)
    into activity_rows
  from public.activities a join public.classes c on c.id=a.class_id
  where (target.role='teacher' and c.teacher_id=target.id)
    or (target.role='student' and exists(select 1 from public.class_members cm where cm.class_id=c.id and cm.user_id=target.id));

  select coalesce(jsonb_agg(to_jsonb(s) - 'created_at'), '[]'::jsonb)
    into submission_rows
  from public.submissions s join public.activities a on a.id=s.activity_id
  join public.classes c on c.id=a.class_id
  where (target.role='teacher' and c.teacher_id=target.id)
     or (target.role='student' and s.student_id=target.id);

  select coalesce(jsonb_agg(jsonb_build_object('id',an.id,'class_id',an.class_id,'message',an.message,'date',an.date)), '[]'::jsonb)
    into announcement_rows
  from public.announcements an
  where exists(select 1 from public.classes c where c.id=an.class_id and (
    (target.role='teacher' and c.teacher_id=target.id)
    or (target.role='student' and exists(select 1 from public.class_members cm where cm.class_id=c.id and cm.user_id=target.id))
  ));

  return jsonb_build_object(
    'user',jsonb_build_object('id',target.id,'full_name',target.full_name,'role',target.role,'school_name',target.school_name),
    'classes',class_rows,'students',member_rows,'activities',activity_rows,'submissions',submission_rows,'announcements',announcement_rows
  );
end;
$$;
revoke all on function public.admin_preview_user(uuid) from public;
grant execute on function public.admin_preview_user(uuid) to authenticated;
commit;
