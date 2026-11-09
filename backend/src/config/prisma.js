require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// BigInt (baisa) → JSON number. Safe: Number.MAX_SAFE_INTEGER baisa ≈ OMR 9 trillion.
if (!BigInt.prototype.toJSON) {
  // eslint-disable-next-line no-extend-native
  BigInt.prototype.toJSON = function toJSON() { return Number(this); };
}

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
