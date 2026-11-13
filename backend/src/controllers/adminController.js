import { pool } from '../config/db.js';
import { createHash, randomBytes } from 'node:crypto';
import { hashTicketToken, tokenForTicket } from '../config/ticketToken.js';

export async function getStats(_req, res) {
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM events) AS total_events,
      (SELECT count(*)::int FROM bookings) AS total_bookings,
      (SELECT count(DISTINCT user_id)::int FROM bookings WHERE created_at >= now() - interval '30 days') AS active_users
  `);
  const monthly = await pool.query("SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, count(*)::int AS total FROM bookings WHERE created_at >= date_trunc('month', now()) - interval '5 months' GROUP BY 1 ORDER BY 1");
  const categories = await pool.query('SELECT e.category, count(*)::int AS total FROM bookings b JOIN events e ON e.id = b.event_id GROUP BY e.category ORDER BY total DESC, e.category');
  return res.json({ stats: { totalEvents: rows[0].total_events, totalBookings: rows[0].total_bookings, activeUsers: rows[0].active_users, monthlyBookings: monthly.rows, topCategories: categories.rows } });
}

export async function createInvite(req, res) {
  const { email, universityId } = req.body ?? {};
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof universityId !== 'string' || !universityId.trim() || universityId.length > 50) {
    return res.status(400).json({ error: 'Valid email and university ID are required' });
  }
  const code = randomBytes(32).toString('hex');
  try {
    await pool.query('DELETE FROM student_invites WHERE used_at IS NULL AND expires_at <= now()');
    const { rows } = await pool.query("INSERT INTO student_invites (email, university_id, code_hash, expires_at, created_by) VALUES ($1, $2, $3, now() + interval '7 days', $4) RETURNING id, email, university_id, expires_at", [email.trim().toLowerCase(), universityId.trim(), createHash('sha256').update(code).digest('hex'), req.user.id]);
    return res.status(201).json({ invite: { ...rows[0], code } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An unclaimed invite already exists for this email or university ID' });
    throw error;
  }
}

export async function listUnverifiedStudents(_req, res) {
  const { rows } = await pool.query("SELECT id, name, email, university_id, created_at FROM users WHERE role = 'student' AND verified_at IS NULL ORDER BY created_at LIMIT 100");
  return res.json({ students: rows });
}

export async function verifyStudent(req, res) {
  if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid student ID' });
  const { universityId } = req.body ?? {};
  if (typeof universityId !== 'string' || !universityId.trim() || universityId.length > 50) return res.status(400).json({ error: 'Verified university ID is required' });
  try {
    const { rows } = await pool.query("UPDATE users SET university_id = $2, verified_at = now() WHERE id = $1 AND role = 'student' AND verified_at IS NULL RETURNING id, name, university_id", [req.params.id, universityId.trim()]);
    if (!rows.length) return res.status(409).json({ error: 'Student was already approved or does not exist' });
    return res.json({ student: rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'University ID is already assigned to another student' });
    throw error;
  }
}

export async function createEvent(req, res) {
  const { title, description = '', startsAt, endsAt, venue, category = 'other', rowsPerSection, seatsPerRow } = req.body ?? {};
  const start = new Date(startsAt); const end = new Date(endsAt);
  if (typeof title !== 'string' || !title.trim() || title.length > 200 || typeof venue !== 'string' || !venue.trim() || venue.length > 200 ||
      typeof description !== 'string' || description.length > 2000 || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
      start <= new Date() || end <= start || !['sports', 'music', 'arts', 'academic', 'other'].includes(category) ||
      !Number.isInteger(rowsPerSection) || rowsPerSection < 1 || rowsPerSection > 50 || !Number.isInteger(seatsPerRow) || seatsPerRow < 1 || seatsPerRow > 100) {
    return res.status(400).json({ error: 'Valid event details and a layout of 1–50 rows and 1–100 seats per row are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO events (title, description, starts_at, ends_at, venue, category, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, title, starts_at, ends_at, venue, category', [title.trim(), description.trim(), start, end, venue.trim(), category, req.user.id]);
    await client.query('INSERT INTO seats (event_id, section_id, row_number, seat_number) SELECT $1, ss.id, row_numbers.value, seat_numbers.value FROM stadium_sections ss CROSS JOIN generate_series(1, $2::int) AS row_numbers(value) CROSS JOIN generate_series(1, $3::int) AS seat_numbers(value)', [rows[0].id, rowsPerSection, seatsPerRow]);
    await client.query('COMMIT');
    return res.status(201).json({ event: rows[0], seatCount: 4 * rowsPerSection * seatsPerRow });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function listBookings(_req, res) {
  const { rows } = await pool.query('SELECT b.id, b.status, b.created_at, u.name AS student_name, u.email, u.university_id, e.title AS event_title, e.starts_at, count(bs.id)::int AS seat_count FROM bookings b JOIN users u ON u.id = b.user_id JOIN events e ON e.id = b.event_id JOIN booking_seats bs ON bs.booking_id = b.id GROUP BY b.id, u.id, e.id ORDER BY b.created_at DESC LIMIT 100');
  return res.json({ bookings: rows });
}

export async function addSeats(req, res) {
  const { eventId, section, rowNumber, fromSeat, toSeat } = req.body ?? {};
  if (!/^[1-9]\d*$/.test(String(eventId)) || !['A', 'B', 'C', 'D'].includes(section) ||
      !Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 100 ||
      !Number.isInteger(fromSeat) || !Number.isInteger(toSeat) || fromSeat < 1 || toSeat < fromSeat || toSeat > 200 || toSeat - fromSeat > 99) {
    return res.status(400).json({ error: 'Valid event, section, row, and seat range are required' });
  }
  const event = await pool.query('SELECT id FROM events WHERE id = $1 AND starts_at > now()', [eventId]);
  if (!event.rowCount) return res.status(404).json({ error: 'Upcoming event not found' });
  const result = await pool.query('INSERT INTO seats (event_id, section_id, row_number, seat_number) SELECT $1, ss.id, $3, seat_numbers.value FROM stadium_sections ss CROSS JOIN generate_series($4::int, $5::int) AS seat_numbers(value) WHERE ss.code = $2 ON CONFLICT (event_id, section_id, row_number, seat_number) DO NOTHING', [eventId, section, rowNumber, fromSeat, toSeat]);
  return res.status(201).json({ seatsAdded: result.rowCount });
}

export async function redeemTicket(req, res) {
  const { token } = req.body ?? {};
  if (typeof token !== 'string' || !/^\d+\.\d+\.[0-9a-f]{64}$/.test(token)) return res.status(400).json({ error: 'Invalid QR token' });
  const [id, version] = token.split('.');
  if (token !== tokenForTicket(id, Number(version))) return res.status(403).json({ error: 'Invalid QR token' });
  const { rows } = await pool.query("UPDATE booking_seats bs SET redeemed_at = now() FROM bookings b, events e WHERE bs.id = $1 AND bs.qr_version = $2 AND bs.qr_code_hash = $3 AND bs.redeemed_at IS NULL AND b.id = bs.booking_id AND b.status = 'confirmed' AND e.id = bs.event_id AND e.starts_at <= now() + interval '2 hours' AND e.ends_at > now() RETURNING bs.id AS ticket_id, bs.redeemed_at, b.id AS booking_id, e.title AS event_title", [id, version, hashTicketToken(token)]);
  if (!rows.length) return res.status(409).json({ error: 'Ticket is invalid, already used, cancelled, or outside its entry window' });
  return res.json({ ticket: rows[0] });
}
