-- Allow the public delivery form to create requests without exposing delivery rows.
-- Run this in Supabase SQL Editor. Anonymous submissions can be abused; add
-- authentication or rate limiting before using this flow for sensitive production data.

alter table public.deliveries enable row level security;

grant insert on table public.deliveries to anon;

drop policy if exists "Public can submit valid deliveries" on public.deliveries;

create policy "Public can submit valid deliveries"
on public.deliveries
for insert
to anon
with check (
  user_id is null
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
