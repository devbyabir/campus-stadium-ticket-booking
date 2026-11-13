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
