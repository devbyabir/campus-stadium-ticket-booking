import { QRCodeSVG } from 'qrcode.react';
export default function TicketQRModal({ ticket, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" onMouseDown={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
    <p className="eyebrow">YOUR ENTRY PASS</p><h2 id="qr-title">{ticket.title}</h2><p>{new Date(ticket.starts_at).toLocaleDateString(undefined, { dateStyle: 'medium' })} · {ticket.venue}</p><p className="qr-seat">Section {ticket.section} · Row {ticket.row_number} · Seat {ticket.seat_number}</p>
    <div className="qr-code-frame"><QRCodeSVG value={ticket.qrCode} size={220} level="M" marginSize={2} title="Ticket QR code" /></div><p className="muted">{ticket.redeemed_at ? 'Already used at the gate' : 'Scan this code at the gate'}</p>
  </section></div>;
}
