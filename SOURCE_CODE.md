# Complete source code

## backend/.env.example

```text
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/campus_stadium
# Neon API: use the pooled connection URL ending in ?sslmode=require.
# For migrations, set MIGRATION_DATABASE_URL to Neon's direct URL ending in ?sslmode=require.
JWT_SECRET=replace-with-a-random-secret-at-least-32-characters-long
JWT_EXPIRES_IN=1h
FRONTEND_ORIGIN=http://localhost:5173
# Production: https://your-frontend-project.vercel.app
NODE_ENV=development
```

## backend/migrations/001_initial.sql

```sql
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL CHECK (length(btrim(name)) > 0),
    email VARCHAR(254) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));

CREATE TABLE events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),
    description TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    venue VARCHAR(200) NOT NULL,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

CREATE TABLE stadium_sections (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code CHAR(1) NOT NULL UNIQUE CHECK (code IN ('A', 'B', 'C', 'D')),
    name VARCHAR(100) NOT NULL
);
INSERT INTO stadium_sections (code, name) VALUES
    ('A', 'Section A'), ('B', 'Section B'),
    ('C', 'Section C'), ('D', 'Section D');

CREATE TABLE seats (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    section_id BIGINT NOT NULL REFERENCES stadium_sections(id),
    row_number INTEGER NOT NULL CHECK (row_number > 0),
    seat_number INTEGER NOT NULL CHECK (seat_number > 0),
    status VARCHAR(10) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked')),
    UNIQUE (event_id, section_id, row_number, seat_number),
    UNIQUE (id, event_id)
);
CREATE INDEX seats_event_status_idx ON seats (event_id, status);

CREATE TABLE bookings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    event_id BIGINT NOT NULL REFERENCES events(id),
    status VARCHAR(10) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, event_id)
);
CREATE INDEX bookings_user_idx ON bookings (user_id);

CREATE TABLE booking_seats (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id BIGINT NOT NULL,
    event_id BIGINT NOT NULL,
    seat_id BIGINT NOT NULL,
    qr_code_hash CHAR(64) NOT NULL UNIQUE CHECK (qr_code_hash ~ '^[0-9a-f]{64}$'),
    FOREIGN KEY (booking_id, event_id) REFERENCES bookings(id, event_id),
    FOREIGN KEY (seat_id, event_id) REFERENCES seats(id, event_id),
    UNIQUE (seat_id)
);
CREATE INDEX booking_seats_booking_idx ON booking_seats (booking_id);
```

## backend/migrations/002_profile.sql

```sql
ALTER TABLE users ADD COLUMN university_id VARCHAR(50), ADD COLUMN phone VARCHAR(30);
CREATE UNIQUE INDEX users_university_id_unique ON users (university_id) WHERE university_id IS NOT NULL;
```

## backend/migrations/003_demo_events.sql

```sql
-- Presentation data only. Replace these demo events with verified campus events before real ticket sales.
WITH demo_events AS (
  INSERT INTO events (title, description, starts_at, ends_at, venue)
  VALUES
    ('Campus Sports Festival · Demo', 'Demo event for the Campus Stadium Ticket Booking project.', date_trunc('day', now()) + interval '30 days 16 hours', date_trunc('day', now()) + interval '30 days 20 hours', 'Main Stadium'),
    ('Fall Music & Arts Fest · Demo', 'Demo event for the Campus Stadium Ticket Booking project.', date_trunc('day', now()) + interval '45 days 18 hours', date_trunc('day', now()) + interval '45 days 22 hours', 'Campus Arena'),
    ('Founders Day Convocation · Demo', 'Demo event for the Campus Stadium Ticket Booking project.', date_trunc('day', now()) + interval '60 days 10 hours', date_trunc('day', now()) + interval '60 days 13 hours', 'Main Stadium'),
    ('Winter Theatre Production · Demo', 'Demo event for the Campus Stadium Ticket Booking project.', date_trunc('day', now()) + interval '75 days 19 hours', date_trunc('day', now()) + interval '75 days 22 hours', 'Campus Arena')
  RETURNING id
)
INSERT INTO seats (event_id, section_id, row_number, seat_number)
SELECT event.id, section.id, row_numbers.value, seat_numbers.value
FROM demo_events AS event
CROSS JOIN stadium_sections AS section
CROSS JOIN generate_series(1, 4) AS row_numbers(value)
CROSS JOIN generate_series(1, 8) AS seat_numbers(value);
```

## backend/package.json

```json
{
  "name": "campus-stadium-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/local-server.js",
    "migrate": "node src/migrate.js",
    "dev": "node --watch src/local-server.js",
    "test": "node --test"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.2",
    "express-rate-limit": "^7.5.0",
    "helmet": "^8.0.0",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.13.1"
  }
}
```

## backend/src/app.js

```js
import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import { bookingRoutes, userRoutes } from './routes/bookingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export const app = express();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}
app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10kb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
```

## backend/src/config/db.js

```js
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DATABASE_SSL === 'verify-full' ? { rejectUnauthorized: true }
    : process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false }
      : process.env.DATABASE_SSL === 'disable' ? false : undefined,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});
```

## backend/src/controllers/adminController.js

```js
import { pool } from '../config/db.js';

export async function getStats(_req, res) {
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM events) AS total_events,
      (SELECT count(*)::int FROM bookings) AS total_bookings,
      (SELECT count(DISTINCT user_id)::int FROM bookings WHERE created_at >= now() - interval '30 days') AS active_users
  `);
  return res.json({ stats: { totalEvents: rows[0].total_events, totalBookings: rows[0].total_bookings, activeUsers: rows[0].active_users } });
}
```

## backend/src/controllers/authController.js

```js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findUserByEmail } from '../models/userModel.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tokenFor(user) {
  return jwt.sign({ role: user.role }, process.env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    algorithm: 'HS256',
  });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, universityId: user.university_id, phone: user.phone, role: user.role };
}

export async function signup(req, res) {
  const { name, email, password } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 ||
      typeof email !== 'string' || email.length > 254 || !emailPattern.test(email) ||
      typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Valid name, email, and password (at least 12 characters, at most 72 UTF-8 bytes) are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({ name: name.trim(), email: normalizedEmail, passwordHash });
    return res.status(201).json({ user: publicUser(user), token: tokenFor(user) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email is already registered' });
    }
    throw error;
  }
}

export async function login(req, res) {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' ||
      email.length > 254 || !emailPattern.test(email) || !password) {
    return res.status(400).json({ error: 'Valid email and password are required' });
  }

  const user = await findUserByEmail(email.trim());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  return res.json({ user: publicUser(user), token: tokenFor(user) });
}
```

## backend/src/controllers/bookingController.js

```js
import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../config/db.js';

export async function createBooking(req, res) {
  const { eventId, seatIds } = req.body ?? {};
  if (!/^[1-9]\d*$/.test(String(eventId)) || !Array.isArray(seatIds) || !seatIds.length || seatIds.length > 20 || seatIds.some(id => !/^[1-9]\d*$/.test(String(id))) || new Set(seatIds.map(String)).size !== seatIds.length) {
    return res.status(400).json({ error: 'Valid eventId and 1–20 distinct seatIds are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await client.query('SELECT id FROM events WHERE id = $1 AND starts_at > now()', [eventId]);
    if (!event.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Upcoming event not found' }); }
    const seats = await client.query("UPDATE seats SET status = 'booked' WHERE event_id = $1 AND id = ANY($2::bigint[]) AND status = 'available' RETURNING id", [eventId, seatIds]);
    if (seats.rowCount !== seatIds.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'One or more seats are unavailable' }); }
    const booking = await client.query('INSERT INTO bookings (user_id, event_id) VALUES ($1, $2) RETURNING id, user_id, event_id, status, created_at', [req.user.id, eventId]);
    const tickets = [];
    for (const seatId of seatIds) {
      const qrCode = randomBytes(32).toString('hex');
      const qrHash = createHash('sha256').update(qrCode).digest('hex');
      const row = await client.query('INSERT INTO booking_seats (booking_id, event_id, seat_id, qr_code_hash) VALUES ($1, $2, $3, $4) RETURNING id, seat_id', [booking.rows[0].id, eventId, seatId, qrHash]);
      tickets.push({ ...row.rows[0], qrCode: qrHash });
    }
    await client.query('COMMIT');
    res.status(201).json({ booking: booking.rows[0], tickets });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function userTickets(req, res) {
  const { rows } = await pool.query('SELECT b.id AS booking_id, b.status AS booking_status, e.id AS event_id, e.title, e.starts_at, e.venue, ss.code AS section, s.row_number, s.seat_number, bs.id AS ticket_id, bs.qr_code_hash FROM bookings b JOIN events e ON e.id = b.event_id JOIN booking_seats bs ON bs.booking_id = b.id JOIN seats s ON s.id = bs.seat_id JOIN stadium_sections ss ON ss.id = s.section_id WHERE b.user_id = $1 ORDER BY e.starts_at, b.id, bs.id', [req.user.id]);
  res.json({ tickets: rows });
}
```

## backend/src/controllers/eventController.js

```js
import { pool } from '../config/db.js';

export async function listEvents(_req, res) {
  const { rows } = await pool.query('SELECT id, title, description, starts_at, ends_at, venue FROM events WHERE starts_at > now() ORDER BY starts_at, id');
  res.json({ events: rows });
}

export async function eventSeats(req, res) {
  if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid event ID' });
  const event = await pool.query('SELECT id, title, starts_at, venue FROM events WHERE id = $1', [req.params.id]);
  if (!event.rowCount) return res.status(404).json({ error: 'Event not found' });
  const { rows } = await pool.query('SELECT s.id, s.section_id, ss.code AS section, ss.name AS section_name, s.row_number, s.seat_number, s.status FROM seats s JOIN stadium_sections ss ON ss.id = s.section_id WHERE s.event_id = $1 ORDER BY ss.code, s.row_number, s.seat_number', [req.params.id]);
  res.json({ event: event.rows[0], seats: rows });
}
```

## backend/src/controllers/userController.js

```js
import bcrypt from 'bcryptjs';
import { findUserById, updatePassword, updateUserProfile } from '../models/userModel.js';

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, universityId: user.university_id, phone: user.phone, role: user.role };
}

export async function getProfile(req, res) {
  const user = await findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: publicUser(user) });
}

