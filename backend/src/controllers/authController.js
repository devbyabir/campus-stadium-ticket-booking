import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { pool } from '../config/db.js';
import { findUserByEmail } from '../models/userModel.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tokenFor(user) {
  return jwt.sign({ role: user.role, version: user.token_version ?? 0 }, process.env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    algorithm: 'HS256',
  });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, universityId: user.university_id, phone: user.phone, role: user.role };
}

export async function signup(req, res) {
  const { name, email, password, invitationCode } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 ||
      typeof email !== 'string' || email.length > 254 || !emailPattern.test(email) ||
      typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 ||
      typeof invitationCode !== 'string' || !/^[0-9a-f]{64}$/.test(invitationCode)) {
    return res.status(400).json({ error: 'Valid name, email, password, and invitation code are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const codeHash = createHash('sha256').update(invitationCode).digest('hex');
  const client = await pool.connect();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query('BEGIN');
    const invite = await client.query('SELECT id, university_id FROM student_invites WHERE lower(email) = $1 AND code_hash = $2 AND used_at IS NULL AND expires_at > now() FOR UPDATE', [normalizedEmail, codeHash]);
    if (!invite.rowCount) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Invitation is invalid or expired' }); }
    const { rows } = await client.query('INSERT INTO users (name, email, university_id, password_hash, verified_at) VALUES ($1, $2, $3, $4, now()) RETURNING id, name, email, university_id, phone, role, token_version', [name.trim(), normalizedEmail, invite.rows[0].university_id, passwordHash]);
    await client.query('UPDATE student_invites SET used_at = now() WHERE id = $1', [invite.rows[0].id]);
    await client.query('COMMIT');
    const user = rows[0];
    return res.status(201).json({ user: publicUser(user), token: tokenFor(user) });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email or university ID is already registered' });
    }
    throw error;
  } finally { client.release(); }
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
