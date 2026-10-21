-- Run after messages.sql, auth_profiles.sql, and deliveries_rls.sql.
-- Admin privileges are read from app_metadata, which users cannot edit themselves.

grant select on table public.profiles to authenticated;
drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');

grant select on table public.items to anon, authenticated;
alter table public.items enable row level security;

drop policy if exists "Anyone can browse available rentals" on public.items;
create policy "Anyone can browse available rentals"
on public.items
for select
to anon, authenticated
using (status = 'available');

drop policy if exists "Admins can read all rentals" on public.items;
create policy "Admins can read all rentals"
on public.items
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');

grant select, update on table public.deliveries to authenticated;

drop policy if exists "Admins can read all deliveries" on public.deliveries;
create policy "Admins can read all deliveries"
on public.deliveries
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');

drop policy if exists "Admins can update delivery status" on public.deliveries;
create policy "Admins can update delivery status"
on public.deliveries
for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')
with check ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');

create or replace function public.admin_dashboard_counts()
returns table (total_users bigint, active_rentals bigint, pending_deliveries bigint)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'is_admin') is distinct from 'true' then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from auth.users),
    (select count(*) from public.items where status = 'available'),
    (select count(*) from public.deliveries where status = 'Pending');
end;
$function$;

revoke all on function public.admin_dashboard_counts() from public, anon;
grant execute on function public.admin_dashboard_counts() to authenticated;
