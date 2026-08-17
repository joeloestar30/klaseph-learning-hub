-- KlasePH production database upgrade.
-- Run after schema.sql and rls-recursion-fix.sql.
-- This keeps the current app compatible while adding normalized production tables.

create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  school_code text,
  region text,
  division text,
  district text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.schools (name)
values ('Local School')
on conflict (name) do nothing;

alter table public.profiles
  add column if not exists school_id uuid references public.schools(id),
  add column if not exists updated_at timestamptz not null default now();

update public.profiles p
set school_id = s.id
from public.schools s
where p.school_id is null
and s.name = coalesce(nullif(p.school_name, ''), 'Local School');

update public.profiles p
set school_id = s.id
from public.schools s
where p.school_id is null
and s.name = 'Local School';

alter table public.admin_invites
  add column if not exists school_id uuid references public.schools(id);

update public.admin_invites ai
set school_id = s.id
from public.schools s
where ai.school_id is null
and s.name = coalesce(nullif(ai.school_name, ''), 'Local School');

alter table public.classes
  add column if not exists school_id uuid references public.schools(id),
  add column if not exists schedule text,
  add column if not exists grade_level text,
  add column if not exists section text,
  add column if not exists school_year text,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.activities
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.classes c
set school_id = coalesce(p.school_id, s.id)
from public.profiles p
cross join public.schools s
where c.school_id is null
and c.teacher_id = p.id
and s.name = 'Local School';

create table if not exists public.competencies (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id),
  grade_level text not null,
  subject text not null,
  quarter text not null,
  learning_area text,
  competency_code text,
  competency_text text not null,
  source text not null default 'Teacher provided',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (school_id, grade_level, subject, quarter, competency_code)
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  competency_id uuid references public.competencies(id),
  title text not null,
  assessment_component text not null check (assessment_component in ('Written Work','Performance Task','Quarterly Assessment','Formative Check')),
  grade_level text,
  subject text,
  quarter text,
  topic text,
  instructions text,
  due_date date,
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  randomize_questions boolean not null default false,
  randomize_choices boolean not null default true,
  allow_late boolean not null default false,
  time_limit_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  competency_id uuid references public.competencies(id),
  item_no integer not null,
  question_type text not null check (question_type in ('mcq','truefalse','identification','essay')),
  difficulty text not null default 'Average' check (difficulty in ('Easy','Average','Challenging')),
  prompt text not null,
  answer_key text,
  points numeric not null default 1 check (points > 0),
  auto_check boolean not null default true,
  explanation text,
  created_at timestamptz not null default now(),
  unique (exam_id, item_no)
);

create table if not exists public.question_choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  choice_label text not null,
  choice_text text not null,
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, choice_label)
);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric,
  max_score numeric,
  status text not null default 'in_progress' check (status in ('in_progress','submitted','graded','returned')),
  feedback text,
  unique (exam_id, student_id)
);

create table if not exists public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer_text text,
  selected_choice_id uuid references public.question_choices(id),
  is_correct boolean,
  awarded_points numeric,
  checked_at timestamptz,
  checked_by uuid references public.profiles(id),
  unique (attempt_id, question_id)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('activity','exam','manual')),
  source_id uuid,
  component text not null,
  score numeric not null,
  max_score numeric not null check (max_score > 0),
  remarks text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present','absent','late','excused')),
  marked_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (class_id, student_id, attendance_date)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  school_id uuid references public.schools(id),
  action text not null,
  table_name text,
  record_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  id text primary key default 'global',
  school_year text not null default '2026-2027',
  grading_components jsonb not null default '["Written Work","Performance Task","Quarterly Assessment"]'::jsonb,
  exam_generator_enabled boolean not null default true,
  auto_check_enabled boolean not null default true,
  late_submissions_enabled boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (id = 'global')
);

insert into public.system_settings (id)
values ('global')
on conflict (id) do nothing;

create index if not exists idx_profiles_school_id on public.profiles(school_id);
create index if not exists idx_classes_school_id on public.classes(school_id);
create index if not exists idx_classes_teacher_id on public.classes(teacher_id);
create index if not exists idx_competencies_lookup on public.competencies(grade_level, subject, quarter);
create index if not exists idx_exams_class_id on public.exams(class_id);
create index if not exists idx_questions_exam_id on public.questions(exam_id);
create index if not exists idx_exam_attempts_exam_student on public.exam_attempts(exam_id, student_id);
create index if not exists idx_scores_class_student on public.scores(class_id, student_id);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_id);

