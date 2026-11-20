# Arc Africa — Production Readiness Audit

**Audit date:** 20 November 2026  
**Production site:** https://arc-africa.onrender.com  
**Repository:** https://github.com/jark-zenith/Arc-Africa-  
**Production branch:** `main`  
**Audit status:** Read-only production inspection; implementation changes are isolated in PR #16.

## 1. Production architecture

- **Frontend:** Render static site `arc-africa`, service `srv-dbtcu06k1f9s73c6snn0`, publishing repository root from `main`.
- **Latest inspected production deploy:** commit `eabd0b2620e656981b8bed0c7ba7b638131036cd`, deployed 18 November 2026; Render reported the build and deploy as successful.
- **Backend:** Supabase project `Arc Africa`, project ref `fgtkttnhhhvgonrwhakj`, region Singapore (`ap-southeast-1`), status `ACTIVE_HEALTHY`.
- **Active Edge Functions:** `admin-console` version 3 and `review-member-application` version 2 at the time of inspection.
- **Authentication:** Supabase Auth with email/password; Google OAuth remains intentionally disabled until provider credentials are configured.
- **Storage/database:** Supabase Postgres, RLS-protected public schema and private project-asset storage.

## 2. Log findings

### Render

Render's service event history showed successful builds/deploys in the inspected period. The Render log query returned no request-log rows for 19–20 November 2026. This is not evidence of zero website visitors; static-site/CDN request analytics were not available from the queried log endpoint.

### Supabase — latest 24-hour window at audit time

- 39 gateway request events were recorded across the project.
- Recorded gateway outcomes were successful HTTP responses (`200`, `201`) and one normal Realtime WebSocket handshake (`101`); the filtered query found no failed HTTP response codes.
- `admin-console` had an `OPTIONS 200` preflight and `POST 200` invocation.
- `member_applications` had an `OPTIONS 200` and `GET 200`; no submission `POST` appeared in that 24-hour window.
- No `review-member-application` invocation was observed in the inspected function log slice.
- These logs show backend/admin activity, not distinct visitor counts or referral attribution. TikTok referrals cannot be confirmed from the available logs.

No IP addresses, email addresses, user-agent strings or other request-level identifiers are included in this report.

## 3. Live data snapshot

Read-only counts at inspection time:

| Resource | Count |
|---|---:|
| Auth users | 2 |
| Profiles | 2 |
| `member_applications` | 1 |
| Legacy `membership_applications` | 0 |
| `admin_inbox` | 0 |
| Projects | 1 |

The owner administrator account and a separate member account both exist. Preserve both identities and all existing application/project data.

## 4. Source-code inventory reviewed

### Public website and shared browser code

| File | Responsibility |
|---|---|
| `index.html` | Public landing page, project/community sections, authentication and membership modal markup |
| `styles.css` | Responsive public site, modal, project and community styling |
| `app.js` | Supabase browser client, authentication, project discovery, membership applications/resubmission, community submissions and public interactions |
| `config.js` | Supabase URL and publishable browser key configuration |
| `security.js` | Safe HTTP(S) URL validation used before rendering external links |
| `discovery.mjs` | Project keyword/category/stage/country filtering |
| `terms.html` | Public Terms of Use |
| `privacy.html` | Public Privacy Policy |
| `legal.css` | Shared Terms and Privacy page styling |
| `README.md` | Project architecture, setup, configuration and deployment notes |

### Administrator and owner tools

| File | Responsibility |
|---|---|
| `admin.html` | Private administrator console layout and panels |
| `admin.js` | Admin authentication gate, metrics, member directory, application/project/community moderation, audit/activity feeds and email retry control |
| `admin.css` | Administrator console styling |
| `admin-router.js` | Admin routing/entry behaviour |
| `owner-tools.js` | Owner-only utilities |

### Supabase configuration and Edge Functions

| File | Responsibility |
|---|---|
| `supabase/config.toml` | Supabase CLI project/function configuration |
| `supabase/functions/admin-console/index.ts` | Verifies the administrator and returns protected console/session data using the service-role client |
| `supabase/functions/review-member-application/index.ts` | Verifies moderator access, provisions/links approved member accounts, persists decisions and tracks/sends applicant notifications |
| `supabase/functions/claim-member-application/index.ts` | Links a verified account to an earlier anonymous application with the same email, without exposing other applicants' records |

