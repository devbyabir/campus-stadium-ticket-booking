import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('invite, booking concurrency, ticket ownership, and single-use gate entry', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  const { app } = await import('../src/app.js');
  const { pool } = await import('../src/config/db.js');
  const jwt = (await import('jsonwebtoken')).default;
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const marker = randomUUID();
  async function request(path, method = 'GET', body, token) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  try {
    const admin = await pool.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Test Admin', $1, 'test', 'admin') RETURNING id", [`admin-${marker}@example.test`]);
    const adminToken = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { subject: String(admin.rows[0].id), expiresIn: '1h' });
    const email = `student-${marker}@example.test`;
    const invitation = await request('/admin/invites', 'POST', { email, universityId: marker }, adminToken);
    assert.equal(invitation.status, 201);
    const signup = await request('/auth/signup', 'POST', { name: 'Test Student', email, password: 'correct horse battery staple', invitationCode: invitation.data.invite.code });
    assert.equal(signup.status, 201);
    assert.equal((await request('/auth/signup', 'POST', { name: 'Other', email: `other-${marker}@example.test`, password: 'correct horse battery staple' })).status, 400);
    assert.equal((await request('/admin/stats')).status, 401);
    assert.equal((await request('/admin/stats', 'GET', undefined, signup.data.token)).status, 403);
    const start = new Date(Date.now() + 30 * 60_000);
    const end = new Date(Date.now() + 3 * 60 * 60_000);
    const created = await request('/admin/events', 'POST', { title: `Test Event ${marker}`, venue: 'Test stadium', startsAt: start.toISOString(), endsAt: end.toISOString(), category: 'sports', rowsPerSection: 1, seatsPerRow: 1 }, adminToken);
    assert.equal(created.status, 201);
    const eventId = created.data.event.id;
    const seatMap = await request(`/events/${eventId}/seats`);
    assert.equal(seatMap.data.seats.length, 4);
    const seatId = seatMap.data.seats[0].id;
    const attempts = await Promise.all([request('/bookings', 'POST', { eventId, seatIds: [seatId] }, signup.data.token), request('/bookings', 'POST', { eventId, seatIds: [seatId] }, signup.data.token)]);
    assert.deepEqual(attempts.map(item => item.status).sort(), [201, 409]);
    const tickets = await request('/user/tickets', 'GET', undefined, signup.data.token);
    assert.equal(tickets.data.tickets.length, 1);
    const token = tickets.data.tickets[0].qrCode;
    assert.match(token, /^\d+\.1\.[0-9a-f]{64}$/);
    assert.equal((await request('/admin/tickets/redeem', 'POST', { token }, signup.data.token)).status, 403);
    assert.equal((await request('/admin/tickets/redeem', 'POST', { token }, adminToken)).status, 200);
    assert.equal((await request('/admin/tickets/redeem', 'POST', { token }, adminToken)).status, 409);
    const after = await request('/user/tickets', 'GET', undefined, signup.data.token);
    assert.ok(after.data.tickets[0].redeemed_at);
  } finally {
    await pool.query('DELETE FROM booking_seats WHERE event_id IN (SELECT id FROM events WHERE title = $1)', [`Test Event ${marker}`]);
    await pool.query('DELETE FROM bookings WHERE event_id IN (SELECT id FROM events WHERE title = $1)', [`Test Event ${marker}`]);
    await pool.query('DELETE FROM events WHERE title = $1', [`Test Event ${marker}`]);
    await pool.query('DELETE FROM student_invites WHERE email = $1', [`student-${marker}@example.test`]);
    await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [`admin-${marker}@example.test`, `student-${marker}@example.test`]);
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
