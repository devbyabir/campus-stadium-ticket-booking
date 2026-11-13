import { Link } from 'react-router-dom';

export default function Home() {
  return <main><h1>Campus Stadium Ticket Booking</h1><p>Explore campus events and reserve seats.</p><Link to="/events">Browse events</Link></main>;
}
