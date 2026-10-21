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

Run `messages.sql` in Supabase SQL Editor to create the chat table, enable RLS, and add the table to Supabase Realtime. The temporary `receiver_id = 'admin'` read policy is shared with all authenticated users for testing; remove that condition before using private admin conversations with real users.

## Legacy PHP endpoints

Vercel does not execute the PHP files in `Backend/`. Those endpoints also use PHP sessions, which are separate from Supabase Auth sessions. The current Vercel frontend does not use the PHP login/register endpoints, and PHP listing APIs need a PHP-capable host plus an auth bridge or migration before they can be used with this Supabase session.

Changing `public.users.role` does not grant a Supabase Auth role. Do not use client-editable user metadata to authorize privileged actions.
