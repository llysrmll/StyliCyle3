create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id text not null check (length(btrim(receiver_id)) between 1 and 255),
  content text not null check (length(btrim(content)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists messages_sender_receiver_created_idx
  on public.messages (sender_id, receiver_id, created_at);

create index if not exists messages_receiver_created_idx
  on public.messages (receiver_id, created_at);

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

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
