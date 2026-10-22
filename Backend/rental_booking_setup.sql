-- Run after app_features.sql, profile_setup.sql, and vendor_chat_setup.sql.
-- Rental delivery bookings require a customer proposal and vendor confirmation.

alter table public.deliveries
  add column if not exists item_id bigint,
  add column if not exists vendor_auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists rental_booking_id bigint;

revoke insert on table public.deliveries from public, anon;
drop policy if exists "Public can submit valid deliveries" on public.deliveries;
drop policy if exists "Anonymous can submit valid deliveries" on public.deliveries;

do $function$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.deliveries'::regclass
      and conname = 'deliveries_item_id_fkey'
  ) then
    alter table public.deliveries
      add constraint deliveries_item_id_fkey
      foreign key (item_id) references public.items(id) on delete set null;
  end if;
end;
$function$;

create table if not exists public.rental_booking_requests (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.items(id) on delete restrict,
  requester_auth_user_id uuid not null references auth.users(id) on delete cascade,
  vendor_auth_user_id uuid not null references auth.users(id) on delete cascade,
  requester_user_id bigint not null references public.users(id) on delete restrict,
  item_title text not null,
  category text,
  price_per_day numeric not null check (price_per_day >= 0),
  rental_start date not null,
  rental_end date not null,
  pickup_address text not null,
  delivery_address text not null,
  pickup_time timestamp without time zone not null,
  pickup_lat double precision not null check (pickup_lat between -90 and 90),
  pickup_lng double precision not null check (pickup_lng between -180 and 180),
  delivery_lat double precision not null check (delivery_lat between -90 and 90),
  delivery_lng double precision not null check (delivery_lng between -180 and 180),
  notes text,
  status text not null default 'pending_vendor'
    check (status in ('pending_vendor', 'confirmed', 'declined')),
  proposal_message_id uuid references public.messages(id) on delete set null,
  delivery_id bigint references public.deliveries(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (rental_end >= rental_start),
  check (length(btrim(pickup_address)) between 1 and 500),
  check (length(btrim(delivery_address)) between 1 and 500),
  check (notes is null or length(notes) <= 2000)
);

alter table public.rental_booking_requests
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists delivery_lat double precision,
  add column if not exists delivery_lng double precision;

create unique index if not exists rental_booking_requests_one_pending_per_item_customer
  on public.rental_booking_requests (item_id, requester_auth_user_id)
  where status = 'pending_vendor';

do $function$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.deliveries'::regclass
      and conname = 'deliveries_rental_booking_id_fkey'
  ) then
    alter table public.deliveries
      add constraint deliveries_rental_booking_id_fkey
      foreign key (rental_booking_id)
      references public.rental_booking_requests(id)
      on delete set null;
  end if;
end;
$function$;

alter table public.rental_booking_requests enable row level security;
revoke all on table public.rental_booking_requests from public, anon;
grant select on table public.rental_booking_requests to authenticated;

drop policy if exists "Booking participants can read requests" on public.rental_booking_requests;
create policy "Booking participants can read requests"
on public.rental_booking_requests
for select
to authenticated
using (
  requester_auth_user_id = (select auth.uid())
  or vendor_auth_user_id = (select auth.uid())
);

alter table public.deliveries enable row level security;
alter table public.deliveries
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

grant select on table public.deliveries to authenticated;

