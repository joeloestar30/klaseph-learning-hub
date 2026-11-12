-- Phase 2: secure assessment publication and server-side grading.
-- Apply once to the existing Neon database after database/schema.sql.
begin;

alter table public.exams add column if not exists activity_id uuid references public.activities(id) on delete cascade;
alter table public.exams add column if not exists max_attempts integer not null default 1 check (max_attempts between 1 and 5);
alter table public.exam_attempts add column if not exists attempt_no integer not null default 1 check (attempt_no > 0);
alter table public.exam_attempts drop constraint if exists exam_attempts_exam_id_student_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='exam_attempts_exam_student_attempt_key') then
    alter table public.exam_attempts add constraint exam_attempts_exam_student_attempt_key
      unique(exam_id,student_id,attempt_no);
  end if;
end $$;

-- Link records created by the earlier dual-write path when their question IDs prove
-- they belong together. Unlinked legacy auto exams are closed instead of exposed.
update public.exams e
set activity_id = a.id
from public.activities a
where e.activity_id is null
  and a.mode = 'auto'
  and a.class_id = e.class_id
  and exists (
    select 1 from public.questions q
    where q.exam_id = e.id
      and a.questions @> jsonb_build_array(jsonb_build_object('id', q.id::text))
  );

update public.activities
set questions = coalesce((
  select jsonb_agg((question - 'answer' - 'answer_key' - 'is_correct' - 'explanation') order by ordinality)
  from jsonb_array_elements(questions) with ordinality as item(question, ordinality)
), '[]'::jsonb)
where mode = 'auto';

update public.activities a
set status = 'Closed'
where a.mode = 'auto'
  and not exists (select 1 from public.exams e where e.activity_id = a.id);

create index if not exists idx_exams_activity_id on public.exams(activity_id);

drop policy if exists secure_activity_visibility on public.activities;
create policy secure_activity_visibility on public.activities as restrictive for select to authenticated
using (
  teacher_id = private.actor_id()
  or private.is_super_admin()
  or private.is_school_admin((select c.school_id from public.classes c where c.id = activities.class_id))
  or (status = 'Open' and private.is_class_member(class_id))
);

-- These views intentionally omit answer_key, is_correct, grading results, and
-- unpublished assessments. The view predicates bind every row to the caller.
drop view if exists public.student_question_choices;
drop view if exists public.student_questions;
drop view if exists public.student_exams;

create view public.student_exams with (security_barrier=true) as
select e.id, e.activity_id, e.class_id, e.title, e.assessment_component,
       e.grade_level, e.subject, e.quarter, e.topic, e.instructions,
       e.due_date, e.time_limit_minutes, e.randomize_questions, e.randomize_choices
from public.exams e
where e.status = 'published'
  and private.is_active()
  and private.is_class_member(e.class_id);

create view public.student_questions with (security_barrier=true) as
select q.id, q.exam_id, q.competency_id, q.item_no, q.question_type,
       q.difficulty, q.prompt, q.points
from public.questions q
join public.exams e on e.id = q.exam_id
where e.status = 'published'
  and private.is_active()
  and private.is_class_member(e.class_id);

create view public.student_question_choices with (security_barrier=true) as
select qc.id, qc.question_id, qc.choice_label, qc.choice_text
from public.question_choices qc
join public.questions q on q.id = qc.question_id
join public.exams e on e.id = q.exam_id
where e.status = 'published'
  and private.is_active()
  and private.is_class_member(e.class_id);

revoke all on public.exams, public.questions, public.question_choices,
  public.exam_attempts, public.submission_answers from authenticated;
grant select on public.student_exams, public.student_questions,
  public.student_question_choices to authenticated;

drop policy if exists "students submit own work" on public.submissions;
drop policy if exists "students update own submissions" on public.submissions;
revoke insert, update, delete on public.submissions from authenticated;

