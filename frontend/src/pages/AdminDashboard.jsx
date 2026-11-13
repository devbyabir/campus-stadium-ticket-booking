import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import { addAdminSeats, createAdminEvent, createAdminInvite, fetchAdminBookings, fetchAdminStats, fetchEvents, fetchUnverifiedStudents, redeemAdminTicket, verifyAdminStudent } from '../services/api.js';

const errorText = error => error.response?.data?.error || 'The request failed. Please try again.';
const input = 'w-full rounded-xl border border-slate-300 px-3 py-2';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [events, setEvents] = useState([]);
  const [unverified, setUnverified] = useState([]);
  const [panel, setPanel] = useState('event');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [summary, bookingRows, eventRows, students] = await Promise.all([fetchAdminStats(), fetchAdminBookings(), fetchEvents(), fetchUnverifiedStudents()]);
    setStats(summary); setBookings(bookingRows); setEvents(eventRows); setUnverified(students);
  }
  useEffect(() => {
    if (user?.role !== 'admin') return;
    let mounted = true;
    Promise.all([fetchAdminStats(), fetchAdminBookings(), fetchEvents(), fetchUnverifiedStudents()]).then(([summary, bookingRows, eventRows, students]) => {
      if (mounted) { setStats(summary); setBookings(bookingRows); setEvents(eventRows); setUnverified(students); }
    }).catch(err => { if (mounted) setError(errorText(err)); });
    return () => { mounted = false; };
  }, [user?.role]);

  async function submit(event, operation) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = event.currentTarget;
    try {
      const result = await operation(Object.fromEntries(new FormData(form)));
      form.reset();
      if (result?.code) setInviteCode(result.code);
      setNotice(result?.message || 'Saved successfully.');
      await refresh();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  if (user?.role !== 'admin' || !sessionStorage.getItem('token')) return <main className="page-shell"><div className="empty-panel"><h1>Admin Dashboard</h1><p>Admin access is required.</p><Link className="primary-button" to="/login">Log in</Link></div></main>;

  return <main className="page-shell admin-page">
    <div className="admin-heading"><BrandMark small /><div><p className="eyebrow">CAMPUS STADIUM</p><h1>Admin Dashboard</h1></div></div>
    <section><h2 className="section-title">Summary</h2><div className="admin-stats">{[['Total Events', stats?.totalEvents], ['Total Bookings', stats?.totalBookings], ['Active Users', stats?.activeUsers]].map(([label, value]) => <div className="admin-stat" key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}</div><p className="field-hint">Active users booked in the last 30 days.</p></section>
    <section className="mt-10"><h2 className="section-title">Manage</h2><div className="flex flex-wrap gap-3 mb-5">{[['event', 'Add Event'], ['bookings', 'Bookings'], ['seats', 'Seats & Layout'], ['invites', 'Student Invites'], ['students', 'Verify Students'], ['gate', 'Gate Check-in']].map(([key, label]) => <button type="button" key={key} className={panel === key ? 'primary-button' : 'outline-button'} onClick={() => { setPanel(key); setError(''); setNotice(''); }}>{label}</button>)}</div>
      {error && <p role="alert" className="error-banner">{error}</p>}{notice && <p role="status" className="success-banner">{notice}</p>}
      <div className="section-card p-5 md:p-7">
        {panel === 'event' && <form className="grid gap-4 md:grid-cols-2" onSubmit={event => submit(event, async values => { const created = await createAdminEvent({ ...values, startsAt: new Date(values.startsAt).toISOString(), endsAt: new Date(values.endsAt).toISOString(), rowsPerSection: Number(values.rowsPerSection), seatsPerRow: Number(values.seatsPerRow) }); return { message: `Created ${created.event.title} with ${created.seatCount} seats.` }; })}>
          <label>Event title<input className={input} name="title" required maxLength="200" /></label><label>Venue<input className={input} name="venue" required maxLength="200" /></label>
          <label>Starts at<input className={input} name="startsAt" type="datetime-local" required /></label><label>Ends at<input className={input} name="endsAt" type="datetime-local" required /></label>
          <label>Category<select className={input} name="category">{['sports', 'music', 'arts', 'academic', 'other'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Rows per section<input className={input} name="rowsPerSection" type="number" min="1" max="50" defaultValue="4" required /></label>
          <label>Seats per row<input className={input} name="seatsPerRow" type="number" min="1" max="100" defaultValue="8" required /></label>
          <label className="md:col-span-2">Description<textarea className={input} name="description" maxLength="2000" rows="3" /></label>
          <button className="primary-button md:col-span-2" disabled={busy}>Create event with sections A–D</button>
        </form>}
        {panel === 'bookings' && <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Booking</th><th className="p-2">Student</th><th className="p-2">Event</th><th className="p-2">Seats</th><th className="p-2">Status</th></tr></thead><tbody>{bookings.map(booking => <tr key={booking.id} className="border-t"><td className="p-2">#{booking.id}</td><td className="p-2">{booking.student_name}<br /><small>{booking.university_id || booking.email}</small></td><td className="p-2">{booking.event_title}</td><td className="p-2">{booking.seat_count}</td><td className="p-2">{booking.status}</td></tr>)}</tbody></table>{!bookings.length && <p className="muted">No bookings yet.</p>}<p className="field-hint mt-3">Showing the 100 newest bookings.</p></div>}
        {panel === 'seats' && <form className="grid gap-4 md:grid-cols-2" onSubmit={event => submit(event, async values => { const result = await addAdminSeats({ eventId: values.eventId, section: values.section, rowNumber: Number(values.rowNumber), fromSeat: Number(values.fromSeat), toSeat: Number(values.toSeat) }); return { message: `Added ${result.seatsAdded} seats.` }; })}>
          <label>Event<select className={input} name="eventId" required>{events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label><label>Section<select className={input} name="section">{['A', 'B', 'C', 'D'].map(code => <option key={code}>{code}</option>)}</select></label>
          <label>Row number<input className={input} name="rowNumber" type="number" min="1" max="100" required /></label><label>First seat<input className={input} name="fromSeat" type="number" min="1" max="200" required /></label><label>Last seat<input className={input} name="toSeat" type="number" min="1" max="200" required /></label>
          <button className="primary-button md:col-span-2" disabled={busy || !events.length}>Add available seats</button><p className="field-hint md:col-span-2">Existing or booked seats are never overwritten.</p>
        </form>}
        {panel === 'invites' && <><form className="grid gap-4 md:grid-cols-2" onSubmit={event => submit(event, async values => { setInviteCode(''); return createAdminInvite(values); })}><label>Approved student email<input className={input} name="email" type="email" required /></label><label>University ID<input className={input} name="universityId" required maxLength="50" /></label><button className="primary-button md:col-span-2" disabled={busy}>Create one-time invitation</button></form>{inviteCode && <div className="success-banner break-all"><strong>Share privately with the approved student. Expires in 7 days; shown only now:</strong><br /><code>{inviteCode}</code></div>}</>}
        {panel === 'students' && <div className="grid gap-4">{unverified.length ? unverified.map(student => <form key={student.id} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end border-b pb-4" onSubmit={event => submit(event, async values => { await verifyAdminStudent(student.id, values.universityId); return { message: `Verified ${student.name}.` }; })}><div><strong>{student.name}</strong><p className="muted">{student.email}</p></div><label>Verified University ID<input className={input} name="universityId" defaultValue={student.university_id || ''} required maxLength="50" /></label><button className="primary-button" disabled={busy}>Approve</button></form>) : <p className="muted">No students are awaiting verification.</p>}<p className="field-hint">Confirm identity against the official campus roster before approving an existing account.</p></div>}
        {panel === 'gate' && <form className="grid gap-4" onSubmit={event => submit(event, async values => { const ticket = await redeemAdminTicket(values.token.trim()); return { message: `Ticket #${ticket.ticket_id} admitted for ${ticket.event_title}.` }; })}><p className="muted">Scan with a keyboard-style QR reader or paste the token. Entry opens two hours before the event. Repeat scans are rejected.</p><label>Ticket QR token<input className={input} name="token" autoComplete="off" required /></label><button className="primary-button" disabled={busy}>Verify and admit</button></form>}
      </div>
    </section>
    <section className="mt-10"><h2 className="section-title">Analytics</h2><div className="admin-analytics"><div><h3>Monthly Bookings</h3>{stats?.monthlyBookings?.length ? stats.monthlyBookings.map(item => <p key={item.month} className="flex justify-between border-b py-2"><span>{item.month}</span><strong>{item.total}</strong></p>) : <p>No bookings yet.</p>}</div><div><h3>Top Selling Event Categories</h3>{stats?.topCategories?.length ? stats.topCategories.map(item => <p key={item.category} className="flex justify-between border-b py-2"><span className="capitalize">{item.category}</span><strong>{item.total}</strong></p>) : <p>No bookings yet.</p>}</div></div></section>
    <button className="admin-logout" onClick={() => { sessionStorage.removeItem('token'); sessionStorage.removeItem('user'); navigate('/login'); }}>Log Out</button>
  </main>;
}
