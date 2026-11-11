-- Run once on a NEW Neon database after enabling Neon Auth and Data API.
-- Apply as database owner. Never run against the existing Supabase project.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
-- Internal mapping preserves the original profile IDs and all classroom foreign keys.
create table private.identity_links(neon_user_id text primary key,profile_id uuid not null unique);
create table private.legacy_accounts(profile_id uuid primary key,email text not null unique,source_verified boolean not null);
revoke all on all tables in schema private from public,authenticated;
create function private.actor_id() returns uuid language sql stable security definer set search_path=private,pg_temp
as $$ select profile_id from private.identity_links where neon_user_id=auth.user_id(); $$;
create function private.claim_profile() returns uuid language plpgsql security definer set search_path=private,pg_temp
as $$ declare account_email text; verified boolean; target uuid; begin
  if auth.user_id() is null then raise exception 'Sign in first'; end if;
  select email,"emailVerified" into account_email,verified from neon_auth."user" where id::text=auth.user_id();
  if not coalesce(verified,false) then return null; end if;
  select profile_id into target from private.identity_links where neon_user_id=auth.user_id();
  if target is not null then return target; end if;
  select profile_id into target from private.legacy_accounts where email=lower(trim(account_email)) and source_verified for update;
  if target is null then return null; end if;
  insert into private.identity_links(neon_user_id,profile_id) values(auth.user_id(),target)
  on conflict(neon_user_id) do nothing;
  return target;
end; $$;



create table if not exists public.profiles (
  id uuid primary key ,
  email text,
  full_name text not null,
  role text not null check (role in ('super_admin','school_admin','teacher','student')),
  school_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null check (role in ('super_admin','school_admin')),
  school_name text,
  invited_by uuid not null references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  subject text not null,
  schedule text,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attendance text not null default 'present',
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  type text not null default 'Activity',
  mode text not null default 'manual' check (mode in ('manual','auto')),
  due_date date,
  status text not null default 'Open',
  instructions text,
  standard jsonb not null default '{}'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score numeric,
  max_score numeric,
  feedback text,
  checked_at date,
  submitted_at timestamptz not null default now(),
  unique(activity_id, student_id)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  message text not null,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = private.actor_id()
    and role = 'super_admin'
  );
$$;

create or replace function private.is_class_teacher(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
    and c.teacher_id = private.actor_id()
  );
$$;

create or replace function private.is_class_member(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.class_members cm
    where cm.class_id = target_class_id
    and cm.user_id = private.actor_id()
  );
$$;

drop function if exists public.join_class_by_code(text);

create or replace function public.join_class_by_code(code_input text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_class uuid;
begin
  select id into target_class
  from public.classes
  where lower(join_code) = lower(trim(code_input));

  if target_class is null then
    raise exception 'Class code not found';
  end if;

  insert into public.class_members (class_id, user_id)
  values (target_class, private.actor_id())
  on conflict (class_id, user_id) do nothing;

  return target_class;
end;
$$;

alter table public.profiles enable row level security;
alter table public.admin_invites enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.activities enable row level security;
alter table public.submissions enable row level security;
alter table public.announcements enable row level security;

create policy "profiles visible to signed in users"
on public.profiles for select
to authenticated
using (true);

create policy "admins view all profiles"
on public.profiles for select
to authenticated
using (private.is_super_admin());

create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check (id = private.actor_id());

create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = private.actor_id())
with check (id = private.actor_id());

create policy "super admins update profiles"
on public.profiles for update
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

create policy "super admins manage admin invites"
on public.admin_invites for all
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

create policy "teachers create own classes"
on public.classes for insert
to authenticated
with check (teacher_id = private.actor_id());

create policy "class visibility for teachers and members"
on public.classes for select
to authenticated
using (
  teacher_id = private.actor_id()
  or private.is_class_member(id)
  or private.is_super_admin()
);

create policy "teachers update own classes"
on public.classes for update
to authenticated
using (teacher_id = private.actor_id())
with check (teacher_id = private.actor_id());

create policy "admins manage all classes"
on public.classes for all
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

create policy "membership visibility"
on public.class_members for select
to authenticated
using (
  user_id = private.actor_id()
  or private.is_class_teacher(class_id)
  or private.is_super_admin()
);

