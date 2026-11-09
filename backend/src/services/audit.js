/**
 * Append-only, hash-chained audit log (plan E0-07).
 * hash = SHA-256(prevHash | canonical JSON of the entry). Any edit or deletion breaks the chain,
 * which `verifyChain` detects. Writes are serialised with a Postgres advisory lock.
 */
const crypto = require('crypto');
const prisma = require('../config/prisma');

const GENESIS = '0'.repeat(64);
const LOCK_KEY = 794251; // arbitrary constant for pg_advisory_xact_lock

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function canonical(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const hashObject = (obj) => (obj === undefined || obj === null ? null : sha256(canonical(obj)));

function entryPayload(e) {
  return canonical({
    organisationId: e.organisationId || null,
    actorId: e.actorId || null,
    action: e.action,
    objectType: e.objectType || null,
    objectId: e.objectId || null,
    beforeHash: e.beforeHash || null,
    afterHash: e.afterHash || null,
    details: e.details || {},
    createdAt: e.createdAt.toISOString(),
  });
}

/**
 * Record an audit event.
 * @param {object} p { req?, organisationId?, actor?, action, objectType?, objectId?, before?, after?, details? }
 */
async function record(p) {
  const req = p.req;
  const actor = p.actor || req?.user;
  const createdAt = new Date();
  const entry = {
    organisationId: p.organisationId ?? req?.org?.id ?? null,
    actorId: actor?.id || null,
    actorLabel: actor ? `${actor.fullName || ''} <${actor.email || ''}>${req?.actingAs ? ` (${req.actingAs})` : ''}` : 'system',
    action: p.action,
    objectType: p.objectType || null,
    objectId: p.objectId ? String(p.objectId) : null,
    beforeHash: hashObject(p.before),
    afterHash: hashObject(p.after),
    details: JSON.parse(JSON.stringify(p.details || {}, (_, v) => (typeof v === 'bigint' ? Number(v) : v))),
    ip: req?.ip || null,
    userAgent: req?.headers?.['user-agent']?.slice(0, 300) || null,
    createdAt,
  };
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
    const last = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash || GENESIS;
    const hash = sha256(`${prevHash}|${entryPayload(entry)}`);
    return tx.auditLog.create({ data: { ...entry, prevHash, hash } });
  });
}

/** Fire-and-forget variant for non-critical events — never breaks the request. */
function recordAsync(p) {
  record(p).catch((err) => console.error('[audit] failed to record', p.action, err.message));
}

/** Verify the whole chain (or until `limit`). Returns { valid, checked, brokenAt? }. */
async function verifyChain({ batch = 1000 } = {}) {
  let prevHash = GENESIS;
  let checked = 0;
  let cursor = null;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      orderBy: { seq: 'asc' },
      take: batch,
      ...(cursor ? { skip: 1, cursor: { seq: cursor } } : {}),
    });
    if (!rows.length) break;
    for (const r of rows) {
      const expected = sha256(`${prevHash}|${entryPayload(r)}`);
      if (r.prevHash !== prevHash || r.hash !== expected) {
        return { valid: false, checked, brokenAt: Number(r.seq) };
      }
      prevHash = r.hash;
      checked++;
    }
    cursor = rows[rows.length - 1].seq;
  }
  return { valid: true, checked, head: prevHash };
}

module.exports = { record, recordAsync, verifyChain, hashObject, sha256, canonical };
