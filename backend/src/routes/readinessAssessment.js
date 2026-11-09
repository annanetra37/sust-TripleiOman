/**
 * Public Readiness Assessment Routes
 *
 * Mounted at /api/readiness-assessment in server.js
 *
 * NO authentication required — this is a public lead-gen tool.
 *
 * GET  /questions     — return the questionnaire
 * POST /submit        — accept answers + contact info, compute score, return report
 * GET  /result/:token — retrieve a result by token (sharing/revisiting)
 */

const router = require('express').Router();
const prisma = require('../config/prisma');

// ─── Questionnaire Definition ──────────────────────────────────

const QUESTIONS = [
  { id: 'q1', text: 'Which ISO certifications does your company currently hold?', type: 'multi_select',
    options: ['ISO 14001', 'ISO 45001', 'ISO 50001', 'ISO 14064', 'ISO 9001', 'ISO 27001', 'ISO 26000', 'ISO 20400', 'None'] },
  { id: 'q2', text: 'How many years have you held your primary ISO certification?', type: 'single_select',
    options: ['Less than 1 year', '1-3 years', '3-5 years', 'More than 5 years'] },
  { id: 'q3', text: 'Do you have a formal environmental monitoring programme?', type: 'yes_no',
    showIf: { q1: ['ISO 14001'] } },
  { id: 'q4', text: 'Do you track energy consumption by source (electricity, gas, fuel)?', type: 'yes_no',
    showIf: { q1: ['ISO 50001', 'ISO 14001'] } },
  { id: 'q5', text: 'Do you maintain workplace injury and incident records?', type: 'yes_no',
    showIf: { q1: ['ISO 45001'] } },
  { id: 'q6', text: 'Have you completed a GHG emissions inventory (Scope 1, 2, or 3)?', type: 'yes_no' },
  { id: 'q7', text: 'Do you have a formal supplier assessment programme for ESG criteria?', type: 'yes_no' },
  { id: 'q8', text: 'Have you conducted a materiality assessment?', type: 'yes_no' },
  { id: 'q9', text: 'Do you publish any form of sustainability or CSR report?', type: 'yes_no' },
  { id: 'q10', text: 'How many employees does your company have?', type: 'single_select',
    options: ['1-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'] },
  { id: 'q11', text: 'In which region is your headquarters?', type: 'single_select',
    options: ['EU/EEA', 'UK', 'North America', 'Asia-Pacific', 'Other'] },
  { id: 'q12', text: 'Are you subject to CSRD reporting requirements?', type: 'single_select',
    options: ['Yes, already reporting', 'Yes, upcoming requirement', 'Not sure', 'No'] },
];

// ─── Scoring Engine ────────────────────────────────────────────

// Topic families with their weights (weights used for the overall
// weighted average).
const TOPIC_FAMILIES = {
  'GRI 2':   { label: 'General Disclosures',   weight: 10 },
  'GRI 3':   { label: 'Material Topics',        weight: 15 },
  'GRI 301': { label: 'Materials',              weight: 8 },
  'GRI 302': { label: 'Energy',                 weight: 10 },
  'GRI 303': { label: 'Water',                  weight: 8 },
  'GRI 101': { label: 'Biodiversity (GRI 101:2024)', weight: 5 },
  'GRI 305': { label: 'Emissions',              weight: 12 },
  'GRI 306': { label: 'Waste',                  weight: 8 },
  'GRI 401': { label: 'Employment',             weight: 6 },
  'GRI 403': { label: 'OHS',                    weight: 8 },
  'GRI 404': { label: 'Training',               weight: 4 },
  'GRI 414': { label: 'Supplier Social',        weight: 6 },
  'GRI 416': { label: 'Customer Health/Safety', weight: 5 },
  'GRI 417': { label: 'Marketing/Labelling',    weight: 3 },
  'GRI 418': { label: 'Customer Privacy',       weight: 3 },
};

// Environmental topic codes (GRI 301-306)
const ENVIRONMENTAL_TOPICS = ['GRI 301', 'GRI 302', 'GRI 303', 'GRI 101', 'GRI 305', 'GRI 306'];

