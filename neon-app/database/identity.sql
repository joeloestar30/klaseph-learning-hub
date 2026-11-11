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
