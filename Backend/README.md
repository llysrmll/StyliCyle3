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

The static Vercel frontend uses Supabase Auth for signup, login, and persistent browser sessions. New signups are created in Supabase Authentication, and protected pages provide a log-out button. Existing accounts must exist in Supabase Authentication to sign in; a row in `public.users` alone is not an Auth account. Add the deployed site's login URL to Supabase Authentication > URL Configuration > Redirect URLs so email confirmation can return users to the site.

Run `deliveries_rls.sql` in Supabase SQL Editor to enable authenticated delivery inserts and per-user reads.

## Legacy PHP endpoints

Vercel does not execute the PHP files in `Backend/`. Those endpoints also use PHP sessions, which are separate from Supabase Auth sessions. The current Vercel frontend does not use the PHP login/register endpoints, and PHP listing APIs need a PHP-capable host plus an auth bridge or migration before they can be used with this Supabase session.

Changing `public.users.role` does not grant a Supabase Auth role. Do not use client-editable user metadata to authorize privileged actions.
