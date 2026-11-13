import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchEvents } from '../services/api.js';

export default function Events() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchEvents().then(rows => { if (active) setEvents(rows); }).catch(err => { if (active) setError(err.response?.data?.error || 'Unable to load events'); });
    return () => { active = false; };
  }, []);
  return <main className="page-shell"><h1>Upcoming events</h1>
    {error && <p role="alert" className="error">{error}</p>}
    {!events && !error && <p>Loading events…</p>}
    {events?.length === 0 && <p>No upcoming events yet.</p>}
    <div className="ticket-list">{events?.map(event => <article className="ticket-card" key={event.id}>
      <h2>{event.title}</h2><p>{new Date(event.starts_at).toLocaleString()} · {event.venue}</p>
      {event.description && <p>{event.description}</p>}
      <Link className="primary-link" to={`/events/${event.id}/seats`}>Choose seats</Link>
    </article>)}</div>
  </main>;
}