### Static assets

- `assets/arc-africa/`: 20+ JPG concept images used by the public project showcase.

### Database migrations in the repository

1. `supabase/migrations/202611100001_arc_africa_platform_core.sql`
2. `supabase/migrations/202611100002_security_hardening.sql`
3. `supabase/migrations/202611100003_query_performance.sql`
4. `supabase/migrations/202611150001_arc_africa_community_hub.sql`
5. `supabase/migrations/202611160001_arc_africa_admin_bootstrap.sql`
6. `supabase/migrations/202611180001_member_activity_privacy_audit.sql`
7. `supabase/migrations/202611180002_legal_acceptances_and_activity_retention.sql`
8. `supabase/migrations/202611180003_admin_audit_read_privilege_hardening.sql`
9. `supabase/migrations/202611180004_secure_service_role_session_overview.sql`
10. `supabase/migrations/202611180005_audit_member_auth_session_events.sql`
11. Proposed in PR #16: `supabase/migrations/202611200001_member_application_email_delivery.sql`

### Automated tests and CI

| File | Responsibility |
|---|---|
| `tests/smoke.mjs` | Static capability and security assertions across the public/admin code |
| `tests/rls-performance.mjs` | RLS/performance-oriented migration checks |
| `tests/community.mjs` | Community feature checks |
| `tests/discovery.mjs` | Project discovery/filter checks |
| `.github/workflows/validate.yml` | Runs Node tests, browser-JavaScript syntax checks and Deno Edge Function type-checks on PRs and pushes to `main` |

CI also runs Node syntax checks for browser JavaScript and Deno type-checks for both Edge Functions. These checks are not yet full browser end-to-end tests of signup, verification, application submission, moderation, email delivery and member access.

## 5. Production database and security findings

### Membership application policy drift

The live `member_applications` table has RLS enabled, but its deployed policies differ from the more restrictive policy in the repository migration:

- `Anyone can submit membership application` permits anon/authenticated inserts when `commitment_accepted = true` and `status = 'pending'`.
- That live insert policy does **not** bind `user_id` to `auth.uid()`, and does not require `reviewed_by` and `reviewed_at` to be null.
- Live column privileges granted anon/authenticated INSERT/UPDATE/SELECT across all application columns, including review metadata. RLS still limits row access and status values, but the broad grants and incomplete insert check permit identity/metadata spoofing within the insert policy.
- The live moderator policy is a broad `FOR ALL` policy. The proposed migration replaces it with narrower read access and reserves review writes for the service-role Edge Function.

PR #16 adds a migration that:
- binds authenticated submissions to their own user ID while retaining anonymous submissions;
- requires new submissions to be pending and contain no reviewer metadata;
- revokes broad anon/authenticated table grants;
- grants only the columns required for application submission and applicant resubmission;
- restricts application reads to authenticated applicants and moderators;
- adds foreign-key indexes for application ownership/reviewer fields.

**Do not apply this migration to production until the full live migration ledger is reconciled with the repository.**

### Email delivery and approval flow

The deployed version 2 review function has two important failure modes. The current application-submission flow also only displays a browser confirmation; it does not send a separate application-received email to the applicant.

1. If Resend is not configured, an anonymous application can be marked approved without creating/linking an Auth user.
2. Once a decision is final, a failed notification cannot be retried through the current function because it only accepts pending/changes-requested applications.

PR #16 adds a private `member_application_email_delivery` outbox, separates decision state from notification state, prepares an Auth link before approving, and adds an admin retry control. The outbox is readable only by moderators; clients cannot write delivery records. The matching migration must be applied before deploying the updated Edge Function.

### Admin application alerts

The database already writes privacy-conscious `admin_audit_events` for member application activity and publishes those events to Realtime. Before PR #16, the admin subscriber refreshed only the activity/audit feed, not the application queue. PR #16 refreshes the queue and displays the pending count.

### Other hardening items

- Supabase Auth leaked-password protection is disabled.
- SMTP/Resend secret configuration has not been independently verified; do not paste secrets into chat.
- The performance advisor reports 15 unindexed foreign keys, 20 multiple-permissive-policy warnings and 9 unused indexes. Review query plans and usage before adding/removing indexes or merging policies.
- `member_applications` is the active table used by the frontend/functions. `membership_applications` is an empty legacy table; do not delete it until all references and retention needs are checked.
- The README previously named a stale Supabase project ref; PR #16 corrects it.

