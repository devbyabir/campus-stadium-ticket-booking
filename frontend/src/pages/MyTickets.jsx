import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import Icon from '../components/Icon.jsx';
import TicketQRModal from '../components/TicketQRModal.jsx';
import { fetchMyTickets } from '../services/api.js';

export default function MyTickets() {
  const [tickets, setTickets] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sessionStorage.getItem('token')) { setError('Log in to view your tickets.'); return; }
    let mounted = true;
    fetchMyTickets().then(rows => { if (mounted) setTickets(rows); }).catch(err => { if (mounted) setError(err.response?.data?.error || 'Unable to load tickets.'); });
    return () => { mounted = false; };
  }, []);

  return <main className="page-shell tickets-page"><div className="page-heading centered-heading"><BrandMark /><p className="eyebrow">YOUR BOOKINGS</p><h1>My Tickets</h1><p>All your campus moments, ready at the gate.</p></div>
    {error && <div className="empty-panel"><Icon name="ticket" size={38} /><p role="alert">{error}</p><Link className="primary-button" to="/login">Log in</Link></div>}
    {!tickets && !error && <div className="empty-panel">Loading your tickets…</div>}
    {tickets?.length === 0 && <div className="empty-panel"><span className="empty-icon"><Icon name="ticket" size={40} /></span><h2>No tickets yet</h2><p>Once you book a seat, your ticket and QR code will appear here.</p><Link className="primary-button" to="/events">Browse Events</Link></div>}
    <div className="ticket-list">{tickets?.map(ticket => <article className="ticket-card" key={ticket.ticket_id}>
      <span className="ticket-card-icon"><Icon name="ticket" size={32} /></span><div className="ticket-card-copy"><h2>{ticket.title}</h2><p>{new Date(ticket.starts_at).toLocaleDateString(undefined, { dateStyle: 'medium' })} · {ticket.venue}</p><p>Section {ticket.section} · Row {ticket.row_number} · Seat {ticket.seat_number}</p></div>
      {ticket.booking_status === 'confirmed' ? <button className="ticket-qr-button" onClick={() => setActive(ticket)} aria-label={`Show QR code for ${ticket.title}`}><Icon name="ticket" size={21} /><span>View QR</span></button> : <span className="ticket-status">{ticket.booking_status}</span>}
    </article>)}</div>
    {active && <TicketQRModal ticket={active} onClose={() => setActive(null)} />}
  </main>;
}
