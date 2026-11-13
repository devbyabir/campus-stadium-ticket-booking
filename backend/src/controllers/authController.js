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
