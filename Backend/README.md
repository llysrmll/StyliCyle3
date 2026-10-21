# StyliCycle backend (PHP + Supabase)

## Folder layout (put everything inside C:\xampp\htdocs\stylicycle)

```
stylicycle/
  Backend/            <- from this zip (PHP files + uploads/)
  Frontend/
    HTML/             <- your existing pages
    CSS/style.css     <- your existing css
    Images/           <- your existing images
    JS/               <- frontend scripts, including the Supabase Auth client
  schema.sql
```

## Setup
1. Supabase > SQL Editor: paste and run `schema.sql`.
2. Supabase > Connect > Session pooler: configure `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_NAME`, `SUPABASE_DB_USER`, and `SUPABASE_DB_PASSWORD` in the environment used by PHP/Apache. Do not put database credentials in source files.
3. XAMPP: in php.ini enable `extension=pdo_pgsql` and `extension=pgsql`, then restart Apache.
4. Open the site at `http://localhost/stylicycle/Frontend/HTML/index.html`.

## Vercel login and sessions

The static Vercel frontend uses Supabase Auth for signup, login, and persistent browser sessions. Credentials are stored by Supabase Auth and appear under **Authentication > Users**; they are not written to the legacy `public.users` table. To show signup details in a queryable public table, run `auth_profiles.sql` in Supabase SQL Editor. It creates `public.profiles`, syncs profile fields from Auth metadata, and backfills existing Auth accounts without copying passwords. Add the deployed site's login URL to Supabase Authentication > URL Configuration > Redirect URLs so email confirmation can return users to the site.

Supabase may temporarily reject signup confirmation emails with HTTP 429 (`email rate limit exceeded`). Wait for the configured Auth email limit to reset, or configure a custom SMTP provider in Supabase Auth settings. Deleting a `public.users` row does not delete the Auth account or reset the email rate limit.

Run `deliveries_rls.sql` in Supabase SQL Editor to enable authenticated delivery inserts and per-user reads.

Run `messages.sql` in Supabase SQL Editor to create the chat table, enable RLS, and add the table to Supabase Realtime. Users can read their own conversations; only admins can read all messages addressed to `admin`.

Run `auth_profiles.sql`, `deliveries_rls.sql`, and then `admin_setup.sql` in Supabase SQL Editor to prepare profile lookups, delivery management, admin rental reads, and dashboard counts.

## Rental search, image uploads, and notifications

For a new database, run `schema.sql` first. **Do not rerun it on a database with data:** it drops and recreates the legacy tables.

For an existing Vercel/Supabase database, run these scripts in the Supabase SQL Editor in order:

1. `auth_profiles.sql`
2. `messages.sql`
3. `deliveries_rls.sql`
4. `admin_setup.sql`
5. `app_features.sql`
6. `profile_setup.sql` (if using vendor profiles)
7. `admin_chat_setup.sql` (if using the searchable admin inbox)
8. `vendor_chat_setup.sql` (if using rental-to-vendor chat)

`app_features.sql` links Auth UUIDs to the bigint `public.users.id` values (matching existing rows by email where unambiguous), creates a legacy profile row for new email-based Auth users without copying passwords, and provides the `current_public_user_id()` RPC used by listings and deliveries. It also enables safe client access to the legacy users table, adds owner-based item/delivery rules, creates the public `item-images` bucket and its read/upload/owner-delete policies, creates the private notifications table and message/delivery triggers, and adds notifications to Realtime.

The `item-images` bucket is created as public by the SQL, so listing images can be displayed with their public URLs. Authenticated uploads must be placed under a folder matching their Auth UUID; the frontend does this automatically. Optional manual verification: in Supabase **Storage > Buckets**, confirm that `item-images` is marked **Public**.

The rental page supports optional JPG, PNG, and WEBP uploads up to 3 MB. Listing search is restricted to available items and matches title or category. Delivery creation requires an email-based Auth account with a linked bigint profile. Auth accounts without email are intentionally not mapped to the legacy email-required `public.users` table.

After running the SQL, confirm that `notifications` is enabled in the `supabase_realtime` publication if the project did not have that publication when the script ran. The frontend uses authenticated RLS-protected queries; do not place a service-role key in browser code.

Run `profile_setup.sql` after `app_features.sql` to add vendor profile fields, create the public `avatars` bucket and per-user storage policies, and expose profile reads/updates through Auth-scoped RPCs. Do not grant browser clients direct access to `public.users`, which also contains legacy credential data. The profile page and script use these RPCs, while the portfolio reads only the current user's item rows.

Run `admin_chat_setup.sql` after `auth_profiles.sql` and `messages.sql` to allow the admin inbox to read messages when either `app_metadata.is_admin` or `app_metadata.role` is set, and to add a protected name/email user search for starting new conversations. Admins must sign out and back in after changing their app metadata so their access token includes the updated role. Existing legacy item image paths such as `Frontend/Images/evening.jpg` are normalized by the rental page to deployed `/Images/...` URLs.

Run `vendor_chat_setup.sql` after `app_features.sql` and `profile_setup.sql` to enable searchable rental results with safe vendor UUID/name fields, resolve listing links by bigint owner ID, provide names and scoped profiles for direct-message contacts, and load vendor portfolios without exposing `public.users`. It also adds a server-enforced one-time item-interest share per customer/listing, backfills matching legacy item-interest messages, returns the original message for repeat attempts so it remains visible in chat, and includes the listing photo in new item-share messages. The `messages` table stores `receiver_id` as text; direct vendor chats store the UUID's text form, while the support chat uses `admin`.

Promote an Auth account by running this in Supabase SQL Editor, replacing the sample email with the account shown in **Authentication > Users**:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"is_admin": true, "role": "admin"}'::jsonb
where email = lower('admin@example.com');
```

The admin pages check `app_metadata` (not user-editable `user_metadata`) and Supabase RLS checks the same claim. Sign out and back in after promotion so the new claim is included in the session. Never expose a service-role key in frontend code.

## Legacy PHP endpoints

Vercel does not execute the PHP files in `Backend/`. Those endpoints also use PHP sessions, which are separate from Supabase Auth sessions. The current Vercel frontend does not use the PHP login/register endpoints, and PHP listing APIs need a PHP-capable host plus an auth bridge or migration before they can be used with this Supabase session.

Changing `public.users.role` does not grant a Supabase Auth role.