drop policy if exists "Booking participants can read rental deliveries" on public.deliveries;
create policy "Booking participants can read rental deliveries"
on public.deliveries
for select
to authenticated
using (
  rental_booking_id is not null
  and (
    auth_user_id = (select auth.uid())
    or vendor_auth_user_id = (select auth.uid())
  )
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
  and item_id is null
  and vendor_auth_user_id is null
  and rental_booking_id is null
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

drop function if exists public.propose_rental_delivery(bigint, date, date, text, text, timestamp without time zone, text);

create or replace function public.propose_rental_delivery(
  p_item_id bigint,
  p_rental_start date,
  p_rental_end date,
  p_pickup_address text,
  p_delivery_address text,
  p_pickup_time timestamp without time zone,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_delivery_lat double precision,
  p_delivery_lng double precision,
  p_notes text default null
)
returns setof public.messages
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item public.items%rowtype;
  v_requester_user_id bigint;
  v_vendor_auth_user_id uuid;
  v_booking public.rental_booking_requests%rowtype;
  v_message public.messages%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_rental_start is null or p_rental_start < (now() at time zone 'Asia/Manila')::date
    or p_rental_end is null or p_rental_end < p_rental_start then
    raise exception 'Enter a valid rental date range beginning today or later.';
  end if;
  if p_pickup_time is null or p_pickup_time <= (now() at time zone 'Asia/Manila') then
    raise exception 'Choose a future pickup time.';
  end if;
  if p_pickup_address is null or length(btrim(p_pickup_address)) not between 1 and 500
    or p_delivery_address is null or length(btrim(p_delivery_address)) not between 1 and 500 then
    raise exception 'Pickup and delivery addresses are required (500 characters maximum).';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Notes must be 2,000 characters or fewer.';
  end if;
  if p_pickup_lat is null or p_pickup_lat not between -90 and 90
    or p_pickup_lng is null or p_pickup_lng not between -180 and 180
    or p_delivery_lat is null or p_delivery_lat not between -90 and 90
    or p_delivery_lng is null or p_delivery_lng not between -180 and 180 then
    raise exception 'Could not locate both addresses on the map. Please check the addresses and try again.';
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

  v_requester_user_id := public.current_public_user_id();
  if v_requester_user_id is null then
    raise exception 'Your account is not linked to a rental profile.';
  end if;

  select coalesce(
    nullif(to_jsonb(public_user) ->> 'auth_user_id', ''),
    nullif(to_jsonb(public_user) ->> 'auth_id', '')
  )::uuid
  into v_vendor_auth_user_id
  from public.users as public_user
  where public_user.id = v_item.owner_id;

  if v_vendor_auth_user_id is null then
    raise exception 'The listing owner is not linked to a messaging account.';
  end if;
  if v_vendor_auth_user_id = (select auth.uid()) then
    raise exception 'You cannot book your own listing.';
  end if;
  if not exists (
    select 1
    from public.item_interest_shares as share
    where share.sender_id = (select auth.uid())
      and share.item_id = v_item.id
  ) then
    raise exception 'Send this item to the vendor before proposing a delivery booking.';
  end if;

  select booking.*
  into v_booking
  from public.rental_booking_requests as booking
  where booking.item_id = v_item.id
    and booking.requester_auth_user_id = (select auth.uid())
    and booking.status = 'pending_vendor'
  for update;

  if found then
    select message.*
    into v_message
    from public.messages as message
    where message.id = v_booking.proposal_message_id;
    if found then
      return next v_message;
      return;
    end if;
    raise exception 'A booking request for this item is already awaiting the vendor.';
  end if;

  insert into public.rental_booking_requests (
    item_id, requester_auth_user_id, vendor_auth_user_id, requester_user_id,
    item_title, category, price_per_day, rental_start, rental_end,
    pickup_address, delivery_address, pickup_time,
    pickup_lat, pickup_lng, delivery_lat, delivery_lng, notes
  )
  values (
    v_item.id, (select auth.uid()), v_vendor_auth_user_id, v_requester_user_id,
    v_item.title, v_item.category, v_item.price_per_day, p_rental_start, p_rental_end,
    btrim(p_pickup_address), btrim(p_delivery_address), p_pickup_time,
    p_pickup_lat, p_pickup_lng, p_delivery_lat, p_delivery_lng,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning * into v_booking;

  insert into public.messages (sender_id, receiver_id, content)
  values (
    (select auth.uid()),
    v_vendor_auth_user_id::text,
    jsonb_build_object(
      'type', 'rental_booking_proposal',
      'booking_id', v_booking.id,
      'item_id', v_item.id,
      'item_title', v_item.title,
      'category', v_item.category,
      'price_per_day', v_item.price_per_day,
      'rental_start', p_rental_start,
      'rental_end', p_rental_end,
      'pickup_address', btrim(p_pickup_address),
      'delivery_address', btrim(p_delivery_address),
      'pickup_time', p_pickup_time,
      'notes', nullif(btrim(coalesce(p_notes, '')), ''),
      'status', 'pending_vendor'
    )::text
  )
  returning * into v_message;

  update public.rental_booking_requests
  set proposal_message_id = v_message.id
  where id = v_booking.id;

  return next v_message;
end;
$function$;

revoke all on function public.propose_rental_delivery(bigint, date, date, text, text, timestamp without time zone, double precision, double precision, double precision, double precision, text) from public, anon;
grant execute on function public.propose_rental_delivery(bigint, date, date, text, text, timestamp without time zone, double precision, double precision, double precision, double precision, text) to authenticated;

create or replace function public.respond_rental_delivery(
  p_booking_id bigint,
  p_accept boolean
)
returns setof public.messages
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.rental_booking_requests%rowtype;
  v_item public.items%rowtype;
  v_actual_owner_auth_id uuid;
  v_delivery_id bigint;
  v_response public.messages%rowtype;
  v_updated_proposal jsonb;
  v_rental_days integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select booking.*
  into v_booking
  from public.rental_booking_requests as booking
  where booking.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking proposal not found.';
  end if;
  if v_booking.vendor_auth_user_id <> (select auth.uid()) then
    raise exception 'Only the listing owner can respond to this proposal.' using errcode = '42501';
  end if;
  if v_booking.status <> 'pending_vendor' then
    raise exception 'This proposal has already been answered.';
  end if;

  if p_accept then
    select item.*
    into v_item
    from public.items as item
    where item.id = v_booking.item_id
      and item.owner_id is not null
    for update;
    if not found or v_item.status <> 'available' then
      raise exception 'The listing is no longer available.';
    end if;

    select coalesce(
      nullif(to_jsonb(public_user) ->> 'auth_user_id', ''),
      nullif(to_jsonb(public_user) ->> 'auth_id', '')
    )::uuid
    into v_actual_owner_auth_id
    from public.users as public_user
    where public_user.id = v_item.owner_id;
    if v_actual_owner_auth_id is distinct from v_booking.vendor_auth_user_id then
      raise exception 'The listing owner changed after this proposal was sent.';
    end if;

    if exists (
      select 1
      from public.rental_booking_requests as existing_booking
      where existing_booking.item_id = v_booking.item_id
        and existing_booking.status = 'confirmed'
        and existing_booking.rental_start <= v_booking.rental_end
        and existing_booking.rental_end >= v_booking.rental_start
    ) then
      raise exception 'These rental dates conflict with another confirmed booking.';
    end if;

    v_rental_days := (v_booking.rental_end - v_booking.rental_start) + 1;
    insert into public.deliveries (
      user_id, auth_user_id, vendor_auth_user_id, item_id, rental_booking_id,
      pickup_address, delivery_address, pickup_time,
      pickup_lat, pickup_lng, delivery_lat, delivery_lng, item_type, notes, status
    )
    values (
      v_booking.requester_user_id,
      v_booking.requester_auth_user_id,
      v_booking.vendor_auth_user_id,
      v_booking.item_id,
      v_booking.id,
      v_booking.pickup_address,
      v_booking.delivery_address,
      v_booking.pickup_time,
      v_booking.pickup_lat,
      v_booking.pickup_lng,
      v_booking.delivery_lat,
      v_booking.delivery_lng,
      v_booking.item_title,
      concat(
        'Agreed rental period: ',
        v_booking.rental_start::text,
        ' through ',
        v_booking.rental_end::text,
        '. Rental total: ',
        (v_booking.price_per_day * v_rental_days)::text,
        case when v_booking.notes is null then '' else E'\nNotes: ' || v_booking.notes end
      ),
      'Pending'
    )
    returning id into v_delivery_id;

    update public.rental_booking_requests
    set status = 'confirmed',
        delivery_id = v_delivery_id,
        responded_at = now()
    where id = v_booking.id;

    v_updated_proposal := jsonb_build_object(
      'type', 'rental_booking_proposal',
      'booking_id', v_booking.id,
      'item_id', v_booking.item_id,
      'item_title', v_booking.item_title,
      'category', v_booking.category,
      'price_per_day', v_booking.price_per_day,
      'rental_start', v_booking.rental_start,
      'rental_end', v_booking.rental_end,
      'pickup_address', v_booking.pickup_address,
      'delivery_address', v_booking.delivery_address,
      'pickup_time', v_booking.pickup_time,
      'notes', v_booking.notes,
      'status', 'confirmed',
      'delivery_id', v_delivery_id
    );
    update public.messages
    set content = v_updated_proposal::text
    where id = v_booking.proposal_message_id;

    insert into public.messages (sender_id, receiver_id, content)
    values (
      (select auth.uid()),
      v_booking.requester_auth_user_id::text,
      jsonb_build_object(
        'type', 'rental_booking_confirmed',
        'booking_id', v_booking.id,
        'delivery_id', v_delivery_id,
        'item_title', v_booking.item_title,
        'rental_start', v_booking.rental_start,
        'rental_end', v_booking.rental_end,
        'pickup_time', v_booking.pickup_time
      )::text
    )
    returning * into v_response;
  else
    update public.rental_booking_requests
    set status = 'declined',
        responded_at = now()
    where id = v_booking.id;

    v_updated_proposal := jsonb_build_object(
      'type', 'rental_booking_proposal',
      'booking_id', v_booking.id,
      'item_id', v_booking.item_id,
      'item_title', v_booking.item_title,
      'category', v_booking.category,
      'price_per_day', v_booking.price_per_day,
      'rental_start', v_booking.rental_start,
      'rental_end', v_booking.rental_end,
      'pickup_address', v_booking.pickup_address,
      'delivery_address', v_booking.delivery_address,
      'pickup_time', v_booking.pickup_time,
      'notes', v_booking.notes,
      'status', 'declined'
    );
    update public.messages
    set content = v_updated_proposal::text
    where id = v_booking.proposal_message_id;

    insert into public.messages (sender_id, receiver_id, content)
    values (
      (select auth.uid()),
      v_booking.requester_auth_user_id::text,
      jsonb_build_object(
        'type', 'rental_booking_declined',
        'booking_id', v_booking.id,
        'item_title', v_booking.item_title
      )::text
    )
    returning * into v_response;
  end if;

  return next v_response;
end;
$function$;

revoke all on function public.respond_rental_delivery(bigint, boolean) from public, anon;
grant execute on function public.respond_rental_delivery(bigint, boolean) to authenticated;