export async function updateProfile(req, res) {
  const { name, email, universityId = null, phone = null } = req.body ?? {};
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanId = typeof universityId === 'string' ? universityId.trim() || null : universityId;
  const cleanPhone = typeof phone === 'string' ? phone.trim() || null : phone;
  if (!cleanName || cleanName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254 ||
      (cleanId !== null && (typeof cleanId !== 'string' || cleanId.length > 50)) ||
      (cleanPhone !== null && (typeof cleanPhone !== 'string' || !/^[+\d() .-]{7,30}$/.test(cleanPhone)))) {
    return res.status(400).json({ error: 'Invalid profile details' });
  }
  try {
    const user = await updateUserProfile(req.user.id, { name: cleanName, email: cleanEmail, universityId: cleanId, phone: cleanPhone });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Email or university ID is already in use' });
    throw error;
  }
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' ||
      newPassword.length < 12 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ error: 'Current password and a new password of at least 12 characters (maximum 72 UTF-8 bytes) are required' });
  }
  const user = await findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) return res.status(401).json({ error: 'Current password is incorrect' });
  if (await bcrypt.compare(newPassword, user.password_hash)) return res.status(400).json({ error: 'New password must be different' });
  const changed = await updatePassword(user.id, user.password_hash, await bcrypt.hash(newPassword, 12));
  if (!changed) return res.status(409).json({ error: 'Password changed elsewhere; try again' });
  return res.json({ message: 'Password changed successfully' });
}
```

## backend/src/local-server.js

```js
import 'dotenv/config';
import { pool } from './config/db.js';
import { app } from './app.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

try {
  await pool.query('SELECT 1');
  const server = app.listen(port, () => console.log(`API listening on port ${port}`));
  async function shutdown() {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error('Database startup failed', error);
  await pool.end();
  process.exitCode = 1;
}
```

## backend/src/middleware/auth.js

```js
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}
```

## backend/src/middleware/errorHandler.js

```js
export function notFound(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
}
```

## backend/src/migrate.js

```js
import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const migrationUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!migrationUrl) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required');
const pool = new Pool({ connectionString: migrationUrl, max: 1 });

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const lockId = 73412019;
const client = await pool.connect();

try {
  await client.query('SELECT pg_advisory_lock($1)', [lockId]);
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const files = (await readdir(migrationsDir)).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
  for (const name of files) {
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (applied.rowCount) continue;
    const sql = await readFile(resolve(migrationsDir, name), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied migration ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} catch (error) {
  console.error('Migration failed', error);
  process.exitCode = 1;
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
  client.release();
  await pool.end();
}
```

## backend/src/models/userModel.js

```js
import { pool } from '../config/db.js';

const publicColumns = 'id, name, email, university_id, phone, role, created_at';

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, name, email, university_id, phone, password_hash, role, created_at FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id) {
  const { rows } = await pool.query(`SELECT ${publicColumns}, password_hash FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function updateUserProfile(id, { name, email, universityId, phone }) {
  const { rows } = await pool.query(
    `UPDATE users SET name = $2, email = $3, university_id = $4, phone = $5 WHERE id = $1 RETURNING ${publicColumns}`,
    [id, name, email, universityId, phone],
  );
  return rows[0] ?? null;
}

export async function updatePassword(id, oldHash, newHash) {
  const result = await pool.query('UPDATE users SET password_hash = $3 WHERE id = $1 AND password_hash = $2', [id, oldHash, newHash]);
  return result.rowCount === 1;
}

export async function createUser({ name, email, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${publicColumns}`,
    [name, email, passwordHash],
  );
  return rows[0];
}
```

## backend/src/routes/adminRoutes.js

```js
import { Router } from 'express';
import { getStats } from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
const router = Router();
router.get('/stats', requireAuth, requireRole('admin'), (req, res, next) => Promise.resolve(getStats(req, res)).catch(next));
export default router;
```

## backend/src/routes/authRoutes.js

```js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, signup } from '../controllers/authController.js';

const router = Router();
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const handle = (controller) => (req, res, next) => Promise.resolve(controller(req, res)).catch(next);

router.post('/signup', authLimit, handle(signup));
router.post('/login', authLimit, handle(login));

export default router;
```

## backend/src/routes/bookingRoutes.js

```js
import { Router } from 'express';
import { createBooking, userTickets } from '../controllers/bookingController.js';
import { requireAuth } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import { getProfile, updateProfile, changePassword } from '../controllers/userController.js';
export const bookingRoutes = Router();
export const userRoutes = Router();
const handle = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
bookingRoutes.post('/', requireAuth, handle(createBooking));
userRoutes.get('/tickets', requireAuth, handle(userTickets));
userRoutes.get('/profile', requireAuth, handle(getProfile));
userRoutes.put('/profile', requireAuth, handle(updateProfile));
userRoutes.put('/change-password', requireAuth, rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }), handle(changePassword));
```

## backend/src/routes/eventRoutes.js

```js
import { Router } from 'express';
import { listEvents, eventSeats } from '../controllers/eventController.js';
const router = Router();
const handle = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.get('/', handle(listEvents));
router.get('/:id/seats', handle(eventSeats));
export default router;
```

## backend/vercel.json

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "express"
}
```

## frontend/.env.example

```text
VITE_API_URL=http://localhost:3000/api
# Production: https://your-backend-project.vercel.app/api
```

## frontend/index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Campus Stadium Ticket Booking</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

## frontend/package.json

```json
{
  "name": "campus-stadium-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.9",
    "qrcode.react": "^4.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.1.3"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "vite": "^6.0.5"
  }
}
```

## frontend/postcss.config.js

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

## frontend/src/App.jsx

```jsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Events from './pages/Events.jsx';
import SeatMap from './pages/SeatMap.jsx';
import MyTickets from './pages/MyTickets.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import Help from './pages/Help.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:eventId/seats" element={<SeatMap />} />
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<main><h1>Page not found</h1></main>} />
      </Routes>
    </BrowserRouter>
  );
}
```

## frontend/src/components/BookingConfirmation.jsx

```jsx
import { Link } from 'react-router-dom';
import BrandMark from './BrandMark.jsx';
import Icon from './Icon.jsx';

export default function BookingConfirmation({ event, seats, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" onMouseDown={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close">×</button><BrandMark /><h2 id="confirmation-title">Booking Confirmed!</h2><span className="success-icon"><Icon name="check" size={45} /></span>
    <div className="confirmation-details"><h3>{event.title}</h3><p>{new Date(event.starts_at).toLocaleDateString(undefined, { dateStyle: 'long' })}</p><p>{event.venue}</p><hr /><p><strong>Seats:</strong> {seats.map(s => `${s.section} · Row ${s.row_number} · Seat ${s.seat_number}`).join(', ')}</p></div>
    <p className="muted">Your tickets are available in My Tickets.</p><Link className="primary-button" to="/tickets">View My Tickets</Link>
  </section></div>;
}
```

## frontend/src/components/BrandMark.jsx

```jsx
export default function BrandMark({ small = false }) {
  return <span className={`brand-mark${small ? ' brand-mark-small' : ''}`} aria-label="Campus Stadium logo" role="img">
    <span className="brand-mark-inner"><span className="brand-mark-red" /><span className="brand-mark-blue" /><strong>CS</strong></span>
  </span>;
}
```

## frontend/src/components/Icon.jsx

