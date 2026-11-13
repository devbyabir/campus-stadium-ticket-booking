import { Link } from 'react-router-dom';
import BrandMark from './BrandMark.jsx';
import Icon from './Icon.jsx';

export default function BookingConfirmation({ event, seats, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" onMouseDown={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close">×</button><BrandMark /><h2 id="confirmation-title">Booking Confirmed!</h2><span className="success-icon"><Icon name="check" size={45} /></span>
    <div className="confirmation-details"><h3>{event.title}</h3><p>{new Date(event.starts_at).toLocaleDateString(undefined, { dateStyle: 'long' })}</p><p>{event.venue}</p><hr /><p><strong>Seats:</strong> {seats.map(s => `${s.section} · Row ${s.row_number} · Seat ${s.seat_number}`).join(', ')}</p></div>
    <p className="muted">Your tickets are available in My Tickets.</p><Link className="primary-button" to="/tickets">View My Tickets</Link>
  </section></div>;
}
