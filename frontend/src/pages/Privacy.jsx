import { Link } from 'react-router-dom';

export default function Privacy() {
  return <main className="page-shell"><div className="page-heading"><p className="eyebrow">DEMO PROJECT</p><h1>Privacy & data use</h1><p>Last updated 14 November 2026</p></div>
    <div className="section-card p-6 md:p-10 space-y-6 leading-relaxed">
      <p>This is a software engineering demonstration. Please do not enter real student records, sensitive personal data, or payment information.</p>
      <section><h2 className="section-title">Data this demo stores</h2><p>Accounts store name, email, university ID, optional phone number, and a one-way password hash. Bookings store event and seat selections. QR ticket hashes and gate check-in times are stored for admission checks. Admins can view booking details and issue student invitations.</p></section>
      <section><h2 className="section-title">How it is used</h2><p>Data is used to sign in, book seats, show tickets, prevent duplicate entry, and display admin summaries. Notifications and language choices are saved only on this device and do not send messages.</p></section>
      <section><h2 className="section-title">Storage and access</h2><p>The frontend and API run on Vercel; the database runs on Neon PostgreSQL. Account tokens are kept in this browser tab's session storage. Authorized administrators can access account and booking information. This demo has no automated account deletion or retention schedule.</p></section>
      <section><h2 className="section-title">Questions and removal requests</h2><p>For this public project, open a <a className="text-blue-700 underline" href="https://github.com/devbyabir/campus-stadium-ticket-booking/issues" target="_blank" rel="noreferrer">GitHub issue</a> without posting personal details. A project administrator must handle data removal manually. This notice is for the demo and must be reviewed by the institution before any real campus launch.</p></section>
      <Link className="outline-button" to="/settings">Back to settings</Link>
    </div>
  </main>;
}
