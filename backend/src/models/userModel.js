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
