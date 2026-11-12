# ELLNA record governance

KlasePH treats ELLNA learner information as a governed school record. This document describes application behavior, not a legal retention determination. A school or DepEd data-protection authority must approve the configured retention period before production use.

## Ownership and access

- Every new record is linked to one learner, class, and school.
- Learners may create records only for themselves and only in classes where they are enrolled.
- Teachers may create or review records only for learners enrolled in classes they teach.
- School administrators are limited to their school. Super administrators retain audited oversight access.
- Legacy unlinked records remain visible only to their original owner or a super administrator; they are not silently assigned to a class.

## Status workflow

`draft → submitted → reviewed`

A reviewer may move a submitted record to `needs_correction`. The learner or authorized teacher can revise it and resubmit it. The original `submitted_at` timestamp never changes; later submission activity is stored in `resubmitted_at`, and every save increments `revision`.

## Export and audit

Exports are generated through `export_ellna_form`. The export contains its form version, revision, relational ownership, workflow dates, retention date, payload, and export timestamp. Every save, submission, review, correction request, export, deletion request, and finalized deletion writes an audit event without copying the learner payload into the audit log.

## Retention and deletion

- `system_settings.ellna_retention_days` controls the retention window and defaults to 365 days. This default is operational, not a statement of DepEd legal policy.
- An unsubmitted draft can be deleted immediately by its learner or creator.
- A submitted record becomes `deletion_requested`; it is not erased by the requester.
- Only a super administrator can finalize deletion. Before `retention_until`, a documented override is required.
- Finalization removes the payload and preserves minimal metadata plus the audit trail.

## Form authority and versioning

The current printable layout is `photo-reconstruction-v1`. It is not certified for optical scanning and must not be represented as an official BEA form. DepEd's current public materials confirm ELLNA policy and administration but do not provide a machine-readable learner-information-sheet layout suitable for implementation:

- DepEd Memorandum No. 087, s. 2025, Administration of ELLNA for SY 2025–2026
- DepEd Order No. 55, s. 2016, Policy Guidelines on the National Assessment of Student Learning
- Bureau of Education Assessment, Technical Notes on Learning Outcomes Data (as of March 31, 2025)

When BEA supplies an authoritative form or data dictionary, add a new form version and migration. Do not silently change previously submitted records or label the reconstructed sheet as scanner-compatible.
