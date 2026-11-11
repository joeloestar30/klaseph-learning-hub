begin;
create table public.ellna_forms (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 school_year text not null check(school_year ~ '^[0-9]{4}-[0-9]{4}$' and split_part(school_year,'-',2)::int=split_part(school_year,'-',1)::int+1),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 updated_at timestamptz not null default now()
);
alter table public.ellna_forms enable row level security;
create policy ellna_read on public.ellna_forms for select to authenticated
using(private.is_active() and (owner_id=private.actor_id() or private.is_super_admin()));
create policy ellna_create on public.ellna_forms for insert to authenticated
with check(private.is_active() and owner_id=private.actor_id());
create policy ellna_edit on public.ellna_forms for update to authenticated
using(private.is_active() and (owner_id=private.actor_id() or private.is_super_admin()))
with check(private.is_active() and (owner_id=private.actor_id() or private.is_super_admin()));
grant select,insert,update on public.ellna_forms to authenticated;
commit;
