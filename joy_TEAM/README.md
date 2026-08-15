# KlasePH Learning Hub

A separate mobile-first classroom companion prototype for teachers and students in the Philippines.

This version supports two modes:

- Cloud mode with Supabase Auth and database sync for real teacher/student accounts.
- Local demo mode when `config.js` is blank.

## Included

- Local teacher and student accounts
- Supabase-backed teacher and student accounts when configured
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

## Demo Accounts

- Teacher: `teacher@klaseph.test` / `teacher123`
- Student: `ana@klaseph.test` / `student123`

Demo accounts only work in local demo mode. In cloud mode, create real accounts through the sign-up form.

## Next Steps

- Add real school/admin roles.
- Add teacher-editable answer keys and item analysis.
- Add a maintained database of official MATATAG/K to 12 competencies by grade, subject, and quarter.
- Add import/export for class lists.
- Add assessment item banks for literacy and numeracy.
- Add privacy notices and consent flows before production use.

## DepEd Alignment Note

The exam generator uses teacher-provided competencies and lesson source text to create a test blueprint. Teachers should paste the exact competency from the applicable DepEd curriculum guide and review all generated questions before giving an exam.
