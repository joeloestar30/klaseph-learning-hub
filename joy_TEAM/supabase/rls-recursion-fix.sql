-- Fixes: infinite recursion detected in policy for relation "class_members".
-- Run this in Supabase SQL Editor after schema.sql.

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
  teacher_id = auth.uid()
  or public.is_class_member(id)
  or public.is_super_admin()
);

create policy "membership visibility"
on public.class_members for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_class_teacher(class_id)
  or public.is_super_admin()
);

create policy "activities visible to teachers and members"
on public.activities for select
to authenticated
using (
  teacher_id = auth.uid()
  or public.is_class_member(class_id)
  or public.is_super_admin()
);

create policy "students submit own work"
on public.submissions for insert
to authenticated
with check (
  student_id = auth.uid()
  and exists (
    select 1
    from public.activities a
    where a.id = activity_id
    and public.is_class_member(a.class_id)
  )
);

create policy "announcements visible to class users"
on public.announcements for select
to authenticated
using (
  public.is_class_teacher(class_id)
  or public.is_class_member(class_id)
  or public.is_super_admin()
);

create policy "teachers create announcements"
on public.announcements for insert
to authenticated
with check (
  public.is_class_teacher(class_id)
  or public.is_super_admin()
);