create or replace function public.publish_exam(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := private.actor_id();
  target_class uuid := (payload->>'class_id')::uuid;
  activity uuid := coalesce((payload->>'activity_id')::uuid, gen_random_uuid());
  exam uuid := gen_random_uuid();
  question jsonb;
  question_id uuid;
  choice text;
  choice_number integer;
  item_number integer := 0;
  safe_questions jsonb;
  component text := coalesce(nullif(payload->>'assessment_component',''), 'Written Work');
  requested_due date := nullif(payload->>'due_date','')::date;
  requested_attempts integer := coalesce((payload->>'max_attempts')::integer, 1);
begin
  if not private.is_active() then raise exception 'Active account required'; end if;
  if not exists (
    select 1 from public.classes c where c.id = target_class
      and (c.teacher_id = actor or private.is_school_admin(c.school_id))
  ) then raise exception 'Only the class teacher or school administrator can publish this exam'; end if;
  if component not in ('Written Work','Performance Task','Quarterly Assessment','Formative Check') then
    raise exception 'Invalid assessment component';
  end if;
  if requested_attempts not between 1 and 5 then raise exception 'Attempts must be between 1 and 5'; end if;
  if jsonb_typeof(payload->'questions') <> 'array' or jsonb_array_length(payload->'questions') = 0 then
    raise exception 'At least one question is required';
  end if;

  select jsonb_agg((value - 'answer' - 'answer_key' - 'is_correct' - 'explanation') order by ordinality)
  into safe_questions
  from jsonb_array_elements(payload->'questions') with ordinality;

  insert into public.activities(id,class_id,teacher_id,title,type,mode,due_date,status,instructions,standard,questions)
  values(activity,target_class,actor,left(payload->>'title',200),'Exam','auto',requested_due,'Open',
    payload->>'instructions',coalesce(payload->'standard','{}'::jsonb),coalesce(safe_questions,'[]'::jsonb));

  insert into public.exams(id,activity_id,class_id,teacher_id,title,assessment_component,
    grade_level,subject,quarter,topic,instructions,due_date,status,time_limit_minutes,max_attempts)
  values(exam,activity,target_class,actor,left(payload->>'title',200),component,
    payload#>>'{standard,grade}',payload#>>'{standard,subject}',payload#>>'{standard,quarter}',
    payload#>>'{standard,topic}',payload->>'instructions',requested_due,'published',
    nullif(payload->>'time_limit_minutes','')::integer,requested_attempts);

  for question in select value from jsonb_array_elements(payload->'questions') loop
    item_number := item_number + 1;
    question_id := coalesce((question->>'id')::uuid, gen_random_uuid());
    insert into public.questions(id,exam_id,item_no,question_type,difficulty,prompt,answer_key,points,auto_check,explanation)
    values(question_id,exam,item_number,question->>'type',coalesce(question->>'difficulty','Average'),
      question->>'prompt',question->>'answer',coalesce((question->>'points')::numeric,1),
      question->>'type' <> 'essay',question->>'component');

    if jsonb_typeof(question->'choices') = 'array' then
      choice_number := 0;
      for choice in select jsonb_array_elements_text(question->'choices') loop
        choice_number := choice_number + 1;
        insert into public.question_choices(question_id,choice_label,choice_text,is_correct)
        values(question_id,chr(64 + choice_number),choice,
          lower(trim(choice)) = lower(trim(coalesce(question->>'answer',''))));
      end loop;
    end if;
  end loop;
  return activity;
end;
$$;

create or replace function public.submit_exam(activity_id_input uuid, answers_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := private.actor_id();
  target public.exams%rowtype;
  attempt uuid := gen_random_uuid();
  attempt_number integer;
  question public.questions%rowtype;
  answer text;
  correct boolean;
  choice_id uuid;
  earned numeric := 0;
  possible numeric := 0;
  manual_required boolean := false;
begin
  if not private.is_active() or not exists(select 1 from public.profiles where id=actor and role='student') then
    raise exception 'An active student account is required';
  end if;
  if jsonb_typeof(answers_input) <> 'object' then raise exception 'Answers must be an object'; end if;

  select * into target from public.exams
  where activity_id = activity_id_input order by created_at desc limit 1 for update;
  if target.id is null then raise exception 'Secure exam record not found'; end if;
  if target.status <> 'published' then raise exception 'This exam is not published'; end if;
  if not private.is_class_member(target.class_id) then raise exception 'You are not enrolled in this class'; end if;
  if target.due_date is not null and current_date > target.due_date and not target.allow_late then
    raise exception 'The submission deadline has passed';
  end if;

  select count(*) + 1 into attempt_number from public.exam_attempts
  where exam_id=target.id and student_id=actor;
  if attempt_number > target.max_attempts then raise exception 'No attempts remaining'; end if;

  insert into public.exam_attempts(id,exam_id,student_id,attempt_no,status)
  values(attempt,target.id,actor,attempt_number,'in_progress');

  for question in select * from public.questions where exam_id=target.id order by item_no loop
    answer := coalesce(answers_input->>question.id::text,'');
    possible := possible + question.points;
    correct := null;
    choice_id := null;
    if question.auto_check and question.question_type <> 'essay' then
      correct := lower(trim(answer)) = lower(trim(coalesce(question.answer_key,'')));
      if correct then earned := earned + question.points; end if;
      if question.question_type in ('mcq','truefalse') then
        select id into choice_id from public.question_choices
        where question_id=question.id and lower(trim(choice_text))=lower(trim(answer)) limit 1;
      end if;
    else
      manual_required := true;
    end if;
    insert into public.submission_answers(attempt_id,question_id,answer_text,selected_choice_id,is_correct,awarded_points,checked_at)
    values(attempt,question.id,answer,choice_id,correct,
      case when correct then question.points when correct is false then 0 else null end,
      case when correct is null then null else now() end);
  end loop;

  update public.exam_attempts set submitted_at=now(), score=case when manual_required then null else earned end,
    max_score=possible, status=case when manual_required then 'submitted' else 'graded' end
  where id=attempt;

  insert into public.submissions(activity_id,student_id,answers,score,max_score,feedback,checked_at)
  values(activity_id_input,actor,answers_input,case when manual_required then null else earned end,possible,
    case when manual_required then 'Submitted for teacher review.' else 'Checked securely on the server.' end,
    case when manual_required then null else current_date end)
  on conflict(activity_id,student_id) do update set answers=excluded.answers,score=excluded.score,
    max_score=excluded.max_score,feedback=excluded.feedback,checked_at=excluded.checked_at,submitted_at=now();

  if not manual_required then
    insert into public.scores(class_id,student_id,source_type,source_id,component,score,max_score,remarks,created_by)
    values(target.class_id,actor,'exam',target.id,target.assessment_component,earned,possible,
      'Server-graded attempt '||attempt_number,target.teacher_id);
  end if;
  return jsonb_build_object('attempt_id',attempt,'attempt_no',attempt_number,'status',
    case when manual_required then 'submitted' else 'graded' end,'score',
    case when manual_required then null else earned end,'max_score',possible);
end;
$$;

create or replace function public.submit_activity(activity_id_input uuid, answers_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor uuid := private.actor_id(); target public.activities%rowtype; submission uuid;
begin
  if not private.is_active() or not exists(select 1 from public.profiles where id=actor and role='student') then
    raise exception 'An active student account is required';
  end if;
  select * into target from public.activities where id=activity_id_input for update;
  if target.id is null or target.mode='auto' then raise exception 'Use the secure exam submission flow'; end if;
  if target.status <> 'Open' then raise exception 'This activity is not open'; end if;
  if not private.is_class_member(target.class_id) then raise exception 'You are not enrolled in this class'; end if;
  if target.due_date is not null and current_date > target.due_date
     and not coalesce((select late_submissions_enabled from public.system_settings where id='global'),false) then
    raise exception 'The submission deadline has passed';
  end if;
  insert into public.submissions(activity_id,student_id,answers,score,max_score,feedback,checked_at)
  values(target.id,actor,answers_input,null,null,'Submitted for teacher review.',null)
  on conflict(activity_id,student_id) do update set answers=excluded.answers,score=null,max_score=null,
    feedback=excluded.feedback,checked_at=null,submitted_at=now()
  returning id into submission;
  return submission;
end;
$$;

revoke all on function public.publish_exam(jsonb) from public;
revoke all on function public.submit_exam(uuid,jsonb) from public;
revoke all on function public.submit_activity(uuid,jsonb) from public;
grant execute on function public.publish_exam(jsonb) to authenticated;
grant execute on function public.submit_exam(uuid,jsonb) to authenticated;
grant execute on function public.submit_activity(uuid,jsonb) to authenticated;

commit;
