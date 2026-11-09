/**
 * ESG Standard Registry
 *
 * Defines the structure, required sections, and disclosure requirements
 * for each supported reporting standard.
 */

const STANDARDS = {
  ESRS: {
    name: 'European Sustainability Reporting Standards',
    framework: 'CSRD',
    version: '2024',
    topics: {
      E1: {
        code: 'ESRS E1', name: 'Climate Change', pillar: 'Environmental',
        required: true,
        disclosures: [
          { code: 'E1-1', name: 'Transition plan for climate change mitigation', type: 'narrative' },
          { code: 'E1-2', name: 'Policies related to climate change mitigation and adaptation', type: 'narrative' },
          { code: 'E1-3', name: 'Actions and resources related to climate change', type: 'narrative' },
          { code: 'E1-4', name: 'Targets related to climate change mitigation and adaptation', type: 'metric', dataSource: 'sbti_targets' },
          { code: 'E1-5', name: 'Energy consumption and mix', type: 'metric', dataSource: 'e1_activities', filter: { category: 'energy' } },
          { code: 'E1-6', name: 'Gross Scopes 1, 2, 3 and Total GHG emissions', type: 'metric', dataSource: 'e1_activities' },
          { code: 'E1-7', name: 'GHG removals and GHG mitigation projects', type: 'narrative' },
          { code: 'E1-8', name: 'Internal carbon pricing', type: 'narrative' },
          { code: 'E1-9', name: 'Anticipated financial effects from climate change', type: 'narrative' },
        ],
      },
      S1: {
        code: 'ESRS S1', name: 'Own Workforce', pillar: 'Social',
        required: true,
        disclosures: [
          { code: 'S1-1', name: 'Policies related to own workforce', type: 'narrative' },
          { code: 'S1-2', name: 'Processes for engaging with own workforce', type: 'narrative' },
          { code: 'S1-3', name: 'Processes to remediate negative impacts', type: 'narrative' },
          { code: 'S1-4', name: 'Taking action on material impacts', type: 'narrative' },
          { code: 'S1-5', name: 'Targets related to managing impacts', type: 'narrative' },
          { code: 'S1-6', name: 'Characteristics of employees', type: 'metric', dataSource: 's1_composition' },
          { code: 'S1-7', name: 'Characteristics of non-employee workers', type: 'metric' },
          { code: 'S1-8', name: 'Collective bargaining coverage', type: 'metric' },
          { code: 'S1-9', name: 'Diversity metrics', type: 'metric', dataSource: 's1_diversity' },
          { code: 'S1-10', name: 'Adequate wages', type: 'metric' },
          { code: 'S1-11', name: 'Social protection', type: 'narrative' },
          { code: 'S1-12', name: 'Persons with disabilities', type: 'metric', dataSource: 's1_diversity' },
          { code: 'S1-13', name: 'Training and skills development', type: 'metric', dataSource: 's1_training' },
          { code: 'S1-14', name: 'Health and safety metrics', type: 'metric', dataSource: 's1_injuries' },
          { code: 'S1-15', name: 'Work-life balance', type: 'narrative' },
          { code: 'S1-16', name: 'Compensation metrics', type: 'metric' },
          { code: 'S1-17', name: 'Incidents, complaints and severe impacts', type: 'metric' },
        ],
      },
      G1: {
        code: 'ESRS G1', name: 'Business Conduct', pillar: 'Governance',
        required: true,
        disclosures: [
          { code: 'G1-1', name: 'Business conduct policies and corporate culture', type: 'metric', dataSource: 'g1_policies' },
          { code: 'G1-2', name: 'Management of relationships with suppliers', type: 'narrative' },
          { code: 'G1-3', name: 'Prevention and detection of corruption and bribery', type: 'metric', dataSource: 'g1_ethics_training' },
          { code: 'G1-4', name: 'Confirmed incidents of corruption or bribery', type: 'metric', dataSource: 'g1_incidents' },
          { code: 'G1-5', name: 'Political influence and lobbying activities', type: 'narrative' },
          { code: 'G1-6', name: 'Payment practices', type: 'metric' },
        ],
      },
    },
    crossCutting: [
      { code: 'ESRS 2', name: 'General Disclosures', required: true },
      { code: 'BP-1', name: 'General basis for preparation', required: true },
      { code: 'BP-2', name: 'Disclosures in relation to specific circumstances', required: true },
      { code: 'GOV-1', name: 'Role of administrative, management and supervisory bodies', required: true },
      { code: 'GOV-2', name: 'Information and sustainability matters addressed by undertaking bodies', required: true },
      { code: 'GOV-3', name: 'Integration of sustainability performance in incentive schemes', required: true },
      { code: 'SBM-1', name: 'Strategy, business model and value chain', required: true },
      { code: 'SBM-3', name: 'Material impacts, risks and opportunities', required: true },
      { code: 'IRO-1', name: 'Description of materiality assessment process', required: true },
    ],
  },

  GRI: {
    name: 'Global Reporting Initiative',
    framework: 'GRI Standards 2021',
    version: '2021',
    topics: {
      E1: {
        code: 'GRI 300', name: 'Environmental Topics', pillar: 'Environmental',
        disclosures: [
          { code: 'GRI 302', name: 'Energy', type: 'metric', dataSource: 'e1_activities' },
          { code: 'GRI 305-1', name: 'Direct GHG emissions (Scope 1)', type: 'metric', dataSource: 'e1_activities' },
          { code: 'GRI 305-2', name: 'Energy indirect GHG emissions (Scope 2)', type: 'metric', dataSource: 'e1_activities' },
          { code: 'GRI 305-3', name: 'Other indirect GHG emissions (Scope 3)', type: 'metric', dataSource: 'e1_activities' },
          { code: 'GRI 305-4', name: 'GHG emissions intensity', type: 'metric', dataSource: 'e1_activities' },
          { code: 'GRI 305-5', name: 'Reduction of GHG emissions', type: 'metric' },
        ],
      },
      S1: {
        code: 'GRI 400', name: 'Social Topics', pillar: 'Social',
        disclosures: [
          { code: 'GRI 401-1', name: 'New employee hires and employee turnover', type: 'metric', dataSource: 's1_turnover' },
          { code: 'GRI 403-9', name: 'Work-related injuries', type: 'metric', dataSource: 's1_injuries' },
          { code: 'GRI 404-1', name: 'Average hours of training per year per employee', type: 'metric', dataSource: 's1_training' },
          { code: 'GRI 405-1', name: 'Diversity of governance bodies and employees', type: 'metric', dataSource: 's1_composition' },
          { code: 'GRI 405-2', name: 'Ratio of basic salary by gender', type: 'metric' },
        ],
      },
      G1: {
        code: 'GRI 200', name: 'Economic Topics', pillar: 'Governance',
        disclosures: [
          { code: 'GRI 205-1', name: 'Operations assessed for risks related to corruption', type: 'narrative' },
          { code: 'GRI 205-2', name: 'Communication and training about anti-corruption policies', type: 'metric', dataSource: 'g1_ethics_training' },
          { code: 'GRI 205-3', name: 'Confirmed incidents of corruption and actions taken', type: 'metric', dataSource: 'g1_incidents' },
          { code: 'GRI 206-1', name: 'Legal actions for anti-competitive behavior', type: 'metric', dataSource: 'g1_incidents' },
          { code: 'GRI 2-9', name: 'Governance structure and composition', type: 'metric', dataSource: 'g1_board' },
        ],
      },
    },
    crossCutting: [
      { code: 'GRI 2', name: 'General Disclosures 2021', required: true },
      { code: 'GRI 3', name: 'Material Topics 2021', required: true },
    ],
  },

  TCFD: {
    name: 'Task Force on Climate-related Financial Disclosures',
    framework: 'TCFD Recommendations',
    version: '2017',
    topics: {
      E1: {
        code: 'TCFD', name: 'Climate-related Disclosures', pillar: 'Environmental',
        required: true,
        disclosures: [
          { code: 'GOV-a', name: 'Board oversight of climate-related risks/opportunities', type: 'narrative' },
          { code: 'GOV-b', name: 'Management role in assessing climate-related risks/opportunities', type: 'narrative' },
          { code: 'STR-a', name: 'Climate-related risks and opportunities identified', type: 'narrative' },
          { code: 'STR-b', name: 'Impact on strategy and financial planning', type: 'narrative' },
          { code: 'STR-c', name: 'Resilience of strategy under different scenarios', type: 'narrative' },
          { code: 'RM-a', name: 'Processes for identifying and assessing climate-related risks', type: 'narrative' },
          { code: 'RM-b', name: 'Processes for managing climate-related risks', type: 'narrative' },
          { code: 'MT-a', name: 'Metrics used to assess climate-related risks', type: 'metric', dataSource: 'e1_activities' },
          { code: 'MT-b', name: 'Scope 1, 2, 3 GHG emissions', type: 'metric', dataSource: 'e1_activities' },
          { code: 'MT-c', name: 'Targets used to manage climate-related risks', type: 'metric', dataSource: 'sbti_targets' },
        ],
      },
    },
    crossCutting: [],
  },

  ISSB: {
    name: 'International Sustainability Standards Board',
    framework: 'IFRS S1 & S2',
    version: '2023',
    topics: {
      E1: {
        code: 'IFRS S2', name: 'Climate-related Disclosures', pillar: 'Environmental',
        required: true,
        disclosures: [
          { code: 'S2-GOV', name: 'Governance processes, controls and procedures', type: 'narrative' },
          { code: 'S2-STR', name: 'Strategy — climate risks and opportunities', type: 'narrative' },
          { code: 'S2-RM', name: 'Risk management processes', type: 'narrative' },
          { code: 'S2-MET-1', name: 'Cross-industry GHG emissions', type: 'metric', dataSource: 'e1_activities' },
          { code: 'S2-MET-2', name: 'Climate-related targets', type: 'metric', dataSource: 'sbti_targets' },
          { code: 'S2-MET-3', name: 'Internal carbon pricing', type: 'narrative' },
        ],
      },
    },
    crossCutting: [
      { code: 'IFRS S1', name: 'General Requirements for Sustainability Disclosures', required: true },
    ],
  },
};

