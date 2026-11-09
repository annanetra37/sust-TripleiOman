/** RFC 6238 TOTP (authenticator apps) implemented with node:crypto — no third-party dependency. */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const s = str.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0; let value = 0; const out = [];
  for (const c of s) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateSecret() { return base32Encode(crypto.randomBytes(20)); }

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1e6).padStart(6, '0');
}

function totp(secret, time = Date.now()) { return hotp(secret, Math.floor(time / 30000)); }

function verifyTotp(secret, token, window = 1) {
  if (!secret || !/^\d{6}$/.test(String(token || ''))) return false;
  const counter = Math.floor(Date.now() / 30000);
  for (let i = -window; i <= window; i++) {
    const expected = hotp(secret, counter + i);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(token)))) return true;
  }
  return false;
}

function otpauthUri(secret, email, issuer = 'Triple i Oman') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { generateSecret, totp, verifyTotp, otpauthUri, base32Encode, base32Decode };
