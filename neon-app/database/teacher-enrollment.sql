-- Teacher self-service enrollment of existing active student accounts.
-- Apply after schema.sql and permission-enforcement.sql as the database owner.
begin;

create or replace function public.teacher_search_enrollable_students(
  class_id_input uuid,
  search_input text default ''
)
returns table(student_id uuid, full_name text, email text, school_name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_school uuid;
  search_term text := left(trim(coalesce(search_input,'')),120);
begin
  if not private.is_active() then raise exception 'Active account required'; end if;
  if not (private.is_class_teacher(class_id_input) or private.is_super_admin()) then
    raise exception 'You can only add students to a class you teach';
  end if;

  select coalesce(c.school_id,p.school_id) into target_school
  from public.classes c
  join public.profiles p on p.id=private.actor_id()
  where c.id=class_id_input and c.archived_at is null;

  return query
  select p.id, p.full_name, p.email, coalesce(p.school_name, s.name, 'School unassigned')
  from public.profiles p
  left join public.schools s on s.id=p.school_id
  where p.role='student'
    and p.status='active'
    and (target_school is null or p.school_id=target_school or p.school_id is null)
    and not exists(select 1 from public.class_members cm where cm.class_id=class_id_input and cm.user_id=p.id)
    and (search_term = '' or p.full_name ilike '%'||search_term||'%' or p.email ilike '%'||search_term||'%')
  order by p.full_name, p.email
  limit 50;
end;
$$;

create or replace function public.teacher_enroll_student(
  class_id_input uuid,
  student_id_input uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_school uuid;
  student_school uuid;
  student_name text;
  class_name text;
begin
  if not private.is_active() then raise exception 'Active account required'; end if;
  if not (private.is_class_teacher(class_id_input) or private.is_super_admin()) then
    raise exception 'You can only add students to a class you teach';
  end if;

  select coalesce(c.school_id,t.school_id), c.name
    into target_school, class_name
  from public.classes c
  join public.profiles t on t.id=private.actor_id()
  where c.id=class_id_input and c.archived_at is null;
  if class_name is null then raise exception 'Active class not found'; end if;

  select p.school_id, p.full_name into student_school, student_name
  from public.profiles p
  where p.id=student_id_input and p.role='student' and p.status='active';
  if student_name is null then raise exception 'Active student account not found'; end if;
  if target_school is not null and student_school is not null and student_school is distinct from target_school then
    raise exception 'Student must belong to the same school as this class';
  end if;
  if exists(select 1 from public.class_members where class_id=class_id_input and user_id=student_id_input) then
    raise exception 'Student is already enrolled in this class';
  end if;

  insert into public.class_members(class_id, user_id, attendance)
  values(class_id_input, student_id_input, 'present');
  perform public.log_audit('teacher_enroll_student', 'class_members', student_id_input, null,
    jsonb_build_object('class_id',class_id_input,'class_name',class_name,'student_id',student_id_input,'student_name',student_name));
end;
$$;

create or replace function public.teacher_remove_student(
  class_id_input uuid,
  student_id_input uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  class_name text;
  student_name text;
begin
  if not private.is_active() then raise exception 'Active account required'; end if;
  if not (private.is_class_teacher(class_id_input) or private.is_super_admin()) then
    raise exception 'You can only remove students from a class you teach';
  end if;

  select name into class_name from public.classes where id=class_id_input;
  select full_name into student_name from public.profiles where id=student_id_input;

  delete from public.class_members
  where class_id=class_id_input and user_id=student_id_input;

  perform public.log_audit('teacher_remove_student', 'class_members', student_id_input, null,
    jsonb_build_object('class_id',class_id_input,'class_name',class_name,'student_id',student_id_input,'student_name',student_name));
end;
$$;

revoke all on function public.teacher_search_enrollable_students(uuid,text) from public;
revoke all on function public.teacher_enroll_student(uuid,uuid) from public;
revoke all on function public.teacher_remove_student(uuid,uuid) from public;
grant execute on function public.teacher_search_enrollable_students(uuid,text) to authenticated;
grant execute on function public.teacher_enroll_student(uuid,uuid) to authenticated;
grant execute on function public.teacher_remove_student(uuid,uuid) to authenticated;

commit;
