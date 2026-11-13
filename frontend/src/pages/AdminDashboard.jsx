import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminStats } from '../services/api.js';

export default function AdminDashboard() {
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user?.role !== 'admin') return;
    let active = true;
    fetchAdminStats().then(result => { if (active) setStats(result); }).catch(err => { if (active) setError(err.response?.data?.error || 'Statistics are unavailable.'); });
    return () => { active = false; };
  }, [user?.role]);
  if (user?.role !== 'admin' || !sessionStorage.getItem('token')) return <main className="mx-auto max-w-6xl p-6"><h1 className="text-3xl font-bold">Admin dashboard</h1><p className="mt-4">Admin access required. <Link className="text-blue-700 underline" to="/login">Log in</Link></p></main>;
  return <main className="mx-auto max-w-6xl space-y-7 p-4 sm:p-8"><header><p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Overview</p><h1 className="text-3xl font-bold">Admin dashboard</h1></header>
    <div className="grid gap-4 sm:grid-cols-3">{[['Total Events', stats?.totalEvents ?? '—'], ['Total Bookings', stats?.totalBookings ?? '—'], ['Active Users', stats?.activeUsers ?? '—']].map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</div>
    <p className="text-sm text-slate-500">Active users are distinct users who booked in the last 30 days.</p>
    {error && <p role="status" className="text-amber-700">{error}</p>}
    <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Management</h2><div className="mt-4 flex flex-wrap gap-3">{['Add New Event', 'View / Manage Bookings', 'Manage Seats & Layouts'].map(label => <button key={label} disabled title="Admin management API is not available" className="rounded-lg bg-slate-200 px-4 py-3 text-slate-500">{label}</button>)}</div><p className="mt-3 text-sm text-slate-500">Management actions require admin APIs.</p></section>
    <section className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Monthly Bookings</h2><p className="mt-4 text-slate-500">Analytics unavailable until booking reports are exposed by the API.</p></div><div className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Top Selling Event Categories</h2><p className="mt-4 text-slate-500">Category data is not yet available in the events schema.</p></div></section>
  </main>;
}
