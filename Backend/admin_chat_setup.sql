-- Run after auth_profiles.sql, messages.sql, app_features.sql, and profile_setup.sql.
-- Admin portal authorization accepts either supported app_metadata claim.

drop policy if exists "Users can read their messages" on public.messages;
create policy "Users can read their messages"
on public.messages
for select
to authenticated
using (
  sender_id = (select auth.uid())
  or receiver_id = (select auth.uid())::text
  or (
    receiver_id = 'admin'
    and (
      (select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
      or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
  )
  or (select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop function if exists public.admin_search_users(text);
create function public.admin_search_users(p_query text default '')
returns table (
  id uuid,
  email text,
  first_name text,
  last_name text,
  full_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  search_term text := btrim(coalesce(p_query, ''));
begin
  if (select auth.uid()) is null
    or (
      (select auth.jwt() -> 'app_metadata' ->> 'is_admin') is distinct from 'true'
      and (select auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin'
    ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select
    public_user.auth_user_id,
    public_user.email,
    public_user.first_name,
    public_user.last_name,
    coalesce(
      nullif(btrim(public_user.full_name), ''),
      nullif(btrim(concat_ws(' ', public_user.first_name, public_user.last_name)), '')
    )
  from public.users as public_user
  where public_user.auth_user_id is not null
    and (
      search_term = ''
      or coalesce(public_user.email, '') ilike '%' || search_term || '%'
      or coalesce(public_user.first_name, '') ilike '%' || search_term || '%'
      or coalesce(public_user.last_name, '') ilike '%' || search_term || '%'
      or coalesce(public_user.full_name, '') ilike '%' || search_term || '%'
      or concat_ws(' ', public_user.first_name, public_user.last_name) ilike '%' || search_term || '%'
    )
  order by lower(coalesce(public_user.full_name, concat_ws(' ', public_user.first_name, public_user.last_name))),
           public_user.email
  limit 50;
end;
$function$;

revoke all on function public.admin_search_users(text) from public, anon;
grant execute on function public.admin_search_users(text) to authenticated;

create or replace function public.admin_public_user_details(
  p_auth_user_ids uuid[],
  p_public_user_ids bigint[]
)
returns table (
  auth_user_id uuid,
  public_user_id bigint,
  full_name text,
  email text,
  first_name text,
  last_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or (
      (select auth.jwt() -> 'app_metadata' ->> 'is_admin') is distinct from 'true'
      and (select auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin'
    ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select
    public_user.auth_user_id,
    public_user.id,
    coalesce(
      nullif(btrim(public_user.full_name), ''),
      nullif(btrim(concat_ws(' ', public_user.first_name, public_user.last_name)), '')
    ),
    public_user.email,
    public_user.first_name,
    public_user.last_name
  from public.users as public_user
  where (
    coalesce(p_auth_user_ids, array[]::uuid[]) <> array[]::uuid[]
    and public_user.auth_user_id = any(coalesce(p_auth_user_ids, array[]::uuid[]))
  ) or (
    coalesce(p_public_user_ids, array[]::bigint[]) <> array[]::bigint[]
    and public_user.id = any(coalesce(p_public_user_ids, array[]::bigint[]))
  );
end;
$function$;

revoke all on function public.admin_public_user_details(uuid[], bigint[]) from public, anon;
grant execute on function public.admin_public_user_details(uuid[], bigint[]) to authenticated;
