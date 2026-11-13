import { QRCodeSVG } from 'qrcode.react';
export default function TicketQRModal({ ticket, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" onMouseDown={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
    <h2 id="qr-title">{ticket.title}</h2><p>Section {ticket.section} · Row {ticket.row_number} · Seat {ticket.seat_number}</p>
    <QRCodeSVG value={ticket.qr_code_hash} size={220} level="M" marginSize={2} title="Ticket QR code" /><p>Show this code at the gate.</p>
  </section></div>;
}
