import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import BrandMark from './BrandMark.jsx';
import Icon from './Icon.jsx';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const signedIn = Boolean(sessionStorage.getItem('token'));
  const user = signedIn ? JSON.parse(sessionStorage.getItem('user') || '{}') : null;
  const onAuthPage = location.pathname === '/login';

  function logout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    navigate('/login');
  }

  return <>
    {!onAuthPage && <header className="site-header"><div className="site-header-inner">
      <Link className="site-brand" to="/"><BrandMark small /><span><strong>Campus Stadium</strong><small>ZHENGZHOU UNIVERSITY</small></span></Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        <NavLink to="/" end>Home</NavLink><NavLink to="/events">Events</NavLink>
        {signedIn && <NavLink to="/tickets">My Tickets</NavLink>}
        {signedIn && <NavLink to="/profile">Profile</NavLink>}
        {signedIn && <NavLink to="/settings">Settings</NavLink>}
        {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      {signedIn ? <button className="header-account" onClick={logout}>Log out</button> : <Link className="header-account" to="/login">Log in</Link>}
    </div></header>}
    {!onAuthPage && <nav className="bottom-nav" aria-label="Mobile navigation">
      <NavLink to="/" end><Icon name="home" size={23} /><span>Home</span></NavLink>
      <NavLink to="/events"><Icon name="calendar" size={23} /><span>Events</span></NavLink>
      <NavLink to="/tickets"><Icon name="ticket" size={23} /><span>My Tickets</span></NavLink>
      <NavLink to={signedIn ? '/profile' : '/login'}><Icon name="user" size={23} /><span>Profile</span></NavLink>
    </nav>}
  </>;
}