```jsx
const paths = {
  home: <><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/></>,
  ticket: <><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M12 7v2m0 2v2m0 2v2"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M8 14h2m4 0h2m-8 3h2"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  settings: <><path d="M10 3h4l.6 2.2 2 .8 2-.9 2.8 2.8-.9 2 .8 2L23 12l-1.7 1.1-.8 2 .9 2-2.8 2.8-2-.9-2 .8L14 22h-4l-.6-2.2-2-.8-2 .9-2.8-2.8.9-2-.8-2L1 12l1.7-1.1.8-2-.9-2L5.4 4l2 .9 2-.8z"/><circle cx="12" cy="12" r="3"/></>,
  arrow: <path d="m9 18 6-6-6-6"/>,
  back: <path d="m15 18-6-6 6-6"/>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18m0-18c5 5 5 13 0 18"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4m-6-4h10"/></>,
  shield: <><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></>,
  plus: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8m-4-4h8"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 4h.01"/></>,
  check: <path d="m4 12 5 5L20 6"/>,
  music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  sport: <><circle cx="12" cy="12" r="9"/><path d="m12 5 3 3-1 4h-4L9 8zm-7 5 4 2m6 0 4-2M8 18l2-6m4 0 2 6"/></>,
  graduation: <><path d="m2 9 10-5 10 5-10 5zM6 12v5c4 3 8 3 12 0v-5m4-3v7"/></>,
};

export default function Icon({ name, size = 24, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.ticket}</svg>;
}
```

## frontend/src/components/Navbar.jsx

```jsx
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import BrandMark from './BrandMark.jsx';
import Icon from './Icon.jsx';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const signedIn = Boolean(sessionStorage.getItem('token'));
  const user = signedIn ? JSON.parse(sessionStorage.getItem('user') || '{}') : null;
  const onAuthPage = location.pathname === '/login';

  function logout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    navigate('/login');
  }

  return <>
    {!onAuthPage && <header className="site-header"><div className="site-header-inner">
      <Link className="site-brand" to="/"><BrandMark small /><span><strong>Campus Stadium</strong><small>ZHENGZHOU UNIVERSITY</small></span></Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        <NavLink to="/" end>Home</NavLink><NavLink to="/events">Events</NavLink>
        {signedIn && <NavLink to="/tickets">My Tickets</NavLink>}
        {signedIn && <NavLink to="/profile">Profile</NavLink>}
        {signedIn && <NavLink to="/settings">Settings</NavLink>}
        {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      {signedIn ? <button className="header-account" onClick={logout}>Log out</button> : <Link className="header-account" to="/login">Log in</Link>}
    </div></header>}
    {!onAuthPage && <nav className="bottom-nav" aria-label="Mobile navigation">
      <NavLink to="/" end><Icon name="home" size={23} /><span>Home</span></NavLink>
      <NavLink to="/events"><Icon name="calendar" size={23} /><span>Events</span></NavLink>
      <NavLink to="/tickets"><Icon name="ticket" size={23} /><span>My Tickets</span></NavLink>
      <NavLink to={signedIn ? '/profile' : '/login'}><Icon name="user" size={23} /><span>Profile</span></NavLink>
    </nav>}
  </>;
}
```

## frontend/src/components/StadiumIllustration.jsx

```jsx
export default function StadiumIllustration() {
  return <svg className="stadium-illustration" viewBox="0 0 520 310" role="img" aria-label="Illustration of a campus stadium">
    <g fill="none" stroke="#425a70" strokeWidth="3" strokeLinejoin="round">
      <path d="M28 235h464M51 206v-66h44v66m8-28V98h40v91m10-33V77h38v78m148 14V93h48v87m11-33V113h37v84m11-54V82h34v132" opacity=".55" />
      <path d="M70 177h20m-20 16h20m31-75h16m-16 16h16m228-18h16m-16 17h16m69-36h15m-15 19h15" opacity=".45" />
      <ellipse cx="260" cy="193" rx="197" ry="85" fill="#f9fbff" />
      <ellipse cx="260" cy="185" rx="180" ry="74" fill="#d8e5f1" />
      <ellipse cx="260" cy="183" rx="155" ry="61" fill="#d85762" />
      <ellipse cx="260" cy="184" rx="124" ry="45" fill="#f5f8fb" />
      <ellipse cx="260" cy="184" rx="95" ry="32" fill="#dbe8ee" />
      <rect x="205" y="158" width="110" height="52" rx="4" fill="#5aaf73" />
      <path d="M260 158v52m-55-26h110" stroke="#e8f6e8" strokeWidth="2" />
      <ellipse cx="260" cy="184" rx="27" ry="20" stroke="#e8f6e8" strokeWidth="2" />
      <path d="M120 155c35 20 70 26 140 26s105-6 140-26M99 180c43 25 91 36 161 36s118-11 161-36" stroke="#fff" strokeWidth="2" opacity=".7" />
      <path d="M74 206c25 61 91 88 186 88s161-27 186-88M124 247v26m65-5v20m71-14v20m71-26v20m65-41v26" />
    </g>
  </svg>;
}
```

## frontend/src/components/TicketQRModal.jsx

```jsx
import { QRCodeSVG } from 'qrcode.react';
export default function TicketQRModal({ ticket, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" onMouseDown={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
    <p className="eyebrow">YOUR ENTRY PASS</p><h2 id="qr-title">{ticket.title}</h2><p>{new Date(ticket.starts_at).toLocaleDateString(undefined, { dateStyle: 'medium' })} · {ticket.venue}</p><p className="qr-seat">Section {ticket.section} · Row {ticket.row_number} · Seat {ticket.seat_number}</p>
    <div className="qr-code-frame"><QRCodeSVG value={ticket.qr_code_hash} size={220} level="M" marginSize={2} title="Ticket QR code" /></div><p className="muted">Scan this code at the gate</p>
  </section></div>;
}
```

## frontend/src/main.jsx

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);
```

## frontend/src/pages/AdminDashboard.jsx

```jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import Icon from '../components/Icon.jsx';
import { fetchAdminStats } from '../services/api.js';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user?.role !== 'admin') return;
    let active = true;
    fetchAdminStats().then(result => { if (active) setStats(result); }).catch(err => { if (active) setError(err.response?.data?.error || 'Statistics are unavailable.'); });
    return () => { active = false; };
  }, [user?.role]);
  if (user?.role !== 'admin' || !sessionStorage.getItem('token')) return <main className="page-shell"><div className="empty-panel"><h1>Admin Dashboard</h1><p>Admin access is required.</p><Link className="primary-button" to="/login">Log in</Link></div></main>;
  function logout() { sessionStorage.removeItem('token'); sessionStorage.removeItem('user'); navigate('/login'); }
  return <main className="page-shell admin-page"><div className="admin-heading"><BrandMark small /><div><p className="eyebrow">CAMPUS STADIUM</p><h1>Admin Dashboard</h1></div></div>
    <section><h2 className="section-title">Summary</h2><div className="admin-stats">{[['Total Events', stats?.totalEvents ?? '—', 'calendar'], ['Total Bookings', stats?.totalBookings ?? '—', 'ticket'], ['Active Users', stats?.activeUsers ?? '—', 'user']].map(([label, value, icon]) => <div className="admin-stat" key={label}><Icon name={icon} size={29} /><span>{label}</span><strong>{value}</strong></div>)}</div><p className="field-hint">Active users booked in the last 30 days.</p>{error && <p role="status" className="error-banner">{error}</p>}</section>
    <section><h2 className="section-title">Manage</h2><div className="admin-management">{[['Add New Event', 'plus'], ['View / Manage Bookings', 'ticket'], ['Manage Seats & Layouts', 'settings']].map(([label, icon]) => <button key={label} disabled title="Management API is not available yet"><Icon name={icon} size={20} />{label}</button>)}<p>Management tools will be available when their API endpoints are added.</p></div></section>
    <section><h2 className="section-title">Analytics</h2><div className="admin-analytics"><div><Icon name="calendar" size={28} /><h3>Monthly Bookings</h3><p>Booking reports are not available yet.</p></div><div><Icon name="sport" size={28} /><h3>Top Selling Categories</h3><p>Event categories are not yet in the database.</p></div></div></section>
    <button className="admin-logout" onClick={logout}>Log Out</button>
  </main>;
}
```

## frontend/src/pages/Events.jsx

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import Icon from '../components/Icon.jsx';
import { fetchEvents } from '../services/api.js';

function eventIcon(title) {
  const value = title.toLowerCase();
  if (/music|art|concert|fest/.test(value)) return 'music';
  if (/convocation|graduation|founder/.test(value)) return 'graduation';
  if (/sport|football|basketball|game/.test(value)) return 'sport';
  return 'calendar';
}

export default function Events() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchEvents().then(rows => { if (active) setEvents(rows); }).catch(err => { if (active) setError(err.response?.data?.error || 'Unable to load events.'); });
    return () => { active = false; };
  }, []);

  return <main className="page-shell events-page">
    <div className="page-heading centered-heading"><BrandMark /><p className="eyebrow">CAMPUS LIFE</p><h1>Upcoming Events</h1><p>Find your next campus moment and choose the seat that feels right.</p></div>
    {error && <div className="empty-panel"><Icon name="calendar" size={38} /><h2>Events unavailable</h2><p role="alert">{error}</p><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></div>}
    {!events && !error && <div className="empty-panel"><p>Loading campus events…</p></div>}
    {events?.length === 0 && <div className="empty-panel"><span className="empty-icon"><Icon name="calendar" size={40} /></span><h2>New events are on the way</h2><p>No upcoming events have been published yet. Check back soon for the next campus celebration.</p><Link className="outline-button" to="/">Back to home</Link></div>}
    <div className="event-grid">{events?.map(event => <article className="event-card" key={event.id}>
      <span className="event-card-icon"><Icon name={eventIcon(event.title)} size={37} /></span><div className="event-card-copy"><h2>{event.title}</h2><p className="event-date">{new Date(event.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {event.venue}</p>{event.description && <p className="event-description">{event.description}</p>}</div><Link className="event-card-link" to={`/events/${event.id}/seats`} aria-label={`Choose seats for ${event.title}`}><Icon name="arrow" /></Link>
    </article>)}</div>
  </main>;
}
```

