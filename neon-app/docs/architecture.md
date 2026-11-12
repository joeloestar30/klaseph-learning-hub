# KlasePH frontend architecture

The application remains a static PWA, but responsibilities are separated so the main UI no longer owns every platform concern.

- `src/client.js` adapts Neon Auth and the Data API.
- `observability.js` captures structured authentication, RPC, database, startup, promise, and frontend failures. It keeps at most 100 metadata-only events in local storage; learner payloads and answers must never be added to event context.
- `cloud-data.js` owns parallel table loading, role-aware datasets, server-side directory/audit pagination, and query error reporting.
- `app.js` owns shared state, navigation, mapping, and classroom/admin views.
- `ellna.js` owns the governed ELLNA interface.
- `classroom-operations.js` owns teacher scoring, item analytics, roster transfer, and dated attendance presentation.
- `auth-enhancements.js` owns authentication and onboarding presentation.

## Data refresh rules

Initial cloud loading fetches independent datasets in parallel. Mutations refresh only affected tables—for example, attendance refreshes memberships, assessment submission refreshes submissions, and settings updates refresh settings. The explicit admin refresh remains available for reconciliation.

## Canonical assessments

`exams`, `questions`, and `question_choices` are the only source of generated assessment content. The `activities.questions` field is retained temporarily for compatibility with manual/local-demo activities, but a database trigger forces it to an empty array for cloud auto-checked exams. Students receive normalized content only through answer-free views.

## Operational events

The System Health workspace shows the number of locally retained operational events. These records assist diagnosis but are not a replacement for centralized production monitoring. A future remote sink must implement authentication, redaction, retention limits, and rate limiting before events leave the browser.

## Accessibility and constrained connections

The shell provides a keyboard skip link, visible focus indicators, live status announcements, document-language switching, and a low-data preference. Low-data mode reduces administrator directory and audit page sizes and suppresses nonessential sidebar content. The browser's `Save-Data` preference enables the same reduced page sizes automatically.
