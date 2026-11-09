/**
 * Submission adapter for Fawtara via a partner Accredited Service Provider (plan §5.5, E5-03).
 * The interface lets us switch from the sandbox to a real ASP (and later to our own access point)
 * without touching the rest of the app.
 */
const crypto = require('crypto');
const config = require('../config');

const sandbox = {
  name: 'sandbox',
  async send({ xml, idempotencyKey, buyer }) {
    const messageId = `SBX-${crypto.createHash('sha1').update(idempotencyKey).digest('hex').slice(0, 16).toUpperCase()}`;
    if (String(buyer?.peppolId || '').toLowerCase().includes('reject')) {
      return { messageId, status: 'REJECTED', reason: 'Receiver not found in the Fawtara SMP directory (sandbox simulation).' };
    }
    if (!xml.includes('<cbc:CustomizationID>')) return { messageId, status: 'REJECTED', reason: 'Missing CustomizationID' };
    return { messageId, status: 'ACCEPTED', reason: null };
  },
  async lookup(participantId) {
    return { participantId, registered: !String(participantId || '').toLowerCase().includes('reject'), simulated: true };
  },
};

const http = {
  name: 'http',
  async send({ xml, idempotencyKey }) {
    const res = await fetch(`${config.asp.baseUrl.replace(/\/$/, '')}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', Authorization: `Bearer ${config.asp.apiKey}`, 'Idempotency-Key': idempotencyKey },
      body: xml,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { messageId: body.id || null, status: 'REJECTED', reason: body.error || `ASP HTTP ${res.status}` };
    return { messageId: body.id || body.messageId, status: (body.status || 'SENT').toUpperCase(), reason: null };
  },
  async lookup(participantId) {
    const res = await fetch(`${config.asp.baseUrl.replace(/\/$/, '')}/participants/${encodeURIComponent(participantId)}`, { headers: { Authorization: `Bearer ${config.asp.apiKey}` } });
    return { participantId, registered: res.ok };
  },
};

function adapter() { return config.asp.provider === 'http' && config.asp.baseUrl ? http : sandbox; }

module.exports = { adapter };
