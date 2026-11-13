import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const { rows } = await pool.query('SELECT role, token_version, verified_at FROM users WHERE id = $1', [payload.sub]);
    if (!rows.length || rows[0].token_version !== (payload.version ?? 0)) return res.status(401).json({ error: 'Session expired. Please log in again.' });
    req.user = { id: payload.sub, role: rows[0].role, verified: Boolean(rows[0].verified_at) };
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return res.status(401).json({ error: 'Invalid or expired token' });
    return next(error);
  }
}

export function requireVerifiedStudent(req, res, next) {
  if (req.user.role === 'admin' || req.user.verified) return next();
  return res.status(403).json({ error: 'Student identity must be verified by an administrator before booking' });
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}
