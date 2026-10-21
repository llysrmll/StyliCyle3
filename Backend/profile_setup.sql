-- Run after app_features.sql. Client profile access is provided by scoped RPCs
-- because public.users also contains legacy credential columns.

alter table public.users
  add column if not exists full_name text,
  add column if not exists business_name text,
  add column if not exists phone text,
  add column if not exists location text,
  add column if not exists specialty text,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists member_since timestamptz not null default now();

update public.users
set full_name = nullif(btrim(concat_ws(' ', first_name, last_name)), '')
where full_name is null;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public can view avatars" on storage.objects;
create policy "Public can view avatars"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.current_vendor_profile()
returns table (
  id bigint,
  email text,
  first_name text,
  last_name text,
  full_name text,
  business_name text,
  phone text,
  location text,
  specialty text,
  bio text,
  avatar_url text,
  member_since timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    public_user.id,
    public_user.email,
    public_user.first_name,
    public_user.last_name,
    public_user.full_name,
    public_user.business_name,
    public_user.phone,
    public_user.location,
    public_user.specialty,
    public_user.bio,
    public_user.avatar_url,
    public_user.member_since
  from public.users as public_user
  where public_user.auth_user_id = (select auth.uid())
  limit 1
$function$;

revoke all on function public.current_vendor_profile() from public, anon;
grant execute on function public.current_vendor_profile() to authenticated;

create or replace function public.update_current_vendor_profile(
  p_full_name text,
  p_business_name text,
  p_phone text,
  p_location text,
  p_specialty text,
  p_bio text,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if nullif(btrim(p_full_name), '') is null or length(btrim(p_full_name)) > 160 then
    raise exception 'Full name is required and must be 160 characters or fewer.';
  end if;
  if length(coalesce(p_business_name, '')) > 160
    or length(coalesce(p_phone, '')) > 40
    or length(coalesce(p_location, '')) > 160
    or length(coalesce(p_specialty, '')) > 160
    or length(coalesce(p_bio, '')) > 2000
    or length(coalesce(p_avatar_url, '')) > 2048 then
    raise exception 'One or more profile fields exceed their allowed length.';
  end if;

  update public.users as public_user
  set full_name = btrim(p_full_name),
      business_name = nullif(btrim(coalesce(p_business_name, '')), ''),
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      location = nullif(btrim(coalesce(p_location, '')), ''),
      specialty = nullif(btrim(coalesce(p_specialty, '')), ''),
      bio = nullif(btrim(coalesce(p_bio, '')), ''),
      avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), '')
  where public_user.auth_user_id = (select auth.uid());

  if not found then
    raise exception 'No linked public profile was found for this account.';
  end if;
end;
$function$;

revoke all on function public.update_current_vendor_profile(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_current_vendor_profile(text, text, text, text, text, text, text) to authenticated;
