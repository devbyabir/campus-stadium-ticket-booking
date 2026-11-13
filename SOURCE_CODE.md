# Complete source code

## backend/.env.example

```text
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/campus_stadium
DATABASE_SSL=disable
JWT_SECRET=replace-with-a-random-secret-at-least-32-characters-long
JWT_EXPIRES_IN=1h
FRONTEND_ORIGIN=http://localhost:5173
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

## backend/package.json

```json
{
  "name": "campus-stadium-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "start:deploy": "npm run migrate && npm start",
    "migrate": "node src/migrate.js",
    "dev": "node --watch src/server.js",
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
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import { bookingRoutes, userRoutes } from './routes/bookingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10kb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use(notFound);
app.use(errorHandler);
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
    : process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : false,
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
import { pool } from './config/db.js';

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

## backend/src/server.js

```js
import 'dotenv/config';
import { pool } from './config/db.js';
import { app } from './app.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

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

## frontend/.env.example

```text
VITE_API_URL=http://localhost:3000/api
# Production: https://your-render-service.onrender.com/api
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
        <Route path="*" element={<main><h1>Page not found</h1></main>} />
      </Routes>
    </BrowserRouter>
  );
}
```

## frontend/src/components/BookingConfirmation.jsx

```jsx
import { Link } from 'react-router-dom';
export default function BookingConfirmation({ event, seats, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" onMouseDown={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
    <h2 id="confirmation-title">Booking confirmed</h2><p>{event.title}</p><p>{new Date(event.starts_at).toLocaleString()} · {event.venue}</p>
    <p>Seats: {seats.map(s => `${s.section} · Row ${s.row_number} · Seat ${s.seat_number}`).join(', ')}</p>
    <Link to="/tickets">View my tickets</Link>
  </section></div>;
}
```

## frontend/src/components/Navbar.jsx

```jsx
import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  useLocation();
  const signedIn = Boolean(sessionStorage.getItem('token'));
  function logout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <nav aria-label="Main navigation">
      <Link to="/">Campus Stadium</Link>{' '}
      <Link to="/events">Events</Link>{' '}
      {signedIn && <Link to="/tickets">My tickets</Link>}
      {signedIn && <Link to="/profile">Profile</Link>}
      {signedIn && <Link to="/settings">Settings</Link>}
      {signedIn && JSON.parse(sessionStorage.getItem('user') || '{}').role === 'admin' && <Link to="/admin">Admin</Link>}
      {signedIn ? <button onClick={logout}>Log out</button> : <Link to="/login">Log in</Link>}
    </nav>
  );
}
```

## frontend/src/components/TicketQRModal.jsx

```jsx
import { QRCodeSVG } from 'qrcode.react';
export default function TicketQRModal({ ticket, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" onMouseDown={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
    <h2 id="qr-title">{ticket.title}</h2><p>Section {ticket.section} · Row {ticket.row_number} · Seat {ticket.seat_number}</p>
    <QRCodeSVG value={ticket.qr_code_hash} size={220} level="M" marginSize={2} title="Ticket QR code" /><p>Show this code at the gate.</p>
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
import { Link } from 'react-router-dom';
import { fetchAdminStats } from '../services/api.js';

export default function AdminDashboard() {
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user?.role !== 'admin') return;
    let active = true;
    fetchAdminStats().then(result => { if (active) setStats(result); }).catch(err => { if (active) setError(err.response?.data?.error || 'Statistics are unavailable.'); });
    return () => { active = false; };
  }, [user?.role]);
  if (user?.role !== 'admin' || !sessionStorage.getItem('token')) return <main className="mx-auto max-w-6xl p-6"><h1 className="text-3xl font-bold">Admin dashboard</h1><p className="mt-4">Admin access required. <Link className="text-blue-700 underline" to="/login">Log in</Link></p></main>;
  return <main className="mx-auto max-w-6xl space-y-7 p-4 sm:p-8"><header><p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Overview</p><h1 className="text-3xl font-bold">Admin dashboard</h1></header>
    <div className="grid gap-4 sm:grid-cols-3">{[['Total Events', stats?.totalEvents ?? '—'], ['Total Bookings', stats?.totalBookings ?? '—'], ['Active Users', stats?.activeUsers ?? '—']].map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</div>
    <p className="text-sm text-slate-500">Active users are distinct users who booked in the last 30 days.</p>
    {error && <p role="status" className="text-amber-700">{error}</p>}
    <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Management</h2><div className="mt-4 flex flex-wrap gap-3">{['Add New Event', 'View / Manage Bookings', 'Manage Seats & Layouts'].map(label => <button key={label} disabled title="Admin management API is not available" className="rounded-lg bg-slate-200 px-4 py-3 text-slate-500">{label}</button>)}</div><p className="mt-3 text-sm text-slate-500">Management actions require admin APIs.</p></section>
    <section className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Monthly Bookings</h2><p className="mt-4 text-slate-500">Analytics unavailable until booking reports are exposed by the API.</p></div><div className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Top Selling Event Categories</h2><p className="mt-4 text-slate-500">Category data is not yet available in the events schema.</p></div></section>
  </main>;
}
```

## frontend/src/pages/Events.jsx

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchEvents } from '../services/api.js';

export default function Events() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchEvents().then(rows => { if (active) setEvents(rows); }).catch(err => { if (active) setError(err.response?.data?.error || 'Unable to load events'); });
    return () => { active = false; };
  }, []);
  return <main className="page-shell"><h1>Upcoming events</h1>
    {error && <p role="alert" className="error">{error}</p>}
    {!events && !error && <p>Loading events…</p>}
    {events?.length === 0 && <p>No upcoming events yet.</p>}
    <div className="ticket-list">{events?.map(event => <article className="ticket-card" key={event.id}>
      <h2>{event.title}</h2><p>{new Date(event.starts_at).toLocaleString()} · {event.venue}</p>
      {event.description && <p>{event.description}</p>}
      <Link className="primary-link" to={`/events/${event.id}/seats`}>Choose seats</Link>
    </article>)}</div>
  </main>;
}
```

