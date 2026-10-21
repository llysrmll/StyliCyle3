-- Run after auth_profiles.sql and messages.sql.
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

create or replace function public.admin_search_users(p_query text default '')
returns table (
  id uuid,
  email text,
  first_name text,
  last_name text
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
    profile.id,
    profile.email,
    profile.first_name,
    profile.last_name
  from public.profiles as profile
  where search_term = ''
    or coalesce(profile.email, '') ilike '%' || search_term || '%'
    or coalesce(profile.first_name, '') ilike '%' || search_term || '%'
    or coalesce(profile.last_name, '') ilike '%' || search_term || '%'
    or concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || search_term || '%'
  order by lower(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')),
           profile.email
  limit 50;
end;
$function$;

revoke all on function public.admin_search_users(text) from public, anon;
grant execute on function public.admin_search_users(text) to authenticated;
