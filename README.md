# Arc Africa

Recruitment and talent-network landing page for Arc Africa.

## Current implementation
- Responsive static website with mission, interest areas, collaboration paths, and contact information.
- The interest form validates fields in the browser and prepares an email draft addressed to `jarkpruden@gmail.com`.
- The form does **not** post data to a server or store applications. Secure application intake and a founder-only review dashboard are not yet implemented.
- Interest areas are not advertised vacancies or a promise of employment.

## Deploy on Render
Create a **Static Site** for this repository:
- Repository: `https://github.com/jark-zenith/Arc-Africa-`
- Branch: `main`
- Build command: `echo "Static HTML site — no build step required"`
- Publish directory: `.`

## Secure application workflow — pending
Before accepting applications as a live recruitment workflow, connect the approved Supabase project, define a private applications table and restrictive row-level security policies, implement authenticated founder-only review, and test application submission and access boundaries. Do not put a Supabase service-role key in browser code.