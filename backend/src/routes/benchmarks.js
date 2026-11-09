'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// benchmarks.js — Benchmark cohort API (PCF-08)
//
//   GET  /api/benchmarks/opt-in        — current opt-in status
//   PUT  /api/benchmarks/opt-in        — set opt-in (admin only)
//   GET  /api/benchmarks/cohorts       — list all cohorts visible to this
//                                        company (requires opt-in)
//   GET  /api/benchmarks/peer          — percentile lookup for a single
//                                        company value (requires opt-in)
//   POST /api/benchmarks/recompute     — admin-only: re-run the engine now
//
// Privacy: reads and writes are both gated behind Company.benchmarkOptIn.
// A company that has opted out can neither contribute to nor see cohort
// statistics.  Withdrawal is retroactive — opting out triggers a recompute
// job that excludes the withdrawn contributor from all future cohorts.
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const benchmarkEngine = require('../services/benchmarkEngine');

router.use(authenticate);

// ─── Opt-in status ──────────────────────────────────────────────────────────

router.get('/opt-in', async (req, res) => {
  try {
    const c = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { benchmarkOptIn: true },
    });
    res.json({ optedIn: !!c?.benchmarkOptIn });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/opt-in', requireAdmin, async (req, res) => {
  try {
    const { optedIn } = req.body || {};
    if (typeof optedIn !== 'boolean') {
      return res.status(400).json({ error: 'Body must include optedIn: boolean.' });
    }

    const company = await prisma.company.update({
      where: { id: req.user.companyId },
      data: { benchmarkOptIn: optedIn },
      select: { benchmarkOptIn: true },
    });

    logActivity(
      req.user.id, req.user.companyId,
      optedIn ? 'BENCHMARK_OPT_IN' : 'BENCHMARK_OPT_OUT',
      optedIn
        ? 'Opted in to anonymous benchmark cohort'
        : 'Withdrew from benchmark cohort — data removed retroactively',
      { optedIn }, req.ip,
    );

    // Trigger an async recompute so withdrawal is immediately effective.
    // Not awaited — the UI doesn't need to wait for nightly-equivalent work.
    if (!optedIn) {
      benchmarkEngine.recomputeCohorts().catch((e) => {
        console.error('[benchmarks] recompute after opt-out failed:', e.message);
      });
    }

    res.json({ optedIn: company.benchmarkOptIn });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Cohort list ────────────────────────────────────────────────────────────

router.get('/cohorts', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { benchmarkOptIn: true, sectorSelection: { select: { sectorKey: true } } },
    });
    if (!company?.benchmarkOptIn) {
      return res.status(403).json({ error: 'Not opted in to benchmark cohorts.', optedIn: false });
    }

    const sectorKey = req.query.sector || company.sectorSelection?.sectorKey || 'generic';
    const cohorts = await prisma.benchmarkCohort.findMany({
      where: { sectorKey },
      orderBy: [{ kpiCode: 'asc' }, { region: 'asc' }],
    });

    res.json({ sectorKey, cohorts });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Peer percentile lookup ─────────────────────────────────────────────────
// Called by dashboards to show "you're in the 62nd percentile".

router.get('/peer', async (req, res) => {
  try {
    const { kpiCode, value, region } = req.query;
    if (!kpiCode || value === undefined) {
      return res.status(400).json({ error: 'kpiCode and value are required query parameters.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { benchmarkOptIn: true, sectorSelection: { select: { sectorKey: true } } },
    });
    if (!company?.benchmarkOptIn) return res.json({ available: false, reason: 'not_opted_in' });

    const sectorKey = company.sectorSelection?.sectorKey || 'generic';
    const result = await benchmarkEngine.peerPercentile({
      companyId: req.user.companyId,
      sectorKey,
      kpiCode,
      region: region || 'GLO',
      value: parseFloat(value),
    });

    if (!result) return res.json({ available: false, reason: 'cohort_too_small' });
    res.json({ available: true, sectorKey, ...result });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Admin: force recompute ─────────────────────────────────────────────────

router.post('/recompute', requireAdmin, async (req, res) => {
  try {
    const result = await benchmarkEngine.recomputeCohorts();
    logActivity(req.user.id, req.user.companyId, 'BENCHMARK_RECOMPUTE',
      `Benchmark cohorts recomputed (${result.cohortsEmitted} emitted, ${result.cohortsRemoved} removed)`,
      result, req.ip);
    res.json(result);
  } catch (err) {
    console.error('[benchmarks] recompute error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