// Social topic codes (GRI 401-414)
const SOCIAL_TOPICS = ['GRI 401', 'GRI 403', 'GRI 404', 'GRI 414'];

// Product topic codes (GRI 416-418)
const PRODUCT_TOPICS = ['GRI 416', 'GRI 417', 'GRI 418'];

function computeScores(answers) {
  // Initialise per-topic scores at 0
  const scores = {};
  for (const key of Object.keys(TOPIC_FAMILIES)) {
    scores[key] = 0;
  }

  // Parse held certifications from q1
  const certs = Array.isArray(answers.q1) ? answers.q1 : [];
  const hasCert = (cert) => certs.includes(cert);

  // ── ISO certification base scores ────────────────────────────

  // ISO 14001 → GRI 301-306 Environmental gets +60% base
  if (hasCert('ISO 14001')) {
    for (const topic of ENVIRONMENTAL_TOPICS) {
      scores[topic] += 60;
    }
  }

  // ISO 45001 → GRI 401-414 Social gets +50% base (specifically 403 series)
  if (hasCert('ISO 45001')) {
    for (const topic of SOCIAL_TOPICS) {
      scores[topic] += 50;
    }
  }

  // ISO 50001 → GRI 302 Energy gets +90%
  if (hasCert('ISO 50001')) {
    scores['GRI 302'] += 90;
  }

  // ISO 14064 → GRI 305 Emissions gets +85%
  if (hasCert('ISO 14064')) {
    scores['GRI 305'] += 85;
  }

  // ISO 9001 → GRI 416-418 Product gets +40%
  if (hasCert('ISO 9001')) {
    for (const topic of PRODUCT_TOPICS) {
      scores[topic] += 40;
    }
  }

  // ── Practice-based boosts ────────────────────────────────────

  // Environmental monitoring (q3=yes) → +15% to Environmental
  if (answers.q3 === 'Yes') {
    for (const topic of ENVIRONMENTAL_TOPICS) {
      scores[topic] += 15;
    }
  }

  // Energy tracking (q4=yes) → +10% to Environmental
  if (answers.q4 === 'Yes') {
    for (const topic of ENVIRONMENTAL_TOPICS) {
      scores[topic] += 10;
    }
  }

  // Injury records (q5=yes) → +15% to Social
  if (answers.q5 === 'Yes') {
    for (const topic of SOCIAL_TOPICS) {
      scores[topic] += 15;
    }
  }

  // GHG inventory (q6=yes) → +20% to Environmental
  if (answers.q6 === 'Yes') {
    for (const topic of ENVIRONMENTAL_TOPICS) {
      scores[topic] += 20;
    }
  }

  // Supplier assessment (q7=yes) → +10% to Social
  if (answers.q7 === 'Yes') {
    for (const topic of SOCIAL_TOPICS) {
      scores[topic] += 10;
    }
  }

  // Materiality assessment (q8=yes) → +30% to GRI 3
  if (answers.q8 === 'Yes') {
    scores['GRI 3'] += 30;
  }

  // Sustainability report (q9=yes) → +10% to GRI 2 General
  if (answers.q9 === 'Yes') {
    scores['GRI 2'] += 10;
  }

  // ── Cap each topic at 100% ───────────────────────────────────
  for (const key of Object.keys(scores)) {
    scores[key] = Math.min(scores[key], 100);
  }

  // ── Weighted average for overall score ───────────────────────
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, meta] of Object.entries(TOPIC_FAMILIES)) {
    weightedSum += scores[key] * meta.weight;
    totalWeight += meta.weight;
  }
  const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;

  return { overallScore, topicScores: scores };
}

// ─── Recommendation Generator ──────────────────────────────────

