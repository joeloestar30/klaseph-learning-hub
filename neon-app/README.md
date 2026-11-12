# KlasePH — Neon edition

A separate copy of the existing KlasePH interface, prepared for free static frontend hosting and Neon Auth + Neon Data API. The original app at the repository root is unchanged.

## Current status

Live app: https://joyteam-neon.vercel.app

The frontend is deployed as the separate `joyteam-neon` project on Vercel Hobby, using a direct upload of the built static files. It connects to the Free Neon project `joy_team` (`damp-rice-42686167`, production branch). Neon Auth and Data API are enabled, and the schema and existing records have been imported. The production origin is registered in Neon Auth's trusted domains; email verification by code is required. The public frontend and auth endpoints return HTTP 200, the production CORS origin matches, and the deployed sign-in screen loads without browser errors. Automated local PostgreSQL tests cover onboarding, migration identity matching, class isolation and role protection. A real user must still register/verify their Neon account to confirm their individual login and restored records.

This deployment uses a static ZIP upload, not a Git connection. Future local source changes will not deploy automatically: rebuild and upload the updated `dist/` files to this same Vercel project, or connect Git as described below. The uploaded ZIP contains only public frontend assets and public Neon endpoints; migration snapshots, SQL and passwords are excluded.

On September 9, 2026, two profiles, four classes, two schools, four audit entries and the system settings were copied from Supabase. Two verified legacy identities can reclaim their existing profiles by registering and verifying the same email in Neon. Two Supabase auth-only accounts had no app profile and were unverified; they must register anew. No passwords or auth tokens were copied. The original Supabase app remains intact.

Do not rerun the initial schema or import against this now-populated target. `database/schema.sql` is for a fresh installation only. Private source snapshots and import SQL are under the ignored `.migration/` directory and must never be published.

## Set up Neon Free

1. Sign in at https://console.neon.tech and create a **Free** project, preferably in the nearest available region to your users. Keep the default scale-to-zero behavior.
2. Enable **Neon Auth / Managed Better Auth** and **Data API** for the same database/branch. Configure Data API to use Neon Auth. Do not enable the separate legacy Neon RLS product on that branch.
3. Enable email/password signup and email verification. Verify email delivery settings and the verification-code flow. The app includes a code verification screen and email-link password reset.
4. In the SQL editor, run `database/schema.sql` **once on the new empty database**, followed by `database/ellna.sql`, `database/secure-assessments.sql`, `database/ellna-workflow.sql`, `database/canonical-assessments.sql`, `database/classroom-operations.sql`, `database/access-control.sql`, and `database/permission-enforcement.sql`, as its owner. The scripts require the `authenticated` role, `auth.user_id()` function, and `neon_auth.user` table that Neon provisions. They commit atomically. Do not run the initial schema on Supabase or an existing populated database. For an existing KlasePH Neon installation, apply only migrations that have not yet been run. See `docs/architecture.md` for module and data-refresh boundaries.
5. Copy `.env.example` to `.env`; set `NEON_AUTH_URL` and `NEON_DATA_API_URL` to the separate **public HTTPS endpoints** from Neon. These are public frontend configuration, not database passwords. Never put a Postgres connection string or Neon management key here.
6. Add `http://127.0.0.1:4173` and the final deployed origin to Neon Auth's trusted origins; configure the deployed app URL as an allowed password-reset destination. Confirm CORS access for the Data API.

The pre-login school lookup is optional: this edition grants the directory RPC only to authenticated users. New users can enter their school manually. School names alone never grant administrator rights.

## Run locally

Use Node.js 22+ and pnpm:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

Open http://127.0.0.1:4173. For an explicit local-only demo, set `DEMO_MODE=true` before building. A normal build fails when Neon endpoints are missing, so a production setup cannot silently become a demo.

The original teacher, student and administrator demo accounts operate only in demo mode. Demo data uses a separate local storage key. Installing the site as a desktop PWA does not make cloud login or classroom data available offline.

## Publish the frontend for free

### Cloudflare Pages

- Connect this repository and set **root directory** to `neon-app`.
- Build command: `pnpm build`.
- Output directory: `dist`.
- Add `NEON_AUTH_URL` and `NEON_DATA_API_URL` as build environment variables. Leave `DEMO_MODE` unset.
- Use the free `pages.dev` address, then add its exact HTTPS origin to Neon Auth.

### Vercel

- Create a **separate** Vercel project with root directory `neon-app`.
- Framework preset: Other. Build command: `pnpm build`. Output: `dist`.
- Add the same two Neon environment variables. Keep the current joyteam deployment unchanged.
- Vercel Hobby requires qualifying personal, noncommercial use.

Only `dist/` is publishable. SQL, tests, dependencies, and private environment files are not copied into it. Free tiers have usage limits; check the provider dashboards as usage grows. This project does not add paid services or artificial keep-alive jobs.

## First administrator

Register and verify your new account, then complete its profile. In Neon SQL Editor, promote only the exact verified account you own:

```sql
update public.profiles
set role = 'super_admin'
where id = 'YOUR-VERIFIED-ACCOUNT-UUID';
```

Refresh the app afterward. Other administrators can be invited from the app by an existing super administrator. Invitations are claimed only by verified matching email addresses; public signup cannot request an administrator role.

## Validation before live use

- Register teacher and student accounts; verify their emails and reload sessions.
- Create a class as the teacher; join by code as the student.
- Create activities/exams, submit work, verify records/CSV export and attendance.
- Test admin invitations, account suspension, school management and password recovery.
- Verify unrelated accounts cannot read or change another class, and suspended accounts lose access.

Cloud-mode generated exams use `publish_exam` and `submit_exam` database functions. Publication is transactional, student-readable views omit answer keys and correctness flags, and objective grading occurs on the server with database-enforced enrollment, publication, deadline, and attempt checks. Local demo mode still grades in the browser and must never be used for real or high-stakes assessment. Apply `database/secure-assessments.sql` before enabling cloud exam publication.

## References

- https://neon.com/docs/auth/migrate/from-supabase
- https://neon.com/docs/reference/javascript-sdk
- https://neon.com/docs/guides/row-level-security
- https://neon.com/pricing

`scripts/schema.mjs` regenerates the Neon schema from the preserved original schema files plus `database/hardening.sql`; it is a development helper, not a deploy-time migration runner.
