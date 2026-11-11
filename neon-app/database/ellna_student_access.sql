begin;
drop policy if exists ellna_create on public.ellna_forms;
create policy ellna_create on public.ellna_forms for insert to authenticated
with check(private.is_active() and owner_id=private.actor_id());
commit;
