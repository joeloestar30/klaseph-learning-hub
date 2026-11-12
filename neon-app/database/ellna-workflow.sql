-- Phase 3: governed ELLNA ownership, review, correction, retention and deletion.
-- Apply once after database/ellna.sql and database/secure-assessments.sql.
begin;

alter table public.system_settings add column if not exists ellna_retention_days integer not null default 365
  check (ellna_retention_days between 30 and 3650);

alter table public.ellna_forms add column if not exists student_id uuid references public.profiles(id);
alter table public.ellna_forms add column if not exists class_id uuid references public.classes(id);
alter table public.ellna_forms add column if not exists school_id uuid references public.schools(id);
alter table public.ellna_forms add column if not exists created_by uuid references public.profiles(id);
alter table public.ellna_forms add column if not exists status text not null default 'draft'
  check (status in ('draft','submitted','needs_correction','reviewed','deletion_requested','deleted'));
alter table public.ellna_forms add column if not exists submitted_at timestamptz;
alter table public.ellna_forms add column if not exists resubmitted_at timestamptz;
alter table public.ellna_forms add column if not exists reviewed_at timestamptz;
alter table public.ellna_forms add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.ellna_forms add column if not exists correction_requested_at timestamptz;
alter table public.ellna_forms add column if not exists correction_requested_by uuid references public.profiles(id);
alter table public.ellna_forms add column if not exists correction_note text;
alter table public.ellna_forms add column if not exists retention_until date;
alter table public.ellna_forms add column if not exists deletion_requested_at timestamptz;
alter table public.ellna_forms add column if not exists deletion_requested_by uuid references public.profiles(id);
alter table public.ellna_forms add column if not exists deletion_reason text;
alter table public.ellna_forms add column if not exists deleted_at timestamptz;
alter table public.ellna_forms add column if not exists deleted_by uuid references public.profiles(id);
alter table public.ellna_forms add column if not exists form_version text not null default 'photo-reconstruction-v1';
alter table public.ellna_forms add column if not exists revision integer not null default 1 check (revision > 0);
alter table public.ellna_forms add column if not exists created_at timestamptz not null default now();

update public.ellna_forms f set
  student_id = case when p.role='student' then f.owner_id else null end,
  created_by = f.owner_id,
  status = case when f.payload->>'_status'='submitted' then 'submitted' else 'draft' end,
  submitted_at = case when f.payload->>'_submitted_at' is not null then (f.payload->>'_submitted_at')::timestamptz else null end
from public.profiles p where p.id=f.owner_id and f.created_by is null;

create index if not exists idx_ellna_forms_student on public.ellna_forms(student_id);
create index if not exists idx_ellna_forms_class_status on public.ellna_forms(class_id,status);
create index if not exists idx_ellna_forms_school on public.ellna_forms(school_id);