create or replace function public.is_school_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
    and (
      p.role = 'super_admin'
      or (p.role = 'school_admin' and p.school_id = target_school_id)
    )
  );
$$;

create or replace function public.can_manage_school(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_school_admin(target_school_id);
$$;

create or replace function public.is_exam_teacher(target_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.exams e
    where e.id = target_exam_id
    and (
      e.teacher_id = auth.uid()
      or public.is_school_admin((select c.school_id from public.classes c where c.id = e.class_id))
    )
  );
$$;

create or replace function public.can_access_exam(target_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.exams e
    where e.id = target_exam_id
    and (
      e.teacher_id = auth.uid()
      or public.is_class_member(e.class_id)
      or public.is_school_admin((select c.school_id from public.classes c where c.id = e.class_id))
    )
  );
$$;

create or replace function public.log_audit(
  action_input text,
  table_name_input text,
  record_id_input uuid,
  before_input jsonb default null,
  after_input jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_school uuid;
begin
  select school_id into actor_school
  from public.profiles
  where id = auth.uid();

  insert into public.audit_logs (actor_id, school_id, action, table_name, record_id, before_data, after_data)
  values (auth.uid(), actor_school, action_input, table_name_input, record_id_input, before_input, after_input);
end;
$$;

alter table public.schools enable row level security;
alter table public.competencies enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.question_choices enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.submission_answers enable row level security;
alter table public.scores enable row level security;
alter table public.attendance enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists "schools visible to members" on public.schools;
create policy "schools visible to members"
on public.schools for select
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
    and p.school_id = schools.id
  )
);

drop policy if exists "admins manage schools" on public.schools;
create policy "admins manage schools"
on public.schools for all
to authenticated
using (public.is_super_admin() or public.is_school_admin(id))
with check (public.is_super_admin() or public.is_school_admin(id));

drop policy if exists "admins manage class memberships" on public.class_members;
create policy "admins manage class memberships"
on public.class_members for all
to authenticated
using (
  public.is_super_admin()
  or public.is_school_admin((select c.school_id from public.classes c where c.id = class_members.class_id))
)
with check (
  public.is_super_admin()
  or public.is_school_admin((select c.school_id from public.classes c where c.id = class_members.class_id))
);

drop policy if exists "competencies visible to signed in users" on public.competencies;
create policy "competencies visible to signed in users"
on public.competencies for select
to authenticated
using (
  school_id is null
  or public.is_school_admin(school_id)
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
    and p.school_id = competencies.school_id
  )
);

drop policy if exists "teachers manage competencies" on public.competencies;
create policy "teachers manage competencies"
on public.competencies for all
to authenticated
using (
  public.is_super_admin()
  or public.is_school_admin(school_id)
  or created_by = auth.uid()
)
with check (
  public.is_super_admin()
  or public.is_school_admin(school_id)
  or created_by = auth.uid()
);

drop policy if exists "exams visible to class users" on public.exams;
create policy "exams visible to class users"
on public.exams for select
to authenticated
using (public.can_access_exam(id));

drop policy if exists "teachers manage exams" on public.exams;
create policy "teachers manage exams"
on public.exams for all
to authenticated
using (
  teacher_id = auth.uid()
  or public.is_school_admin((select c.school_id from public.classes c where c.id = exams.class_id))
)
with check (
  teacher_id = auth.uid()
  or public.is_school_admin((select c.school_id from public.classes c where c.id = exams.class_id))
);

drop policy if exists "questions visible with exams" on public.questions;
create policy "questions visible with exams"
on public.questions for select
to authenticated
using (public.can_access_exam(exam_id));

drop policy if exists "teachers manage questions" on public.questions;
create policy "teachers manage questions"
on public.questions for all
to authenticated
using (public.is_exam_teacher(exam_id))
with check (public.is_exam_teacher(exam_id));

drop policy if exists "choices visible with questions" on public.question_choices;
create policy "choices visible with questions"
on public.question_choices for select
to authenticated
using (
  exists (
    select 1 from public.questions q
    where q.id = question_choices.question_id
    and public.can_access_exam(q.exam_id)
  )
);

drop policy if exists "teachers manage choices" on public.question_choices;
create policy "teachers manage choices"
on public.question_choices for all
to authenticated
using (
  exists (
    select 1 from public.questions q
    where q.id = question_choices.question_id
    and public.is_exam_teacher(q.exam_id)
  )
)
with check (
  exists (
    select 1 from public.questions q
    where q.id = question_choices.question_id
    and public.is_exam_teacher(q.exam_id)
  )
);