create policy "students insert own membership"
on public.class_members for insert
to authenticated
with check (user_id = private.actor_id());

create policy "admins view all memberships"
on public.class_members for select
to authenticated
using (private.is_super_admin());

create policy "teachers create activities"
on public.activities for insert
to authenticated
with check (
  teacher_id = private.actor_id()
  and exists (
    select 1 from public.classes c
    where c.id = class_id and c.teacher_id = private.actor_id()
  )
);

create policy "activities visible to teachers and members"
on public.activities for select
to authenticated
using (
  teacher_id = private.actor_id()
  or private.is_class_member(class_id)
  or private.is_super_admin()
);

create policy "teachers update own activities"
on public.activities for update
to authenticated
using (teacher_id = private.actor_id())
with check (teacher_id = private.actor_id());

create policy "admins manage all activities"
on public.activities for all
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

create policy "students submit own work"
on public.submissions for insert
to authenticated
with check (
  student_id = private.actor_id()
  and exists (
    select 1 from public.activities a
    where a.id = activity_id
    and private.is_class_member(a.class_id)
  )
);

create policy "students update own submissions"
on public.submissions for update
to authenticated
using (student_id = private.actor_id())
with check (student_id = private.actor_id());

create policy "submissions visible to owner or teacher"
on public.submissions for select
to authenticated
using (
  student_id = private.actor_id()
  or exists (
    select 1 from public.activities a
    where a.id = submissions.activity_id and a.teacher_id = private.actor_id()
  )
);

create policy "admins view all submissions"
on public.submissions for select
to authenticated
using (private.is_super_admin());

create policy "announcements visible to class users"
on public.announcements for select
to authenticated
using (
  private.is_class_teacher(class_id)
  or private.is_class_member(class_id)
  or private.is_super_admin()
);

create policy "admins view all announcements"
on public.announcements for select
to authenticated
using (private.is_super_admin());

create policy "teachers create announcements"
on public.announcements for insert
to authenticated
with check (
  private.is_class_teacher(class_id)
  or private.is_super_admin()
);

-- Fixes: infinite recursion detected in policy for relation "class_members".
-- Run this in Supabase SQL Editor after schema.sql.

create or replace function private.is_class_teacher(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
    and c.teacher_id = private.actor_id()
  );
$$;

create or replace function private.is_class_member(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.class_members cm
    where cm.class_id = target_class_id
    and cm.user_id = private.actor_id()
  );
$$;

drop policy if exists "class visibility for teachers and members" on public.classes;
drop policy if exists "membership visibility" on public.class_members;
drop policy if exists "activities visible to teachers and members" on public.activities;
drop policy if exists "students submit own work" on public.submissions;
drop policy if exists "announcements visible to class users" on public.announcements;
drop policy if exists "teachers create announcements" on public.announcements;

create policy "class visibility for teachers and members"
on public.classes for select
to authenticated
using (
  teacher_id = private.actor_id()
  or private.is_class_member(id)
  or private.is_super_admin()
);

create policy "membership visibility"
on public.class_members for select
to authenticated
using (
  user_id = private.actor_id()
  or private.is_class_teacher(class_id)
  or private.is_super_admin()
);

create policy "activities visible to teachers and members"
on public.activities for select
to authenticated
using (
  teacher_id = private.actor_id()
  or private.is_class_member(class_id)
  or private.is_super_admin()
);

create policy "students submit own work"
on public.submissions for insert
to authenticated
with check (
  student_id = private.actor_id()
  and exists (
    select 1
    from public.activities a
    where a.id = activity_id
    and private.is_class_member(a.class_id)
  )
);

create policy "announcements visible to class users"
on public.announcements for select
to authenticated
using (
  private.is_class_teacher(class_id)
  or private.is_class_member(class_id)
  or private.is_super_admin()
);

create policy "teachers create announcements"
on public.announcements for insert
to authenticated
with check (
  private.is_class_teacher(class_id)
  or private.is_super_admin()
);


-- Run this after promoting your first super_admin.
-- It lets admin accounts see and manage school-wide records.

