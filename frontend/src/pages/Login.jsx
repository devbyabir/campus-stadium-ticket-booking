import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
      setError(requestError.response?.data?.error || 'Unable to connect to the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{mode === 'login' ? 'Log in' : 'Student sign up'}</h1>
      <form onSubmit={submit}>
        {mode === 'signup' && <label>Name <input name="name" required maxLength="120" /></label>}
        <label>Email <input name="email" type="email" required maxLength="254" /></label>
        <label>Password <input name="password" type="password" required minLength={mode === 'signup' ? 12 : undefined} /></label>
        <button disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => { setError(''); setMode(mode === 'login' ? 'signup' : 'login'); }}>
        {mode === 'login' ? 'Create an account' : 'Already have an account? Log in'}
      </button>
      <p><Link to="/">Back to home</Link></p>
    </main>
  );
}
