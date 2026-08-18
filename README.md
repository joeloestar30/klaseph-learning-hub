# KlasePH Learning Hub

A separate mobile-first classroom companion prototype for teachers and students in the Philippines.

This version supports two modes:

- Cloud mode with Supabase Auth and database sync for real teacher/student accounts.
- Local demo mode when `config.js` is blank.

## Included

- Local teacher and student accounts
- Supabase-backed teacher and student accounts when configured
- Improved sign-in and 3-step teacher/student onboarding
- Password recovery, password confirmation, and stronger password guidance
- School-directory assisted signup
- Private onboarding profile storage for teacher/student identifiers and school context
- Class list and class code workflow
- Activity and submission flow
- Teacher exam generator
- DepEd-aligned exam blueprint fields for grade, quarter, subject, competency, and assessment component
- Production database upgrade with schools, competencies, normalized exams/questions/answers, scores, attendance, and audit logs
- Cloud-generated exams are mirrored into normalized production exam tables
- Super Admin Users workspace with Directory, Schools, Admin Invites, Audit Logs, and System Health tabs
- Multiple choice, true/false, and identification items
- Automatic checking for objective exams
- Attendance/progress overview
- Class record CSV export
- Offline status indicator
- Local demo-data persistence
- Basic PWA manifest and service worker

## Open the App

Open `index.html` in a browser.

For the best PWA behavior, serve the folder through a local server such as VS Code Live Server.

## Supabase Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run the SQL files in this order:
   - `supabase/schema.sql`
   - `supabase/rls-recursion-fix.sql`
   - `supabase/admin-role-fix.sql`
   - `supabase/production-db-upgrade.sql`
   - `supabase/admin-dashboard-upgrade.sql`
   - `supabase/onboarding-profile-upgrade.sql`
4. In Supabase, open Project Settings > API.
5. Copy the Project URL and Publishable key.
6. Paste them into `config.js`.

```js
window.KLASEPH_CONFIG = {
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "your-publishable-key"
};
```

Use only the publishable/anon key. Never put a service role key in the browser.

## Auth Redirect Setup

Password recovery uses the current app URL as the Supabase redirect target. In Supabase Auth URL configuration, add every URL where you run KlasePH, for example your VS Code Live Server URL during development and your production website URL after deployment.

If you use Live Server, the port can vary. Add the exact URL that appears in your browser, such as `http://127.0.0.1:5500/`, to the allowed redirect URLs before testing password recovery.

## Onboarding Data

The public `profiles` table continues to hold the account information needed by the existing app, such as name, role, school name, and school ID.

Additional signup information is stored in `profile_onboarding`, which is protected with Row Level Security. This includes region, division, school year, teacher ID, designation, grade/subject assignments, advisory section, student LRN, grade level, and section. Users can read/update their own onboarding record, while super admins can access it for administration.

The signup page gets only non-sensitive school directory fields through the `list_signup_schools()` RPC. This lets users select an existing school before authentication without making the full `schools` table publicly readable.

## Demo Accounts

- Teacher: `teacher@klaseph.test` / `teacher123`
- Student: `ana@klaseph.test` / `student123`

Demo accounts only work in local demo mode. In cloud mode, create real accounts through the sign-up form.

## Next Steps

- Add teacher-editable answer keys and item analysis.
- Add a maintained database of official MATATAG/K to 12 competencies by grade, subject, and quarter.
- Add import/export for class lists.
- Add assessment item banks for literacy and numeracy.
- Add privacy notices and consent flows before production use.
- Add automated browser tests for sign-in, signup, email verification, password reset, and role-based onboarding.

## DepEd Alignment Note

The exam generator uses teacher-provided competencies and lesson source text to create a test blueprint. Teachers should paste the exact competency from the applicable DepEd curriculum guide and review all generated questions before giving an exam.
