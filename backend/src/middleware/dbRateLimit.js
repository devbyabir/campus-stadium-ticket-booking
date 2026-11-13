import { createHash } from 'node:crypto';
import { pool } from '../config/db.js';

export function dbRateLimit(scope, limit, windowMinutes = 15) {
  return async (req, res, next) => {
    try {
      const key = createHash('sha256').update(req.ip || 'unknown').digest('hex');
      const { rows } = await pool.query(`
        INSERT INTO api_rate_limits (scope, key_hash, window_ends_at, attempts)
        VALUES ($1, $2, now() + ($3::int * interval '1 minute'), 1)
        ON CONFLICT (scope, key_hash) DO UPDATE SET
          attempts = CASE WHEN api_rate_limits.window_ends_at <= now() THEN 1 ELSE api_rate_limits.attempts + 1 END,
          window_ends_at = CASE WHEN api_rate_limits.window_ends_at <= now() THEN now() + ($3::int * interval '1 minute') ELSE api_rate_limits.window_ends_at END
        RETURNING attempts, window_ends_at`, [scope, key, windowMinutes]);
      if (rows[0].attempts > limit) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((new Date(rows[0].window_ends_at) - Date.now()) / 1000))));
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
      }
      return next();
    } catch (error) { return next(error); }
  };
}
