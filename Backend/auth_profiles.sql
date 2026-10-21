-- Create public profile rows for Supabase Auth users without copying credentials.
-- Safe to rerun. Existing Auth users are backfilled at the end.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  middle_name text,
  last_name text,
  age integer check (age is null or age between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select, update on table public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  metadata_age text;
  profile_age integer;
begin
  metadata_age := coalesce(new.raw_user_meta_data ->> 'age', '');

  if metadata_age ~ '^[0-9]{1,3}$' then
    if metadata_age::integer between 1 and 120 then
      profile_age := metadata_age::integer;
    end if;
  end if;

  insert into public.profiles (
    id,
    email,
    first_name,
    middle_name,
    last_name,
    age,
    updated_at
  )
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'middle_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''),
    profile_age,
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    age = excluded.age,
    updated_at = now();

  return new;
end;
$function$;

revoke all on function public.sync_auth_user_profile() from public;

drop trigger if exists sync_auth_user_profile on auth.users;
create trigger sync_auth_user_profile
after insert or update on auth.users
for each row execute function public.sync_auth_user_profile();

insert into public.profiles (
  id,
  email,
  first_name,
  middle_name,
  last_name,
  age
)
select
  users.id,
  users.email,
  nullif(btrim(coalesce(users.raw_user_meta_data ->> 'first_name', '')), ''),
  nullif(btrim(coalesce(users.raw_user_meta_data ->> 'middle_name', '')), ''),
  nullif(btrim(coalesce(users.raw_user_meta_data ->> 'last_name', '')), ''),
  case
    when coalesce(users.raw_user_meta_data ->> 'age', '') ~ '^[0-9]{1,3}$'
      then case
        when (users.raw_user_meta_data ->> 'age')::integer between 1 and 120
          then (users.raw_user_meta_data ->> 'age')::integer
        else null
      end
    else null
  end
from auth.users as users
on conflict (id) do update set
  email = excluded.email,
  first_name = excluded.first_name,
  middle_name = excluded.middle_name,
  last_name = excluded.last_name,
  age = excluded.age,
  updated_at = now();
