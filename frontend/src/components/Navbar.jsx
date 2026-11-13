import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  useLocation();
  const signedIn = Boolean(sessionStorage.getItem('token'));
  function logout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <nav aria-label="Main navigation">
      <Link to="/">Campus Stadium</Link>{' '}
      <Link to="/events">Events</Link>{' '}
      {signedIn && <Link to="/tickets">My tickets</Link>}
      {signedIn && <Link to="/profile">Profile</Link>}
      {signedIn && <Link to="/settings">Settings</Link>}
      {signedIn && JSON.parse(sessionStorage.getItem('user') || '{}').role === 'admin' && <Link to="/admin">Admin</Link>}
      {signedIn ? <button onClick={logout}>Log out</button> : <Link to="/login">Log in</Link>}
    </nav>
  );
}