drop policy if exists "admins view all profiles" on public.profiles;
create policy "admins view all profiles"
on public.profiles for select
to authenticated
using (private.is_super_admin());

drop policy if exists "admins manage all classes" on public.classes;
create policy "admins manage all classes"
on public.classes for all
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists "admins view all memberships" on public.class_members;
create policy "admins view all memberships"
on public.class_members for select
to authenticated
using (private.is_super_admin());

drop policy if exists "admins manage all activities" on public.activities;
create policy "admins manage all activities"
on public.activities for all
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists "admins view all submissions" on public.submissions;
create policy "admins view all submissions"
on public.submissions for select
to authenticated
using (private.is_super_admin());

drop policy if exists "admins view all announcements" on public.announcements;
create policy "admins view all announcements"
on public.announcements for select
to authenticated
using (private.is_super_admin());


-- KlasePH production database upgrade.
-- Run after schema.sql and rls-recursion-fix.sql.
-- This keeps the current app compatible while adding normalized production tables.



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

create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  action_taken text not null,
  follow_up_date date,
  status text not null default 'pending' check (status in ('pending','improving','resolved')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
create index if not exists idx_interventions_student_class on public.interventions(student_id, class_id);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_id);

create or replace function private.is_school_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = private.actor_id()
    and (
      p.role = 'super_admin'
      or (p.role = 'school_admin' and p.school_id = target_school_id)
    )
  );
$$;

