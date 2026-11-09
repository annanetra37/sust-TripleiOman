/**
 * Preparation Guide ("Where to Start") — persistence for the per-topic
 * onboarding wizard. The question/checklist definitions live in the
 * frontend (config/preparationGuide.js); this route only stores each
 * company's answers and ticked checklist items so the plan is shared
 * across users of the same company.
 */
const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');

router.use(authenticate);

const TOPICS = ['e1', 's1', 'g1', 'pcf', 'isoBridge', 'reports'];

router.get('/', async (req, res) => {
  try {
    const plans = await prisma.preparationPlan.findMany({
      where: { companyId: req.user.companyId },
    });
    res.json({ plans });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    if (!TOPICS.includes(topic)) {
      return res.status(400).json({ error: `Unknown topic. One of: ${TOPICS.join(', ')}` });
    }
    const { answers, checkedItems } = req.body;

    const plan = await prisma.preparationPlan.upsert({
      where: { companyId_topic: { companyId: req.user.companyId, topic } },
      create: {
        companyId: req.user.companyId,
        topic,
        answers: answers || {},
        checkedItems: Array.isArray(checkedItems) ? checkedItems : [],
        updatedById: req.user.id,
      },
      update: {
        ...(answers !== undefined ? { answers } : {}),
        ...(Array.isArray(checkedItems) ? { checkedItems } : {}),
        updatedById: req.user.id,
      },
    });

    res.json({ plan });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/:topic', async (req, res) => {
  try {
    await prisma.preparationPlan.deleteMany({
      where: { companyId: req.user.companyId, topic: req.params.topic },
    });
    logActivity(req.user.id, req.user.companyId, 'PREPARE_RESET', `Reset preparation plan for ${req.params.topic}`, { topic: req.params.topic }, req.ip);
    res.json({ message: 'Plan reset' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
