import test from 'node:test';
import assert from 'node:assert/strict';
import { hashTicketToken, tokenForTicket } from '../src/config/ticketToken.js';

test('ticket token is stable, versioned, and its stored hash is not the QR value', () => {
  process.env.JWT_SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
  const token = tokenForTicket(42, 1);
  assert.match(token, /^42\.1\.[0-9a-f]{64}$/);
  assert.equal(token, tokenForTicket(42, 1));
  assert.notEqual(token, tokenForTicket(42, 2));
  assert.notEqual(token, hashTicketToken(token));
  assert.match(hashTicketToken(token), /^[0-9a-f]{64}$/);
});
