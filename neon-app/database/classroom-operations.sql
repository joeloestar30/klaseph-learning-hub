-- Phase 5: teacher grading, analytics, roster import, attendance and competency provenance.
begin;

alter table public.competencies add column if not exists source_url text;
alter table public.competencies add column if not exists source_version text;
alter table public.competencies add column if not exists is_official boolean not null default false;
alter table public.competencies add column if not exists effective_from date;
alter table public.exams add column if not exists competency_text_snapshot text;
alter table public.exams add column if not exists competency_source_url text;
alter table public.exams add column if not exists competency_source_version text;

create or replace function private.snapshot_exam_competency()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare metadata jsonb;
begin
  if new.activity_id is not null then
    select standard into metadata from public.activities where id=new.activity_id;
    new.competency_text_snapshot:=metadata->>'competency';
    new.competency_source_url:=metadata->>'competencySourceUrl';
    new.competency_source_version:=metadata->>'competencySourceVersion';
  end if;
  return new;
end $$;
drop trigger if exists snapshot_exam_competency on public.exams;
create trigger snapshot_exam_competency before insert on public.exams for each row execute function private.snapshot_exam_competency();

create or replace view public.teacher_attempt_reviews with (security_barrier=true) as
select ea.id attempt_id,ea.exam_id,e.activity_id,e.class_id,e.title exam_title,p.id student_id,p.full_name student_name,
 ea.status,ea.score,ea.max_score,ea.submitted_at,ea.feedback
from public.exam_attempts ea join public.exams e on e.id=ea.exam_id join public.profiles p on p.id=ea.student_id
where private.is_exam_teacher(e.id);

create or replace view public.teacher_attempt_answers with (security_barrier=true) as
select sa.id answer_id,sa.attempt_id,q.item_no,q.prompt,q.question_type,q.points,sa.answer_text,sa.awarded_points,sa.is_correct
from public.submission_answers sa join public.exam_attempts ea on ea.id=sa.attempt_id
join public.questions q on q.id=sa.question_id where private.is_exam_teacher(ea.exam_id);

create or replace view public.teacher_item_analysis with (security_barrier=true) as
select e.id exam_id,e.title,q.id question_id,q.item_no,q.prompt,q.points,count(sa.id)::integer responses,
 count(sa.id) filter(where sa.is_correct)::integer correct_responses,
 round(avg(coalesce(sa.awarded_points,0)),2) average_points
from public.exams e join public.questions q on q.exam_id=e.id left join public.submission_answers sa on sa.question_id=q.id
where private.is_exam_teacher(e.id) group by e.id,e.title,q.id,q.item_no,q.prompt,q.points;

create or replace view public.teacher_competency_performance with (security_barrier=true) as
select e.class_id,coalesce(c.competency_text,e.competency_text_snapshot,'Unspecified competency') competency,
 coalesce(c.source_version,e.competency_source_version,'Teacher provided') source_version,
 count(ea.id)::integer attempts,round(avg(case when ea.max_score>0 then ea.score/ea.max_score*100 end),1) average_percent
from public.exams e left join public.competencies c on c.id=e.competency_id left join public.exam_attempts ea on ea.exam_id=e.id and ea.status in ('graded','returned')
where private.is_exam_teacher(e.id) group by e.class_id,coalesce(c.competency_text,e.competency_text_snapshot,'Unspecified competency'),coalesce(c.source_version,e.competency_source_version,'Teacher provided');

grant select on public.teacher_attempt_reviews,public.teacher_attempt_answers,public.teacher_item_analysis,
 public.teacher_competency_performance to authenticated;

create or replace function public.grade_exam_attempt(attempt_id_input uuid,awards_input jsonb,feedback_input text default null)
returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=private.actor_id(); target public.exam_attempts%rowtype; answer_row record; award numeric; total numeric;
begin
 select * into target from public.exam_attempts where id=attempt_id_input for update;
 if target.id is null or not private.is_exam_teacher(target.exam_id) then raise exception 'Teacher access required'; end if;
 if jsonb_typeof(awards_input)<>'object' then raise exception 'Awards must be an object'; end if;
 for answer_row in select sa.id,q.points from public.submission_answers sa join public.questions q on q.id=sa.question_id where sa.attempt_id=target.id loop
   if awards_input ? answer_row.id::text then
     award:=(awards_input->>answer_row.id::text)::numeric;
     if award<0 or award>answer_row.points then raise exception 'Awarded points are outside the allowed range'; end if;
     update public.submission_answers set awarded_points=award,checked_at=now(),checked_by=actor where id=answer_row.id;
   end if;
 end loop;
 select coalesce(sum(awarded_points),0) into total from public.submission_answers where attempt_id=target.id;
 update public.exam_attempts set score=total,status='graded',feedback=left(feedback_input,2000) where id=target.id;
 update public.submissions s set score=total,feedback=left(feedback_input,2000),checked_at=current_date
 from public.exams e where e.id=target.exam_id and s.activity_id=e.activity_id and s.student_id=target.student_id;
 delete from public.scores where source_type='exam' and source_id=target.exam_id and student_id=target.student_id;
 insert into public.scores(class_id,student_id,source_type,source_id,component,score,max_score,remarks,created_by)
 select e.class_id,target.student_id,'exam',e.id,e.assessment_component,total,target.max_score,left(feedback_input,500),actor from public.exams e where e.id=target.exam_id;
 insert into public.audit_logs(actor_id,action,table_name,record_id,after_data) values(actor,'grade_exam_attempt','exam_attempts',target.id,jsonb_build_object('score',total,'max_score',target.max_score));
 return total;