create or replace function private.can_manage_school(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_school_admin(target_school_id);
$$;

create or replace function private.is_exam_teacher(target_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.exams e
    where e.id = target_exam_id
    and (
      e.teacher_id = private.actor_id()
      or private.is_school_admin((select c.school_id from public.classes c where c.id = e.class_id))
    )
  );
$$;

create or replace function private.can_access_exam(target_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.exams e
    where e.id = target_exam_id
    and (
      e.teacher_id = private.actor_id()
      or private.is_class_member(e.class_id)
      or private.is_school_admin((select c.school_id from public.classes c where c.id = e.class_id))
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
set search_path = public, pg_temp
as $$
declare
  actor_school uuid;
begin
  select school_id into actor_school
  from public.profiles
  where id = private.actor_id();

  insert into public.audit_logs (actor_id, school_id, action, table_name, record_id, before_data, after_data)
  values (private.actor_id(), actor_school, action_input, table_name_input, record_id_input, before_input, after_input);
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
alter table public.interventions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists "schools visible to members" on public.schools;
create policy "schools visible to members"
on public.schools for select
to authenticated
using (
  private.is_super_admin()
  or exists (
    select 1 from public.profiles p
    where p.id = private.actor_id()
    and p.school_id = schools.id
  )
);

drop policy if exists "admins manage schools" on public.schools;
create policy "admins manage schools"
on public.schools for all
to authenticated
using (private.is_super_admin() or private.is_school_admin(id))
with check (private.is_super_admin() or private.is_school_admin(id));

drop policy if exists "admins manage class memberships" on public.class_members;
create policy "admins manage class memberships"
on public.class_members for all
to authenticated
using (
  private.is_super_admin()
  or private.is_school_admin((select c.school_id from public.classes c where c.id = class_members.class_id))
)
with check (
  private.is_super_admin()
  or private.is_school_admin((select c.school_id from public.classes c where c.id = class_members.class_id))
);

drop policy if exists "competencies visible to signed in users" on public.competencies;
create policy "competencies visible to signed in users"
on public.competencies for select
to authenticated
using (
  school_id is null
  or private.is_school_admin(school_id)
  or exists (
    select 1 from public.profiles p
    where p.id = private.actor_id()
    and p.school_id = competencies.school_id
  )
);

drop policy if exists "teachers manage competencies" on public.competencies;
create policy "teachers manage competencies"
on public.competencies for all
to authenticated
using (
  private.is_super_admin()
  or private.is_school_admin(school_id)
  or created_by = private.actor_id()
)
with check (
  private.is_super_admin()
  or private.is_school_admin(school_id)
  or created_by = private.actor_id()
);

drop policy if exists "exams visible to class users" on public.exams;
create policy "exams visible to class users"
on public.exams for select
to authenticated
using (private.can_access_exam(id));

drop policy if exists "teachers manage exams" on public.exams;
create policy "teachers manage exams"
on public.exams for all
to authenticated
using (
  teacher_id = private.actor_id()
  or private.is_school_admin((select c.school_id from public.classes c where c.id = exams.class_id))
)
with check (
  teacher_id = private.actor_id()
  or private.is_school_admin((select c.school_id from public.classes c where c.id = exams.class_id))
);

drop policy if exists "questions visible with exams" on public.questions;
create policy "questions visible with exams"
on public.questions for select
to authenticated
using (private.can_access_exam(exam_id));

drop policy if exists "teachers manage questions" on public.questions;
create policy "teachers manage questions"
on public.questions for all
to authenticated
using (private.is_exam_teacher(exam_id))
with check (private.is_exam_teacher(exam_id));

drop policy if exists "choices visible with questions" on public.question_choices;
create policy "choices visible with questions"
on public.question_choices for select
to authenticated
using (
  exists (
    select 1 from public.questions q
    where q.id = question_choices.question_id
    and private.can_access_exam(q.exam_id)
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
    and private.is_exam_teacher(q.exam_id)
  )
)
with check (
  exists (
    select 1 from public.questions q
    where q.id = question_choices.question_id
    and private.is_exam_teacher(q.exam_id)
  )
);

drop policy if exists "attempts visible to owner or teacher" on public.exam_attempts;
create policy "attempts visible to owner or teacher"
on public.exam_attempts for select
to authenticated
using (
  student_id = private.actor_id()
  or private.is_exam_teacher(exam_id)
);

drop policy if exists "students create own attempts" on public.exam_attempts;
create policy "students create own attempts"
on public.exam_attempts for insert
to authenticated
with check (
  student_id = private.actor_id()
  and private.can_access_exam(exam_id)
);

drop policy if exists "students update own attempts" on public.exam_attempts;
create policy "students update own attempts"
on public.exam_attempts for update
to authenticated
using (student_id = private.actor_id() or private.is_exam_teacher(exam_id))
with check (student_id = private.actor_id() or private.is_exam_teacher(exam_id));

drop policy if exists "answers visible to owner or teacher" on public.submission_answers;
create policy "answers visible to owner or teacher"
on public.submission_answers for select
to authenticated
using (
  exists (
    select 1 from public.exam_attempts ea
    where ea.id = submission_answers.attempt_id
    and (ea.student_id = private.actor_id() or private.is_exam_teacher(ea.exam_id))
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
    and ea.student_id = private.actor_id()
  )
)
with check (
  exists (
    select 1 from public.exam_attempts ea
    where ea.id = submission_answers.attempt_id
    and ea.student_id = private.actor_id()
  )
);

drop policy if exists "scores visible to class users" on public.scores;
create policy "scores visible to class users"
on public.scores for select
to authenticated
using (
  student_id = private.actor_id()
  or private.is_class_teacher(class_id)
  or private.is_school_admin((select c.school_id from public.classes c where c.id = scores.class_id))
);

drop policy if exists "teachers manage scores" on public.scores;
create policy "teachers manage scores"
on public.scores for all
to authenticated
using (
  created_by = private.actor_id()
  or private.is_class_teacher(class_id)
  or private.is_school_admin((select c.school_id from public.classes c where c.id = scores.class_id))
)
with check (
  created_by = private.actor_id()
  or private.is_class_teacher(class_id)
  or private.is_school_admin((select c.school_id from public.classes c where c.id = scores.class_id))
);

drop policy if exists "attendance visible to class users" on public.attendance;
create policy "attendance visible to class users"
on public.attendance for select
to authenticated
using (
  student_id = private.actor_id()
  or private.is_class_teacher(class_id)
  or private.is_school_admin((select c.school_id from public.classes c where c.id = attendance.class_id))
);

drop policy if exists "teachers manage attendance" on public.attendance;
create policy "teachers manage attendance"
on public.attendance for all
to authenticated
using (
  private.is_class_teacher(class_id)
  or private.is_school_admin((select c.school_id from public.classes c where c.id = attendance.class_id))
)
with check (
  private.is_class_teacher(class_id)
  or private.is_school_admin((select c.school_id from public.classes c where c.id = attendance.class_id))
);

drop policy if exists "interventions visible to teachers and admins" on public.interventions;
create policy "interventions visible to teachers and admins"
on public.interventions for select
to authenticated
using (
  teacher_id = private.actor_id()
  or private.is_super_admin()
  or private.is_school_admin((select c.school_id from public.classes c where c.id = interventions.class_id))
);

drop policy if exists "teachers manage interventions" on public.interventions;
create policy "teachers manage interventions"
on public.interventions for all
to authenticated
using (
  teacher_id = private.actor_id()
  or private.is_super_admin()
  or private.is_school_admin((select c.school_id from public.classes c where c.id = interventions.class_id))
)
with check (
  teacher_id = private.actor_id()
  or private.is_super_admin()
  or private.is_school_admin((select c.school_id from public.classes c where c.id = interventions.class_id))
);

drop policy if exists "admins manage announcements" on public.announcements;
create policy "admins manage announcements"
on public.announcements for all
to authenticated
using (
  private.is_super_admin()
  or private.is_school_admin((select c.school_id from public.classes c where c.id = announcements.class_id))
)
with check (
  private.is_super_admin()
  or private.is_school_admin((select c.school_id from public.classes c where c.id = announcements.class_id))
);

drop policy if exists "admins view audit logs" on public.audit_logs;
create policy "admins view audit logs"
on public.audit_logs for select
to authenticated
using (
  private.is_super_admin()
  or private.is_school_admin(school_id)
);

drop policy if exists "signed in users write audit logs" on public.audit_logs;
create policy "signed in users write audit logs"
on public.audit_logs for insert
to authenticated
with check (actor_id = private.actor_id());

drop policy if exists "settings visible to signed in users" on public.system_settings;
create policy "settings visible to signed in users"
on public.system_settings for select
to authenticated
using (true);

drop policy if exists "admins manage settings" on public.system_settings;
create policy "admins manage settings"
on public.system_settings for all
to authenticated
using (private.is_super_admin() or private.is_school_admin((select p.school_id from public.profiles p where p.id = private.actor_id())))
with check (private.is_super_admin() or private.is_school_admin((select p.school_id from public.profiles p where p.id = private.actor_id())));

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
set search_path = public, pg_temp
as $$
declare
  before_row jsonb;
  after_row jsonb;
begin
  if not private.is_super_admin() then
    raise exception 'Only super_admin can update user roles or status';
  end if;

  if target_user_id = private.actor_id() and new_status <> 'active' then
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
set search_path = public, pg_temp
as $$
declare
  invite_id uuid;
begin
  if not private.is_super_admin() then
    raise exception 'Only super_admin can create admin invites';
  end if;

  if invite_role not in ('super_admin','school_admin') then
    raise exception 'Invalid admin invite role';
  end if;

  insert into public.admin_invites (email, role, school_id, school_name, invited_by)
  values (lower(trim(invite_email)), invite_role, invite_school_id, invite_school_name, private.actor_id())
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
with check (private.is_super_admin());


-- KlasePH onboarding profile upgrade.
-- Run after admin-dashboard-upgrade.sql.
-- Persists signup/onboarding fields without exposing private identifiers in public profiles.

create table if not exists public.profile_onboarding (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  region text,
  division text,
  school_code text,
  school_year text,
  employee_id text,
  position text,
  grade_levels text,
  subjects text,
  advisory_section text,
  lrn text,
  grade_level text,
  section text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- LRN is intentionally not unique at public signup. It is user-entered and optional;
-- schools should verify it before using it as an authoritative learner identifier.

alter table public.profile_onboarding enable row level security;

drop policy if exists "users read own onboarding profile" on public.profile_onboarding;
create policy "users read own onboarding profile"
on public.profile_onboarding for select
to authenticated
using (user_id = private.actor_id() or private.is_super_admin());

drop policy if exists "users update own onboarding profile" on public.profile_onboarding;
create policy "users update own onboarding profile"
on public.profile_onboarding for update
to authenticated
using (user_id = private.actor_id() or private.is_super_admin())
with check (user_id = private.actor_id() or private.is_super_admin());

drop policy if exists "users insert own onboarding profile" on public.profile_onboarding;
create policy "users insert own onboarding profile"
on public.profile_onboarding for insert
to authenticated
with check (user_id = private.actor_id() or private.is_super_admin());

-- Minimal, non-sensitive school directory for the public signup screen.
create or replace function public.list_signup_schools()
returns table (
  id uuid,
  name text,
  school_code text,
  region text,
  division text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.name, s.school_code, s.region, s.division
  from public.schools s
  order by s.region nulls last, s.division nulls last, s.name;
$$;

grant execute on function public.list_signup_schools() to authenticated;


-- All identity and role decisions are made using the authenticated database identity.
create or replace function private.is_active()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.profiles where id = private.actor_id() and status = 'active'); $$;

create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.profiles where id = private.actor_id() and role = 'super_admin' and status = 'active'); $$;

-- Profile inserts and changes go through scoped RPCs, not self-editable role fields.
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "profiles visible to signed in users" on public.profiles;
create policy "related profiles only" on public.profiles for select to authenticated using (
  id = private.actor_id() or private.is_super_admin()
  or exists(select 1 from public.class_members cm where cm.user_id = profiles.id and private.is_class_teacher(cm.class_id))
  or exists(select 1 from public.classes c where c.teacher_id = profiles.id and private.is_class_member(c.id))
  or private.is_school_admin(school_id)
);

create or replace function public.complete_onboarding(metadata jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  actor uuid := coalesce(private.claim_profile(), (auth.user_id())::uuid);
  account_email text;
  verified boolean;
  chosen_role text := metadata->>'role';
  school uuid;
  invitation public.admin_invites%rowtype;
begin
  if actor is null then raise exception 'Sign in first'; end if;
  select email, "emailVerified" into account_email, verified from neon_auth."user" where id::text = auth.user_id();
  if account_email is null or not coalesce(verified,false) then raise exception 'Verify your email before continuing'; end if;
  if exists(select 1 from public.profiles where id = actor) then return; end if;
  if chosen_role not in ('student','teacher') or chosen_role is null then raise exception 'Choose teacher or student'; end if;
  if length(trim(coalesce(metadata->>'full_name',''))) = 0 then raise exception 'Full name is required'; end if;
  select id into school from public.schools where name = metadata->>'school_name' limit 1;
  select * into invitation from public.admin_invites where lower(email) = lower(account_email) and accepted_at is null for update;
  insert into public.profiles(id,email,full_name,role,school_name,school_id)
  values(actor,account_email,left(trim(metadata->>'full_name'),200),coalesce(invitation.role,chosen_role),
    coalesce(invitation.school_name,left(metadata->>'school_name',200)),coalesce(invitation.school_id,school));
  insert into private.identity_links(neon_user_id,profile_id) values(auth.user_id(),actor);
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
as $$ select exists(select 1 from public.profiles where id=private.actor_id() and role in ('teacher','school_admin','super_admin') and status='active'); $$;
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
  if not private.is_active() or not exists(select 1 from public.profiles where id=private.actor_id() and role='student') then raise exception 'An active student account is required'; end if;
  select id into target from public.classes where lower(join_code)=lower(trim(code_input)) and archived_at is null;
  if target is null then raise exception 'Class code not found'; end if;
  insert into public.class_members(class_id,user_id) values(target,private.actor_id()) on conflict do nothing;
  return target;
end; $$;

-- Students may update a submission only while they still belong to its class.
drop policy if exists "students update own submissions" on public.submissions;
create policy "students update own submissions" on public.submissions for update to authenticated
using (student_id=private.actor_id() and exists(select 1 from public.activities a where a.id=activity_id and private.is_class_member(a.class_id)))
with check (student_id=private.actor_id() and exists(select 1 from public.activities a where a.id=activity_id and private.is_class_member(a.class_id)));

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
  select id,school_id,left(action_input,100),left(table_name_input,100),record_id_input,before_input,after_input from public.profiles where id=private.actor_id();
end; $$;

create function public.claim_existing_profile() returns uuid language sql security invoker
set search_path=public,pg_temp as $$ select private.claim_profile(); $$;
revoke all on function public.claim_existing_profile() from public;
grant execute on function public.claim_existing_profile() to authenticated;

commit;
