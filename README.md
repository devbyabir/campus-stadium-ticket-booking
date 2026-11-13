# Campus Stadium Ticket Booking

React/Vite frontend, Express API, and PostgreSQL. Authentication, event listing, seat selection, booking, QR tickets, profile editing, password changes, and admin summary counts are implemented. Admin management and detailed analytics still require backend APIs.

## Setup

1. Create a PostgreSQL database. Copy `backend/.env.example` to `backend/.env`; set `DATABASE_URL` and a random `JWT_SECRET` of at least 32 characters.
2. In `backend`, run `npm ci`, `npm run migrate`, then `npm run dev`.
3. Copy `frontend/.env.example` to `frontend/.env`. In `frontend`, run `npm ci`, then `npm run dev`.

The API also exposes `GET /api/user/profile`, `PUT /api/user/profile`, `PUT /api/user/change-password`, and admin-only `GET /api/admin/stats`. Active users in admin stats are distinct users with a booking created in the last 30 days. Signup accepts `name`, `email`, and `password` (at least 12 characters, at most 72 UTF-8 bytes) and creates a student account. Both auth routes return `{ "user": { ... }, "token": "..." }`. Send the token with `Authorization: Bearer <token>` for protected routes. Admin users must be provisioned by a trusted database administrator.

Seat records are scoped to events. Booking updates seats and creates QR hashes in one transaction. The schema's unique constraints prevent a seat from being attached to two bookings.

## Deployment

### Vercel Hobby and Neon Free

Use two Vercel projects from this GitHub repository and one Neon PostgreSQL project. No Render account or credit card is needed. Free plans have usage limits; review the [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) and [Neon pricing](https://neon.com/pricing).

Live frontend: https://campus-stadium-frontend.vercel.app  
Live API health check: https://campus-stadium-api.vercel.app/api/health

The deployed database uses the Neon `free_v3` plan. The API and frontend projects are `campus-stadium-api` and `campus-stadium-frontend` in the `dev-by-abir` Vercel team. Production URLs and CORS are configured in those projects. No real events have been added yet, so the events endpoint currently returns an empty list.

1. Create a Neon Free PostgreSQL project. Copy its **pooled** connection URL for the API and **direct** connection URL for migrations. Both URLs should include `sslmode=require`. Keep them secret.
2. Run migrations once from `backend`: set `MIGRATION_DATABASE_URL` to the direct URL in your local shell, then run `npm run migrate`. The runner records applied files in `schema_migrations`.
3. In Vercel team `dev-by-abir`, import `devbyabir/campus-stadium-ticket-booking` with **Root Directory** `backend` and **Framework Preset** Express. Set `DATABASE_URL` to the pooled Neon URL, `JWT_SECRET` to a random string of at least 32 characters, and `NODE_ENV=production`. Deploy and check `https://<backend-project>.vercel.app/api/health`.
4. Import the same repository as a second Vercel project with **Root Directory** `frontend` and **Framework Preset** Vite. Set `VITE_API_URL=https://<backend-project>.vercel.app/api` for Production. Deploy and note its URL.
5. Set `FRONTEND_ORIGIN=https://<frontend-project>.vercel.app` on the backend Vercel project, without a trailing slash, then redeploy it. Exact preview origins can be added as a comma-separated list.

Vercel environment variables belong in each project's dashboard or CLI, never in Git. `VITE_API_URL` is public in the browser bundle; the database URLs and `JWT_SECRET` belong only to the backend project. The backend exports Express from `src/app.js` for Vercel Functions; `src/local-server.js` is for local development.

To enable deployments on every push, grant the Vercel GitHub App access to this repository in [GitHub Installed Apps](https://github.com/settings/installations), then connect the repository in each project's Vercel **Settings → Git** page. Vercel CLI can deploy either project from the repository root after `vercel link --scope dev-by-abir --project <project-name>`; the configured Root Directory selects `backend` or `frontend`.

For a database migrated manually before `schema_migrations` existed, mark an already applied migration in that table only after verifying its schema changes are present. Do not rerun old SQL blindly.
