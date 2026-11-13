import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../services/api.js';

export default function Settings() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(localStorage.getItem('notifications') !== 'off');
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'en');
  const [privacyOpen, setPrivacyOpen] = useState(false);
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
    try { await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }); form.reset(); setPasswordMessage('Password changed successfully.'); }
    catch (error) { setPasswordError(error.response?.data?.error || 'Unable to change password.'); }
    finally { setChanging(false); }
  }
  return <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8"><header><p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Preferences</p><h1 className="text-3xl font-bold">Settings</h1></header>
    <section className="space-y-6 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold">Notifications</h2><p className="text-sm text-slate-500">Save your notification preference on this device.</p></div><label className="inline-flex items-center gap-2"><input type="checkbox" checked={notifications} onChange={e => { setNotifications(e.target.checked); localStorage.setItem('notifications', e.target.checked ? 'on' : 'off'); }} /><span>{notifications ? 'On' : 'Off'}</span></label></div>
      <div className="border-t pt-5"><label htmlFor="language" className="block font-semibold">Language</label><select id="language" value={language} onChange={e => { setLanguage(e.target.value); localStorage.setItem('language', e.target.value); }} className="mt-2 w-full rounded-lg border border-slate-300 p-2 sm:w-64"><option value="en">English</option><option value="zh">中文</option></select><p className="mt-2 text-sm text-slate-500">Full translation is not yet available.</p></div>
      <div className="border-t pt-5"><button onClick={() => setPrivacyOpen(value => !value)} aria-expanded={privacyOpen} className="font-semibold text-blue-700 underline">Privacy policy</button>{privacyOpen && <p className="mt-2 text-sm text-slate-600">The privacy policy has not been published yet. Contact the campus event administrator for data handling details.</p>}</div>
      <form id="password" onSubmit={submitPassword} className="space-y-3 border-t pt-5"><h2 className="font-semibold">Change password</h2>
        <label className="block text-sm">Current password<input name="currentPassword" type="password" autoComplete="current-password" required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
        <label className="block text-sm">New password<input name="newPassword" type="password" autoComplete="new-password" minLength="12" required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
        <label className="block text-sm">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength="12" required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
        {passwordError && <p role="alert" className="text-red-700">{passwordError}</p>}{passwordMessage && <p role="status" className="text-green-700">{passwordMessage}</p>}
        <button disabled={changing || !sessionStorage.getItem('token')} className="rounded-lg bg-blue-700 px-5 py-2 text-white disabled:opacity-50">{changing ? 'Updating…' : 'Update password'}</button>
      </form>
      <div className="border-t pt-5"><button onClick={logout} className="rounded-lg bg-red-600 px-5 py-2 font-medium text-white">Log out</button></div>
    </section>
  </main>;
}