function generateRecommendations(topicScores, answers) {
  const recommendations = [];
  const certs = Array.isArray(answers.q1) ? answers.q1 : [];

  // Low-scoring topics get recommendations
  for (const [topic, score] of Object.entries(topicScores)) {
    const meta = TOPIC_FAMILIES[topic];
    if (!meta) continue;

    if (score < 30) {
      recommendations.push({
        topic,
        label: meta.label,
        score,
        priority: 'HIGH',
        message: `Your ${meta.label} coverage is very low (${score}%). This GRI topic family has significant gaps that need addressing.`,
      });
    } else if (score < 60) {
      recommendations.push({
        topic,
        label: meta.label,
        score,
        priority: 'MEDIUM',
        message: `Your ${meta.label} coverage is moderate (${score}%). Some supplementary data collection would strengthen GRI compliance.`,
      });
    }
  }

  // Certification-specific recommendations
  if (!certs.includes('ISO 14001') && !certs.includes('ISO 50001')) {
    recommendations.push({
      topic: 'general',
      label: 'Environmental Certifications',
      priority: 'HIGH',
      message: 'Consider pursuing ISO 14001 or ISO 50001 certification to substantially improve your environmental GRI coverage.',
    });
  }

  if (!certs.includes('ISO 45001')) {
    recommendations.push({
      topic: 'general',
      label: 'Health & Safety Certification',
      priority: 'MEDIUM',
      message: 'ISO 45001 certification would significantly boost your social disclosure coverage, especially GRI 403 (OHS).',
    });
  }

  if (answers.q8 !== 'Yes') {
    recommendations.push({
      topic: 'GRI 3',
      label: 'Materiality Assessment',
      priority: 'HIGH',
      message: 'A materiality assessment is fundamental to GRI reporting. Conducting one would add 30% to your GRI 3 (Material Topics) score.',
    });
  }

  if (answers.q6 !== 'Yes') {
    recommendations.push({
      topic: 'GRI 305',
      label: 'GHG Emissions Inventory',
      priority: 'HIGH',
      message: 'Completing a GHG emissions inventory (Scope 1, 2, and 3) would strengthen your emissions disclosure readiness by 20%.',
    });
  }

  // Sort by priority
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  recommendations.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  return recommendations;
}

// ─── GET /questions — return the questionnaire ─────────────────

router.get('/questions', (req, res) => {
  res.json({ questions: QUESTIONS });
});

// ─── POST /submit — accept answers + contact info, compute ─────

router.post('/submit', async (req, res) => {
  try {
    const { answers, contactName, contactEmail, companyName, phone } = req.body;

    // Validate required fields
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid answers object' });
    }
    if (!contactName || !contactEmail || !companyName) {
      return res.status(400).json({ error: 'Missing required contact fields: contactName, contactEmail, companyName' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Compute scores
    const { overallScore, topicScores } = computeScores(answers);

    // Generate recommendations
    const recommendations = generateRecommendations(topicScores, answers);

    // Store the result
    const assessment = await prisma.readinessAssessment.create({
      data: {
        contactName,
        contactEmail,
        companyName,
        phone: phone || null,
        answers,
        overallScore,
        topicScores,
        recommendations,
      },
    });

    res.status(201).json({
      token: assessment.token,
      overallScore,
      topicScores,
      topicDetails: Object.entries(topicScores).map(([key, score]) => ({
        topic: key,
        label: TOPIC_FAMILIES[key] ? TOPIC_FAMILIES[key].label : key,
        score,
      })),
      recommendations,
      createdAt: assessment.createdAt,
    });
  } catch (err) {
    console.error('[readinessAssessment] POST /submit error:', err);
    res.status(500).json({ error: 'Failed to process readiness assessment' });
  }
});

// ─── GET /result/:token — retrieve a result by token ───────────

router.get('/result/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const assessment = await prisma.readinessAssessment.findUnique({
      where: { token },
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    res.json({
      token: assessment.token,
      contactName: assessment.contactName,
      companyName: assessment.companyName,
      overallScore: assessment.overallScore,
      topicScores: assessment.topicScores,
      topicDetails: Object.entries(assessment.topicScores).map(([key, score]) => ({
        topic: key,
        label: TOPIC_FAMILIES[key] ? TOPIC_FAMILIES[key].label : key,
        score,
      })),
      recommendations: assessment.recommendations,
      createdAt: assessment.createdAt,
    });
  } catch (err) {
    console.error('[readinessAssessment] GET /result/:token error:', err);
    res.status(500).json({ error: 'Failed to retrieve assessment result' });
  }
});

module.exports = router;
