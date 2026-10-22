-- Run after schema.sql, auth_profiles.sql, and messages.sql.
-- Links Supabase Auth users to legacy bigint public.users rows without
-- copying or deleting password values.

alter table public.users
  alter column password drop not null,
  add column if not exists auth_user_id uuid unique
    references auth.users(id) on delete set null;

-- The legacy table contains password hashes and is not a client-facing API.
alter table public.users enable row level security;
revoke all on table public.users from anon, authenticated;

with email_matches as (
  select
    auth_user.id as auth_user_id,
    public_user.id as public_user_id,
    count(*) over (partition by auth_user.id) as auth_match_count,
    count(*) over (partition by public_user.id) as public_match_count
  from auth.users as auth_user
  join public.users as public_user
    on lower(public_user.email) = lower(auth_user.email)
  where public_user.auth_user_id is null
)
update public.users as public_user
set auth_user_id = email_matches.auth_user_id
from email_matches
where public_user.id = email_matches.public_user_id
  and email_matches.auth_match_count = 1
  and email_matches.public_match_count = 1;

drop function if exists public.sync_auth_user_legacy_profile_for(uuid);

create function public.sync_auth_user_legacy_profile_for(p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  auth_record auth.users%rowtype;
  existing_user_id bigint;
  existing_auth_user_id uuid;
  matched_user_count integer;
  metadata_age text;
  profile_age integer;
  profile_first_name text;
  profile_last_name text;
begin
  select * into auth_record
  from auth.users
  where id = p_auth_user_id;
  if not found or auth_record.email is null then
    return;
  end if;

  metadata_age := coalesce(auth_record.raw_user_meta_data ->> 'age', '');
  if metadata_age ~ '^[0-9]{1,3}$'
    and metadata_age::integer between 1 and 120 then
    profile_age := metadata_age::integer;
  end if;

  profile_first_name := coalesce(
    nullif(btrim(auth_record.raw_user_meta_data ->> 'first_name'), ''),
    nullif(split_part(coalesce(auth_record.email, ''), '@', 1), ''),
    'User'
  );
  profile_last_name := coalesce(
    nullif(btrim(auth_record.raw_user_meta_data ->> 'last_name'), ''),
    'Account'
  );

  select count(*), min(public_user.id)
  into matched_user_count, existing_user_id
  from public.users as public_user
  where lower(public_user.email) = lower(auth_record.email);

  if matched_user_count > 1 then
    raise exception 'Multiple public.users rows match email %; resolve the duplicate before linking Auth.', auth_record.email;
  end if;

  if matched_user_count = 1 then
    select auth_user_id
    into existing_auth_user_id
    from public.users
    where id = existing_user_id;

    if existing_auth_user_id is not null and existing_auth_user_id <> auth_record.id then
      raise exception 'The public.users row for % is already linked to another Auth account.', auth_record.email;
    end if;

    update public.users
    set auth_user_id = auth_record.id,
        first_name = profile_first_name,
        middle_name = nullif(btrim(auth_record.raw_user_meta_data ->> 'middle_name'), ''),
        last_name = profile_last_name,
        age = profile_age,
        email = auth_record.email
    where id = existing_user_id;
  else
    insert into public.users (
      first_name,
      middle_name,
      last_name,
      age,
      email,
      password,
      auth_user_id
    )
    values (
      profile_first_name,
      nullif(btrim(auth_record.raw_user_meta_data ->> 'middle_name'), ''),
      profile_last_name,
      profile_age,
      auth_record.email,
      null,
      auth_record.id
    )
    on conflict (auth_user_id) do update
      set email = excluded.email,
          first_name = excluded.first_name,
          middle_name = excluded.middle_name,
          last_name = excluded.last_name,
          age = excluded.age;
  end if;
end;
$function$;

revoke all on function public.sync_auth_user_legacy_profile_for(uuid) from public, anon, authenticated;

create or replace function public.sync_auth_user_legacy_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.sync_auth_user_legacy_profile_for(new.id);
  return new;
end;
$function$;

revoke all on function public.sync_auth_user_legacy_profile() from public, anon, authenticated;

drop trigger if exists sync_auth_user_legacy_profile on auth.users;
create trigger sync_auth_user_legacy_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_auth_user_legacy_profile();

create or replace function public.current_public_user_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select public_user.id
  from public.users as public_user
  where public_user.auth_user_id = (select auth.uid())
  limit 1
$function$;

revoke all on function public.current_public_user_id() from public, anon;
grant execute on function public.current_public_user_id() to authenticated;

-- Backfill profile rows for Auth accounts that existed before the trigger.
do $function$
declare
  auth_user record;
begin
  for auth_user in
    select id from auth.users
  loop
    perform public.sync_auth_user_legacy_profile_for(auth_user.id);
  end loop;
end;
$function$;

-- Rental listings: public users can browse available items; owners and admins
-- can also select their own or all listings respectively.
alter table public.items enable row level security;
grant select on table public.items to anon, authenticated;
grant insert on table public.items to authenticated;

drop policy if exists "Anyone can browse available rentals" on public.items;
create policy "Anyone can browse available rentals"
on public.items
for select
to anon, authenticated
using (status = 'available');

drop policy if exists "Users can read their own rentals" on public.items;
create policy "Users can read their own rentals"
on public.items
for select
to authenticated
using (owner_id = (select public.current_public_user_id()));

drop policy if exists "Users can create rentals for themselves" on public.items;
create policy "Users can create rentals for themselves"
on public.items
for insert
to authenticated
with check (
  owner_id = (select public.current_public_user_id())
  and status = 'available'
);

-- Deliveries: keep the UUID column used by the existing client, and also bind
-- each delivery to its bigint legacy user row.
alter table public.deliveries
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

revoke insert on table public.deliveries from public, anon;
grant select, insert on table public.deliveries to authenticated;

drop policy if exists "Public can submit valid deliveries" on public.deliveries;
drop policy if exists "Anonymous can submit valid deliveries" on public.deliveries;

drop policy if exists "Authenticated users can read their deliveries" on public.deliveries;
create policy "Authenticated users can read their deliveries"
on public.deliveries
for select
to authenticated
using (
  user_id = (select public.current_public_user_id())
  or auth_user_id = (select auth.uid())
);

drop policy if exists "Authenticated users can submit their deliveries" on public.deliveries;
create policy "Authenticated users can submit their deliveries"
on public.deliveries
for insert
to authenticated
with check (
  user_id = (select public.current_public_user_id())
  and auth_user_id = (select auth.uid())
  and status = 'Pending'
);

-- Public image URLs are readable, while uploads must be placed under the
-- uploader's own Auth UUID folder: <auth.uid()>/<generated filename>.
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public can view item images" on storage.objects;
create policy "Public can view item images"
on storage.objects
for select
to public
using (bucket_id = 'item-images');

drop policy if exists "Users can upload their own item images" on storage.objects;
create policy "Users can upload their own item images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'item-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete their own item images" on storage.objects;
create policy "Users can delete their own item images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'item-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Private notification rows are addressed to bigint public.users IDs.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_created_idx
  on public.notifications (user_id, is_read, created_at desc);

alter table public.notifications enable row level security;
grant select on table public.notifications to authenticated;
grant update (is_read) on table public.notifications to authenticated;

drop policy if exists "Users can read their notifications" on public.notifications;
create policy "Users can read their notifications"
on public.notifications
for select
to authenticated
using (user_id = (select public.current_public_user_id()));

drop policy if exists "Users can mark their notifications read" on public.notifications;
create policy "Users can mark their notifications read"
on public.notifications
for update
to authenticated
using (user_id = (select public.current_public_user_id()))
with check (user_id = (select public.current_public_user_id()));

create or replace function public.notify_for_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  recipient_auth_id uuid;
  recipient_user_id bigint;
  admin_name text;
  notification_title text;
  notification_message text;
begin
  select coalesce(
    nullif(btrim(auth_user.raw_user_meta_data ->> 'first_name'), ''),
    public_user.first_name,
    'A user'
  )
  into admin_name
  from auth.users as auth_user
  left join public.users as public_user on public_user.auth_user_id = auth_user.id
  where auth_user.id = new.sender_id;

  notification_title := 'New message';
  notification_message := left(coalesce(admin_name, 'A user') || ' sent you a message.', 500);

  if new.receiver_id = 'admin' then
    insert into public.notifications (user_id, title, message)
    select public_user.id, notification_title, notification_message
    from auth.users as auth_user
    join public.users as public_user on public_user.auth_user_id = auth_user.id
    where auth_user.raw_app_meta_data ->> 'is_admin' = 'true'
       or auth_user.raw_app_meta_data ->> 'role' = 'admin';
  elsif new.receiver_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    recipient_auth_id := new.receiver_id::uuid;
    select id into recipient_user_id
    from public.users
    where auth_user_id = recipient_auth_id;

    if recipient_user_id is not null then
      insert into public.notifications (user_id, title, message)
      values (recipient_user_id, notification_title, notification_message);
    end if;
  else
    insert into public.notifications (user_id, title, message)
    select public_user.id, notification_title, notification_message
    from auth.users as auth_user
    join public.users as public_user on public_user.auth_user_id = auth_user.id
    where auth_user.raw_app_meta_data ->> 'is_admin' = 'true'
       or auth_user.raw_app_meta_data ->> 'role' = 'admin';
  end if;

  return new;
end;
$function$;

revoke all on function public.notify_for_message() from public, anon, authenticated;
drop trigger if exists notify_for_new_message on public.messages;
create trigger notify_for_new_message
after insert on public.messages
for each row execute function public.notify_for_message();

create or replace function public.notify_for_delivery_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status is distinct from old.status and new.user_id is not null then
    insert into public.notifications (user_id, title, message)
    values (
      new.user_id,
      'Delivery status updated',
      left('Your delivery status is now ' || new.status || '.', 500)
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.notify_for_delivery_status() from public, anon, authenticated;
drop trigger if exists notify_for_delivery_status on public.deliveries;
create trigger notify_for_delivery_status
after update of status on public.deliveries
for each row execute function public.notify_for_delivery_status();

do $function$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$function$;
