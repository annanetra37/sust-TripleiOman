const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { formatError } = require('../utils/errors');

router.use(authenticate, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { companyId: req.user.companyId },
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true,
        jobTitle: true, role: true, isActive: true, createdAt: true,
        permissions: { include: { orgUnit: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false.' });

    const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!user) return res.status(404).json({ error: 'User not found in your organization.' });

    await prisma.user.update({ where: { id: req.params.id }, data: { isActive } });
    res.json({ message: `User ${isActive ? 'activated' : 'deactivated'} successfully.` });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!user) return res.status(404).json({ error: 'User not found in your organization.' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });

    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/:id/permissions', async (req, res) => {
  try {
    const { permissions } = req.body;
    const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!user) return res.status(404).json({ error: 'User not found in your organization.' });

    await prisma.userPermission.deleteMany({ where: { userId: req.params.id } });

    if (permissions && permissions.length > 0) {
      await prisma.userPermission.createMany({
        data: permissions.map((p) => ({
          userId: req.params.id,
          orgUnitId: p.orgUnitId,
          canView: !!p.canView,
          canUpload: !!p.canUpload,
          canDelete: !!p.canDelete,
        })),
      });
    }

    res.json({ message: 'Permissions updated successfully.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