## frontend/src/pages/Home.jsx

```jsx
import { Link } from 'react-router-dom';

export default function Home() {
  return <main><h1>Campus Stadium Ticket Booking</h1><p>Explore campus events and reserve seats.</p><Link to="/events">Browse events</Link></main>;
}
```

## frontend/src/pages/Login.jsx

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
      setError(requestError.response?.data?.error || 'Unable to connect to the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{mode === 'login' ? 'Log in' : 'Student sign up'}</h1>
      <form onSubmit={submit}>
        {mode === 'signup' && <label>Name <input name="name" required maxLength="120" /></label>}
        <label>Email <input name="email" type="email" required maxLength="254" /></label>
        <label>Password <input name="password" type="password" required minLength={mode === 'signup' ? 12 : undefined} /></label>
        <button disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => { setError(''); setMode(mode === 'login' ? 'signup' : 'login'); }}>
        {mode === 'login' ? 'Create an account' : 'Already have an account? Log in'}
      </button>
      <p><Link to="/">Back to home</Link></p>
    </main>
  );
}
```

## frontend/src/pages/MyTickets.jsx

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TicketQRModal from '../components/TicketQRModal.jsx';
import { fetchMyTickets } from '../services/api.js';

export default function MyTickets() {
  const [tickets, setTickets] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sessionStorage.getItem('token')) { setError('Log in to view your tickets.'); return; }
    let mounted = true;
    fetchMyTickets().then(rows => { if (mounted) setTickets(rows); }).catch(err => { if (mounted) setError(err.response?.data?.error || 'Unable to load tickets'); });
    return () => { mounted = false; };
  }, []);
  return <main className="page-shell"><h1>My tickets</h1>
    {error && <p role="alert" className="error">{error} <Link to="/login">Log in</Link></p>}
    {!tickets && !error && <p>Loading tickets…</p>}
    {tickets?.length === 0 && <p>No tickets yet. <Link to="/events">Browse events</Link></p>}
    <div className="ticket-list">{tickets?.map(ticket => <article className="ticket-card" key={ticket.ticket_id}>
      <h2>{ticket.title}</h2><p>{new Date(ticket.starts_at).toLocaleString()} · {ticket.venue}</p>
      <p>Section {ticket.section} · Row {ticket.row_number} · Seat {ticket.seat_number}</p><p>Status: {ticket.booking_status}</p>
      {ticket.booking_status === 'confirmed' && <button className="primary-button" onClick={() => setActive(ticket)}>Show QR code</button>}
    </article>)}</div>
    {active && <TicketQRModal ticket={active} onClose={() => setActive(null)} />}
  </main>;
}
```

