# StyliCycle backend (PHP + Supabase)

## Folder layout (put everything inside C:\xampp\htdocs\stylicycle)

```
stylicycle/
  Backend/            <- from this zip (PHP files + uploads/)
  Frontend/
    HTML/             <- your existing pages
    CSS/style.css     <- your existing css
    Images/           <- your existing images
    JS/               <- your existing JS; REPLACE auth.js, rental.js, delivery.js with the ones in this zip
  schema.sql
```

## Setup
1. Supabase > SQL Editor: paste and run `schema.sql`.
2. Supabase > Connect > Session pooler: copy host + user. Put them and your DB password in `Backend/config.php`.
3. XAMPP: in php.ini enable `extension=pdo_pgsql` and `extension=pgsql`, then restart Apache.
4. Open the site at `http://localhost/stylicycle/Frontend/HTML/index.html`
   (NOT Live Server on port 5500 - PHP only runs through Apache).
5. Register, log in, add a listing with a photo, schedule a delivery.

## Make an admin
Supabase > Table Editor > users > change `role` from `customer` to `admin`, then log in again.
Admins see every delivery and get a status dropdown on each one.

## Log out (for switching users)
Open `http://localhost/stylicycle/Backend/logout.php`
