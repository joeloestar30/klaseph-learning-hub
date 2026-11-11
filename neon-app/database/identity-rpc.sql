create function public.claim_existing_profile() returns uuid language sql security invoker
set search_path=public,pg_temp as $$ select private.claim_profile(); $$;
revoke all on function public.claim_existing_profile() from public;
grant execute on function public.claim_existing_profile() to authenticated;
