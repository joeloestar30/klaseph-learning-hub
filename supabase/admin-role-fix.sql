-- Run this after promoting your first super_admin.
-- It lets admin accounts see and manage school-wide records.

drop policy if exists "admins view all profiles" on public.profiles;
create policy "admins view all profiles"
on public.profiles for select
to authenticated
using (public.is_super_admin());

drop policy if exists "admins manage all classes" on public.classes;
create policy "admins manage all classes"
on public.classes for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "admins view all memberships" on public.class_members;
create policy "admins view all memberships"
on public.class_members for select
to authenticated
using (public.is_super_admin());

drop policy if exists "admins manage all activities" on public.activities;
create policy "admins manage all activities"
on public.activities for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "admins view all submissions" on public.submissions;
create policy "admins view all submissions"
on public.submissions for select
to authenticated
using (public.is_super_admin());

drop policy if exists "admins view all announcements" on public.announcements;
create policy "admins view all announcements"
on public.announcements for select
to authenticated
using (public.is_super_admin());

