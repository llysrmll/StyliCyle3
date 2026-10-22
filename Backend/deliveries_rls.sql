-- Allow signed-in users to manage their own delivery rows without exposing
-- another user's rows. Delivery submission requires an authenticated account.
-- Run this in Supabase SQL Editor.

alter table public.deliveries enable row level security;

alter table public.deliveries
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;

revoke insert on table public.deliveries from public, anon;
grant select, insert on table public.deliveries to authenticated;

drop policy if exists "Public can submit valid deliveries" on public.deliveries;
drop policy if exists "Anonymous can submit valid deliveries" on public.deliveries;
drop policy if exists "Authenticated users can read their deliveries" on public.deliveries;
drop policy if exists "Authenticated users can submit their deliveries" on public.deliveries;

create policy "Authenticated users can read their deliveries"
on public.deliveries
for select
to authenticated
using (auth_user_id = auth.uid());

create policy "Authenticated users can submit their deliveries"
on public.deliveries
for insert
to authenticated
with check (
  user_id is null
  and auth_user_id = auth.uid()
  and status = 'Pending'
  and pickup_address is not null
  and length(btrim(pickup_address)) between 1 and 500
  and delivery_address is not null
  and length(btrim(delivery_address)) between 1 and 500
  and pickup_time is not null
  and pickup_lat between -90 and 90
  and pickup_lng between -180 and 180
  and delivery_lat between -90 and 90
  and delivery_lng between -180 and 180
  and (notes is null or length(notes) <= 2000)
);
