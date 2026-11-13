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
