import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import Icon from '../components/Icon.jsx';
import { fetchEvents } from '../services/api.js';

function eventIcon(title) {
  const value = title.toLowerCase();
  if (/sport|football|basketball|game/.test(value)) return 'sport';
  if (/music|art|concert|fest/.test(value)) return 'music';
  if (/convocation|graduation|founder/.test(value)) return 'graduation';
  return 'calendar';
}

export default function Events() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchEvents().then(rows => { if (active) setEvents(rows); }).catch(err => { if (active) setError(err.response?.data?.error || 'Unable to load events.'); });
    return () => { active = false; };
  }, []);

  return <main className="page-shell events-page">
    <div className="page-heading centered-heading"><BrandMark /><p className="eyebrow">CAMPUS LIFE</p><h1>Upcoming Events</h1><p>Find your next campus moment and choose the seat that feels right.</p></div>
    {error && <div className="empty-panel"><Icon name="calendar" size={38} /><h2>Events unavailable</h2><p role="alert">{error}</p><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></div>}
    {!events && !error && <div className="empty-panel"><p>Loading campus events…</p></div>}
    {events?.length === 0 && <div className="empty-panel"><span className="empty-icon"><Icon name="calendar" size={40} /></span><h2>New events are on the way</h2><p>No upcoming events have been published yet. Check back soon for the next campus celebration.</p><Link className="outline-button" to="/">Back to home</Link></div>}
    <div className="event-grid">{events?.map(event => <article className="event-card" key={event.id}>
      <span className="event-card-icon"><Icon name={eventIcon(event.title)} size={37} /></span><div className="event-card-copy"><h2>{event.title}</h2><p className="event-date">{new Date(event.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {event.venue}</p>{event.description && <p className="event-description">{event.description}</p>}</div><Link className="event-card-link" to={`/events/${event.id}/seats`} aria-label={`Choose seats for ${event.title}`}><Icon name="arrow" /></Link>
    </article>)}</div>
  </main>;
}
