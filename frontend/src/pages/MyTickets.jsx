import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TicketQRModal from '../components/TicketQRModal.jsx';
import { fetchMyTickets } from '../services/api.js';

export default function MyTickets() {
  const [tickets, setTickets] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sessionStorage.getItem('token')) { setError('Log in to view your tickets.'); return; }
    let mounted = true;
    fetchMyTickets().then(rows => { if (mounted) setTickets(rows); }).catch(err => { if (mounted) setError(err.response?.data?.error || 'Unable to load tickets'); });
    return () => { mounted = false; };
  }, []);
  return <main className="page-shell"><h1>My tickets</h1>
    {error && <p role="alert" className="error">{error} <Link to="/login">Log in</Link></p>}
    {!tickets && !error && <p>Loading tickets…</p>}
    {tickets?.length === 0 && <p>No tickets yet. <Link to="/events">Browse events</Link></p>}
    <div className="ticket-list">{tickets?.map(ticket => <article className="ticket-card" key={ticket.ticket_id}>
      <h2>{ticket.title}</h2><p>{new Date(ticket.starts_at).toLocaleString()} · {ticket.venue}</p>
      <p>Section {ticket.section} · Row {ticket.row_number} · Seat {ticket.seat_number}</p><p>Status: {ticket.booking_status}</p>
      {ticket.booking_status === 'confirmed' && <button className="primary-button" onClick={() => setActive(ticket)}>Show QR code</button>}
    </article>)}</div>
    {active && <TicketQRModal ticket={active} onClose={() => setActive(null)} />}
  </main>;
}
