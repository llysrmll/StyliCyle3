-- StyliCycle schema for Supabase (Postgres)
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- WARNING: it drops and recreates the tables, so any earlier test data is removed.

drop table if exists deliveries cascade;
drop table if exists rentals cascade;
drop table if exists items cascade;
drop table if exists profiles cascade;
drop table if exists users cascade;

create table users (
  id          bigint generated always as identity primary key,
  first_name  text not null,
  middle_name text,
  last_name   text not null,
  age         int,
  email       text unique not null,
  password    text not null,              -- stored as a bcrypt hash, never plain text
  role        text not null default 'user',       -- 'user' or 'admin'
  created_at  timestamptz default now()
);

create table items (
  id            bigint generated always as identity primary key,
  owner_id      bigint references users(id) on delete set null,
  title         text not null,
  category      text,
  price_per_day numeric not null,
  size          text,
  chest_cm      numeric,
  waist_cm      numeric,
  length_cm     numeric,
  description   text,
  image_path    text,                     -- e.g. Backend/uploads/abc123.jpg
  status        text not null default 'available',
  created_at    timestamptz default now()
);

create table deliveries (
  id               bigint generated always as identity primary key,
  user_id          bigint references users(id) on delete cascade,
  pickup_address   text not null,
  delivery_address text not null,
  pickup_lat       double precision,
  pickup_lng       double precision,
  delivery_lat     double precision,
  delivery_lng     double precision,
  distance_km      numeric,
  fee              numeric,
  pickup_time      timestamp,
  item_type        text,
  notes            text,
  status           text not null default 'Pending',
  created_at       timestamptz default now()
);

-- Sample listings so the Rentals page is not empty on demo day
insert into items (title, category, price_per_day, size, description, image_path) values
('Evening Gown',  'Formalwear', 650,  'M', 'Perfect for formal events.',  'Frontend/Images/evening.jpg'),
('Tuxedo Suit',   'Formalwear', 850,  'L', 'Classic suit for weddings.',  'Frontend/Images/tuxedo.jpg'),
('Bridal Gown',   'Bridal',     1200, 'S', 'Elegant wedding dress.',      'Frontend/Images/bridal.jpg'),
('Tan Suit',      'Formalwear', 750,  'M', 'Smart tan suit for events.',  'Frontend/Images/gold.jpg');