## frontend/src/pages/Profile.jsx

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  if (!sessionStorage.getItem('token') || !user) return <main className="mx-auto max-w-5xl p-6"><h1 className="text-3xl font-bold">Profile</h1><p className="mt-4">Please <Link to="/login" className="text-blue-700 underline">log in</Link> to view your profile.</p></main>;
  const total = tickets?.filter(ticket => ticket.booking_status === 'confirmed').length;
  const attended = tickets ? new Set(tickets.filter(ticket => ticket.booking_status === 'confirmed' && new Date(ticket.starts_at) < new Date()).map(ticket => ticket.event_id)).size : null;
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <header><p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Account</p><h1 className="text-3xl font-bold">My profile</h1></header>
    <div className="grid gap-4 sm:grid-cols-3">{[['Total Tickets Booked', total ?? '—'], ['Events Attended', attended ?? '—'], ['Points Earned', '—']].map(([label, value]) => <div className="rounded-2xl bg-white p-5 shadow-sm" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</div>
    {error && <p role="status" className="text-amber-700">{error}</p>}
    {message && <p role="status" className="text-green-700">{message}</p>}
    <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"><h2 className="text-xl font-semibold">Personal details</h2>
      {editing ? <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        {[['name', 'Name', user.name], ['universityId', 'University ID', user.universityId || ''], ['email', 'Email', user.email], ['phone', 'Phone', user.phone || '']].map(([key, label, value]) => <label className="block text-sm font-medium" key={key}>{label}<input className="mt-1 block w-full rounded-lg border border-slate-300 p-2" name={key} defaultValue={value} required={key === 'name' || key === 'email'} type={key === 'email' ? 'email' : 'text'} maxLength={key === 'email' ? 254 : key === 'name' ? 120 : key === 'universityId' ? 50 : 30} /></label>)}
        <div className="flex gap-3 sm:col-span-2"><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 text-white">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" onClick={() => setEditing(false)} className="rounded-lg border px-4 py-2">Cancel</button></div>
      </form> : <dl className="mt-5 grid gap-5 sm:grid-cols-2">{[['Name', user.name], ['University ID', user.universityId || '—'], ['Email', user.email], ['Phone', user.phone || '—'], ['Password', '••••••••']].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 font-medium break-all">{value}</dd></div>)}</dl>}
      {!editing && <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => { setMessage(''); setEditing(true); }} className="rounded-lg bg-blue-700 px-4 py-2 text-white">Edit profile</button><Link to="/settings#password" className="rounded-lg border px-4 py-2">Change password</Link></div>}
    </section>
  </main>;
}
```

## frontend/src/pages/SeatMap.jsx

```jsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BookingConfirmation from '../components/BookingConfirmation.jsx';
import { confirmBooking, fetchEventSeats } from '../services/api.js';

export default function SeatMap() {
  const { eventId } = useParams();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [confirmed, setConfirmed] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchEventSeats(eventId).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.response?.data?.error || 'Unable to load seats'); });
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

  return <main className="page-shell"><Link to="/events">← Events</Link>
    <h1>{data?.event.title || 'Choose your seats'}</h1>
    {data && <p>{new Date(data.event.starts_at).toLocaleString()} · {data.event.venue}</p>}
    {error && <p role="alert" className="error">{error} {error.includes('Log in') && <Link to="/login">Log in</Link>}</p>}
    {!data && !error && <p>Loading seats…</p>}
    {data && <><div className="seat-legend"><span className="legend available" /> Available <span className="legend selected" /> Selected <span className="legend booked" /> Booked</div>
      <div className="sections">{['A', 'B', 'C', 'D'].map(section => <section className="section-card" key={section}>
        <h2>Section {section}</h2><div className="seat-grid">{data.seats.filter(seat => seat.section === section).map(seat => <button key={seat.id} type="button" disabled={seat.status === 'booked' || busy} aria-pressed={selected.includes(seat.id)} aria-label={`Section ${section}, row ${seat.row_number}, seat ${seat.seat_number}, ${seat.status === 'booked' ? 'booked' : selected.includes(seat.id) ? 'selected' : 'available'}`} title={`Row ${seat.row_number}, Seat ${seat.seat_number}`} className={`seat ${seat.status === 'booked' ? 'booked' : selected.includes(seat.id) ? 'selected' : 'available'}`} onClick={() => toggle(seat.id)}>{seat.row_number}-{seat.seat_number}</button>)}</div>
        {!data.seats.some(seat => seat.section === section) && <p>No seats listed.</p>}
      </section>)}</div><div className="booking-bar"><span>{selected.length} seat{selected.length === 1 ? '' : 's'} selected</span><button className="primary-button" disabled={!selected.length || busy} onClick={book}>{busy ? 'Confirming…' : 'Confirm booking'}</button></div>
    </>}
    {confirmed && <BookingConfirmation event={data.event} seats={confirmed} onClose={() => setConfirmed(null)} />}
  </main>;
}
```

## frontend/src/pages/Settings.jsx

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  return <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8"><header><p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Preferences</p><h1 className="text-3xl font-bold">Settings</h1></header>
    <section className="space-y-6 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold">Notifications</h2><p className="text-sm text-slate-500">Save your notification preference on this device.</p></div><label className="inline-flex items-center gap-2"><input type="checkbox" checked={notifications} onChange={e => { setNotifications(e.target.checked); localStorage.setItem('notifications', e.target.checked ? 'on' : 'off'); }} /><span>{notifications ? 'On' : 'Off'}</span></label></div>
      <div className="border-t pt-5"><label htmlFor="language" className="block font-semibold">Language</label><select id="language" value={language} onChange={e => { setLanguage(e.target.value); localStorage.setItem('language', e.target.value); }} className="mt-2 w-full rounded-lg border border-slate-300 p-2 sm:w-64"><option value="en">English</option><option value="zh">中文</option></select><p className="mt-2 text-sm text-slate-500">Full translation is not yet available.</p></div>
      <div className="border-t pt-5"><button onClick={() => setPrivacyOpen(value => !value)} aria-expanded={privacyOpen} className="font-semibold text-blue-700 underline">Privacy policy</button>{privacyOpen && <p className="mt-2 text-sm text-slate-600">The privacy policy has not been published yet. Contact the campus event administrator for data handling details.</p>}</div>
      <form id="password" onSubmit={submitPassword} className="space-y-3 border-t pt-5"><h2 className="font-semibold">Change password</h2>
        <label className="block text-sm">Current password<input name="currentPassword" type="password" autoComplete="current-password" required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
        <label className="block text-sm">New password<input name="newPassword" type="password" autoComplete="new-password" minLength="12" required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
        <label className="block text-sm">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength="12" required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
        {passwordError && <p role="alert" className="text-red-700">{passwordError}</p>}{passwordMessage && <p role="status" className="text-green-700">{passwordMessage}</p>}
        <button disabled={changing || !sessionStorage.getItem('token')} className="rounded-lg bg-blue-700 px-5 py-2 text-white disabled:opacity-50">{changing ? 'Updating…' : 'Update password'}</button>
      </form>
      <div className="border-t pt-5"><button onClick={logout} className="rounded-lg bg-red-600 px-5 py-2 font-medium text-white">Log out</button></div>
    </section>
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
@tailwind base;
@tailwind components;
@tailwind utilities;
:root { font-family: system-ui, sans-serif; color: #17233b; background: #f5f7fb; }
* { box-sizing: border-box; }
body { margin: 0; }
nav { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; padding: 1rem max(1rem, calc((100vw - 1100px)/2)); background: #fff; box-shadow: 0 1px 5px #d5dce8; }
a { color: #175abb; }
button { font: inherit; cursor: pointer; }
button:disabled { cursor: not-allowed; }
main { padding: 1.5rem; }
.page-shell { max-width: 1100px; margin: auto; }
.sections, .ticket-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 1rem; margin: 1.5rem 0; }
.section-card, .ticket-card { background: #fff; border: 1px solid #dce3ee; border-radius: 14px; padding: 1.25rem; box-shadow: 0 3px 12px #1f34520d; }
.section-card h2, .ticket-card h2 { margin-top: 0; }
.seat-grid { display: flex; flex-wrap: wrap; gap: .5rem; }
.seat { min-width: 3.5rem; border: 0; border-radius: 7px; padding: .65rem .4rem; color: #fff; }
.seat.available, .legend.available { background: #2475dc; }
.seat.selected, .legend.selected { background: #158561; }
.seat.booked, .legend.booked { background: #929ba9; }
.seat:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid #f59e0b; outline-offset: 2px; }
.seat-legend { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.legend { width: 1rem; height: 1rem; border-radius: 3px; display: inline-block; margin-left: .75rem; }
.booking-bar { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; background: #fff; border: 1px solid #dce3ee; border-radius: 12px; }
.primary-button, .primary-link { display: inline-block; border: 0; border-radius: 8px; padding: .7rem 1rem; background: #175abb; color: #fff; text-decoration: none; }
.primary-button:disabled { opacity: .55; }
.error { color: #ad2424; }
.modal-backdrop { position: fixed; inset: 0; z-index: 10; background: #111b2baa; display: grid; place-items: center; padding: 1rem; }
.modal { position: relative; width: min(100%, 480px); max-height: 90vh; overflow: auto; background: #fff; border-radius: 16px; padding: 2rem; box-shadow: 0 20px 60px #0004; }
.modal-close { position: absolute; top: .7rem; right: .8rem; border: 0; background: transparent; font-size: 1.7rem; }
.qr-modal { text-align: center; }
.qr-modal svg { max-width: 100%; height: auto; }
@media (max-width: 600px) { .booking-bar { flex-direction: column; align-items: stretch; } .primary-button { width: 100%; } }
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