// Data source availability checkers
const DATA_SOURCES = {
  e1_activities: async (prisma, companyId, year) => {
    const count = await prisma.fE1EmissionActivityData.count({ where: { companyId, year } });
    return { available: count > 0, count, label: 'Emission activity data' };
  },
  s1_composition: async (prisma, companyId, year) => {
    const count = await prisma.fS1WorkforceComposition.count({ where: { companyId, year } });
    return { available: count > 0, count, label: 'Workforce composition data' };
  },
  s1_diversity: async (prisma, companyId, year) => {
    const count = await prisma.fS1WorkforceDiversity.count({ where: { companyId, year } });
    return { available: count > 0, count, label: 'Workforce diversity data' };
  },
  s1_training: async (prisma, companyId, year) => {
    const count = await prisma.fS1EmployeeTraining.count({ where: { companyId, year } });
    return { available: count > 0, count, label: 'Employee training data' };
  },
  s1_turnover: async (prisma, companyId, year) => {
    const count = await prisma.fS1EmployeeTurnover.count({ where: { companyId, year } });
    return { available: count > 0, count, label: 'Employee turnover data' };
  },
  s1_injuries: async (prisma, companyId, year) => {
    const count = await prisma.fS1WorkplaceInjuries.count({ where: { companyId, year } });
    return { available: count > 0, count, label: 'Workplace injury data' };
  },
  sbti_targets: async (prisma, companyId) => {
    const count = await prisma.sBTiTarget.count({ where: { companyId } });
    return { available: count > 0, count, label: 'SBTi decarbonization targets' };
  },
  g1_board: async (prisma, companyId, year) => {
    const count = await prisma.fG1BoardComposition.count({ where: { companyId, year } });
    return { available: count > 0, count, label: 'Board composition data' };
  },
  g1_ethics_training: async (prisma, companyId, year) => {
    const count = await prisma.fG1EthicsTraining.count({ where: { companyId, year } });
    return { available: count > 0, count, label: 'Ethics & compliance training data' };
  },
  g1_incidents: async (prisma, companyId, year) => {
    const count = await prisma.fG1GovernanceIncident.count({ where: { companyId, year } });
    return { available: count > 0, count, label: 'Governance incident data' };
  },
  g1_policies: async (prisma, companyId, year) => {
    const count = await prisma.fG1PolicyRegister.count({ where: { companyId, year } });
    return { available: count > 0, count, label: 'Governance policy register' };
  },
};

