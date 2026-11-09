/**
 * ISO → GRI Classification & Gap Analysis Engine
 *
 * - classifyIngestion(companyId, year)  — matches ingested ISO data to mapping rules
 * - computeGapAnalysis(companyId, year) — computes GRI coverage / gaps
 * - getReadinessScore(companyId, year)  — overall + per-topic-family readiness %
 */

const prisma = require('../config/prisma');

// ─── GRI 2021 Topic Families ────────────────────────────────────
// Each family groups a set of GRI disclosure codes.  A regex is used
// to match griCode strings that may contain multiple codes.

const GRI_TOPIC_FAMILIES = [
  {
    family: 'GRI 2',
    label: 'General Disclosures',
    pattern: /GRI\s*2[-\s]/i,
    disclosures: [
      { code: 'GRI 2-1', name: 'Organizational details' },
      { code: 'GRI 2-6', name: 'Activities, value chain and other business relationships' },
      { code: 'GRI 2-9', name: 'Governance structure and composition' },
      { code: 'GRI 2-12', name: 'Role of the highest governance body' },
      { code: 'GRI 2-13', name: 'Delegation of responsibility for managing impacts' },
      { code: 'GRI 2-14', name: 'Role of the highest governance body in sustainability reporting' },
      { code: 'GRI 2-18', name: 'Evaluation of the performance of the highest governance body' },
      { code: 'GRI 2-22', name: 'Statement on sustainable development strategy' },
      { code: 'GRI 2-23', name: 'Policy commitments' },
      { code: 'GRI 2-25', name: 'Processes to remediate negative impacts' },
      { code: 'GRI 2-27', name: 'Compliance with laws and regulations' },
      { code: 'GRI 2-29', name: 'Approach to stakeholder engagement' },
    ],
  },
  {
    family: 'GRI 3',
    label: 'Material Topics',
    pattern: /GRI\s*3[-\s]/i,
    disclosures: [
      { code: 'GRI 3-1', name: 'Process to determine material topics' },
      { code: 'GRI 3-2', name: 'List of material topics' },
      { code: 'GRI 3-3', name: 'Management of material topics' },
    ],
  },
  {
    family: 'GRI 201-207',
    label: 'Economic',
    pattern: /GRI\s*20[1-7]/i,
    disclosures: [
      { code: 'GRI 201-1', name: 'Direct economic value generated and distributed' },
      { code: 'GRI 201-2', name: 'Financial implications of climate change' },
      { code: 'GRI 203-1', name: 'Infrastructure investments and services supported' },
      { code: 'GRI 205-1', name: 'Operations assessed for risks related to corruption' },
      { code: 'GRI 206-1', name: 'Legal actions for anti-competitive behavior' },
      { code: 'GRI 207-1', name: 'Approach to tax' },
    ],
  },
  {
    family: 'GRI 301-306',
    label: 'Environmental',
    pattern: /GRI\s*(30[1-8]|101)/i,
    disclosures: [
      { code: 'GRI 301-1', name: 'Materials used by weight or volume' },
      { code: 'GRI 302-1', name: 'Energy consumption within the organization' },
      { code: 'GRI 302-3', name: 'Energy intensity' },
      { code: 'GRI 302-4', name: 'Reduction of energy consumption' },
      { code: 'GRI 303-3', name: 'Water withdrawal' },
      { code: 'GRI 303-4', name: 'Water discharge' },
      { code: 'GRI 303-5', name: 'Water consumption' },
      // GRI 101: Biodiversity 2024 supersedes GRI 304 (mandatory since 1 Jan 2026)
      { code: 'GRI 101-5', name: 'Locations with biodiversity impacts (GRI 101: Biodiversity 2024)' },
      { code: 'GRI 305-1', name: 'Direct (Scope 1) GHG emissions' },
      { code: 'GRI 305-2', name: 'Energy indirect (Scope 2) GHG emissions' },
      { code: 'GRI 305-3', name: 'Other indirect (Scope 3) GHG emissions' },
      { code: 'GRI 305-7', name: 'Nitrogen oxides, sulfur oxides, and other significant air emissions' },
      { code: 'GRI 306-3', name: 'Waste generated' },
      { code: 'GRI 306-4', name: 'Waste diverted from disposal' },
      { code: 'GRI 306-5', name: 'Waste directed to disposal' },
    ],
  },
  {
    family: 'GRI 401-414',
    label: 'Social',
    pattern: /GRI\s*4(0[1-9]|1[0-4])/i,
    disclosures: [
      { code: 'GRI 401-1', name: 'New employee hires and employee turnover' },
      { code: 'GRI 402-1', name: 'Minimum notice periods regarding operational changes' },
      { code: 'GRI 403-1', name: 'Occupational health and safety management system' },
      { code: 'GRI 403-2', name: 'Hazard identification, risk assessment, and incident investigation' },
      { code: 'GRI 403-3', name: 'Occupational health services' },
      { code: 'GRI 403-4', name: 'Worker participation on OH&S' },
      { code: 'GRI 403-5', name: 'Worker training on OH&S' },
      { code: 'GRI 403-6', name: 'Promotion of worker health' },
      { code: 'GRI 403-7', name: 'Prevention and mitigation of OH&S impacts' },
      { code: 'GRI 403-8', name: 'Workers covered by an OH&S management system' },
      { code: 'GRI 403-9', name: 'Work-related injuries' },
      { code: 'GRI 403-10', name: 'Work-related ill health' },
      { code: 'GRI 404-1', name: 'Average hours of training per year per employee' },
      { code: 'GRI 404-2', name: 'Programs for upgrading employee skills' },
      { code: 'GRI 405-1', name: 'Diversity of governance bodies and employees' },
      { code: 'GRI 406-1', name: 'Incidents of discrimination and corrective actions' },
      { code: 'GRI 407-1', name: 'Freedom of association and collective bargaining' },
      { code: 'GRI 408-1', name: 'Operations and suppliers at significant risk for child labor' },
      { code: 'GRI 409-1', name: 'Operations and suppliers at significant risk for forced labor' },
      { code: 'GRI 410-1', name: 'Security personnel trained in human rights' },
      { code: 'GRI 411-1', name: 'Incidents of violations involving rights of indigenous peoples' },
      { code: 'GRI 412-1', name: 'Operations subject to human rights reviews' },
      { code: 'GRI 413-1', name: 'Operations with local community engagement' },
      { code: 'GRI 414-1', name: 'New suppliers screened using social criteria' },
      { code: 'GRI 414-2', name: 'Negative social impacts in the supply chain' },
    ],
  },
  {
    family: 'GRI 416-418',
    label: 'Product Responsibility',
    pattern: /GRI\s*41[6-8]/i,
    disclosures: [
      { code: 'GRI 416-1', name: 'Assessment of the health and safety impacts of product/service categories' },
      { code: 'GRI 416-2', name: 'Incidents of non-compliance concerning H&S of products/services' },
      { code: 'GRI 417-1', name: 'Requirements for product and service information and labeling' },
      { code: 'GRI 417-2', name: 'Incidents of non-compliance concerning product information and labeling' },
      { code: 'GRI 418-1', name: 'Substantiated complaints concerning breaches of customer privacy' },
    ],
  },
];

