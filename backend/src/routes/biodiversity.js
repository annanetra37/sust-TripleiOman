'use strict';

const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/tier');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');

router.use(authenticate);
router.use(requireFeature('biodiversity'));

// ═══════════════════════════════════════════════════════════════════════════
// Assessments CRUD
// ═══════════════════════════════════════════════════════════════════════════

router.post('/assessments', async (req, res) => {
  try {
    const {
      siteId, year, assessmentType, leapPhase, landAreaHa, landUseChange,
      ecosystemType, directDrivers, ecosystemServices, peopleImpacts,
      accessBenefitSharing, status,
    } = req.body;

    if (!siteId || !year || !assessmentType) {
      return res.status(400).json({ error: 'siteId, year, and assessmentType are required.' });
    }

    // Verify site belongs to this company
    const site = await prisma.site.findFirst({ where: { id: siteId, companyId: req.user.companyId } });
    if (!site) return res.status(404).json({ error: 'Site not found.' });

    const assessment = await prisma.biodiversityAssessment.create({
      data: {
        companyId: req.user.companyId,
        siteId,
        year: parseInt(year),
        assessmentType,
        leapPhase: leapPhase || null,
        landAreaHa: landAreaHa != null ? parseFloat(landAreaHa) : null,
        landUseChange: landUseChange || null,
        ecosystemType: ecosystemType || null,
        directDrivers: directDrivers || null,
        ecosystemServices: ecosystemServices || null,
        peopleImpacts: peopleImpacts || null,
        accessBenefitSharing: accessBenefitSharing != null ? Boolean(accessBenefitSharing) : null,
        status: status || 'draft',
      },
    });

    logActivity(req.user.id, req.user.companyId, 'BIODIVERSITY_ASSESSMENT_CREATE', `Created ${assessmentType} assessment for site ${site.name}`, { assessmentId: assessment.id, siteId }, req.ip);
    res.status(201).json(assessment);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/assessments', async (req, res) => {
  try {
    const { year, siteId, assessmentType, status: statusFilter } = req.query;
    const where = { companyId: req.user.companyId };
    if (year) where.year = parseInt(year);
    if (siteId) where.siteId = siteId;
    if (assessmentType) where.assessmentType = assessmentType;
    if (statusFilter) where.status = statusFilter;

    const assessments = await prisma.biodiversityAssessment.findMany({
      where,
      include: { site: { select: { id: true, name: true, country: true, waterStress: true, protectedArea: true } } },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(assessments);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/assessments/:id', async (req, res) => {
  try {
    const existing = await prisma.biodiversityAssessment.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!existing) return res.status(404).json({ error: 'Assessment not found.' });

    const {
      leapPhase, landAreaHa, landUseChange, ecosystemType,
      directDrivers, ecosystemServices, peopleImpacts,
      accessBenefitSharing, status,
    } = req.body;

    const assessment = await prisma.biodiversityAssessment.update({
      where: { id: req.params.id },
      data: {
        leapPhase: leapPhase !== undefined ? leapPhase : existing.leapPhase,
        landAreaHa: landAreaHa !== undefined ? (landAreaHa != null ? parseFloat(landAreaHa) : null) : existing.landAreaHa,
        landUseChange: landUseChange !== undefined ? landUseChange : existing.landUseChange,
        ecosystemType: ecosystemType !== undefined ? ecosystemType : existing.ecosystemType,
        directDrivers: directDrivers !== undefined ? directDrivers : existing.directDrivers,
        ecosystemServices: ecosystemServices !== undefined ? ecosystemServices : existing.ecosystemServices,
        peopleImpacts: peopleImpacts !== undefined ? peopleImpacts : existing.peopleImpacts,
        accessBenefitSharing: accessBenefitSharing !== undefined ? (accessBenefitSharing != null ? Boolean(accessBenefitSharing) : null) : existing.accessBenefitSharing,
        status: status || existing.status,
      },
    });

    logActivity(req.user.id, req.user.companyId, 'BIODIVERSITY_ASSESSMENT_UPDATE', `Updated assessment ${assessment.id}`, { assessmentId: assessment.id }, req.ip);
    res.json(assessment);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TNFD-LEAP flow — per-site status + guidance
// ═══════════════════════════════════════════════════════════════════════════

const LEAP_PHASES = [
  {
    phase: 'locate',
    name: 'Locate',
    description: 'Identify the interface with nature — where are your sites in relation to ecosystems and biodiversity?',
    guidance: [
      'Map all operational sites against protected areas and key biodiversity areas (KBA)',
      'Identify ecosystem types adjacent to each site',
      'Assess water-stress levels and dependency on ecosystem services',
      'Review site-level land use and land use change history',
    ],
  },
  {
    phase: 'evaluate',
    name: 'Evaluate',
    description: 'Evaluate your dependencies and impacts on biodiversity and ecosystem services.',
    guidance: [
      'Identify direct drivers of biodiversity loss at each site (IPBES framework)',
      'Assess dependencies on ecosystem services (provisioning, regulating, cultural)',
      'Quantify land area affected and characterise land use change',
      'Evaluate water-related impacts in water-stressed areas',
    ],
  },
  {
    phase: 'assess',
    name: 'Assess',
    description: 'Assess material nature-related risks and opportunities.',
    guidance: [
      'Determine physical risks from ecosystem degradation',
      'Assess transition risks from policy and regulation changes',
      'Identify opportunities from nature-positive investments',
      'Consider impacts on indigenous peoples and local communities',
    ],
  },
  {
    phase: 'prepare',
    name: 'Prepare',
    description: 'Prepare to respond and report on nature-related issues.',
    guidance: [
      'Set nature-related targets aligned with the GBF',
      'Develop a nature transition plan',
      'Prepare TNFD-aligned disclosures',
      'Integrate findings into enterprise risk management',
    ],
  },
];

router.get('/leap/:siteId', async (req, res) => {
  try {
    const site = await prisma.site.findFirst({
      where: { id: req.params.siteId, companyId: req.user.companyId },
      include: { biodiversityAssessments: { orderBy: { year: 'desc' } } },
    });
    if (!site) return res.status(404).json({ error: 'Site not found.' });

    // Determine current LEAP progress from assessments
    const completedPhases = new Set();
    for (const a of site.biodiversityAssessments) {
      if (a.leapPhase && a.status === 'complete') {
        completedPhases.add(a.leapPhase);
      }
    }

    const phases = LEAP_PHASES.map((p) => ({
      ...p,
      status: completedPhases.has(p.phase) ? 'complete' : 'pending',
    }));

    // Current phase = first pending
    const currentPhase = phases.find((p) => p.status === 'pending')?.phase || 'complete';

    res.json({
      siteId: site.id,
      siteName: site.name,
      protectedArea: site.protectedArea,
      waterStress: site.waterStress,
      currentPhase,
      phases,
      assessmentCount: site.biodiversityAssessments.length,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════════════════════

router.get('/dashboard', async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();

    const [assessments, sites] = await Promise.all([
      prisma.biodiversityAssessment.findMany({
        where: { companyId: req.user.companyId, year },
        include: { site: { select: { id: true, name: true, country: true, protectedArea: true, waterStress: true } } },
      }),
      prisma.site.findMany({
        where: { companyId: req.user.companyId },
        select: { id: true, name: true, protectedArea: true },
      }),
    ]);

    // Sites in/near protected areas
    const sitesNearProtected = sites.filter((s) => {
      const pa = s.protectedArea;
      return pa && (pa.inProtectedArea || (pa.nearbyAreas && pa.nearbyAreas.length > 0));
    });

    // Assessment status breakdown
    const statusBreakdown = { draft: 0, complete: 0, verified: 0 };
    const ecosystemBreakdown = {};
    const landUseBreakdown = {};

    for (const a of assessments) {
      if (statusBreakdown[a.status] !== undefined) statusBreakdown[a.status]++;
      if (a.ecosystemType) {
        ecosystemBreakdown[a.ecosystemType] = (ecosystemBreakdown[a.ecosystemType] || 0) + 1;
      }
      if (a.landUseChange) {
        landUseBreakdown[a.landUseChange] = (landUseBreakdown[a.landUseChange] || 0) + 1;
      }
    }

    // Total land area assessed
    const totalLandAreaHa = assessments.reduce((sum, a) => sum + (a.landAreaHa || 0), 0);

    res.json({
      year,
      totalSites: sites.length,
      sitesNearProtectedAreas: sitesNearProtected.length,
      assessmentCount: assessments.length,
      statusBreakdown,
      ecosystemBreakdown,
      landUseBreakdown,
      totalLandAreaHa: Math.round(totalLandAreaHa * 100) / 100,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