## frontend/src/pages/Help.jsx

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

const questions = [
  ['How do I book a ticket?', 'Open Upcoming Events, choose an event, select available seats, and confirm your booking. Your QR ticket will appear in My Tickets.'],
  ['Can I cancel my booking?', 'Self-service cancellation is not available yet. Please contact the campus event administrator for help.'],
  ['How do I change language?', 'Open Settings and choose English or 中文. Full translation is still in progress.'],
  ['Where can I find my QR code?', 'Open My Tickets and select View QR on a confirmed ticket. Show the code at the gate.'],
];

export default function Help() {
  const [open, setOpen] = useState(null);
  return <main className="page-shell help-page"><Link className="back-link" to="/"><Icon name="back" size={18} /> Home</Link><div className="page-heading"><p className="eyebrow">WE'RE HERE TO HELP</p><h1>Help &amp; Support</h1><p>Answers to the most common campus ticket questions.</p></div>
    <div className="help-hero"><span><Icon name="help" size={55} /></span><div><h2>Need a hand?</h2><p>Find answers below or contact your campus event administrator.</p></div></div>
    <h2 className="section-title">Frequently Asked Questions</h2><div className="faq-list">{questions.map(([question, answer], index) => <section className="faq-item" key={question}><button aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>{question}<Icon name="arrow" size={20} /></button>{open === index && <p>{answer}</p>}</section>)}</div>
    <h2 className="section-title">Contact Support</h2><p className="muted">For account or booking help, contact your campus event administrator through your university's official support channel.</p>
  </main>;
}
```

## frontend/src/pages/Home.jsx

```jsx
import { Link } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import Icon from '../components/Icon.jsx';
import StadiumIllustration from '../components/StadiumIllustration.jsx';

export default function Home() {
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const actions = [
    { title: 'Book Tickets', icon: 'ticket', to: '/events' },
    { title: 'Upcoming Events', icon: 'calendar', to: '/events' },
    { title: 'My Tickets', icon: 'ticket', to: '/tickets' },
    { title: 'Settings', icon: 'settings', to: '/settings' },
  ];

  return <main className="home-screen page-shell">
    <div className="home-identity"><p className="university-label">ZHENGZHOU UNIVERSITY</p><BrandMark /><h1>Campus Stadium Ticket</h1><p className="home-welcome">{firstName ? `Welcome back, ${firstName}!` : 'Welcome to your campus stadium!'}</p><div className="home-stadium"><StadiumIllustration /></div></div>
    <div className="home-action-grid">{actions.map(action => <Link className="home-action" to={action.to} key={action.title}><Icon name={action.icon} size={39} /><span>{action.title}</span></Link>)}</div>
    <p className="home-footnote">Every campus moment starts with a seat.</p>
    <Link className="home-help-link" to="/help"><Icon name="help" size={17} /> Help &amp; Support</Link>
  </main>;
}
```

## frontend/src/pages/Login.jsx

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import StadiumIllustration from '../components/StadiumIllustration.jsx';
import { login, signup } from '../services/api.js';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = mode === 'login' ? await login(values) : await signup(values);
      sessionStorage.setItem('token', result.token);
      sessionStorage.setItem('user', JSON.stringify(result.user));
      navigate('/');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to connect to the server.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-screen"><div className="auth-layout">
    <section className="auth-intro"><BrandMark /><h1>Welcome!</h1><p>Your seat for every campus moment.</p><StadiumIllustration /></section>
    <section className="auth-panel" aria-label="Account access">
      <p className="eyebrow">CAMPUS STADIUM TICKET</p><h2>{mode === 'login' ? 'Log in to your account' : 'Create your student account'}</h2>
      <p className="muted">{mode === 'login' ? 'Explore events, book seats, and keep every ticket in one place.' : 'Join the campus community and start booking your seats.'}</p>
      <div className="auth-switch" role="group" aria-label="Account action"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Login</button><button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Sign Up</button></div>
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && <label>Full name<input name="name" autoComplete="name" placeholder="Your full name" required maxLength="120" /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@university.edu" required maxLength="254" /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Your password" required minLength={mode === 'signup' ? 12 : undefined} /></label>
        {mode === 'signup' && <p className="field-hint">Use at least 12 characters for your password.</p>}
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary-button" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'}</button>
      </form>
      <Link className="auth-help" to="/help">Need help accessing your account?</Link>
    </section>
  </div><p className="auth-credit">Developed for Software Engineering · Campus Stadium Ticket Booking</p></main>;
}
```

## frontend/src/pages/MyTickets.jsx

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import Icon from '../components/Icon.jsx';
import TicketQRModal from '../components/TicketQRModal.jsx';
import { fetchMyTickets } from '../services/api.js';

export default function MyTickets() {
  const [tickets, setTickets] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sessionStorage.getItem('token')) { setError('Log in to view your tickets.'); return; }
    let mounted = true;
    fetchMyTickets().then(rows => { if (mounted) setTickets(rows); }).catch(err => { if (mounted) setError(err.response?.data?.error || 'Unable to load tickets.'); });
    return () => { mounted = false; };
  }, []);

  return <main className="page-shell tickets-page"><div className="page-heading centered-heading"><BrandMark /><p className="eyebrow">YOUR BOOKINGS</p><h1>My Tickets</h1><p>All your campus moments, ready at the gate.</p></div>
    {error && <div className="empty-panel"><Icon name="ticket" size={38} /><p role="alert">{error}</p><Link className="primary-button" to="/login">Log in</Link></div>}
    {!tickets && !error && <div className="empty-panel">Loading your tickets…</div>}
    {tickets?.length === 0 && <div className="empty-panel"><span className="empty-icon"><Icon name="ticket" size={40} /></span><h2>No tickets yet</h2><p>Once you book a seat, your ticket and QR code will appear here.</p><Link className="primary-button" to="/events">Browse Events</Link></div>}
    <div className="ticket-list">{tickets?.map(ticket => <article className="ticket-card" key={ticket.ticket_id}>
      <span className="ticket-card-icon"><Icon name="ticket" size={32} /></span><div className="ticket-card-copy"><h2>{ticket.title}</h2><p>{new Date(ticket.starts_at).toLocaleDateString(undefined, { dateStyle: 'medium' })} · {ticket.venue}</p><p>Section {ticket.section} · Row {ticket.row_number} · Seat {ticket.seat_number}</p></div>
      {ticket.booking_status === 'confirmed' ? <button className="ticket-qr-button" onClick={() => setActive(ticket)} aria-label={`Show QR code for ${ticket.title}`}><Icon name="ticket" size={21} /><span>View QR</span></button> : <span className="ticket-status">{ticket.booking_status}</span>}
    </article>)}</div>
    {active && <TicketQRModal ticket={active} onClose={() => setActive(null)} />}
  </main>;
}
```

## frontend/src/pages/Profile.jsx

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import Icon from '../components/Icon.jsx';
import { fetchMyTickets, fetchProfile, saveProfile } from '../services/api.js';

export default function Profile() {
  const [user, setUser] = useState(() => JSON.parse(sessionStorage.getItem('user') || 'null'));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sessionStorage.getItem('token')) return;
    let active = true;
    fetchProfile().then(profile => { if (active) { setUser(profile); sessionStorage.setItem('user', JSON.stringify(profile)); } }).catch(() => { if (active) setError('Profile could not be refreshed.'); });
    fetchMyTickets().then(rows => { if (active) setTickets(rows); }).catch(() => { if (active) setError('Ticket statistics are unavailable.'); });
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const updated = await saveProfile(values);
      setUser(updated); sessionStorage.setItem('user', JSON.stringify(updated));
      setEditing(false); setMessage('Profile updated successfully.');
    } catch (requestError) { setError(requestError.response?.data?.error || 'Unable to update profile.'); }
    finally { setSaving(false); }
  }

  if (!sessionStorage.getItem('token') || !user) return <main className="page-shell"><div className="empty-panel"><Icon name="user" size={40} /><h1>My Profile</h1><p>Please log in to view your profile.</p><Link to="/login" className="primary-button">Log in</Link></div></main>;
  const total = tickets?.filter(ticket => ticket.booking_status === 'confirmed').length;
  const attended = tickets ? new Set(tickets.filter(ticket => ticket.booking_status === 'confirmed' && new Date(ticket.starts_at) < new Date()).map(ticket => ticket.event_id)).size : null;

  return <main className="page-shell profile-page"><div className="page-heading centered-heading"><p className="university-label">ZHENGZHOU UNIVERSITY</p><BrandMark /><h1>Campus Stadium Ticket</h1></div>
    <div className="profile-layout"><section className="profile-main"><div className="profile-person"><span className="profile-avatar"><Icon name="user" size={44} /></span><div><p className="eyebrow">MY PROFILE</p><h2>{user.name}</h2><p>{user.role === 'admin' ? 'Administrator' : 'Student account'}</p></div></div>
      {error && <p role="status" className="error-banner">{error}</p>}{message && <p role="status" className="success-banner">{message}</p>}
      <section className="profile-details"><h3>Personal details</h3>{editing ? <form onSubmit={submit} className="profile-edit-form">
        {[['name', 'Name', user.name], ['universityId', 'University ID', user.universityId || ''], ['email', 'Email', user.email], ['phone', 'Phone', user.phone || '']].map(([key, label, value]) => <label key={key}>{label}<input name={key} defaultValue={value} required={key === 'name' || key === 'email'} type={key === 'email' ? 'email' : 'text'} maxLength={key === 'email' ? 254 : key === 'name' ? 120 : key === 'universityId' ? 50 : 30} /></label>)}
        <div className="form-actions"><button disabled={saving} className="primary-button">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" onClick={() => setEditing(false)} className="outline-button">Cancel</button></div>
      </form> : <dl>{[['Name', user.name], ['University ID', user.universityId || '—'], ['Email', user.email], ['Phone Number', user.phone || '—'], ['Password', '••••••••']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</section>
    </section><aside className="profile-side"><section className="activity-section"><h3>My Activity</h3><div className="activity-grid"><div><Icon name="ticket" /><strong>{total ?? '—'}</strong><span>Total Tickets Booked</span></div><div><Icon name="calendar" /><strong>{attended ?? '—'}</strong><span>Events Attended</span></div><div><Icon name="shield" /><strong>—</strong><span>Points Earned</span></div></div><p className="field-hint">Points are not available yet.</p></section>
      {!editing && <div className="profile-actions"><button onClick={() => { setMessage(''); setEditing(true); }} className="primary-button">Edit Profile</button><Link to="/settings#password" className="primary-button">Change Password</Link></div>}
    </aside></div>
  </main>;
}
```

