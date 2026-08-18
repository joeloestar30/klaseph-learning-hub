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
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "users update own onboarding profile" on public.profile_onboarding;
create policy "users update own onboarding profile"
on public.profile_onboarding for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "users insert own onboarding profile" on public.profile_onboarding;
create policy "users insert own onboarding profile"
on public.profile_onboarding for insert
to authenticated
with check (user_id = auth.uid() or public.is_super_admin());

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
set search_path = public
as $$
  select s.id, s.name, s.school_code, s.region, s.division
  from public.schools s
  order by s.region nulls last, s.division nulls last, s.name;
$$;

grant execute on function public.list_signup_schools() to anon, authenticated;

-- Replace the signup trigger so Auth metadata is persisted at account creation,
-- including flows where email confirmation is required and no session exists yet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_school_id uuid;
  resolved_school_name text;
begin
  select s.id, s.name
  into resolved_school_id, resolved_school_name
  from public.schools s
  where (
    nullif(btrim(new.raw_user_meta_data ->> 'school_code'), '') is not null
    and lower(coalesce(s.school_code, '')) = lower(btrim(new.raw_user_meta_data ->> 'school_code'))
  )
  or lower(s.name) = lower(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'school_name'), ''), 'Local School'))
  order by case when lower(coalesce(s.school_code, '')) = lower(coalesce(new.raw_user_meta_data ->> 'school_code', '')) then 0 else 1 end
  limit 1;

  insert into public.profiles (id, email, full_name, role, school_name, school_id)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data ->> 'role' in ('teacher', 'student')
      then new.raw_user_meta_data ->> 'role'
      else 'student'
    end,
    coalesce(resolved_school_name, nullif(btrim(new.raw_user_meta_data ->> 'school_name'), ''), 'Local School'),
    resolved_school_id
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    school_name = excluded.school_name,
    school_id = coalesce(excluded.school_id, public.profiles.school_id);

  insert into public.profile_onboarding (
    user_id,
    region,
    division,
    school_code,
    school_year,
    employee_id,
    position,
    grade_levels,
    subjects,
    advisory_section,
    lrn,
    grade_level,
    section,
    updated_at
  ) values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'region'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'division'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'school_code'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'school_year'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'employee_id'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'position'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'grade_levels'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'subjects'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'advisory_section'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'lrn'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'grade_level'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'section'), ''),
    now()
  )
  on conflict (user_id) do update set
    region = excluded.region,
    division = excluded.division,
    school_code = excluded.school_code,
    school_year = excluded.school_year,
    employee_id = excluded.employee_id,
    position = excluded.position,
    grade_levels = excluded.grade_levels,
    subjects = excluded.subjects,
    advisory_section = excluded.advisory_section,
    lrn = excluded.lrn,
    grade_level = excluded.grade_level,
    section = excluded.section,
    updated_at = now();

  return new;
end;
$$;

-- Re-create the trigger in case an older schema was installed first.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
