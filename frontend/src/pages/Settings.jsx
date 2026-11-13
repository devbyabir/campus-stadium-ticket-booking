import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { changePassword } from '../services/api.js';

export default function Settings() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(localStorage.getItem('notifications') !== 'off');
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'en');
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [changing, setChanging] = useState(false);
  function logout() { sessionStorage.removeItem('token'); sessionStorage.removeItem('user'); navigate('/login'); }
  async function submitPassword(event) {
    event.preventDefault(); setPasswordError(''); setPasswordMessage('');
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) { setPasswordError('New passwords do not match.'); return; }
    setChanging(true);
    try { await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }); form.reset(); sessionStorage.removeItem('token'); sessionStorage.removeItem('user'); navigate('/login'); }
    catch (error) { setPasswordError(error.response?.data?.error || 'Unable to change password.'); }
    finally { setChanging(false); }
  }
  return <main className="page-shell settings-page"><div className="page-heading"><p className="eyebrow">YOUR PREFERENCES</p><h1>Settings</h1><p>Make your campus experience your own.</p></div>
    <div className="settings-layout"><div className="settings-list">
      <section className="settings-row"><span className="settings-icon"><Icon name="bell" /></span><div><h2>Notifications</h2><p>Save your preference on this device</p></div><label className="switch"><input type="checkbox" checked={notifications} onChange={e => { setNotifications(e.target.checked); localStorage.setItem('notifications', e.target.checked ? 'on' : 'off'); }} /><span aria-hidden="true" /></label></section>
      <section className="settings-row settings-language"><span className="settings-icon"><Icon name="globe" /></span><div><h2>Language</h2><p>Choose your preferred language</p></div><div className="language-switch" role="group" aria-label="Language"><button className={language === 'en' ? 'active' : ''} onClick={() => { setLanguage('en'); localStorage.setItem('language', 'en'); }}>English</button><button className={language === 'zh' ? 'active' : ''} onClick={() => { setLanguage('zh'); localStorage.setItem('language', 'zh'); }}>中文</button></div></section>
      <p className="field-hint settings-hint">Full translation is not available yet.</p>
      <Link className="settings-row settings-row-click" to="/privacy"><span className="settings-icon"><Icon name="lock" /></span><div><h2>Privacy &amp; data use</h2></div><Icon name="arrow" /></Link>
      <Link className="settings-row settings-row-click" to="/help"><span className="settings-icon"><Icon name="help" /></span><div><h2>Help &amp; Support</h2></div><Icon name="arrow" /></Link>
      <button className="settings-row settings-row-click settings-logout" onClick={logout}><span className="settings-icon"><Icon name="logout" /></span><div><h2>Logout</h2></div><Icon name="arrow" /></button>
    </div><section className="password-panel" id="password"><h2>Change Password</h2><p className="muted">Keep your account secure with a new password.</p>
      <form onSubmit={submitPassword}><label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength="12" required /></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength="12" required /></label>
        {passwordError && <p role="alert" className="error">{passwordError}</p>}{passwordMessage && <p role="status" className="success-text">{passwordMessage}</p>}
        <button disabled={changing || !sessionStorage.getItem('token')} className="primary-button">{changing ? 'Updating…' : 'Update Password'}</button>
      </form></section></div>
  </main>;
}
