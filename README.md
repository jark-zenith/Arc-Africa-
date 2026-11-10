# Arc Africa

Arc Africa is a community project discovery and collaboration platform. Public browsing is open; accounts are required to submit projects, save favourites, rate, and comment. New submissions remain private until a moderator approves them.

## Stack
- Static HTML/CSS/JavaScript frontend (Render static site)
- Supabase Auth (email/password; Google OAuth UI is prepared but intentionally disabled until provider credentials are configured)
- Supabase Postgres with row-level security
- Private Supabase Storage bucket for project assets

## Backend
Supabase project: `Arc Africa` (EU West / Ireland), ref `zlhvczgjzgmiugdjfmgj`.

Apply the migration in `supabase/migrations/202611100001_arc_africa_platform_core.sql` to a fresh project. The migration creates profiles, projects, milestones, updates, comments, ratings and favourites; ownership and moderation policies; and a private asset bucket.

The first user whose verified email is `jarkpruden@gmail.com` is assigned the moderator role by the auth trigger. Change that allowlisted address in the migration before applying if the platform owner account changes. The role cannot be changed by a normal user through profile updates.

## Local preview
Serve the repository root with any static HTTP server, for example `python3 -m http.server 8000`, then open `http://localhost:8000`.

## Configuration
The browser uses the Supabase project URL and public anon key in `config.js`. These are publishable client credentials; never add a service-role key or database password to frontend code.

For production email verification and password recovery, set the Supabase Auth Site URL to the Render URL and add it to the redirect URL allowlist. Configure custom SMTP before public launch for reliable delivery. To enable Google later, add the Google OAuth client ID/secret in Supabase Auth and set `googleOAuthConfigured: true` in `config.js`; then replace the disabled Google button handler with the OAuth sign-in flow.

## Moderation model
Project submissions default to `pending`; only approved projects are publicly discoverable. Owners can edit pending or changes-requested submissions. Moderators can approve, reject, or request changes. Public fundraising or investment collection is not implemented; the platform only supports project discovery and expressions of interest through external project links.
