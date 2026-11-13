import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import StadiumIllustration from '../components/StadiumIllustration.jsx';
import { login, signup } from '../services/api.js';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = mode === 'login' ? await login(values) : await signup(values);
      sessionStorage.setItem('token', result.token);
      sessionStorage.setItem('user', JSON.stringify(result.user));
      navigate('/');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to connect to the server.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-screen"><div className="auth-layout">
    <section className="auth-intro"><BrandMark /><h1>Welcome!</h1><p>Your seat for every campus moment.</p><StadiumIllustration /></section>
    <section className="auth-panel" aria-label="Account access">
      <p className="eyebrow">CAMPUS STADIUM TICKET</p><h2>{mode === 'login' ? 'Log in to your account' : 'Create your student account'}</h2>
      <p className="muted">{mode === 'login' ? 'Explore events, book seats, and keep every ticket in one place.' : 'Join the campus community and start booking your seats.'}</p>
      <div className="auth-switch" role="group" aria-label="Account action"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Login</button><button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Sign Up</button></div>
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && <label>Full name<input name="name" autoComplete="name" placeholder="Your full name" required maxLength="120" /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@university.edu" required maxLength="254" /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Your password" required minLength={mode === 'signup' ? 12 : undefined} /></label>
        {mode === 'signup' && <p className="field-hint">Use at least 12 characters for your password.</p>}
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary-button" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'}</button>
      </form>
      <Link className="auth-help" to="/help">Need help accessing your account?</Link>
    </section>
  </div><p className="auth-credit">Developed for Software Engineering · Campus Stadium Ticket Booking</p></main>;
}