/**
 * Validate data availability for a given standard + year.
 * Returns which topics/disclosures have data and which are missing.
 */
async function validateReportData(prisma, companyId, year, standardKey, selectedTopics) {
  const standard = STANDARDS[standardKey];
  if (!standard) throw new Error(`Unknown standard: ${standardKey}`);

  const results = { standard: standardKey, year, topics: [], missing: [], available: [], warnings: [] };

  const topicsToCheck = selectedTopics || Object.keys(standard.topics);

  for (const topicKey of topicsToCheck) {
    const topic = standard.topics[topicKey];
    if (!topic) continue;

    const topicResult = { key: topicKey, code: topic.code, name: topic.name, pillar: topic.pillar, disclosures: [] };

    for (const disc of topic.disclosures) {
      const discResult = { code: disc.code, name: disc.name, type: disc.type, hasData: false, count: 0 };

      if (disc.dataSource && DATA_SOURCES[disc.dataSource]) {
        const check = await DATA_SOURCES[disc.dataSource](prisma, companyId, year);
        discResult.hasData = check.available;
        discResult.count = check.count;
        discResult.dataLabel = check.label;
      } else if (disc.type === 'narrative') {
        discResult.hasData = false; // Narratives need AI generation
        discResult.isNarrative = true;
      }

      topicResult.disclosures.push(discResult);

      if (discResult.hasData) {
        results.available.push({ topic: topicKey, disclosure: disc.code, name: disc.name });
      } else if (disc.type === 'metric') {
        results.missing.push({ topic: topicKey, disclosure: disc.code, name: disc.name, dataSource: disc.dataSource });
      }
    }

    results.topics.push(topicResult);
  }

  // Check cross-cutting requirements
  results.crossCutting = standard.crossCutting;

  return results;
}

module.exports = { STANDARDS, DATA_SOURCES, validateReportData };