## 6. Production migration ledger — live Supabase

The live ledger contained these 12 versions at audit time:

| Version | Ledger name |
|---|---|
| `20261116121556` | `arc_africa_core_platform` |
| `20261116121602` | `arc_africa_storage_and_api_access` |
| `20261116121623` | `add_approved_content_status` |
| `20261116121630` | `align_arc_africa_app_schema` |
| `20261116121644` | `harden_profile_updates_and_sync_auth_metadata` |
| `20261116121651` | `add_project_funding_fields` |
| `20261116123636` | `private_admin_console_foundation` |
| `20261118155704` | `member_activity_privacy_audit` |
| `20261118155732` | `legal_acceptances_and_activity_retention` |
| `20261118155950` | `admin_audit_read_privilege_hardening` |
| `20261118160124` | `secure_service_role_session_overview` |
| `20261118160320` | `audit_member_auth_session_events` |

These ledger identifiers do not map one-to-one to the repository migration filenames. This is a deployment blocker for new migrations until the mapping is documented and drift is resolved.

## 7. Implementation plan

### Phase 1 — isolated PR work (in progress)

- [x] Public community administrator profile, with no private address or admin email.
- [x] Live application queue refresh from the existing audit/RealtIme stream.
- [x] Pending application count in the admin console.
- [x] Verified signup redirect into membership application onboarding, with existing-application status checks and applicant name/email prefill.
- [x] Applicant resubmission flow for returned/rejected linked applications, including visible moderator feedback and clearing old review metadata under restrictive RLS checks.
- [x] Securely link a verified account to an earlier anonymous application using a service-role Edge Function.
- [x] Approval invitation welcome redirect handling.
- [x] Private email-delivery outbox and retry action in code.
- [x] Restrictive membership application RLS/column-grant migration drafted.
- [x] Correct README backend reference and deployment notes.
- [x] Expand smoke assertions for the new controls and security rules.
- [x] Remove an unused unsupported `User.last_active_at` field from the admin-console Edge Function response after Deno type-checking exposed it.
- [ ] Review final PR diff and wait for all checks on the latest commit.

### Phase 2 — schema and deployment reconciliation

1. Compare every repository migration file with the 12 production ledger entries.
2. Compare live table definitions, triggers, functions, grants and RLS policies with repository SQL.
3. Produce a non-destructive drift report and decide whether to baseline or add forward-only corrective migrations.
4. Test the migration and updated Edge Function against a safe development database before production.
5. Apply the migration before deploying the matching Edge Function.
6. Verify Resend sender/domain and SMTP settings in the provider dashboards without exposing secrets.

### Phase 3 — complete user journey tests

- Signup with a new email.
- Email verification and return to Arc Africa.
- Sign-in and membership application handoff.
- Anonymous application submission, if the public application path is retained.
- Duplicate application handling and resubmission after changes requested.
- Immediate admin notification and queue refresh.
- Approval, account creation/linking and member permission synchronization.
- Rejection and request-changes notifications.
- Failed-email state, admin retry and successful retry.
- Confirm ordinary members cannot access admin tools or alter review metadata.
- Confirm existing admin/member accounts, projects and applications remain intact.

### Phase 4 — public-launch hardening

- Enable leaked-password protection after reviewing the Auth setting.
- Verify custom SMTP and Resend delivery, bounce handling and sender reputation.
- Add a separate application-received acknowledgement email with delivery tracking; keep it distinct from the later moderation decision email.
- Add privacy-preserving rate limiting and bot protection to public signup/application forms.
- Add browser-level E2E tests and failure-path monitoring.
- Review RLS policy overlap and foreign-key indexes based on actual query plans.
- Add reliable analytics/referral attribution for TikTok and other campaigns without collecting unnecessary personal data.
- Add operational alerts for failed Edge Functions, failed email delivery and pending applications.

## 8. Change-control rules

- Work through feature branches and pull requests; do not push directly to `main`.
- Do not deploy Edge Functions that depend on unapplied migrations.
- Do not replay migrations against production until the live ledger is reconciled.
- Do not delete legacy tables or indexes based only on unused-index warnings.
- Do not change the owner admin identity, existing member identities or project/application records.
- Do not expose service-role keys, private applicant information, IP addresses or private admin contact details.
