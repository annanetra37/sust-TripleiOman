const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/prisma');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(header.split(' ')[1], config.jwt.secret);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true, companyId: true, firstName: true, lastName: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Account inactive or not found' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function checkPermission(action) {
  return async (req, res, next) => {
    if (req.user.role === 'ADMIN') return next();

    const orgUnitId = req.body.orgUnitId || req.query.orgUnitId || req.params.orgUnitId;
    if (!orgUnitId) return next();

    const perm = await prisma.userPermission.findUnique({
      where: { userId_orgUnitId: { userId: req.user.id, orgUnitId } },
    });

    if (!perm || !perm[action]) {
      return res.status(403).json({ error: `Permission denied: ${action}` });
    }
    next();
  };
}

module.exports = { authenticate, requireAdmin, checkPermission };
