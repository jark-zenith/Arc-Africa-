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

## Community hub (first phase)

Arc Africa is launching Kenya-first with application-based publishing membership. Public visitors can browse approved content. New contributors apply for membership; moderators approve or return applications. Existing profiles are grandfathered as approved by the community-hub migration.

Approved members can submit projects (existing workflow) and moderated community posts: upcoming technology events, jobs/internships/grants/programmes, technology issues and discussions, and Journal articles/tutorials. All submissions remain pending until a moderator approves them.

Apply the new migration `supabase/migrations/202611150001_arc_africa_community_hub.sql` to the Arc Africa Supabase project before deploying the matching frontend. Do not expose a service-role key in the browser.

Supabase remains the primary backend because the platform already uses relational Postgres data, Auth, Storage and RLS. Firebase may be useful later for a separate mobile/offline-first feature, but migrating this relational community platform is not recommended.


## Membership applications and approval email

Applications are public submissions and do not require an account. Full name, email, GitHub username, LinkedIn profile, county, technology interests, motivation and acceptance of the community commitment are required; portfolio is optional. GitHub and LinkedIn links are reviewed privately and are not published on member profiles.

Only moderators can review applications. The `review-member-application` Edge Function verifies the moderator session, creates a one-time Supabase invite/sign-in link after approval, sends the decision email through Resend, and only then records the decision. Set the Edge Function secrets `RESEND_API_KEY`, `ARC_AFRICA_FROM_EMAIL` (a sender verified by Resend), and `ARC_AFRICA_SITE_URL`. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the function runtime. Never put privileged keys in browser code. If email delivery fails, the application remains pending and can be retried.

## Discovery and administration
The public project directory supports multi-field keyword search and category, stage and country filters. Approved moderators can switch from their personal dashboard to the admin control room to review applications, search the member directory, moderate projects and community posts, and monitor recent application activity.


## Imagination Lab and concept artwork

The homepage hero and Concepts gallery use 15 visual concept studies supplied by the project owner. The gallery is image-led: each complete image links directly to its full-size file. These are speculative visual references, not a catalogue of released products or completed projects. The public project directory remains separate and displays community-submitted projects only after moderator approval.

Concept imagery is stored in `assets/arc-africa/concept-01.jpg` through `concept-15.jpg`.

## Future possibilities (not implemented)

The site may describe longer-term ideas such as an Arc Africa Wallet, transparent milestone-based community support, and member/event passes. These are exploratory directions only. No wallet, payment collection, crowdfunding, grants disbursement, or digital pass functionality is implemented. Any future financial feature would require appropriate governance, legal and regulatory review, security controls, transparent accounting, and a separate implementation decision.
