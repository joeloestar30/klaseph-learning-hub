-- Teacher self-service enrollment of existing active student accounts.
-- Apply after schema.sql and permission-enforcement.sql as the database owner.
begin;

create or replace function public.teacher_search_enrollable_students(
  class_id_input uuid,
  search_input text
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
  if not private.is_class_teacher(class_id_input) then raise exception 'You can only add students to a class you teach'; end if;
  if length(search_term)<2 then raise exception 'Enter at least two characters to search'; end if;

  select coalesce(c.school_id,p.school_id) into target_school
  from public.classes c
  join public.profiles p on p.id=private.actor_id()
  where c.id=class_id_input and c.archived_at is null;
  if target_school is null then raise exception 'Assign a school to this class or your teacher profile before enrolling students'; end if;

  return query
  select p.id,p.full_name,p.email,coalesce(p.school_name,s.name)
  from public.profiles p
  join public.schools s on s.id=p.school_id
  where p.role='student'
    and p.status='active'
    and p.school_id=target_school
    and not exists(select 1 from public.class_members cm where cm.class_id=class_id_input and cm.user_id=p.id)
    and (p.full_name ilike '%'||search_term||'%' or p.email ilike '%'||search_term||'%')
  order by p.full_name,p.email
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
  if not private.is_class_teacher(class_id_input) then raise exception 'You can only add students to a class you teach'; end if;

  select coalesce(c.school_id,t.school_id),c.name
    into target_school,class_name
  from public.classes c
  join public.profiles t on t.id=private.actor_id()
  where c.id=class_id_input and c.archived_at is null;
  if class_name is null then raise exception 'Active class not found'; end if;
  if target_school is null then raise exception 'Assign a school to this class or your teacher profile before enrolling students'; end if;

  select p.school_id,p.full_name into student_school,student_name
  from public.profiles p
  where p.id=student_id_input and p.role='student' and p.status='active';
  if student_name is null then raise exception 'Active student account not found'; end if;
  if student_school is distinct from target_school then raise exception 'Student must belong to the same school as this class'; end if;
  if exists(select 1 from public.class_members where class_id=class_id_input and user_id=student_id_input) then
    raise exception 'Student is already enrolled in this class';
  end if;

  insert into public.class_members(class_id,user_id,attendance)
  values(class_id_input,student_id_input,'present');
  perform public.log_audit('teacher_enroll_student','class_members',student_id_input,null,
    jsonb_build_object('class_id',class_id_input,'class_name',class_name,'student_id',student_id_input,'student_name',student_name));
end;
$$;

revoke all on function public.teacher_search_enrollable_students(uuid,text) from public;
revoke all on function public.teacher_enroll_student(uuid,uuid) from public;
grant execute on function public.teacher_search_enrollable_students(uuid,text) to authenticated;
grant execute on function public.teacher_enroll_student(uuid,uuid) to authenticated;

commit;
