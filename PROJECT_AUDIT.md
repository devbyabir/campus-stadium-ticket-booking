# Release audit and remediation status

Reviewed on 2026-11-14. This file records what was found, what changed, and what remains before the project can be closed. The public deployment is a **software engineering demo**, not an institution-approved ticket service.

## Baseline

- Repository: https://github.com/devbyabir/campus-stadium-ticket-booking
- Frontend: https://campus-stadium-frontend.vercel.app
- API readiness: https://campus-stadium-api.vercel.app/api/ready
- Before this remediation, local Git and GitHub `main` matched at `51496a1`. The frontend and API were reachable, frontend build passed, and npm audit found no known advisories. The backend test script ran zero tests.

## Remediation implemented in the workspace

1. **QR admission:** Versioned HMAC ticket tokens are returned to the owner; their SHA-256 hashes are stored. An admin-only redeem endpoint checks the event window and atomically records `redeemed_at`, rejecting repeat scans. Existing tickets receive a new token hash on their first tickets request after deployment. Previous QR images are no longer valid. See `backend/src/config/ticketToken.js`, `backend/src/controllers/bookingController.js`, and `backend/src/controllers/adminController.js`.
2. **Student identity:** Signup requires an admin-issued, one-time, seven-day invitation tied to an approved email and University ID. Self-service changes to those identifiers are removed. Older open-signup accounts are unverified and cannot book until a trusted admin checks the campus roster and approves them. This is an admin-attestation model, not university SSO or automated email ownership verification.
3. **Admin operations:** Event creation, seat addition, booking list, monthly/category counts, student invitations/approval, and gate check-in have APIs and dashboard controls. The booking list displays the latest 100 records; cancellation, refunds, bulk import, and arbitrary layout redesign are outside this demo's scope.
4. **Tests and release gate:** QR unit test and a disposable-PostgreSQL integration test cover invitation, role checks, seat conflict, ticket ownership, and one-time redemption. GitHub Actions starts PostgreSQL, applies migrations, runs tests, and builds the frontend. The integration test is intentionally skipped locally without `TEST_DATABASE_URL`; a passing local unit test is not a substitute for a green CI run.
5. **Documentation and operations:** README contains live demo buttons, architecture, setup, API, deployment sequence, migration/backup guidance, and explicit demo limitations. A demo data-use notice is available in the UI. Institutional policy, official contact, real retention/deletion operations, and owner approval remain external decisions.
6. **Additional hardening:** PostgreSQL-backed rate limits replace process-local limits; password changes revoke old JWTs through `token_version`; TLS certificate verification is no longer disabled by `DATABASE_SSL=require`; `/api/ready` checks the database.

Database migrations `004`, `005`, and `006` were applied successfully to Neon before code deployment. No production test records were created during this audit.

## Release verification

- Commit `ed7160c` was pushed to GitHub `main`. [GitHub Actions run 43491031793](https://github.com/devbyabir/campus-stadium-ticket-booking/actions/runs/43491031793) completed successfully: PostgreSQL migrations, integration tests, and frontend build passed.
- Both Vercel production deployments reported Ready. Read-only live checks returned HTTP 200 for frontend `/`, `/privacy`, `/admin` and API `/api/health`, `/api/ready`, `/api/events`; unauthenticated `/api/admin/stats` returned HTTP 401 as expected.
- The full live auth → admin → booking → gate flow remains untested because there is no production admin account. CI tested that flow against disposable PostgreSQL.

## Outstanding decisions
- Provision the first production administrator through a controlled, approved process. A read-only check found **zero admins** before release. Automatic provisioning was rejected by approval review because it would create a privileged persistent account and could leave credentials unmanaged. Do not silently promote an existing account.
- Review the current unverified legacy student account against a real campus roster before approving it. Do not assume existing public-signup records are genuine students.
- For real campus deployment, obtain an official identity source or institutional process, publish an approved privacy/retention policy, designate support and backup owners, and check that the chosen hosting plan permits the intended use. Vercel Hobby is for personal/non-commercial use: https://vercel.com/docs/plans/hobby.

## Decision

The code can be presented as a demo: CI and read-only live checks passed. **Do not claim full production closure** until an authorized admin is provisioned, live end-to-end checks pass, and the institution accepts the identity, privacy, and operating model. No audit or automated test proves that all security flaws have been found.
