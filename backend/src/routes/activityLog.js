const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { formatError } = require('../utils/errors');

router.use(authenticate, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const { userId, action, from, to, page, limit } = req.query;
    const take = Math.min(parseInt(limit) || 50, 200);
    const skip = ((parseInt(page) || 1) - 1) * take;

    const where = { companyId: req.user.companyId };
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { user: { select: { firstName: true, lastName: true, email: true, role: true } } },
      }),
      prisma.activityLog.count({ where }),
    ]);

    // Get distinct actions for filter dropdown
    const actions = await prisma.activityLog.findMany({
      where: { companyId: req.user.companyId },
      select: { action: true },
      distinct: ['action'],
    });

    // Get users for filter
    const users = await prisma.user.findMany({
      where: { companyId: req.user.companyId },
      select: { id: true, firstName: true, lastName: true },
    });

    res.json({ logs, total, page: Math.floor(skip / take) + 1, totalPages: Math.ceil(total / take), actions: actions.map((a) => a.action), users });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
