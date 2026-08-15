# Database Management

KlasePH uses Supabase Postgres as the production database.

## Migration Order

Run these files in Supabase SQL Editor in this order:

1. `supabase/schema.sql`
2. `supabase/rls-recursion-fix.sql`
3. `supabase/admin-role-fix.sql`
4. `supabase/production-db-upgrade.sql`
5. `supabase/admin-dashboard-upgrade.sql`

## Core Tables

- `schools` - school identity and grouping
- `profiles` - app profile linked to Supabase Auth users
- `classes` - class sections owned by teachers
- `class_members` - student enrollment
- `competencies` - DepEd/MATATAG or teacher-provided competencies
- `exams` - normalized online exams
- `questions` - exam questions
- `question_choices` - choices for objective questions
- `exam_attempts` - one student attempt per exam
- `submission_answers` - per-question student answers
- `scores` - gradebook-ready score rows
- `attendance` - attendance records
- `audit_logs` - admin/security event history
- `admin_invites` - invite-only admin promotion workflow
- Admin dashboard RPCs - `admin_update_profile`, `admin_create_invite`
- Super Admin user management is organized into Directory, Schools, Admin Invites, Audit Logs, and System Health tabs.

## Role Model

- `super_admin` can manage the full system.
- `school_admin` can manage records in their assigned school.
- `teacher` can manage their classes, exams, questions, attendance, and scores.
- `student` can join classes, answer exams, and view their own results.

## Rules

- Passwords belong only in Supabase Auth, never in app tables.
- The browser uses only the Supabase publishable key.
- Every production table has Row Level Security enabled.
- School-scoped data should use `school_id`.
- Exams should use normalized `exams`, `questions`, `question_choices`, `exam_attempts`, and `submission_answers`.
- Keep old `activities.questions` JSON only for prototype compatibility.
- Generated cloud exams are mirrored into `exams`, `questions`, and `question_choices` when the production upgrade tables exist.
