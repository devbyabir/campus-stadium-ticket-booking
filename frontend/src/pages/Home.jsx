import { Link } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import Icon from '../components/Icon.jsx';
import StadiumIllustration from '../components/StadiumIllustration.jsx';

export default function Home() {
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const actions = [
    { title: 'Book Tickets', icon: 'ticket', to: '/events' },
    { title: 'Upcoming Events', icon: 'calendar', to: '/events' },
    { title: 'My Tickets', icon: 'ticket', to: '/tickets' },
    { title: 'Settings', icon: 'settings', to: '/settings' },
  ];

  return <main className="home-screen page-shell">
    <div className="home-identity"><p className="university-label">ZHENGZHOU UNIVERSITY</p><BrandMark /><h1>Campus Stadium Ticket</h1><p className="home-welcome">{firstName ? `Welcome back, ${firstName}!` : 'Welcome to your campus stadium!'}</p><div className="home-stadium"><StadiumIllustration /></div></div>
    <div className="home-action-grid">{actions.map(action => <Link className="home-action" to={action.to} key={action.title}><Icon name={action.icon} size={39} /><span>{action.title}</span></Link>)}</div>
    <p className="home-footnote">Every campus moment starts with a seat.</p>
    <Link className="home-help-link" to="/help"><Icon name="help" size={17} /> Help &amp; Support</Link>
  </main>;
}
