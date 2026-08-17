create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, school_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data ->> 'role' in ('teacher', 'student')
      then new.raw_user_meta_data ->> 'role'
      else 'student'
    end,
    coalesce(new.raw_user_meta_data ->> 'school_name', 'Local School')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.apply_admin_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
begin
  select * into invite
  from public.admin_invites
  where lower(email) = lower(new.email)
  and accepted_at is null
  limit 1;

  if invite.id is not null then
    update public.profiles
    set role = invite.role,
        school_name = coalesce(invite.school_name, school_name)
    where id = new.id;

    update public.admin_invites
    set accepted_at = now()
    where id = invite.id;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_admin_invite_after_profile on public.profiles;
create trigger apply_admin_invite_after_profile
after insert on public.profiles
for each row execute function public.apply_admin_invite();

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
    and role = 'super_admin'
  );
$$;

create or replace function public.is_class_teacher(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
    and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_class_member(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_members cm
    where cm.class_id = target_class_id
    and cm.user_id = auth.uid()
  );
$$;

drop function if exists public.join_class_by_code(text);

create or replace function public.join_class_by_code(code_input text)
returns uuid
language plpgsql
security definer
set search_path = public
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
  values (target_class, auth.uid())
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
using (public.is_super_admin());

create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "super admins update profiles"
on public.profiles for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "super admins manage admin invites"
on public.admin_invites for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "teachers create own classes"
on public.classes for insert
to authenticated
with check (teacher_id = auth.uid());

create policy "class visibility for teachers and members"
on public.classes for select
to authenticated
using (
  teacher_id = auth.uid()
  or public.is_class_member(id)
  or public.is_super_admin()
);

create policy "teachers update own classes"
on public.classes for update
to authenticated
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

create policy "admins manage all classes"
on public.classes for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "membership visibility"
on public.class_members for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_class_teacher(class_id)
  or public.is_super_admin()
);

create policy "students insert own membership"
on public.class_members for insert
to authenticated
with check (user_id = auth.uid());

create policy "admins view all memberships"
on public.class_members for select
to authenticated
using (public.is_super_admin());

create policy "teachers create activities"
on public.activities for insert
to authenticated
with check (
  teacher_id = auth.uid()
  and exists (
    select 1 from public.classes c
    where c.id = class_id and c.teacher_id = auth.uid()
  )
);

create policy "activities visible to teachers and members"
on public.activities for select
to authenticated
using (
  teacher_id = auth.uid()
  or public.is_class_member(class_id)
  or public.is_super_admin()
);

create policy "teachers update own activities"
on public.activities for update
to authenticated
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

create policy "admins manage all activities"
on public.activities for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "students submit own work"
on public.submissions for insert
to authenticated
with check (
  student_id = auth.uid()
  and exists (
    select 1 from public.activities a
    where a.id = activity_id
    and public.is_class_member(a.class_id)
  )
);

create policy "students update own submissions"
on public.submissions for update
to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

create policy "submissions visible to owner or teacher"
on public.submissions for select
to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1 from public.activities a
    where a.id = submissions.activity_id and a.teacher_id = auth.uid()
  )
);

create policy "admins view all submissions"
on public.submissions for select
to authenticated
using (public.is_super_admin());

create policy "announcements visible to class users"
on public.announcements for select
to authenticated
using (
  public.is_class_teacher(class_id)
  or public.is_class_member(class_id)
  or public.is_super_admin()
);

create policy "admins view all announcements"
on public.announcements for select
to authenticated
using (public.is_super_admin());

create policy "teachers create announcements"
on public.announcements for insert
to authenticated
with check (
  public.is_class_teacher(class_id)
  or public.is_super_admin()
);