## frontend/src/pages/SeatMap.jsx

```jsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BookingConfirmation from '../components/BookingConfirmation.jsx';
import Icon from '../components/Icon.jsx';
import { confirmBooking, fetchEventSeats } from '../services/api.js';

const sections = ['A', 'B', 'C', 'D'];

export default function SeatMap() {
  const { eventId } = useParams();
  const [data, setData] = useState(null);
  const [section, setSection] = useState('A');
  const [selected, setSelected] = useState([]);
  const [confirmed, setConfirmed] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchEventSeats(eventId).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.response?.data?.error || 'Unable to load seats.'); });
    return () => { active = false; };
  }, [eventId]);

  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 20 ? [...current, id] : current);
  }

  async function book() {
    if (!sessionStorage.getItem('token')) { setError('Log in to book seats.'); return; }
    setBusy(true); setError('');
    const chosen = data.seats.filter(seat => selected.includes(seat.id));
    try {
      await confirmBooking(eventId, selected);
      setConfirmed(chosen); setSelected([]);
      setData(current => ({ ...current, seats: current.seats.map(seat => chosen.some(item => item.id === seat.id) ? { ...seat, status: 'booked' } : seat) }));
    } catch (err) {
      setError(err.response?.data?.error || 'Booking failed. Please try again.');
      if (err.response?.status === 409) {
        try { setData(await fetchEventSeats(eventId)); setSelected([]); } catch { /* Keep the booking error visible. */ }
      }
    } finally { setBusy(false); }
  }

  const visibleSeats = data?.seats.filter(seat => seat.section === section) || [];
  const chosenSeats = data?.seats.filter(seat => selected.includes(seat.id)) || [];

  return <main className="page-shell seat-page"><Link className="back-link" to="/events"><Icon name="back" size={18} /> Upcoming events</Link>
    <div className="page-heading"><p className="eyebrow">CHOOSE YOUR PLACE</p><h1>{data?.event.title || 'Select your seats'}</h1>{data && <p>{new Date(data.event.starts_at).toLocaleString()} · {data.event.venue}</p>}</div>
    {error && <p role="alert" className="error-banner">{error} {error.includes('Log in') && <Link to="/login">Log in</Link>}</p>}
    {!data && !error && <div className="empty-panel">Loading seat map…</div>}
    {data && <div className="seat-layout"><section className="stadium-panel" aria-label="Stadium section map">
      <div className="stadium-map"><div className="stadium-ring"><div className="stadium-track"><div className="stadium-field"><span>STADIUM FIELD</span></div></div></div>
        {sections.map((code, index) => <button key={code} type="button" className={`map-section map-section-${index} ${section === code ? 'active' : ''}`} onClick={() => setSection(code)} aria-pressed={section === code} aria-label={`View section ${code}`}>{code}</button>)}
      </div><div className="seat-legend"><span><i className="legend available" /> Available</span><span><i className="legend selected" /> Selected</span><span><i className="legend booked" /> Booked</span></div>
    </section><section className="section-card seat-picker"><div className="section-heading"><div><p className="eyebrow">SEAT SELECTION</p><h2>Section {section}</h2></div><span>{visibleSeats.filter(seat => seat.status === 'available').length} available</span></div>
      {visibleSeats.length ? <div className="seat-grid">{visibleSeats.map(seat => <button key={seat.id} type="button" disabled={seat.status === 'booked' || busy} aria-pressed={selected.includes(seat.id)} aria-label={`Section ${section}, row ${seat.row_number}, seat ${seat.seat_number}, ${seat.status === 'booked' ? 'booked' : selected.includes(seat.id) ? 'selected' : 'available'}`} title={`Row ${seat.row_number}, Seat ${seat.seat_number}`} className={`seat ${seat.status === 'booked' ? 'booked' : selected.includes(seat.id) ? 'selected' : 'available'}`} onClick={() => toggle(seat.id)}>{seat.row_number}-{seat.seat_number}</button>)}</div> : <p className="muted">No seats are listed in this section yet.</p>}
    </section></div>}
    {data && <div className="booking-bar"><div><strong>{selected.length ? `${selected.length} seat${selected.length === 1 ? '' : 's'} selected` : 'No seats selected'}</strong><p>{chosenSeats.length ? chosenSeats.map(seat => `${seat.section} · Row ${seat.row_number} · Seat ${seat.seat_number}`).join(', ') : 'Tap an available seat to continue.'}</p></div><button className="primary-button" disabled={!selected.length || busy} onClick={book}>{busy ? 'Confirming…' : 'Confirm Seat'}</button></div>}
    {confirmed && <BookingConfirmation event={data.event} seats={confirmed} onClose={() => setConfirmed(null)} />}
  </main>;
}
```

## frontend/src/pages/Settings.jsx

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { changePassword } from '../services/api.js';

export default function Settings() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(localStorage.getItem('notifications') !== 'off');
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'en');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [changing, setChanging] = useState(false);
  function logout() { sessionStorage.removeItem('token'); sessionStorage.removeItem('user'); navigate('/login'); }
  async function submitPassword(event) {
    event.preventDefault(); setPasswordError(''); setPasswordMessage('');
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) { setPasswordError('New passwords do not match.'); return; }
    setChanging(true);
    try { await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }); form.reset(); setPasswordMessage('Password changed successfully.'); }
    catch (error) { setPasswordError(error.response?.data?.error || 'Unable to change password.'); }
    finally { setChanging(false); }
  }
  return <main className="page-shell settings-page"><div className="page-heading"><p className="eyebrow">YOUR PREFERENCES</p><h1>Settings</h1><p>Make your campus experience your own.</p></div>
    <div className="settings-layout"><div className="settings-list">
      <section className="settings-row"><span className="settings-icon"><Icon name="bell" /></span><div><h2>Notifications</h2><p>Save your preference on this device</p></div><label className="switch"><input type="checkbox" checked={notifications} onChange={e => { setNotifications(e.target.checked); localStorage.setItem('notifications', e.target.checked ? 'on' : 'off'); }} /><span aria-hidden="true" /></label></section>
      <section className="settings-row settings-language"><span className="settings-icon"><Icon name="globe" /></span><div><h2>Language</h2><p>Choose your preferred language</p></div><div className="language-switch" role="group" aria-label="Language"><button className={language === 'en' ? 'active' : ''} onClick={() => { setLanguage('en'); localStorage.setItem('language', 'en'); }}>English</button><button className={language === 'zh' ? 'active' : ''} onClick={() => { setLanguage('zh'); localStorage.setItem('language', 'zh'); }}>中文</button></div></section>
      <p className="field-hint settings-hint">Full translation is not available yet.</p>
      <section className="settings-row settings-row-click"><span className="settings-icon"><Icon name="lock" /></span><div><h2>Privacy Policy</h2></div><button onClick={() => setPrivacyOpen(value => !value)} aria-expanded={privacyOpen} aria-label="Show privacy policy"><Icon name="arrow" /></button></section>
      {privacyOpen && <div className="settings-expand">The privacy policy has not been published yet. Contact the campus event administrator for data handling details.</div>}
      <Link className="settings-row settings-row-click" to="/help"><span className="settings-icon"><Icon name="help" /></span><div><h2>Help &amp; Support</h2></div><Icon name="arrow" /></Link>
      <button className="settings-row settings-row-click settings-logout" onClick={logout}><span className="settings-icon"><Icon name="logout" /></span><div><h2>Logout</h2></div><Icon name="arrow" /></button>
    </div><section className="password-panel" id="password"><h2>Change Password</h2><p className="muted">Keep your account secure with a new password.</p>
      <form onSubmit={submitPassword}><label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength="12" required /></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength="12" required /></label>
        {passwordError && <p role="alert" className="error">{passwordError}</p>}{passwordMessage && <p role="status" className="success-text">{passwordMessage}</p>}
        <button disabled={changing || !sessionStorage.getItem('token')} className="primary-button">{changing ? 'Updating…' : 'Update Password'}</button>
      </form></section></div>
  </main>;
}
```

## frontend/src/services/api.js

```js
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function login(credentials) {
  const { data } = await api.post('/auth/login', credentials);
  return data;
}

