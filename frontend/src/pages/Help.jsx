import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

const questions = [
  ['How do I book a ticket?', 'Open Upcoming Events, choose an event, select available seats, and confirm your booking. Your QR ticket will appear in My Tickets.'],
  ['Can I cancel my booking?', 'Self-service cancellation is not available yet. Please contact the campus event administrator for help.'],
  ['How do I change language?', 'Open Settings and choose English or 中文. Full translation is still in progress.'],
  ['Where can I find my QR code?', 'Open My Tickets and select View QR on a confirmed ticket. Show the code at the gate.'],
];

export default function Help() {
  const [open, setOpen] = useState(null);
  return <main className="page-shell help-page"><Link className="back-link" to="/"><Icon name="back" size={18} /> Home</Link><div className="page-heading"><p className="eyebrow">WE'RE HERE TO HELP</p><h1>Help &amp; Support</h1><p>Answers to the most common campus ticket questions.</p></div>
    <div className="help-hero"><span><Icon name="help" size={55} /></span><div><h2>Need a hand?</h2><p>Find answers below or contact your campus event administrator.</p></div></div>
    <h2 className="section-title">Frequently Asked Questions</h2><div className="faq-list">{questions.map(([question, answer], index) => <section className="faq-item" key={question}><button aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>{question}<Icon name="arrow" size={20} /></button>{open === index && <p>{answer}</p>}</section>)}</div>
    <h2 className="section-title">Contact Support</h2><p className="muted">For account or booking help, contact your campus event administrator through your university's official support channel.</p>
  </main>;
}
