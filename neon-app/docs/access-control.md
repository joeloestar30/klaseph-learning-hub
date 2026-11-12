# Access control operations

KlasePH authorizes privileged actions from active records in `access_assignments`. The legacy `profiles.role` field remains only for the student/teacher identity shown by older screens and integrations; it is not an administrator authorization source.

## Administrator onboarding

1. The person registers and completes normal onboarding as a teacher or student.
2. An authorized administrator opens **Admin > Access Management** and creates a request for the smallest role, scope, and duration required.
3. A different authorized administrator approves the request. Super-administrator access requires two distinct approvers.
4. The resulting assignment is reviewed or revoked from Access Management. The database prevents revocation of the final active platform super administrator.

Direct administrator invitations and direct promotion through the user directory are retired. Account status and student/teacher identity can still be managed from the user directory.

## Scope model

- `platform`: all schools and classes.
- `division`: schools and classes within the named division.
- `school`: the selected school and its classes.
- `class`: only the selected class.

Authorization combines an active assignment, the role's permission set, and a matching scope. Expired and revoked assignments do not authorize access.

## Deployment order

For an existing installation, back up the database and apply `database/access-control.sql` followed by `database/permission-enforcement.sql` as the database owner. Deploy the matching frontend only after both migrations succeed. Validate at least one active platform super-administrator assignment before ending the maintenance window.

The second migration removes privileged reliance on `profiles.role`, bootstraps existing teacher access, retires direct admin invites/promotions, and replaces affected row-level policies and helper functions.

## Audit and review

Access requests, approvals, grants, revocations, status changes, and reviews are written to the audit log. Periodically review privileged assignments, assignments older than 180 days, upcoming expirations, and requests still awaiting approval.
