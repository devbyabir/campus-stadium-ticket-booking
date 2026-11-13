import { createHash, createHmac } from 'node:crypto';

export function tokenForTicket(id, version = 1) {
  const message = `${id}.${version}`;
  const signature = createHmac('sha256', process.env.QR_SECRET || process.env.JWT_SECRET)
    .update(`campus-ticket:${message}`).digest('hex');
  return `${message}.${signature}`;
}

export function hashTicketToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
