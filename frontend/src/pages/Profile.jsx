import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMyTickets, fetchProfile, saveProfile } from '../services/api.js';

export default function Profile() {
  const [user, setUser] = useState(() => JSON.parse(sessionStorage.getItem('user') || 'null'));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sessionStorage.getItem('token')) return;
    let active = true;
    fetchProfile().then(profile => { if (active) { setUser(profile); sessionStorage.setItem('user', JSON.stringify(profile)); } }).catch(() => { if (active) setError('Profile could not be refreshed.'); });
    fetchMyTickets().then(rows => { if (active) setTickets(rows); }).catch(() => { if (active) setError('Ticket statistics are unavailable.'); });
    return () => { active = false; };
  }, []);
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const updated = await saveProfile(values);
      setUser(updated); sessionStorage.setItem('user', JSON.stringify(updated));
      setEditing(false); setMessage('Profile updated successfully.');
    } catch (requestError) { setError(requestError.response?.data?.error || 'Unable to update profile.'); }
    finally { setSaving(false); }
  }
  if (!sessionStorage.getItem('token') || !user) return <main className="mx-auto max-w-5xl p-6"><h1 className="text-3xl font-bold">Profile</h1><p className="mt-4">Please <Link to="/login" className="text-blue-700 underline">log in</Link> to view your profile.</p></main>;
  const total = tickets?.filter(ticket => ticket.booking_status === 'confirmed').length;
  const attended = tickets ? new Set(tickets.filter(ticket => ticket.booking_status === 'confirmed' && new Date(ticket.starts_at) < new Date()).map(ticket => ticket.event_id)).size : null;
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <header><p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Account</p><h1 className="text-3xl font-bold">My profile</h1></header>
    <div className="grid gap-4 sm:grid-cols-3">{[['Total Tickets Booked', total ?? '—'], ['Events Attended', attended ?? '—'], ['Points Earned', '—']].map(([label, value]) => <div className="rounded-2xl bg-white p-5 shadow-sm" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</div>
    {error && <p role="status" className="text-amber-700">{error}</p>}
    {message && <p role="status" className="text-green-700">{message}</p>}
    <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"><h2 className="text-xl font-semibold">Personal details</h2>
      {editing ? <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        {[['name', 'Name', user.name], ['universityId', 'University ID', user.universityId || ''], ['email', 'Email', user.email], ['phone', 'Phone', user.phone || '']].map(([key, label, value]) => <label className="block text-sm font-medium" key={key}>{label}<input className="mt-1 block w-full rounded-lg border border-slate-300 p-2" name={key} defaultValue={value} required={key === 'name' || key === 'email'} type={key === 'email' ? 'email' : 'text'} maxLength={key === 'email' ? 254 : key === 'name' ? 120 : key === 'universityId' ? 50 : 30} /></label>)}
        <div className="flex gap-3 sm:col-span-2"><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 text-white">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" onClick={() => setEditing(false)} className="rounded-lg border px-4 py-2">Cancel</button></div>
      </form> : <dl className="mt-5 grid gap-5 sm:grid-cols-2">{[['Name', user.name], ['University ID', user.universityId || '—'], ['Email', user.email], ['Phone', user.phone || '—'], ['Password', '••••••••']].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 font-medium break-all">{value}</dd></div>)}</dl>}
      {!editing && <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => { setMessage(''); setEditing(true); }} className="rounded-lg bg-blue-700 px-4 py-2 text-white">Edit profile</button><Link to="/settings#password" className="rounded-lg border px-4 py-2">Change password</Link></div>}
    </section>
  </main>;
}
