import { pool } from '../config/db.js';
import { hashTicketToken, tokenForTicket } from '../config/ticketToken.js';
import { randomBytes } from 'node:crypto';

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
      const row = await client.query('INSERT INTO booking_seats (booking_id, event_id, seat_id, qr_code_hash) VALUES ($1, $2, $3, $4) RETURNING id, seat_id', [booking.rows[0].id, eventId, seatId, randomBytes(32).toString('hex')]);
      const qrCode = tokenForTicket(row.rows[0].id);
      await client.query('UPDATE booking_seats SET qr_code_hash = $2 WHERE id = $1', [row.rows[0].id, hashTicketToken(qrCode)]);
      tickets.push({ ...row.rows[0], qrCode });
    }
    await client.query('COMMIT');
    res.status(201).json({ booking: booking.rows[0], tickets });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function userTickets(req, res) {
  const { rows } = await pool.query('SELECT b.id AS booking_id, b.status AS booking_status, e.id AS event_id, e.title, e.starts_at, e.venue, ss.code AS section, s.row_number, s.seat_number, bs.id AS ticket_id, bs.qr_version, bs.qr_code_hash, bs.redeemed_at FROM bookings b JOIN events e ON e.id = b.event_id JOIN booking_seats bs ON bs.booking_id = b.id JOIN seats s ON s.id = bs.seat_id JOIN stadium_sections ss ON ss.id = s.section_id WHERE b.user_id = $1 ORDER BY e.starts_at, b.id, bs.id', [req.user.id]);
  const tickets = await Promise.all(rows.map(async ({ qr_version, qr_code_hash, ...ticket }) => {
    const qrCode = tokenForTicket(ticket.ticket_id, qr_version);
    const hash = hashTicketToken(qrCode);
    if (qr_code_hash !== hash) await pool.query('UPDATE booking_seats SET qr_code_hash = $2 WHERE id = $1 AND qr_code_hash = $3', [ticket.ticket_id, hash, qr_code_hash]);
    return { ...ticket, qrCode };
  }));
  res.json({ tickets });
}