// ─── Recommended actions for common gap areas ───────────────────

const GAP_ACTIONS = {
  'GRI 2': [
    'Complete board-level sustainability governance disclosure',
    'Document delegation of ESG responsibility from board to management',
    'Add stakeholder engagement records covering all stakeholder groups',
  ],
  'GRI 3': [
    'Complete double materiality assessment (impact + financial materiality)',
    'Document stakeholder engagement process for material topic identification',
    'Map material topics to specific GRI topic standards',
  ],
  'GRI 201-207': [
    'Connect financial systems to extract economic value generated/distributed',
    'Conduct climate-related financial impact assessment (TCFD-aligned)',
    'Document anti-corruption risk assessment and tax approach',
  ],
  'GRI 301-306': [
    'Connect Scope 3 emissions data from supply chain',
    'Add water stress area assessment using WRI Aqueduct tool',
    'Complete biodiversity impact assessment for operational sites',
    'Upload materials input data with recycled vs virgin content split',
  ],
  'GRI 401-414': [
    'Upload workforce diversity demographics from HRIS',
    'Add employee turnover and new hire data by gender and region',
    'Document freedom of association and collective bargaining policies',
    'Complete human rights due diligence assessment for operations and supply chain',
    'Add local community engagement program documentation',
  ],
  'GRI 416-418': [
    'Upload product safety assessment records by product category',
    'Document data breach and customer privacy complaint records',
    'Add product labelling compliance records',
  ],
};