create or replace function private.can_review_ellna(target_class uuid, target_school uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select private.is_class_teacher(target_class) or private.is_school_admin(target_school) or private.is_super_admin(); $$;

drop policy if exists ellna_read on public.ellna_forms;
drop policy if exists ellna_create on public.ellna_forms;
drop policy if exists ellna_edit on public.ellna_forms;
drop policy if exists ellna_governed_read on public.ellna_forms;
create policy ellna_governed_read on public.ellna_forms for select to authenticated using (
  private.is_active() and (
    (student_id=private.actor_id() and deleted_at is null)
    or (class_id is null and owner_id=private.actor_id() and deleted_at is null)
    or (deleted_at is null and private.can_review_ellna(class_id,school_id))
    or private.is_super_admin()
  )
);
revoke insert,update,delete on public.ellna_forms from authenticated;

create or replace function private.protect_ellna_identity()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.student_id is distinct from new.student_id or old.class_id is distinct from new.class_id
     or old.school_id is distinct from new.school_id or old.created_by is distinct from new.created_by
     or old.created_at is distinct from new.created_at
     or (old.submitted_at is not null and old.submitted_at is distinct from new.submitted_at) then
    raise exception 'ELLNA identity and initial submission metadata are immutable';
  end if;
  return new;
end; $$;
drop trigger if exists protect_ellna_identity on public.ellna_forms;
create trigger protect_ellna_identity before update on public.ellna_forms
for each row execute function private.protect_ellna_identity();

create or replace function public.save_ellna_form(
  form_id_input uuid, class_id_input uuid, student_id_input uuid,
  school_year_input text, payload_input jsonb, intent_input text default 'draft'
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := private.actor_id();
  actor_role text;
  target_student uuid;
  target_school uuid;
  existing public.ellna_forms%rowtype;
  result_id uuid := coalesce(form_id_input,gen_random_uuid());
  next_status text;
  retention integer;
  clean_payload jsonb;
begin
  select role into actor_role from public.profiles where id=actor and status='active';
  if actor_role is null then raise exception 'Active account required'; end if;
  if intent_input not in ('draft','submit') then raise exception 'Choose draft or submit'; end if;
  if school_year_input !~ '^[0-9]{4}-[0-9]{4}$'
     or split_part(school_year_input,'-',2)::int<>split_part(school_year_input,'-',1)::int+1 then
    raise exception 'Invalid school year';
  end if;
  select school_id into target_school from public.classes where id=class_id_input and archived_at is null;
  if not found then raise exception 'Choose an active class'; end if;

  if actor_role='student' then
    target_student := actor;
    if not private.is_class_member(class_id_input) then raise exception 'You are not enrolled in this class'; end if;
  elsif actor_role in ('teacher','school_admin','super_admin') then
    target_student := student_id_input;
    if not private.can_review_ellna(class_id_input,target_school) then raise exception 'You cannot manage this class'; end if;
    if target_student is null or not exists(select 1 from public.class_members where class_id=class_id_input and user_id=target_student) then
      raise exception 'Choose a learner enrolled in this class';
    end if;
  else raise exception 'Unsupported account role';
  end if;

  clean_payload := payload_input - '_status' - '_submitted_at' - '_reviewed_at' - '_correction_note';
  if jsonb_typeof(clean_payload)<>'object' then raise exception 'Form payload must be an object'; end if;
  select ellna_retention_days into retention from public.system_settings where id='global';
  retention := coalesce(retention,365);

  if form_id_input is not null then
    select * into existing from public.ellna_forms where id=form_id_input for update;
    if existing.id is null then raise exception 'ELLNA form not found'; end if;
    if existing.student_id is distinct from target_student or existing.class_id is distinct from class_id_input then
      raise exception 'Form ownership cannot be changed';
    end if;
    if not (existing.student_id=actor or private.can_review_ellna(existing.class_id,existing.school_id)) then
      raise exception 'Not authorized for this form';
    end if;
    if existing.status not in ('draft','needs_correction') then raise exception 'This form is read-only'; end if;
    next_status := case when intent_input='submit' then 'submitted' else existing.status end;
    update public.ellna_forms set payload=clean_payload,school_year=school_year_input,status=next_status,
      submitted_at=case when intent_input='submit' then coalesce(existing.submitted_at,now()) else submitted_at end,
      resubmitted_at=case when intent_input='submit' and existing.status='needs_correction' then now() else resubmitted_at end,
      reviewed_at=case when intent_input='submit' then null else reviewed_at end,
      reviewed_by=case when intent_input='submit' then null else reviewed_by end,
      correction_note=case when intent_input='submit' then null else correction_note end,
      retention_until=case when intent_input='submit' then coalesce(retention_until,current_date+retention) else retention_until end,
      revision=revision+1,updated_at=now()
    where id=form_id_input;
  else
    next_status := case when intent_input='submit' then 'submitted' else 'draft' end;
    insert into public.ellna_forms(id,owner_id,student_id,class_id,school_id,created_by,school_year,payload,status,
      submitted_at,retention_until)
    values(result_id,target_student,target_student,class_id_input,target_school,actor,school_year_input,clean_payload,next_status,
      case when intent_input='submit' then now() else null end,
      case when intent_input='submit' then current_date+retention else null end);
  end if;

  insert into public.audit_logs(actor_id,school_id,action,table_name,record_id,after_data)
  values(actor,target_school,case when intent_input='submit' then 'ellna_submit' else 'ellna_save_draft' end,
    'ellna_forms',result_id,jsonb_build_object('status',next_status,'revision',coalesce(existing.revision+1,1)));
  return result_id;
end; $$;

create or replace function public.review_ellna_form(form_id_input uuid, action_input text, note_input text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=private.actor_id(); target public.ellna_forms%rowtype;
begin
  select * into target from public.ellna_forms where id=form_id_input for update;
  if target.id is null or target.deleted_at is not null then raise exception 'ELLNA form not found'; end if;
  if not private.can_review_ellna(target.class_id,target.school_id) then raise exception 'Reviewer access required'; end if;
  if target.status<>'submitted' then raise exception 'Only submitted forms can be reviewed'; end if;
  if action_input='review' then
    update public.ellna_forms set status='reviewed',reviewed_at=now(),reviewed_by=actor,updated_at=now() where id=target.id;
  elsif action_input='request_correction' then
    if length(trim(coalesce(note_input,'')))<3 then raise exception 'Explain the required correction'; end if;
    update public.ellna_forms set status='needs_correction',correction_requested_at=now(),correction_requested_by=actor,
      correction_note=left(trim(note_input),1000),updated_at=now() where id=target.id;
  else raise exception 'Choose review or request_correction'; end if;
  insert into public.audit_logs(actor_id,school_id,action,table_name,record_id,after_data)
  values(actor,target.school_id,'ellna_'||action_input,'ellna_forms',target.id,
    jsonb_build_object('status',case when action_input='review' then 'reviewed' else 'needs_correction' end));
end; $$;

create or replace function public.export_ellna_form(form_id_input uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=private.actor_id(); target public.ellna_forms%rowtype; result jsonb;
begin
  select * into target from public.ellna_forms where id=form_id_input;
  if target.id is null or target.deleted_at is not null then raise exception 'ELLNA form not found'; end if;
  if not (target.student_id=actor or private.can_review_ellna(target.class_id,target.school_id)) then raise exception 'Not authorized to export'; end if;
  result:=jsonb_build_object('form_id',target.id,'form_version',target.form_version,'revision',target.revision,
    'student_id',target.student_id,'class_id',target.class_id,'school_id',target.school_id,'school_year',target.school_year,
    'status',target.status,'submitted_at',target.submitted_at,'resubmitted_at',target.resubmitted_at,
    'reviewed_at',target.reviewed_at,'retention_until',target.retention_until,'payload',target.payload,
    'exported_at',now());
  insert into public.audit_logs(actor_id,school_id,action,table_name,record_id)
  values(actor,target.school_id,'ellna_export','ellna_forms',target.id);
  return result;
end; $$;

create or replace function public.request_ellna_deletion(form_id_input uuid, reason_input text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=private.actor_id(); target public.ellna_forms%rowtype;
begin
  if length(trim(coalesce(reason_input,'')))<3 then raise exception 'Provide a deletion reason'; end if;
  select * into target from public.ellna_forms where id=form_id_input for update;
  if target.id is null or target.deleted_at is not null then raise exception 'ELLNA form not found'; end if;
  if not (target.student_id=actor or target.created_by=actor) then raise exception 'Only the learner or creator can request deletion'; end if;
  insert into public.audit_logs(actor_id,school_id,action,table_name,record_id,after_data)
  values(actor,target.school_id,'ellna_delete_request','ellna_forms',target.id,jsonb_build_object('prior_status',target.status));
  if target.status in ('draft','needs_correction') and target.submitted_at is null then
    delete from public.ellna_forms where id=target.id;
    return 'deleted';
  end if;
  update public.ellna_forms set status='deletion_requested',deletion_requested_at=now(),deletion_requested_by=actor,
    deletion_reason=left(trim(reason_input),1000),updated_at=now() where id=target.id;
  return 'requested';
end; $$;

create or replace function public.finalize_ellna_deletion(form_id_input uuid, reason_input text, override_retention boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=private.actor_id(); target public.ellna_forms%rowtype;
begin
  if not private.is_super_admin() then raise exception 'Super administrator access required'; end if;
  if length(trim(coalesce(reason_input,'')))<8 then raise exception 'Document the deletion decision'; end if;
  select * into target from public.ellna_forms where id=form_id_input for update;
  if target.id is null or target.deleted_at is not null then raise exception 'ELLNA form not found'; end if;
  if target.status<>'deletion_requested' then raise exception 'A deletion request is required'; end if;
  if target.retention_until is not null and current_date<target.retention_until and not override_retention then
    raise exception 'Retention period has not ended';
  end if;
  update public.ellna_forms set status='deleted',payload='{}'::jsonb,deleted_at=now(),deleted_by=actor,
    deletion_reason=left(trim(reason_input),1000),updated_at=now() where id=target.id;
  insert into public.audit_logs(actor_id,school_id,action,table_name,record_id,after_data)
  values(actor,target.school_id,'ellna_delete_finalized','ellna_forms',target.id,
    jsonb_build_object('override_retention',override_retention,'retention_until',target.retention_until));
end; $$;

revoke all on function public.save_ellna_form(uuid,uuid,uuid,text,jsonb,text) from public;
revoke all on function public.review_ellna_form(uuid,text,text) from public;
revoke all on function public.export_ellna_form(uuid) from public;
revoke all on function public.request_ellna_deletion(uuid,text) from public;
revoke all on function public.finalize_ellna_deletion(uuid,text,boolean) from public;
grant execute on function public.save_ellna_form(uuid,uuid,uuid,text,jsonb,text) to authenticated;
grant execute on function public.review_ellna_form(uuid,text,text) to authenticated;
grant execute on function public.export_ellna_form(uuid) to authenticated;
grant execute on function public.request_ellna_deletion(uuid,text) to authenticated;
grant execute on function public.finalize_ellna_deletion(uuid,text,boolean) to authenticated;

commit;
