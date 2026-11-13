import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BookingConfirmation from '../components/BookingConfirmation.jsx';
import Icon from '../components/Icon.jsx';
import { confirmBooking, fetchEventSeats } from '../services/api.js';

const sections = ['A', 'B', 'C', 'D'];

export default function SeatMap() {
  const { eventId } = useParams();
  const [data, setData] = useState(null);
  const [section, setSection] = useState('A');
  const [selected, setSelected] = useState([]);
  const [confirmed, setConfirmed] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchEventSeats(eventId).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.response?.data?.error || 'Unable to load seats.'); });
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

  const visibleSeats = data?.seats.filter(seat => seat.section === section) || [];
  const chosenSeats = data?.seats.filter(seat => selected.includes(seat.id)) || [];

  return <main className="page-shell seat-page"><Link className="back-link" to="/events"><Icon name="back" size={18} /> Upcoming events</Link>
    <div className="page-heading"><p className="eyebrow">CHOOSE YOUR PLACE</p><h1>{data?.event.title || 'Select your seats'}</h1>{data && <p>{new Date(data.event.starts_at).toLocaleString()} · {data.event.venue}</p>}</div>
    {error && <p role="alert" className="error-banner">{error} {error.includes('Log in') && <Link to="/login">Log in</Link>}</p>}
    {!data && !error && <div className="empty-panel">Loading seat map…</div>}
    {data && <div className="seat-layout"><section className="stadium-panel" aria-label="Stadium section map">
      <div className="stadium-map"><div className="stadium-ring"><div className="stadium-track"><div className="stadium-field"><span>STADIUM FIELD</span></div></div></div>
        {sections.map((code, index) => <button key={code} type="button" className={`map-section map-section-${index} ${section === code ? 'active' : ''}`} onClick={() => setSection(code)} aria-pressed={section === code} aria-label={`View section ${code}`}>{code}</button>)}
      </div><div className="seat-legend"><span><i className="legend available" /> Available</span><span><i className="legend selected" /> Selected</span><span><i className="legend booked" /> Booked</span></div>
    </section><section className="section-card seat-picker"><div className="section-heading"><div><p className="eyebrow">SEAT SELECTION</p><h2>Section {section}</h2></div><span>{visibleSeats.filter(seat => seat.status === 'available').length} available</span></div>
      {visibleSeats.length ? <div className="seat-grid">{visibleSeats.map(seat => <button key={seat.id} type="button" disabled={seat.status === 'booked' || busy} aria-pressed={selected.includes(seat.id)} aria-label={`Section ${section}, row ${seat.row_number}, seat ${seat.seat_number}, ${seat.status === 'booked' ? 'booked' : selected.includes(seat.id) ? 'selected' : 'available'}`} title={`Row ${seat.row_number}, Seat ${seat.seat_number}`} className={`seat ${seat.status === 'booked' ? 'booked' : selected.includes(seat.id) ? 'selected' : 'available'}`} onClick={() => toggle(seat.id)}>{seat.row_number}-{seat.seat_number}</button>)}</div> : <p className="muted">No seats are listed in this section yet.</p>}
    </section></div>}
    {data && <div className="booking-bar"><div><strong>{selected.length ? `${selected.length} seat${selected.length === 1 ? '' : 's'} selected` : 'No seats selected'}</strong><p>{chosenSeats.length ? chosenSeats.map(seat => `${seat.section} · Row ${seat.row_number} · Seat ${seat.seat_number}`).join(', ') : 'Tap an available seat to continue.'}</p></div><button className="primary-button" disabled={!selected.length || busy} onClick={book}>{busy ? 'Confirming…' : 'Confirm Seat'}</button></div>}
    {confirmed && <BookingConfirmation event={data.event} seats={confirmed} onClose={() => setConfirmed(null)} />}
  </main>;
}