// ─── Helper: does a griCode string (e.g. "GRI 305-1, 305-2") mention
//     a specific disclosure code (e.g. "GRI 305-1")? ────────────

function griCodeMatchesDisclosure(griCodeStr, disclosureCode) {
  if (!griCodeStr || !disclosureCode) return false;
  // Normalise: remove "GRI " prefix from disclosure code for flexible matching
  const numPart = disclosureCode.replace(/^GRI\s*/, '');
  // Check if the griCode string contains the numeric part
  // e.g., "GRI 305-1 (Scope 1)" should match "305-1"
  return griCodeStr.includes(numPart) || griCodeStr.includes(disclosureCode);
}

// ─── classifyIngestion ──────────────────────────────────────────

async function classifyIngestion(companyId, year) {
  const ingestions = await prisma.isoDataIngestion.findMany({
    where: { companyId, year },
  });

  const rules = await prisma.isoGriMappingRule.findMany();

  let classified = 0;
  for (const ingestion of ingestions) {
    // Find matching rules by isoStandard + isoClause
    const matches = rules.filter(
      (r) => r.isoStandard === ingestion.isoStandard && r.isoClause === ingestion.isoClause
    );

    if (matches.length === 0) continue;

    // Use the best match (highest coverage: FULL > PARTIAL > SUPPORTING)
    const coverageRank = { FULL: 3, PARTIAL: 2, SUPPORTING: 1 };
    matches.sort((a, b) => (coverageRank[b.coverageLevel] || 0) - (coverageRank[a.coverageLevel] || 0));
    const best = matches[0];

    await prisma.isoDataIngestion.update({
      where: { id: ingestion.id },
      data: {
        classifiedGri: best.griCode,
        coverageLevel: best.coverageLevel,
        ruleVersion: best.version,
      },
    });
    classified++;
  }

  console.log(`[isoGriEngine] Classified ${classified}/${ingestions.length} ingestion records for company ${companyId}, year ${year}`);
  return { total: ingestions.length, classified };
}

// ─── computeGapAnalysis ─────────────────────────────────────────

async function computeGapAnalysis(companyId, year) {
  // Get all classified ingestions for the company + year
  const ingestions = await prisma.isoDataIngestion.findMany({
    where: { companyId, year, classifiedGri: { not: null } },
  });

  const results = [];

  for (const family of GRI_TOPIC_FAMILIES) {
    for (const disclosure of family.disclosures) {
      // Find ingestions that cover this disclosure
      const covering = ingestions.filter((ing) =>
        griCodeMatchesDisclosure(ing.classifiedGri, disclosure.code)
      );

      let status = 'GAP';
      const sources = [];

      if (covering.length > 0) {
        // Determine best coverage level among matching ingestions
        const hasFull = covering.some((c) => c.coverageLevel === 'FULL');
        const hasPartial = covering.some((c) => c.coverageLevel === 'PARTIAL');

        if (hasFull) {
          status = 'COVERED';
        } else if (hasPartial) {
          status = 'PARTIAL';
        } else {
          // Only SUPPORTING evidence
          status = 'PARTIAL';
        }

        covering.forEach((c) => {
          sources.push({
            isoStandard: c.isoStandard,
            isoClause: c.isoClause,
            coverageLevel: c.coverageLevel,
          });
        });
      }

      // Determine recommended action for gaps
      let recommendedAction = null;
      if (status === 'GAP') {
        const familyActions = GAP_ACTIONS[family.family] || [];
        // Pick a contextually relevant action based on the disclosure code
        recommendedAction = pickRecommendedAction(disclosure.code, disclosure.name, familyActions);
      } else if (status === 'PARTIAL') {
        recommendedAction = `Upgrade ${disclosure.code} coverage from partial to full — supplement ISO data with direct ${disclosure.name.toLowerCase()} records.`;
      }

      results.push({
        companyId,
        griTopicFamily: family.family,
        griCode: disclosure.code,
        griName: disclosure.name,
        status,
        coveringSources: sources.length > 0 ? sources : null,
        recommendedAction,
        year,
      });
    }
  }

  // Upsert all results
  let upserted = 0;
  for (const r of results) {
    await prisma.griGapAnalysis.upsert({
      where: {
        companyId_griCode_year: {
          companyId: r.companyId,
          griCode: r.griCode,
          year: r.year,
        },
      },
      update: {
        griTopicFamily: r.griTopicFamily,
        griName: r.griName,
        status: r.status,
        coveringSources: r.coveringSources,
        recommendedAction: r.recommendedAction,
        computedAt: new Date(),
      },
      create: {
        companyId: r.companyId,
        griTopicFamily: r.griTopicFamily,
        griCode: r.griCode,
        griName: r.griName,
        status: r.status,
        coveringSources: r.coveringSources,
        recommendedAction: r.recommendedAction,
        year: r.year,
      },
    });
    upserted++;
  }

  console.log(`[isoGriEngine] Gap analysis: ${upserted} disclosures assessed for company ${companyId}, year ${year}`);
  return results;
}

