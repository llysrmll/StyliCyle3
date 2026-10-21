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
