-- Phase 4: normalized exam tables are the sole source of assessment questions.
begin;

create or replace function private.strip_activity_questions()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.mode='auto' then new.questions='[]'::jsonb; end if;
  return new;
end; $$;

drop trigger if exists strip_activity_questions on public.activities;
create trigger strip_activity_questions before insert or update of questions,mode on public.activities
for each row execute function private.strip_activity_questions();

update public.activities set questions='[]'::jsonb where mode='auto' and questions<>'[]'::jsonb;

commit;