end $$;

create or replace function public.import_class_roster(class_id_input uuid,rows_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=private.actor_id(); item jsonb; learner uuid; added integer:=0; unmatched jsonb:='[]'::jsonb;
begin
 if not private.is_class_teacher(class_id_input) and not private.is_super_admin() then raise exception 'Class teacher access required'; end if;
 if jsonb_typeof(rows_input)<>'array' or jsonb_array_length(rows_input)>500 then raise exception 'Roster must contain at most 500 rows'; end if;
 for item in select value from jsonb_array_elements(rows_input) loop
   select id into learner from public.profiles where role='student' and (lower(email)=lower(item->>'email') or (item->>'lrn' is not null and exists(select 1 from public.profile_onboarding po where po.user_id=profiles.id and po.lrn=item->>'lrn'))) limit 1;
   if learner is null then unmatched:=unmatched||jsonb_build_array(jsonb_build_object('email',item->>'email','lrn',item->>'lrn')); else
     insert into public.class_members(class_id,user_id) values(class_id_input,learner) on conflict do nothing; added:=added+1;
   end if;
 end loop;
 return jsonb_build_object('matched',added,'unmatched',unmatched);
end $$;

create or replace function public.record_class_attendance(class_id_input uuid,attendance_date_input date,entries_input jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=private.actor_id(); item jsonb; saved integer:=0;
begin
 if not private.is_class_teacher(class_id_input) and not private.is_super_admin() then raise exception 'Class teacher access required'; end if;
 if attendance_date_input>current_date then raise exception 'Attendance date cannot be in the future'; end if;
 for item in select value from jsonb_array_elements(entries_input) loop
   if item->>'status' not in ('present','absent','late','excused') then raise exception 'Invalid attendance status'; end if;
   if not exists(select 1 from public.class_members where class_id=class_id_input and user_id=(item->>'student_id')::uuid) then raise exception 'Learner is not enrolled'; end if;
   insert into public.attendance(class_id,student_id,attendance_date,status,marked_by) values(class_id_input,(item->>'student_id')::uuid,attendance_date_input,item->>'status',actor)
   on conflict(class_id,student_id,attendance_date) do update set status=excluded.status,marked_by=actor; saved:=saved+1;
   update public.class_members set attendance=item->>'status' where class_id=class_id_input and user_id=(item->>'student_id')::uuid;
 end loop; return saved;
end $$;

create or replace function public.import_official_competencies(entries_input jsonb,source_url_input text,source_version_input text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=private.actor_id(); item jsonb; saved integer:=0;
begin
 if not private.is_super_admin() then raise exception 'Super administrator access required'; end if;
 if source_url_input !~ '^https://([a-z0-9-]+\.)*deped\.gov\.ph/' or length(trim(source_version_input))<3 then raise exception 'Official entries require a DepEd HTTPS source and version'; end if;
 for item in select value from jsonb_array_elements(entries_input) loop
   insert into public.competencies(grade_level,subject,quarter,learning_area,competency_code,competency_text,source,source_url,source_version,is_official,created_by)
   values(item->>'grade_level',item->>'subject',item->>'quarter',item->>'learning_area',nullif(item->>'competency_code',''),item->>'competency_text','DepEd official',source_url_input,source_version_input,true,actor)
   on conflict(school_id,grade_level,subject,quarter,competency_code) do update set competency_text=excluded.competency_text,source_url=excluded.source_url,source_version=excluded.source_version,is_official=true; saved:=saved+1;
 end loop; return saved;
end $$;

revoke all on function public.grade_exam_attempt(uuid,jsonb,text),public.import_class_roster(uuid,jsonb),public.record_class_attendance(uuid,date,jsonb),public.import_official_competencies(jsonb,text,text) from public;
grant execute on function public.grade_exam_attempt(uuid,jsonb,text),public.import_class_roster(uuid,jsonb),public.record_class_attendance(uuid,date,jsonb),public.import_official_competencies(jsonb,text,text) to authenticated;
commit;
