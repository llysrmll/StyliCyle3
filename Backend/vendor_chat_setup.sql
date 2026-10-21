-- Run after app_features.sql and profile_setup.sql.
-- Exposes only available listings and safe vendor labels to authenticated users.

alter table public.messages enable row level security;
grant select, insert on table public.messages to authenticated;

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

drop policy if exists "Users can send messages as themselves" on public.messages;
create policy "Users can send messages as themselves"
on public.messages
for insert
to authenticated
with check (sender_id = (select auth.uid()));

create or replace function public.search_rentals_with_vendors(p_query text)
returns table (
  id bigint,
  owner_id bigint,
  title text,
  category text,
  price_per_day numeric,
  size text,
  description text,
  image_path text,
  created_at timestamptz,
  vendor_auth_id uuid,
  vendor_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    item.id,
    item.owner_id,
    item.title,
    item.category,
    item.price_per_day,
    item.size,
    item.description,
    item.image_path,
    item.created_at,
    coalesce(
      nullif(to_jsonb(public_user) ->> 'auth_user_id', ''),
      nullif(to_jsonb(public_user) ->> 'auth_id', '')
    )::uuid as vendor_auth_id,
    coalesce(
      nullif(btrim(to_jsonb(public_user) ->> 'business_name'), ''),
      nullif(btrim(to_jsonb(public_user) ->> 'full_name'), ''),
      nullif(btrim(concat_ws(' ', public_user.first_name, public_user.last_name)), ''),
      'Vendor'
    ) as vendor_name
  from public.items as item
  left join public.users as public_user on public_user.id = item.owner_id
  where auth.uid() is not null
    and item.status = 'available'
    and (
      coalesce(p_query, '') = ''
      or item.title ilike '%' || p_query || '%'
      or coalesce(item.category, '') ilike '%' || p_query || '%'
    )
  order by item.created_at desc
  limit 100
$function$;

revoke all on function public.search_rentals_with_vendors(text) from public, anon;
grant execute on function public.search_rentals_with_vendors(text) to authenticated;

create or replace function public.vendor_chat_details(p_owner_id bigint)
returns table (
  auth_user_id uuid,
  vendor_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(
      nullif(to_jsonb(public_user) ->> 'auth_user_id', ''),
      nullif(to_jsonb(public_user) ->> 'auth_id', '')
    )::uuid as auth_user_id,
    coalesce(
      nullif(btrim(to_jsonb(public_user) ->> 'business_name'), ''),
      nullif(btrim(to_jsonb(public_user) ->> 'full_name'), ''),
      nullif(btrim(concat_ws(' ', public_user.first_name, public_user.last_name)), ''),
      'Vendor'
    ) as vendor_name
  from public.users as public_user
  where public_user.id = p_owner_id
    and auth.uid() is not null
    and exists (
      select 1
      from public.items as item
      where item.owner_id = public_user.id
        and item.status = 'available'
    )
  limit 1
$function$;

revoke all on function public.vendor_chat_details(bigint) from public, anon;
grant execute on function public.vendor_chat_details(bigint) to authenticated;

drop function if exists public.chat_partner_details(uuid[]);

create or replace function public.chat_partner_details(p_auth_user_ids uuid[])
returns table (
  id uuid,
  display_name text,
  is_admin boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    auth_user.id,
    coalesce(
      nullif(btrim(to_jsonb(public_user) ->> 'business_name'), ''),
      nullif(btrim(to_jsonb(public_user) ->> 'full_name'), ''),
      nullif(btrim(concat_ws(' ', public_user.first_name, public_user.last_name)), ''),
      nullif(btrim(concat_ws(
        ' ',
        auth_user.raw_user_meta_data ->> 'first_name',
        auth_user.raw_user_meta_data ->> 'last_name'
      )), ''),
      auth_user.email,
      'StyliCycle user'
    ) as display_name,
    (
      auth_user.raw_app_meta_data ->> 'is_admin' = 'true'
      or auth_user.raw_app_meta_data ->> 'role' = 'admin'
    ) as is_admin
  from auth.users as auth_user
  left join public.users as public_user
    on coalesce(
      nullif(to_jsonb(public_user) ->> 'auth_user_id', ''),
      nullif(to_jsonb(public_user) ->> 'auth_id', '')
    )::uuid = auth_user.id
  where auth_user.id = any(coalesce(p_auth_user_ids, array[]::uuid[]))
    and auth.uid() is not null
    and exists (
      select 1
      from public.messages as message
      where (
        message.sender_id = auth.uid()
        and message.receiver_id = auth_user.id::text
      ) or (
        message.sender_id = auth_user.id
        and message.receiver_id = auth.uid()::text
      )
    )
$function$;

revoke all on function public.chat_partner_details(uuid[]) from public, anon;
grant execute on function public.chat_partner_details(uuid[]) to authenticated;

create table if not exists public.item_interest_shares (
  sender_id uuid not null references auth.users(id) on delete cascade,
  item_id bigint not null references public.items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sender_id, item_id)
);

alter table public.item_interest_shares enable row level security;
revoke all on table public.item_interest_shares from public, anon, authenticated;

insert into public.item_interest_shares (sender_id, item_id)
select distinct
  message.sender_id,
  listing.id
from public.messages as message
join public.items as listing
  on listing.id = substring(message.content from 'Listing ID:[[:space:]]*([0-9]+)')::bigint
join public.users as public_user
  on public_user.id = listing.owner_id
where message.sender_id is not null
  and message.receiver_id = coalesce(
    nullif(to_jsonb(public_user) ->> 'auth_user_id', ''),
    nullif(to_jsonb(public_user) ->> 'auth_id', '')
  )
  and message.content ~ 'Listing ID:[[:space:]]*[0-9]+'
on conflict (sender_id, item_id) do nothing;

create or replace function public.send_listing_interest(p_item_id bigint)
returns setof public.messages
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item public.items%rowtype;
  v_owner_auth_id uuid;
  v_message public.messages%rowtype;
  v_rows_inserted integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select item.*
  into v_item
  from public.items as item
  where item.id = p_item_id
    and item.status = 'available'
  for share;

  if not found then
    raise exception 'This listing is no longer available.';
  end if;

  select coalesce(
    nullif(to_jsonb(public_user) ->> 'auth_user_id', ''),
    nullif(to_jsonb(public_user) ->> 'auth_id', '')
  )::uuid
  into v_owner_auth_id
  from public.users as public_user
  where public_user.id = v_item.owner_id;

  if v_owner_auth_id is null then
    raise exception 'The listing owner is not linked to a messaging account.';
  end if;
  if v_owner_auth_id = (select auth.uid()) then
    raise exception 'You cannot send an item of your own to yourself.';
  end if;

  insert into public.item_interest_shares (sender_id, item_id)
  values ((select auth.uid()), v_item.id)
  on conflict (sender_id, item_id) do nothing;
  get diagnostics v_rows_inserted = row_count;

  if v_rows_inserted = 0 then
    return;
  end if;

  insert into public.messages (sender_id, receiver_id, content)
  values (
    (select auth.uid()),
    v_owner_auth_id::text,
    jsonb_build_object(
      'type', 'listing_interest',
      'item_id', v_item.id,
      'title', v_item.title,
      'category', v_item.category,
      'price_per_day', v_item.price_per_day,
      'image_path', v_item.image_path
    )::text
  )
  returning * into v_message;

  return next v_message;
end;
$function$;

revoke all on function public.send_listing_interest(bigint) from public, anon;
grant execute on function public.send_listing_interest(bigint) to authenticated;

create or replace function public.chat_partner_profile(p_auth_user_id uuid)
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
    null::text as email,
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
  where coalesce(
      nullif(to_jsonb(public_user) ->> 'auth_user_id', ''),
      nullif(to_jsonb(public_user) ->> 'auth_id', '')
    )::uuid = p_auth_user_id
    and (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.messages as message
        where (
          message.sender_id = (select auth.uid())
          and message.receiver_id = p_auth_user_id::text
        ) or (
          message.sender_id = p_auth_user_id
          and message.receiver_id = (select auth.uid())::text
        )
      )
      or exists (
        select 1
        from public.items as item
        where item.owner_id = public_user.id
          and item.status = 'available'
      )
    )
  limit 1
$function$;

revoke all on function public.chat_partner_profile(uuid) from public, anon;
grant execute on function public.chat_partner_profile(uuid) to authenticated;

create or replace function public.chat_partner_portfolio(p_auth_user_id uuid)
returns table (
  id bigint,
  title text,
  category text,
  description text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    item.id,
    item.title,
    item.category,
    item.description,
    item.created_at
  from public.items as item
  join public.users as public_user
    on public_user.id = item.owner_id
  where coalesce(
      nullif(to_jsonb(public_user) ->> 'auth_user_id', ''),
      nullif(to_jsonb(public_user) ->> 'auth_id', '')
    )::uuid = p_auth_user_id
    and item.status = 'available'
    and (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.messages as message
        where (
          message.sender_id = (select auth.uid())
          and message.receiver_id = p_auth_user_id::text
        ) or (
          message.sender_id = p_auth_user_id
          and message.receiver_id = (select auth.uid())::text
        )
      )
      or exists (
        select 1
        from public.items as available_item
        where available_item.owner_id = public_user.id
          and available_item.status = 'available'
      )
    )
  order by item.created_at desc
$function$;

revoke all on function public.chat_partner_portfolio(uuid) from public, anon;
grant execute on function public.chat_partner_portfolio(uuid) to authenticated;
