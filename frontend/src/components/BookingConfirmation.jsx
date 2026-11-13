import { Link } from 'react-router-dom';
export default function BookingConfirmation({ event, seats, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" onMouseDown={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
    <h2 id="confirmation-title">Booking confirmed</h2><p>{event.title}</p><p>{new Date(event.starts_at).toLocaleString()} · {event.venue}</p>
    <p>Seats: {seats.map(s => `${s.section} · Row ${s.row_number} · Seat ${s.seat_number}`).join(', ')}</p>
    <Link to="/tickets">View my tickets</Link>
  </section></div>;
}
