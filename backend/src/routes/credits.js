const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const estimator = require('../utils/estimator');
const { STANDARDS, validateReportData } = require('../services/standardRegistry');
const { formatError } = require('../utils/errors');

router.use(authenticate);

// Strip internal pricing details (USD, model, heuristic flags) from an
// estimate before returning it to the client.  The USD value is still used
// internally for CostLog / audit logs — but it must never reach the UI.
const SAFE_BREAKDOWN_KEYS = new Set([
  'fileCount', 'rowCount', 'sheetCount', 'batches',
  'topicCount', 'topicsWithData', 'disclosuresWithData', 'disclosuresMissing',
  'narrativeCount', 'year', 'standard',
]);
function publicEstimate(est) {
  const safe = {};
  for (const [k, v] of Object.entries(est.breakdown || {})) {
    if (SAFE_BREAKDOWN_KEYS.has(k)) safe[k] = v;
  }
  return { credits: est.credits, breakdown: safe };
}

// ─── Current balance ────────────────────────────────────────
router.get('/balance', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.user.companyId },
    select: { creditBalance: true },
  });
  res.json({
    balance: company?.creditBalance ?? 0,
  });
});

// ─── Preview estimate for any supported action ──────────────
// Body: { action: 'doc-extract'|'excel-e1'|'excel-s1'|'report-gen', params: {...} }
// Returns: { credits, breakdown, balance, sufficient, remainingAfter }
// Internal pricing details (USD, model, heuristics) are scrubbed before
// responding — the client never sees them.
router.post('/estimate', async (req, res) => {
  try {
    const { action, params = {} } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action is required' });

    let estimate;
    switch (action) {
      case 'doc-extract':
        estimate = estimator.estimateDocExtract(params);
        break;

      case 'excel-e1':
      case 'excel-s1':
      case 'excel-g1':
        estimate = estimator.estimateExcelETL(params);
        break;

      case 'cert-extract':
        estimate = estimator.estimateCertExtract(params);
        break;

      case 'disclosure-draft':
        estimate = estimator.estimateDisclosureDraft(params);
        break;

      case 'reverse-export':
        estimate = estimator.estimateReverseExport(params);
        break;

      case 'report-gen': {
        const { year, standard, topics } = params;
        if (!year || !standard) {
          return res.status(400).json({ error: 'year and standard are required for report-gen' });
        }
        const std = STANDARDS[standard];
        if (!std) return res.status(400).json({ error: `Unknown standard: ${standard}` });
        const selectedTopics = topics && topics.length ? topics : Object.keys(std.topics);
        const validation = await validateReportData(
          prisma, req.user.companyId, parseInt(year), standard, selectedTopics,
        );
        estimate = estimator.estimateReport({ validation });
        estimate.breakdown.year = parseInt(year);
        estimate.breakdown.standard = standard;
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { creditBalance: true },
    });
    const balance = company?.creditBalance ?? 0;

    res.json({
      action,
      ...publicEstimate(estimate),
      balance,
      sufficient: balance >= estimate.credits,
      remainingAfter: Math.max(0, balance - estimate.credits),
    });
  } catch (err) {
    console.error('Credits estimate error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
