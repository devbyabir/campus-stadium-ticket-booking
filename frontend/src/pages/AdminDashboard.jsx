import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import Icon from '../components/Icon.jsx';
import { fetchAdminStats } from '../services/api.js';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user?.role !== 'admin') return;
    let active = true;
    fetchAdminStats().then(result => { if (active) setStats(result); }).catch(err => { if (active) setError(err.response?.data?.error || 'Statistics are unavailable.'); });
    return () => { active = false; };
  }, [user?.role]);
  if (user?.role !== 'admin' || !sessionStorage.getItem('token')) return <main className="page-shell"><div className="empty-panel"><h1>Admin Dashboard</h1><p>Admin access is required.</p><Link className="primary-button" to="/login">Log in</Link></div></main>;
  function logout() { sessionStorage.removeItem('token'); sessionStorage.removeItem('user'); navigate('/login'); }
  return <main className="page-shell admin-page"><div className="admin-heading"><BrandMark small /><div><p className="eyebrow">CAMPUS STADIUM</p><h1>Admin Dashboard</h1></div></div>
    <section><h2 className="section-title">Summary</h2><div className="admin-stats">{[['Total Events', stats?.totalEvents ?? '—', 'calendar'], ['Total Bookings', stats?.totalBookings ?? '—', 'ticket'], ['Active Users', stats?.activeUsers ?? '—', 'user']].map(([label, value, icon]) => <div className="admin-stat" key={label}><Icon name={icon} size={29} /><span>{label}</span><strong>{value}</strong></div>)}</div><p className="field-hint">Active users booked in the last 30 days.</p>{error && <p role="status" className="error-banner">{error}</p>}</section>
    <section><h2 className="section-title">Manage</h2><div className="admin-management">{[['Add New Event', 'plus'], ['View / Manage Bookings', 'ticket'], ['Manage Seats & Layouts', 'settings']].map(([label, icon]) => <button key={label} disabled title="Management API is not available yet"><Icon name={icon} size={20} />{label}</button>)}<p>Management tools will be available when their API endpoints are added.</p></div></section>
    <section><h2 className="section-title">Analytics</h2><div className="admin-analytics"><div><Icon name="calendar" size={28} /><h3>Monthly Bookings</h3><p>Booking reports are not available yet.</p></div><div><Icon name="sport" size={28} /><h3>Top Selling Categories</h3><p>Event categories are not yet in the database.</p></div></div></section>
    <button className="admin-logout" onClick={logout}>Log Out</button>
  </main>;
}