drop policy if exists "attempts visible to owner or teacher" on public.exam_attempts;
create policy "attempts visible to owner or teacher"
on public.exam_attempts for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_exam_teacher(exam_id)
);

drop policy if exists "students create own attempts" on public.exam_attempts;
create policy "students create own attempts"
on public.exam_attempts for insert
to authenticated
with check (
  student_id = auth.uid()
  and public.can_access_exam(exam_id)
);

drop policy if exists "students update own attempts" on public.exam_attempts;
create policy "students update own attempts"
on public.exam_attempts for update
to authenticated
using (student_id = auth.uid() or public.is_exam_teacher(exam_id))
with check (student_id = auth.uid() or public.is_exam_teacher(exam_id));

drop policy if exists "answers visible to owner or teacher" on public.submission_answers;
create policy "answers visible to owner or teacher"
on public.submission_answers for select
to authenticated
using (
  exists (
    select 1 from public.exam_attempts ea
    where ea.id = submission_answers.attempt_id
    and (ea.student_id = auth.uid() or public.is_exam_teacher(ea.exam_id))
  )
);

drop policy if exists "students write own answers" on public.submission_answers;
create policy "students write own answers"
on public.submission_answers for all
to authenticated
using (
  exists (
    select 1 from public.exam_attempts ea
    where ea.id = submission_answers.attempt_id
    and ea.student_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.exam_attempts ea
    where ea.id = submission_answers.attempt_id
    and ea.student_id = auth.uid()
  )
);

drop policy if exists "scores visible to class users" on public.scores;
create policy "scores visible to class users"
on public.scores for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_class_teacher(class_id)
  or public.is_school_admin((select c.school_id from public.classes c where c.id = scores.class_id))
);

drop policy if exists "teachers manage scores" on public.scores;
create policy "teachers manage scores"
on public.scores for all
to authenticated
using (
  created_by = auth.uid()
  or public.is_class_teacher(class_id)
  or public.is_school_admin((select c.school_id from public.classes c where c.id = scores.class_id))
)
with check (
  created_by = auth.uid()
  or public.is_class_teacher(class_id)
  or public.is_school_admin((select c.school_id from public.classes c where c.id = scores.class_id))
);

drop policy if exists "attendance visible to class users" on public.attendance;
create policy "attendance visible to class users"
on public.attendance for select
to authenticated
using (
  student_id = auth.uid()
  or public.is_class_teacher(class_id)
  or public.is_school_admin((select c.school_id from public.classes c where c.id = attendance.class_id))
);

drop policy if exists "teachers manage attendance" on public.attendance;
create policy "teachers manage attendance"
on public.attendance for all
to authenticated
using (
  public.is_class_teacher(class_id)
  or public.is_school_admin((select c.school_id from public.classes c where c.id = attendance.class_id))
)
with check (
  public.is_class_teacher(class_id)
  or public.is_school_admin((select c.school_id from public.classes c where c.id = attendance.class_id))
);

drop policy if exists "admins manage announcements" on public.announcements;
create policy "admins manage announcements"
on public.announcements for all
to authenticated
using (
  public.is_super_admin()
  or public.is_school_admin((select c.school_id from public.classes c where c.id = announcements.class_id))
)
with check (
  public.is_super_admin()
  or public.is_school_admin((select c.school_id from public.classes c where c.id = announcements.class_id))
);

drop policy if exists "admins view audit logs" on public.audit_logs;
create policy "admins view audit logs"
on public.audit_logs for select
to authenticated
using (
  public.is_super_admin()
  or public.is_school_admin(school_id)
);

drop policy if exists "signed in users write audit logs" on public.audit_logs;
create policy "signed in users write audit logs"
on public.audit_logs for insert
to authenticated
with check (actor_id = auth.uid());

drop policy if exists "settings visible to signed in users" on public.system_settings;
create policy "settings visible to signed in users"
on public.system_settings for select
to authenticated
using (true);

drop policy if exists "admins manage settings" on public.system_settings;
create policy "admins manage settings"
on public.system_settings for all
to authenticated
using (public.is_super_admin() or public.is_school_admin((select p.school_id from public.profiles p where p.id = auth.uid())))
with check (public.is_super_admin() or public.is_school_admin((select p.school_id from public.profiles p where p.id = auth.uid())));
