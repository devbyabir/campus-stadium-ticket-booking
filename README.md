# Campus Stadium Ticket Booking

Node.js/Express API with PostgreSQL and a React/Vite frontend. Authentication, event listing, seat selection, booking, QR tickets, profile editing, password changes, and admin summary counts are implemented. Admin management and detailed analytics still require backend APIs.

## Setup

1. Create a PostgreSQL database named `campus_stadium`. In `backend`, run `npm run migrate` to apply tracked migrations in order. For a database where `001_initial.sql` and `002_profile.sql` were already run manually, add those filenames to `schema_migrations` before running the command; do not apply them twice.
2. Copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL` and replace `JWT_SECRET` with a random secret of at least 32 characters.
3. In `backend`, run `npm install` then `npm run dev`.
4. In `frontend`, run `npm install` then `npm run dev`. Copy `frontend/.env.example` to `.env` if the API is not on the default URL.

The API also exposes `GET /api/user/profile`, `PUT /api/user/profile`, `PUT /api/user/change-password`, and admin-only `GET /api/admin/stats`. Active users in admin stats are distinct users with a booking created in the last 30 days. Signup accepts `name`, `email`, and `password` (at least 12 characters, at most 72 UTF-8 bytes) and creates a student account. Both auth routes return `{ "user": { ... }, "token": "..." }`. Send the token with `Authorization: Bearer <token>` for protected routes. Admin users must be provisioned by a trusted database administrator.

Seat records are scoped to events. Booking updates seats and creates QR hashes in one transaction. The schema's unique constraints prevent a seat from being attached to two bookings.

## Deployment

### Render backend and PostgreSQL

The root `render.yaml` defines a Node web service and PostgreSQL database. Create a Render Blueprint from the GitHub repository. Set `FRONTEND_ORIGIN` to the final Vercel origin (for example, `https://your-app.vercel.app`, without a trailing slash) when prompted. Render provides `PORT`, links the internal `DATABASE_URL`, and generates `JWT_SECRET`. The service runs tracked migrations on startup, then starts Express. `DATABASE_SSL=disable` is appropriate for Render's private internal database connection; use `require` for external TLS connections or `verify-full` with a trusted certificate. Keep the API and database in the same region.

For an existing database previously migrated by hand, create `schema_migrations` and insert `001_initial.sql` and/or `002_profile.sql` only after verifying each schema change already exists. For a fresh Render database, no manual SQL is needed.

### Vercel frontend

Import the same GitHub repository as a Vercel project. Set **Root Directory** to `frontend`, **Framework Preset** to Vite, **Build Command** to `npm run build`, and **Output Directory** to `dist`. Set `VITE_API_URL` to `https://your-render-service.onrender.com/api` in Production and Preview environments, then redeploy. `frontend/vercel.json` rewrites deep links to the SPA entry point.

Set Render `FRONTEND_ORIGIN` to the Vercel deployment origin used by browsers. If the Vercel preview and production origins differ, configure an exact allowlist in the backend before using both; the current CORS setting accepts one origin.

Neither `.env` file nor credentials belong in Git. Vite variables are embedded in the client bundle, so `VITE_API_URL` must contain only a public API URL.
