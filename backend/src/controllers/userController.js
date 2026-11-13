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
