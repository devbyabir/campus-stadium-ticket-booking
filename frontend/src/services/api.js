import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function login(credentials) {
  const { data } = await api.post('/auth/login', credentials);
  return data;
}

export async function signup(details) {
  const { data } = await api.post('/auth/signup', details);
  return data;
}

export async function fetchEvents() {
  const { data } = await api.get('/events');
  return data.events;
}

export async function fetchEventSeats(eventId) {
  const { data } = await api.get(`/events/${encodeURIComponent(eventId)}/seats`);
  return data;
}

export async function confirmBooking(eventId, seatIds) {
  const { data } = await api.post('/bookings', { eventId, seatIds });
  return data;
}

export async function fetchMyTickets() {
  const { data } = await api.get('/user/tickets');
  return data.tickets;
}

export async function fetchProfile() {
  const { data } = await api.get('/user/profile');
  return data.user;
}

export async function saveProfile(profile) {
  const { data } = await api.put('/user/profile', profile);
  return data.user;
}

export async function changePassword(passwords) {
  const { data } = await api.put('/user/change-password', passwords);
  return data;
}

export async function fetchAdminStats() {
  const { data } = await api.get('/admin/stats');
  return data.stats;
}

export async function createAdminInvite(details) {
  const { data } = await api.post('/admin/invites', details);
  return data.invite;
}

export async function createAdminEvent(details) {
  const { data } = await api.post('/admin/events', details);
  return data;
}

export async function fetchAdminBookings() {
  const { data } = await api.get('/admin/bookings');
  return data.bookings;
}

export async function addAdminSeats(details) {
  const { data } = await api.post('/admin/seats', details);
  return data;
}

export async function redeemAdminTicket(token) {
  const { data } = await api.post('/admin/tickets/redeem', { token });
  return data.ticket;
}

export async function fetchUnverifiedStudents() {
  const { data } = await api.get('/admin/students/unverified');
  return data.students;
}

export async function verifyAdminStudent(id, universityId) {
  const { data } = await api.put(`/admin/students/${encodeURIComponent(id)}/verify`, { universityId });
  return data.student;
}
