import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BookingConfirmation from '../components/BookingConfirmation.jsx';
import { confirmBooking, fetchEventSeats } from '../services/api.js';

export default function SeatMap() {
  const { eventId } = useParams();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [confirmed, setConfirmed] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchEventSeats(eventId).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.response?.data?.error || 'Unable to load seats'); });
    return () => { active = false; };
  }, [eventId]);

  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 20 ? [...current, id] : current);
  }

  async function book() {
    if (!sessionStorage.getItem('token')) { setError('Log in to book seats.'); return; }
    setBusy(true); setError('');
    const chosen = data.seats.filter(seat => selected.includes(seat.id));
    try {
      await confirmBooking(eventId, selected);
      setConfirmed(chosen); setSelected([]);
      setData(current => ({ ...current, seats: current.seats.map(seat => chosen.some(item => item.id === seat.id) ? { ...seat, status: 'booked' } : seat) }));
    } catch (err) {
      setError(err.response?.data?.error || 'Booking failed. Please try again.');
      if (err.response?.status === 409) {
        try { setData(await fetchEventSeats(eventId)); setSelected([]); } catch { /* Keep the booking error visible. */ }
      }
    } finally { setBusy(false); }
  }

  return <main className="page-shell"><Link to="/events">← Events</Link>
    <h1>{data?.event.title || 'Choose your seats'}</h1>
    {data && <p>{new Date(data.event.starts_at).toLocaleString()} · {data.event.venue}</p>}
    {error && <p role="alert" className="error">{error} {error.includes('Log in') && <Link to="/login">Log in</Link>}</p>}
    {!data && !error && <p>Loading seats…</p>}
    {data && <><div className="seat-legend"><span className="legend available" /> Available <span className="legend selected" /> Selected <span className="legend booked" /> Booked</div>
      <div className="sections">{['A', 'B', 'C', 'D'].map(section => <section className="section-card" key={section}>
        <h2>Section {section}</h2><div className="seat-grid">{data.seats.filter(seat => seat.section === section).map(seat => <button key={seat.id} type="button" disabled={seat.status === 'booked' || busy} aria-pressed={selected.includes(seat.id)} aria-label={`Section ${section}, row ${seat.row_number}, seat ${seat.seat_number}, ${seat.status === 'booked' ? 'booked' : selected.includes(seat.id) ? 'selected' : 'available'}`} title={`Row ${seat.row_number}, Seat ${seat.seat_number}`} className={`seat ${seat.status === 'booked' ? 'booked' : selected.includes(seat.id) ? 'selected' : 'available'}`} onClick={() => toggle(seat.id)}>{seat.row_number}-{seat.seat_number}</button>)}</div>
        {!data.seats.some(seat => seat.section === section) && <p>No seats listed.</p>}
      </section>)}</div><div className="booking-bar"><span>{selected.length} seat{selected.length === 1 ? '' : 's'} selected</span><button className="primary-button" disabled={!selected.length || busy} onClick={book}>{busy ? 'Confirming…' : 'Confirm booking'}</button></div>
    </>}
    {confirmed && <BookingConfirmation event={data.event} seats={confirmed} onClose={() => setConfirmed(null)} />}
  </main>;
}
