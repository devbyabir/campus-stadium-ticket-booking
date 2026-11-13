import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import Icon from '../components/Icon.jsx';
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

  if (!sessionStorage.getItem('token') || !user) return <main className="page-shell"><div className="empty-panel"><Icon name="user" size={40} /><h1>My Profile</h1><p>Please log in to view your profile.</p><Link to="/login" className="primary-button">Log in</Link></div></main>;
  const total = tickets?.filter(ticket => ticket.booking_status === 'confirmed').length;
  const attended = tickets ? new Set(tickets.filter(ticket => ticket.redeemed_at).map(ticket => ticket.event_id)).size : null;

  return <main className="page-shell profile-page"><div className="page-heading centered-heading"><p className="university-label">ZHENGZHOU UNIVERSITY</p><BrandMark /><h1>Campus Stadium Ticket</h1></div>
    <div className="profile-layout"><section className="profile-main"><div className="profile-person"><span className="profile-avatar"><Icon name="user" size={44} /></span><div><p className="eyebrow">MY PROFILE</p><h2>{user.name}</h2><p>{user.role === 'admin' ? 'Administrator' : 'Student account'}</p></div></div>
      {error && <p role="status" className="error-banner">{error}</p>}{message && <p role="status" className="success-banner">{message}</p>}
      <section className="profile-details"><h3>Personal details</h3>{editing ? <form onSubmit={submit} className="profile-edit-form">
        {[['name', 'Name', user.name], ['phone', 'Phone', user.phone || '']].map(([key, label, value]) => <label key={key}>{label}<input name={key} defaultValue={value} required={key === 'name'} type="text" maxLength={key === 'name' ? 120 : 30} /></label>)}
        <p className="field-hint">Email and University ID are verified account identifiers. Contact the administrator to change them.</p>
        <div className="form-actions"><button disabled={saving} className="primary-button">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" onClick={() => setEditing(false)} className="outline-button">Cancel</button></div>
      </form> : <dl>{[['Name', user.name], ['University ID', user.universityId || '—'], ['Email', user.email], ['Phone Number', user.phone || '—'], ['Password', '••••••••']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</section>
    </section><aside className="profile-side"><section className="activity-section"><h3>My Activity</h3><div className="activity-grid"><div><Icon name="ticket" /><strong>{total ?? '—'}</strong><span>Total Tickets Booked</span></div><div><Icon name="calendar" /><strong>{attended ?? '—'}</strong><span>Events Attended</span></div><div><Icon name="shield" /><strong>—</strong><span>Points Earned</span></div></div><p className="field-hint">Points are not available yet.</p></section>
      {!editing && <div className="profile-actions"><button onClick={() => { setMessage(''); setEditing(true); }} className="primary-button">Edit Profile</button><Link to="/settings#password" className="primary-button">Change Password</Link></div>}
    </aside></div>
  </main>;
}