// ─── getReadinessScore ──────────────────────────────────────────

async function getReadinessScore(companyId, year) {
  const gaps = await prisma.griGapAnalysis.findMany({
    where: { companyId, year },
  });

  if (gaps.length === 0) {
    return {
      overall: 0,
      totalDisclosures: 0,
      covered: 0,
      partial: 0,
      gap: 0,
      byFamily: [],
    };
  }

  // Overall score: COVERED = 1.0, PARTIAL = 0.5, GAP = 0.0
  const scoreMap = { COVERED: 1.0, PARTIAL: 0.5, GAP: 0.0 };
  const totalScore = gaps.reduce((s, g) => s + (scoreMap[g.status] || 0), 0);
  const overall = Math.round((totalScore / gaps.length) * 100);

  const covered = gaps.filter((g) => g.status === 'COVERED').length;
  const partial = gaps.filter((g) => g.status === 'PARTIAL').length;
  const gap = gaps.filter((g) => g.status === 'GAP').length;

  // Per-family breakdown
  const familyMap = {};
  for (const g of gaps) {
    if (!familyMap[g.griTopicFamily]) {
      familyMap[g.griTopicFamily] = { family: g.griTopicFamily, total: 0, covered: 0, partial: 0, gap: 0 };
    }
    familyMap[g.griTopicFamily].total++;
    if (g.status === 'COVERED') familyMap[g.griTopicFamily].covered++;
    else if (g.status === 'PARTIAL') familyMap[g.griTopicFamily].partial++;
    else familyMap[g.griTopicFamily].gap++;
  }

  const byFamily = Object.values(familyMap).map((f) => {
    const familyScore = (f.covered * 1.0 + f.partial * 0.5) / f.total;
    // Find the label from our topic families list
    const familyDef = GRI_TOPIC_FAMILIES.find((tf) => tf.family === f.family);
    return {
      ...f,
      label: familyDef ? familyDef.label : f.family,
      readiness: Math.round(familyScore * 100),
    };
  });

  return {
    overall,
    totalDisclosures: gaps.length,
    covered,
    partial,
    gap,
    byFamily,
  };
}

// ─── Helper: pick a contextual recommended action ───────────────

function pickRecommendedAction(code, name, familyActions) {
  if (!familyActions || familyActions.length === 0) {
    return `Collect data for ${code} (${name}) — no ISO source currently covers this disclosure.`;
  }

  // Try to match keywords from the disclosure name to a specific action
  const nameLower = name.toLowerCase();
  for (const action of familyActions) {
    const actionLower = action.toLowerCase();
    // Simple keyword overlap check
    const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 3);
    const overlap = nameWords.filter((w) => actionLower.includes(w));
    if (overlap.length >= 2) return action;
  }

  // Fallback: return first action for the family
  return familyActions[0];
}

module.exports = {
  classifyIngestion,
  computeGapAnalysis,
  getReadinessScore,
  GRI_TOPIC_FAMILIES,
};