export async function signup(details) {
  const { data } = await api.post('/auth/signup', details);
  return data;
}

export async function fetchEvents() {
  const { data } = await api.get('/events');
  return data.events;
}

export async function fetchEventSeats(eventId) {
  const { data } = await api.get(`/events/${encodeURIComponent(eventId)}/seats`);
  return data;
}

export async function confirmBooking(eventId, seatIds) {
  const { data } = await api.post('/bookings', { eventId, seatIds });
  return data;
}

export async function fetchMyTickets() {
  const { data } = await api.get('/user/tickets');
  return data.tickets;
}

export async function fetchProfile() {
  const { data } = await api.get('/user/profile');
  return data.user;
}

export async function saveProfile(profile) {
  const { data } = await api.put('/user/profile', profile);
  return data.user;
}

export async function changePassword(passwords) {
  const { data } = await api.put('/user/change-password', passwords);
  return data;
}

export async function fetchAdminStats() {
  const { data } = await api.get('/admin/stats');
  return data.stats;
}
```

## frontend/src/styles.css

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

:root{font-family:'DM Sans',system-ui,sans-serif;color:#172940;background:#eef2f8;font-synthesis:none}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-width:320px}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:not-allowed}a{text-decoration:none;color:inherit}h1,h2,h3,p{margin-top:0}h1,h2,h3{font-family:Manrope,system-ui,sans-serif}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #4b91e8;outline-offset:3px}
#root{min-height:100vh;background:radial-gradient(circle at 50% -18%,#fff 0,#eef2f8 52%,#e8eef6 100%)}
.page-shell{width:min(100% - 48px,1120px);margin:0 auto;padding:54px 0 112px}.eyebrow{color:#2e80c9;font-size:.75rem;font-weight:800;letter-spacing:.19em;text-transform:uppercase}.muted{color:#657589}.university-label{font-weight:800;letter-spacing:.065em;font-size:.91rem}.page-heading{margin-bottom:34px}.page-heading h1{font-weight:800;font-size:clamp(2rem,4vw,3.25rem);line-height:1.12;letter-spacing:-.045em;margin:6px 0 10px}.page-heading>p:last-child{color:#657589;font-size:1.04rem}.centered-heading{text-align:center}.centered-heading .brand-mark{margin:0 auto 20px}.section-title{font-size:1.25rem;font-weight:800;margin:0 0 18px}.field-hint{font-size:.82rem;color:#718095}.error{color:#a72d39}.error-banner,.success-banner{padding:14px 17px;border-radius:12px;background:#fff0f1;color:#a72d39;margin:18px 0}.success-banner{background:#eaf8ef;color:#24744c}.success-text{color:#24744c}.back-link{display:inline-flex;align-items:center;gap:4px;color:#2d75b9;font-weight:700;margin-bottom:25px}.primary-button,.outline-button{display:inline-flex;justify-content:center;align-items:center;gap:8px;border-radius:999px;padding:13px 24px;font-weight:800;line-height:1.25;border:2px solid transparent;transition:transform .18s,box-shadow .18s,background .18s}.primary-button{background:#3689dc;color:white;box-shadow:0 8px 18px #3183cf2e}.primary-button:hover:not(:disabled){background:#216fbb;transform:translateY(-2px)}.primary-button:disabled{opacity:.53}.outline-button{background:white;color:#173456;border-color:#173456}.outline-button:hover{background:#edf5ff}.empty-panel{max-width:570px;margin:28px auto;background:#fff;border:1px solid #e2e9f1;border-radius:27px;padding:46px 36px;text-align:center;box-shadow:0 15px 34px #263d5d12}.empty-panel>svg,.empty-icon{color:#3b88d0;margin:0 auto 20px}.empty-icon{width:76px;height:76px;border-radius:23px;background:#e8f3ff;display:grid;place-items:center}.empty-panel h2{font-size:1.55rem;font-weight:800}.empty-panel p{color:#657589;line-height:1.65}.empty-panel .primary-button,.empty-panel .outline-button{margin-top:10px}

.site-header{height:82px;background:#fff;box-shadow:0 6px 20px #1d324913;position:relative;z-index:5}.site-header-inner{height:100%;width:min(100% - 48px,1200px);margin:auto;display:flex;align-items:center;gap:32px}.site-brand{display:flex;align-items:center;gap:11px;flex:none}.site-brand span:last-child{display:flex;flex-direction:column}.site-brand strong{font-family:Manrope,sans-serif;font-weight:800;font-size:1rem}.site-brand small{font-size:.56rem;letter-spacing:.14em;font-weight:800;color:#66809e}.desktop-nav{display:flex;align-items:center;justify-content:center;gap:23px;margin:auto}.desktop-nav a{font-weight:700;color:#6b7c90;font-size:.91rem;white-space:nowrap}.desktop-nav a.active,.desktop-nav a:hover{color:#287aca}.header-account{border:1px solid #24527e;color:#17385d;background:#fff;border-radius:22px;font-weight:800;padding:9px 18px;white-space:nowrap}.header-account:hover{background:#f2f8ff}.bottom-nav{display:none}
.brand-mark{display:grid;place-items:center;flex:none;width:68px;height:68px;border-radius:50%;background:#fff;border:3px double #41617d;box-shadow:0 4px 11px #17385d22;padding:5px}.brand-mark-inner{position:relative;display:grid;place-items:center;width:100%;height:100%;border-radius:50%;border:1px solid #8ca7bd;overflow:hidden}.brand-mark-inner strong{position:relative;z-index:2;font:800 1.05rem Manrope,sans-serif;color:#17385d;transform:skew(-9deg)}.brand-mark-red,.brand-mark-blue{position:absolute;width:28px;height:8px;border-radius:10px;transform:rotate(-35deg)}.brand-mark-red{background:#cc3c46;top:13px;right:4px}.brand-mark-blue{background:#286a9e;bottom:13px;left:4px}.brand-mark-small{width:43px;height:43px;padding:3px;border-width:2px}.brand-mark-small .brand-mark-inner strong{font-size:.72rem}.brand-mark-small .brand-mark-red,.brand-mark-small .brand-mark-blue{width:17px;height:5px}.brand-mark-small .brand-mark-red{top:7px;right:2px}.brand-mark-small .brand-mark-blue{bottom:7px;left:2px}

.home-screen{min-height:calc(100vh - 82px);display:grid;grid-template-columns:.95fr 1.05fr;column-gap:60px;align-content:center;align-items:center}.home-identity{grid-row:1/4;text-align:center;background:#fff;border-radius:34px;padding:48px 35px;box-shadow:0 18px 45px #29426014}.home-identity .brand-mark{margin:22px auto 29px}.home-identity h1{font-size:clamp(2rem,3.3vw,3.1rem);font-weight:800;line-height:1.15;letter-spacing:-.045em;margin:0 0 20px}.home-welcome{font-size:1.28rem;font-weight:600;color:#394c61}.home-stadium{height:225px;margin-top:8px}.home-stadium .stadium-illustration{width:100%;height:100%}.home-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.home-action{min-height:174px;background:white;border:2px solid transparent;border-radius:25px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#173d62;box-shadow:0 11px 25px #24436817;font-weight:800;font-size:1.08rem;text-align:center;transition:transform .2s,border-color .2s,box-shadow .2s}.home-action:hover,.home-action:focus-visible{transform:translateY(-4px);border-color:#2b80cc;box-shadow:0 15px 30px #24436825}.home-action svg{color:#1a507e}.home-footnote{margin:28px 0 9px;text-align:center;color:#657589}.home-help-link{justify-self:center;display:inline-flex;align-items:center;gap:6px;color:#2d7dc4;font-weight:800}

.auth-screen{min-height:100vh;padding:42px 24px 20px;display:flex;flex-direction:column;justify-content:center}.auth-layout{width:min(100%,1050px);margin:auto;display:grid;grid-template-columns:1fr 1fr;align-items:stretch;background:#fff;border-radius:30px;box-shadow:0 22px 60px #213b5922;overflow:hidden}.auth-intro{background:linear-gradient(145deg,#e8eff8,#f7f9fd);padding:46px 38px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}.auth-intro h1{font-size:clamp(2.6rem,5vw,4.2rem);font-weight:800;letter-spacing:-.05em;margin:20px 0 4px}.auth-intro>p{color:#50657b;font-size:1.06rem}.stadium-illustration{width:100%;max-width:520px;margin:20px 0 0}.auth-panel{padding:55px 50px;display:flex;flex-direction:column;justify-content:center}.auth-panel h2{font-size:2rem;font-weight:800;line-height:1.15;margin:4px 0 10px}.auth-panel .muted{line-height:1.55}.auth-switch{display:grid;grid-template-columns:1fr 1fr;border:2px solid #17385d;border-radius:999px;overflow:hidden;margin:26px 0 25px}.auth-switch button{border:0;background:white;color:#17385d;padding:11px;font-weight:800}.auth-switch button.active{background:#17385d;color:white}.auth-form{display:grid;gap:17px}.auth-form label,.profile-edit-form label,.password-panel label{display:grid;gap:7px;color:#33485e;font-weight:700}.auth-form input,.profile-edit-form input,.password-panel input{width:100%;border:1px solid #d9e3ee;background:#f9fbfe;border-radius:13px;padding:13px 15px;color:#172940;box-shadow:0 4px 10px #1a3a5f0a}.auth-form .primary-button{margin-top:7px}.auth-help{display:block;color:#60758b;text-align:center;font-size:.88rem;margin-top:21px;text-decoration:underline}.auth-credit{text-align:center;color:#8b9aab;font-size:.77rem;margin:20px auto 0}

.events-page,.tickets-page{min-height:calc(100vh - 82px)}.event-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.event-card,.ticket-card{background:#fff;border:1px solid #e3ebf3;border-radius:22px;box-shadow:0 10px 24px #203c5b12;padding:24px;display:flex;gap:20px;align-items:center}.event-card-icon,.ticket-card-icon{width:68px;height:68px;flex:none;display:grid;place-items:center;border-radius:18px;background:#eaf4fd;color:#17476f}.event-card-copy,.ticket-card-copy{min-width:0;flex:1}.event-card h2,.ticket-card h2{font-weight:800;font-size:1.08rem;margin:0 0 7px}.event-date,.ticket-card-copy p{color:#5b6e82;margin:0 0 6px;font-size:.94rem}.event-description{color:#8593a1;margin:0;font-size:.88rem}.event-card-link{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#e7f3ff;color:#2a80cb;flex:none}.event-card-link:hover{background:#2a80cb;color:white}.ticket-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.ticket-qr-button{display:flex;flex-direction:column;align-items:center;gap:5px;border:0;background:#eaf4fd;color:#1e6eaf;border-radius:12px;padding:9px 12px;font-weight:800;font-size:.75rem}.ticket-status{text-transform:capitalize;color:#6e7a86}

.seat-page{min-height:calc(100vh - 82px)}.seat-layout{display:grid;grid-template-columns:1.2fr .8fr;gap:24px}.stadium-panel,.section-card,.profile-details,.activity-section,.password-panel,.admin-management,.admin-analytics>div,.help-hero,.faq-item{background:#fff;border:1px solid #e3ebf3;border-radius:24px;box-shadow:0 10px 26px #203c5b12}.stadium-panel{padding:26px}.stadium-map{position:relative;height:340px;display:grid;place-items:center}.stadium-ring{width:77%;height:72%;border:12px solid #2e75ba;border-radius:48%/44%;box-shadow:0 0 0 10px #d8e1eb,0 0 0 13px #647d91,inset 0 0 0 10px #dbe4ed;display:grid;place-items:center;background:repeating-linear-gradient(90deg,#3a85c9 0 25px,#e9f1f7 25px 29px)}.stadium-track{width:72%;height:58%;background:#ecf1f5;border:6px solid #fff;border-radius:49%;display:grid;place-items:center}.stadium-field{width:75%;height:66%;background:repeating-linear-gradient(90deg,#5eae77 0 30px,#66b77e 30px 60px);border:3px solid white;display:grid;place-items:center}.stadium-field span{font-size:.64rem;font-weight:800;letter-spacing:.1em;color:#e6fff0;text-shadow:0 1px 2px #21422b}.map-section{position:absolute;width:45px;height:45px;border:0;border-radius:8px;background:#193c62;color:white;font:800 1.4rem Manrope,sans-serif;box-shadow:0 5px 12px #1f3d5c32}.map-section.active{background:#318cda;box-shadow:0 0 0 4px #badaf6}.map-section-0{top:8px;left:6%}.map-section-1{top:8px;right:6%}.map-section-2{bottom:8px;right:6%}.map-section-3{bottom:8px;left:6%}.seat-legend{display:flex;justify-content:center;flex-wrap:wrap;gap:16px;margin-top:22px;color:#54687a;font-size:.88rem}.seat-legend span{display:inline-flex;align-items:center;gap:7px}.legend{display:inline-block;width:17px;height:17px;border-radius:4px}.legend.available,.seat.available{background:#3d8bd9}.legend.selected,.seat.selected{background:#46b86a}.legend.booked,.seat.booked{background:#adb6c0}.seat-picker{padding:27px}.section-heading{display:flex;justify-content:space-between;align-items:end;margin-bottom:25px}.section-heading h2{font-size:1.65rem;font-weight:800;margin:0}.section-heading .eyebrow{margin-bottom:4px}.section-heading>span{font-size:.83rem;color:#438f64;font-weight:800}.seat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(51px,1fr));gap:9px}.seat{border:0;color:white;border-radius:9px;min-height:44px;font-size:.8rem;font-weight:800}.seat.booked{color:#fff}.booking-bar{position:sticky;bottom:18px;margin:24px 0 0;background:#fff;border:1px solid #dfe8f1;box-shadow:0 9px 30px #23476722;border-radius:20px;padding:19px 24px;display:flex;justify-content:space-between;align-items:center;gap:20px;z-index:4}.booking-bar strong{font-weight:800}.booking-bar p{color:#657589;margin:5px 0 0;font-size:.88rem}.booking-bar .primary-button{min-width:190px}

.modal-backdrop{position:fixed;inset:0;background:#10243dba;z-index:20;display:grid;place-items:center;padding:20px}.modal{position:relative;width:min(100%,500px);max-height:90vh;overflow:auto;background:#fff;border-radius:29px;padding:38px;box-shadow:0 24px 70px #0005}.modal-close{position:absolute;top:12px;right:20px;font-size:1.8rem;border:0;background:transparent;color:#62758b}.confirmation-modal,.qr-modal{text-align:center}.confirmation-modal .brand-mark{margin:0 auto 17px}.confirmation-modal h2{font-size:2rem;font-weight:800;margin-bottom:24px}.success-icon{width:82px;height:82px;margin:0 auto 25px;border-radius:50%;display:grid;place-items:center;color:white;background:#3389d9}.confirmation-details{text-align:left;background:#f5f8fc;border-radius:19px;padding:22px;margin-bottom:20px}.confirmation-details h3{font-size:1.3rem;margin:0 0 7px}.confirmation-details p{margin:5px 0;color:#41566a}.confirmation-details hr{border:0;border-top:1px solid #dbe4ee;margin:17px 0}.confirmation-details+ .muted{font-size:.85rem}.qr-modal h2{font-weight:800;font-size:1.65rem}.qr-modal p{color:#617387}.qr-seat{font-weight:800;color:#173a5e!important}.qr-code-frame{display:inline-grid;place-items:center;padding:16px;background:#fff;border:1px solid #e1e8f0;border-radius:18px;margin:18px 0}.qr-code-frame svg{max-width:100%;height:auto}

.profile-page .page-heading{margin-bottom:42px}.profile-page .page-heading h1{font-size:2.1rem}.profile-page .page-heading .brand-mark{margin:14px auto}.profile-layout{display:grid;grid-template-columns:1.35fr .85fr;gap:26px}.profile-person{display:flex;align-items:center;gap:20px;margin-bottom:25px}.profile-avatar{width:82px;height:82px;display:grid;place-items:center;border:2px solid #2f8ad9;border-radius:50%;color:#2f8ad9;background:#fff}.profile-person h2{font-size:1.55rem;font-weight:800;margin:1px 0}.profile-person p:last-child{color:#728195;margin:0}.profile-details{padding:26px}.profile-details h3{font-size:1.15rem;font-weight:800;margin-bottom:15px}.profile-details dl{margin:0}.profile-details dl>div{padding:13px 0;border-top:1px solid #edf1f5;display:grid;grid-template-columns:160px 1fr;gap:12px}.profile-details dt{font-weight:800}.profile-details dd{margin:0;overflow-wrap:anywhere;color:#5b6b7d}.profile-edit-form{display:grid;grid-template-columns:1fr 1fr;gap:15px}.form-actions{grid-column:1/-1;display:flex;gap:12px;margin-top:5px}.activity-section{padding:26px}.activity-section h3{font-weight:800;font-size:1.15rem}.activity-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.activity-grid>div{background:#f7fafe;border:1px solid #e6eef6;border-radius:15px;padding:15px 8px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px}.activity-grid svg{color:#3286c8}.activity-grid strong{font-size:1.35rem;color:#287cbe}.activity-grid span{font-size:.76rem;color:#5d6c7b;line-height:1.25}.activity-section .field-hint{text-align:right;margin:13px 0 0}.profile-actions{display:grid;gap:13px;margin-top:22px}.profile-actions .primary-button{width:100%}

.settings-layout{display:grid;grid-template-columns:1.1fr .9fr;gap:25px}.settings-list{display:grid;gap:14px;align-content:start}.settings-row{width:100%;border:1px solid #e3ebf3;border-radius:21px;padding:20px;display:flex;align-items:center;gap:17px;background:#fff;text-align:left;box-shadow:0 8px 21px #203c5b10;color:#172940}.settings-icon{width:44px;height:44px;flex:none;display:grid;place-items:center;color:#2477bd}.settings-row>div:nth-child(2){flex:1}.settings-row h2{font-size:1.08rem;font-weight:800;margin:0}.settings-row p{font-size:.83rem;color:#718095;margin:3px 0 0}.settings-row-click{cursor:pointer}.settings-row-click>svg:last-child,.settings-row-click>button{color:#3185c7;flex:none}.settings-row-click>button{border:0;background:transparent}.settings-logout h2,.settings-logout .settings-icon{color:#bd4a4f}.settings-hint{margin:-5px 4px 0}.switch{position:relative;width:51px;height:29px;flex:none}.switch input{position:absolute;inset:0;opacity:0;cursor:pointer}.switch span{display:block;width:100%;height:100%;background:#adb9c5;border-radius:30px;transition:background .2s}.switch span:after{content:'';position:absolute;width:23px;height:23px;top:3px;left:3px;background:white;border-radius:50%;box-shadow:0 1px 4px #0003;transition:transform .2s}.switch input:checked+span{background:#328bdb}.switch input:checked+span:after{transform:translateX(22px)}.switch input:focus-visible+span{outline:3px solid #4b91e8;outline-offset:2px}.language-switch{display:flex;border-radius:999px;background:#edf2f7;padding:3px}.language-switch button{border:0;background:transparent;padding:7px 10px;border-radius:999px;font-size:.8rem;font-weight:800;color:#546b82}.language-switch button.active{background:#2f8bd9;color:white}.settings-expand{padding:16px 20px;background:#fff;border-radius:16px;color:#637487;line-height:1.55}.password-panel{padding:28px;align-self:start}.password-panel h2{font-size:1.3rem;font-weight:800}.password-panel form{display:grid;gap:16px;margin-top:20px}.password-panel .primary-button{width:100%}

.admin-heading{display:flex;align-items:center;gap:14px;background:#1d3658;color:white;border-radius:20px;padding:20px 26px;margin-bottom:30px}.admin-heading .eyebrow{color:#93c7ec;margin:0}.admin-heading h1{font-size:1.65rem;font-weight:800;margin:2px 0 0}.admin-page section{margin-bottom:31px}.admin-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.admin-stat{background:#fff;border-radius:21px;padding:24px 15px;box-shadow:0 8px 20px #203c5b13;display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center}.admin-stat svg{color:#338ad4}.admin-stat span{font-size:.86rem;color:#56697b}.admin-stat strong{font-size:1.5rem;font-weight:800}.admin-page .field-hint{margin-top:12px}.admin-management{padding:25px;display:flex;gap:13px;flex-wrap:wrap}.admin-management button{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;background:#e5f0fa;color:#6d879f;padding:11px 16px;font-weight:800}.admin-management p{width:100%;font-size:.84rem;color:#7c8997;margin:4px 0 0}.admin-analytics{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.admin-analytics>div{padding:25px}.admin-analytics svg{color:#3288d0}.admin-analytics h3{font-size:1.08rem;font-weight:800;margin:13px 0 8px}.admin-analytics p{color:#6b7b8c;margin:0}.admin-logout{display:block;margin:10px auto 0;border:0;background:#d94c4c;color:white;padding:12px 36px;border-radius:999px;font-weight:800}

.help-hero{display:flex;align-items:center;gap:25px;padding:30px;margin-bottom:34px}.help-hero>span{width:90px;height:90px;border-radius:25px;display:grid;place-items:center;background:#e8f3ff;color:#3184c7;flex:none}.help-hero h2{font-weight:800;font-size:1.4rem;margin:0 0 6px}.help-hero p{color:#687c90;margin:0}.faq-list{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:35px}.faq-item{overflow:hidden}.faq-item button{width:100%;padding:20px;display:flex;justify-content:space-between;gap:10px;align-items:center;border:0;background:transparent;text-align:left;font-weight:800;color:#1b2d42}.faq-item button svg{color:#3186c8;transition:transform .2s}.faq-item button[aria-expanded=true] svg{transform:rotate(90deg)}.faq-item p{padding:0 20px 20px;color:#617487;line-height:1.6;margin:0}

.home-screen{grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr)}.home-action-grid,.home-action{min-width:0}
@media(max-width:950px){.desktop-nav{gap:14px}.desktop-nav a{font-size:.84rem}.site-header-inner{gap:17px}.home-screen{gap:28px}.settings-layout,.profile-layout{grid-template-columns:1fr}.activity-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:760px){.page-shell{width:min(100% - 32px,620px);padding:36px 0 116px}.site-header{height:65px}.site-header-inner{width:min(100% - 32px,620px)}.site-brand strong{font-size:.92rem}.site-brand small{font-size:.5rem}.desktop-nav{display:none}.header-account{margin-left:auto;padding:7px 13px;font-size:.85rem}.bottom-nav{position:fixed;bottom:0;left:0;right:0;height:calc(69px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);background:#1d3658;display:flex;justify-content:space-around;align-items:center;z-index:10;box-shadow:0 -5px 18px #1b31502b}.bottom-nav a{min-width:64px;color:#cbd7e2;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:.66rem;font-weight:800}.bottom-nav a.active{color:#51a7ee}.home-screen{display:block;min-height:calc(100vh - 134px);padding-top:35px;text-align:center}.home-identity{background:transparent;box-shadow:none;padding:0}.home-identity .brand-mark{margin:17px auto 27px}.home-identity h1{font-size:1.65rem;margin-bottom:27px}.home-welcome{font-size:1.08rem;margin-bottom:30px}.home-stadium{display:none}.home-action-grid{gap:15px}.home-action{min-height:142px;font-size:.95rem;border-radius:20px}.home-action svg{width:32px;height:32px}.home-footnote{font-size:.84rem;margin:22px 0 7px}.auth-layout{max-width:560px;display:flex;flex-direction:column;border-radius:25px}.auth-intro{padding:31px 25px 0;background:transparent}.auth-intro h1{font-size:2.6rem;margin:14px 0 0}.auth-intro>p{display:none}.auth-intro .stadium-illustration{max-width:340px;margin:6px auto 0}.auth-panel{padding:10px 28px 33px}.auth-panel>.eyebrow,.auth-panel>h2,.auth-panel>.muted{display:none}.auth-switch{margin:7px 0 22px}.auth-screen{justify-content:flex-start;padding:20px 18px 15px}.auth-credit{font-size:.68rem}.event-grid,.ticket-list,.seat-layout,.faq-list{grid-template-columns:1fr}.event-card,.ticket-card{padding:17px;gap:14px}.event-card-icon,.ticket-card-icon{width:51px;height:51px;border-radius:14px}.event-card-icon svg{width:31px;height:31px}.event-card h2,.ticket-card h2{font-size:.98rem}.event-date,.ticket-card-copy p{font-size:.82rem}.event-description{font-size:.78rem}.seat-page .page-heading h1{font-size:1.65rem}.stadium-panel{padding:17px}.stadium-map{height:250px}.stadium-ring{border-width:8px;box-shadow:0 0 0 6px #d8e1eb,0 0 0 9px #647d91,inset 0 0 0 6px #dbe4ed}.map-section{width:38px;height:38px;font-size:1.15rem}.seat-legend{gap:10px;font-size:.76rem}.seat-picker{padding:21px}.booking-bar{bottom:76px;padding:15px;align-items:stretch;flex-direction:column}.booking-bar .primary-button{width:100%}.profile-details dl>div{grid-template-columns:120px 1fr}.admin-heading{margin:-36px -16px 28px;border-radius:0;padding:18px}.admin-stats{gap:9px}.admin-stat{padding:17px 7px}.admin-stat strong{font-size:1.2rem}.admin-stat span{font-size:.72rem}.admin-analytics{grid-template-columns:1fr}.settings-language{flex-wrap:wrap}.settings-language .language-switch{margin-left:62px}.page-heading h1{font-size:2.2rem}}
@media(max-width:430px){.page-shell{width:calc(100% - 28px)}.home-action{min-height:127px}.site-brand small{display:none}.profile-edit-form{grid-template-columns:1fr}.activity-grid>div{padding:12px 5px}.activity-grid span{font-size:.68rem}.profile-details dl>div{display:block}.profile-details dt{margin-bottom:3px}.settings-row{padding:16px;gap:9px}.settings-icon{width:34px;height:34px}.settings-row h2{font-size:.98rem}.settings-row p{font-size:.76rem}.settings-language .language-switch{margin-left:43px}}
```

## frontend/tailwind.config.js

```js
export default { content: ['./index.html', './src/**/*.{js,jsx}'], theme: { extend: {} }, plugins: [] };
```

## frontend/vercel.json

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## frontend/vite.config.js

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
```

