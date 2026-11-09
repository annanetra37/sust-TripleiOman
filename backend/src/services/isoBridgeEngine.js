/**
 * ISO Bridge Engine — AI extraction (C1/C3), narrative drafting (C4) and
 * reverse-export generation (C7) for the ISO-to-GRI/ESRS Bridge.
 *
 * Guardrails baked in (spec §4.1 / §12):
 *  - Every draft carries citations to its source clause + file. Un-sourced
 *    content is rejected before persistence.
 *  - Output status is always DRAFT — approval is a human action handled in
 *    the route layer; nothing here auto-approves.
 *  - Model + prompt version are returned for the audit trail.
 */

const Anthropic = require('@anthropic-ai/sdk').default;
const config = require('../config');
const { trackedAICall } = require('../utils/costTracker');
const { NON_CERTIFICATION_DISCLAIMER } = require('./isoBridgeRegistry');

const PROMPT_VERSION = 'iso-bridge/1.0.0';

let client;
function getClient() {
  if (!client) {
    if (!config.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required. Set it in your .env file.');
    }
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

function parseJsonBlock(response) {
  const text = response.content.find((b) => b.type === 'text')?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function contentBlockFor(bufferOrText, mime, useVision) {
  if (!useVision) return null;
  const base64 = bufferOrText.toString('base64');
  return mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: base64 } };
}

// ─── C1: Certificate extraction ────────────────────────────────────────

const CERT_PROMPT = `You are an ISO certification expert. Extract the metadata from this ISO management-system certificate.

Return ONLY a JSON object:
{
  "isoStandard": "the ISO standard number only, e.g. 14001, 45001, 50001, 14064-1, 14046, 37001, 9001",
  "isoEdition": "the edition year, e.g. 2015 or 2026 or 2018 — return \\"unknown\\" if it is not visible. NEVER guess.",
  "certNumber": "certificate number or null",
  "certBody": "certification body name (TÜV, DNV, SGS, BSI, Bureau Veritas, …) or null",
  "accreditationBody": "accreditation body if an accreditation mark is visible (DAkkS, UKAS, ANAB, RvA, …) or null",
  "accredited": true | false | null,  // true only if an accreditation mark is clearly visible; false if the certificate clearly carries none; null if unsure
  "scopeStatement": "the certified scope statement, verbatim, or null",
  "sites": ["site addresses/locations covered"],
  "issueDate": "YYYY-MM-DD or null",
  "expiryDate": "YYYY-MM-DD or null",
  "nextSurveillanceDate": "YYYY-MM-DD or null",
  "confidence": 0.0-1.0
}

Rules:
- The EDITION matters more than anything else (14001:2015 vs 14001:2026 changes downstream behaviour). If the edition is not explicitly printed, return "unknown" — do not default it.
- Dates in any format/language must be normalised to YYYY-MM-DD.
- The certificate may be in any language.`;

async function extractCertificate(bufferOrText, { mime = 'application/pdf', useVision = true } = {}, costCtx) {
  const block = contentBlockFor(bufferOrText, mime, useVision);
  const messageContent = useVision
    ? [block, { type: 'text', text: CERT_PROMPT }]
    : `${CERT_PROMPT}\n\n## Certificate text\n${String(bufferOrText).slice(0, 20000)}`;

  const params = {
    model: config.anthropic.model,
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: messageContent }],
  };
  const response = costCtx
    ? await trackedAICall(getClient(), params, { ...costCtx, operation: 'ISO_CERT_EXTRACT' })
    : await getClient().messages.create(params);

  const parsed = parseJsonBlock(response);
  if (!parsed) return { isoStandard: null, isoEdition: 'unknown', confidence: 0 };
  parsed.isoEdition = parsed.isoEdition || 'unknown';
  return parsed;
}

// ─── C3: Evidence extraction (PDF/vision path) ─────────────────────────
// Spreadsheet evidence goes through the existing AI ETL (mapSchema path)
// in the route layer; this handles document-form evidence.

const EVIDENCE_PROMPTS = {
  aspectsRegister: 'environmental aspects & impacts register: for each row capture { activity, aspect, impact, significance, lifecycleStage }. Also capture { significanceMethod } once.',
  complianceRegister: 'compliance obligations register: for each row capture { obligation, source, complianceStatus, lastEvaluated }. Capture any identified non-compliances and fines.',
  objectives: 'objectives & targets: for each capture { objective, indicator, baseline, target, targetYear, responsible, status }.',
  monitoring: 'monitoring & measurement records: for each series capture { parameter, value, unit, period, method }.',
  incidentRegister: 'incident register: for each row capture { date, type, severity, lostTimeDays, description, status }. Also capture { totalHoursWorked } if stated.',
  energyReview: 'energy review: capture { consumptionBySource: [{source, value, unit}], baselineYear, baselineValue, enpis: [{name, value, unit}], significantEnergyUses, savingsAchieved }.',
  mgmtReview: 'management review minutes: capture { date, attendees: [{role}], inputsReviewed, decisions, frequency }.',
  nonconformity: 'nonconformity log: for each capture { finding, rootCause, correctiveAction, status, closedDate }.',
  policy: 'policy document: capture { policyTitle, commitments: [], approvedBy, approvalDate, appliesTo }.',
  contextAnalysis: 'context analysis (4.1/4.2): capture { internalIssues, externalIssues, climateConsiderations, biodiversityConsiderations, resourceConsiderations, interestedParties }.',
  hazardRisk: 'hazard identification & risk assessment: capture { methodology, riskCriteria, reportingProcess, examples: [] }.',
  ohsSystem: 'OH&S management-system description: capture { scope, workersCovered, certificationStatus }.',
  workerParticipation: 'worker participation & consultation: capture { mechanisms, committees: [{name, composition, frequency}], topicsConsulted }.',
  healthServices: 'occupational health services: capture { services, accessArrangements, confidentialityMeasures }.',
  trainingRecords: 'OH&S training records: capture { courses: [{name, audience, participants, hours}], totalHours }.',
  contractorControl: 'contractor control procedures: capture { coverage, requirements, coordinationDuties }.',
  ghgInventory: 'GHG inventory report: capture { scope1, scope2, scope3, unit, boundary, baseYear, verifier, assuranceLevel }.',
  waterFootprint: 'water footprint study: capture { withdrawalBySource: [], consumption, unit, stressAssessment }.',
  antiBribery: 'anti-bribery records: capture { riskAssessments, controls, trainingCoverage, incidents: [{date, outcome}] }.',
  supplierEvaluation: 'supplier evaluation procedures: capture { criteria, environmentalCriteria, socialCriteria, cadence }.',
};

async function extractEvidence(bufferOrText, { recordType, mime = 'application/pdf', useVision = true } = {}, costCtx) {
  const what = EVIDENCE_PROMPTS[recordType] || 'the document: capture its key structured content faithfully.';
  const prompt = `You are an ISO management-system documentation expert. Extract structured content from this ${what}

Return ONLY a JSON object:
{
  "payload": { ...the structure described above... },
  "language": "ISO 639-1 code of the source document",
  "sourceLocation": "page/section range the content came from, e.g. \\"pages 2-5\\"",
  "confidence": 0.0-1.0
}

Rules:
- The document may be in ANY language (German, Arabic, French…). Translate field VALUES to English but preserve proper nouns.
- Extract faithfully — never invent rows or figures that are not in the document.
- Keep all quantities with their units.`;

  const block = contentBlockFor(bufferOrText, mime, useVision);
  const messageContent = useVision
    ? [block, { type: 'text', text: prompt }]
    : `${prompt}\n\n## Document text\n${String(bufferOrText).slice(0, 40000)}`;

  const params = {
    model: config.anthropic.model,
    max_tokens: 8192,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: messageContent }],
  };
  const response = costCtx
    ? await trackedAICall(getClient(), params, { ...costCtx, operation: 'ISO_EVIDENCE_INGEST' })
    : await getClient().messages.create(params);

  const parsed = parseJsonBlock(response);
  if (!parsed || !parsed.payload) return null;
  return parsed;
}

// ─── C4: Narrative drafting ────────────────────────────────────────────

/**
 * Draft disclosure content from ingested evidence + crosswalk guidance.
 * Human-in-the-loop is mandatory: the caller persists this as DRAFT.
 *
 * @param disclosureCode e.g. "GRI 403-1"
 * @param mappings crosswalk rows covering this disclosure (with draftingGuidance)
 * @param evidence IsoEvidenceRecord rows (id, recordType, payload, sourceFileName, sourceLocation)
 * @param certificates IsoCertificate rows for citation context
 */
async function draftDisclosure({ disclosureCode, disclosureName, standard, year, mappings, evidence, certificates, language = 'en', companyName }, costCtx) {
  const evidenceBlock = evidence.map((e, i) => ({
    ref: `E${i + 1}`,
    evidenceRecordId: e.id,
    recordType: e.recordType,
    sourceFileName: e.sourceFileName,
    sourceLocation: e.sourceLocation,
    payload: e.payload,
  }));

  const prompt = `You are an ESG reporting expert drafting disclosure content for a sustainability report. Draft the content for disclosure "${disclosureCode}${disclosureName ? ` — ${disclosureName}` : ''}" (${standard}, reporting year ${year}) for ${companyName || 'the organisation'}.

## Crosswalk drafting guidance (follow strictly)
${mappings.map((m) => `- [${m.id}] ISO ${m.isoStandard} clause ${m.clause} (${m.clauseTitle}): ${m.draftingGuidance}`).join('\n')}

## Ingested ISO evidence (the ONLY permitted source material)
${JSON.stringify(evidenceBlock, null, 2).slice(0, 60000)}

## Hard rules
1. Use ONLY the evidence above. If the evidence does not support a statement, do not make it. If the evidence is too thin to draft anything meaningful, say so in "notes" and return an empty draftText.
2. Every factual claim must be attributable to at least one evidence ref (E1, E2…).
3. Write in ${language === 'en' ? 'English' : `language code "${language}"`}, formal report register, 1-4 paragraphs. No headings, no bullet lists unless the disclosure is inherently list-like.
4. This is a DRAFT for human review — do not include meta-commentary in draftText itself.
5. Never state or imply that certification guarantees performance; the certificate is evidence a system exists.

Return ONLY a JSON object:
{
  "draftText": "the disclosure draft",
  "citationsUsed": ["E1", "E3"],
  "confidence": 0.0-1.0,
  "notes": "reviewer-facing caveats: what was assumed, what is missing"
}`;

  const params = {
    model: config.anthropic.model,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: prompt }],
  };
  const response = costCtx
    ? await trackedAICall(getClient(), params, { ...costCtx, operation: 'ISO_DISCLOSURE_DRAFT' })
    : await getClient().messages.create(params);

  const parsed = parseJsonBlock(response);
  if (!parsed || !parsed.draftText || parsed.draftText.trim().length === 0) {
    return { draftText: null, citations: [], confidence: 0, notes: parsed?.notes || 'Evidence insufficient to draft this disclosure.' };
  }

  // Resolve citation refs to full provenance objects. Un-sourced drafts are
  // rejected — provenance is a hard non-functional requirement (spec §12).
  const used = (parsed.citationsUsed || [])
    .map((ref) => evidenceBlock.find((e) => e.ref === ref))
    .filter(Boolean);
  if (used.length === 0) {
    return { draftText: null, citations: [], confidence: 0, notes: 'Draft rejected: the model produced content without evidence citations.' };
  }

  const citations = used.map((e) => {
    const mapping = mappings.find((m) => m.recordType === e.recordType) || mappings[0];
    return {
      evidenceRecordId: e.evidenceRecordId,
      recordType: e.recordType,
      isoStandard: mapping?.isoStandard,
      clause: mapping?.clause,
      clauseTitle: mapping?.clauseTitle,
      mappingId: mapping?.id,
      sourceFileName: e.sourceFileName,
      sourceLocation: e.sourceLocation,
    };
  });

  return {
    draftText: parsed.draftText.trim(),
    citations,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    notes: parsed.notes || null,
    modelVersion: config.anthropic.model,
    promptVersion: PROMPT_VERSION,
  };
}

// ─── C7: Reverse-bridge export packs ───────────────────────────────────

/**
 * Generate a 14001:2026 context-analysis evidence pack from platform data.
 * @param theme climate | biodiversity | resource | lifecycle
 * @param dataSummary pre-assembled platform data for the theme (route layer)
 */
async function generateReversePack({ theme, themeMeta, year, dataSummary, companyName }, costCtx) {
  const prompt = `You are an EMS (ISO 14001) documentation expert. ${companyName || 'The organisation'} is transitioning from ISO 14001:2015 to ISO 14001:2026 and must evidence "${themeMeta.label}" in its context analysis and aspects register.

## Platform ESG data available (the ONLY permitted source material)
${JSON.stringify(dataSummary, null, 2).slice(0, 40000)}

## Task
Produce EMS documentation content blocks for reporting year ${year}, each targeted at one of the 14001:2026 clauses ${themeMeta.targetClauses.join(' / ')}:
- Context entries (clause 4.1/4.2): concise statements of the issue and its relevance, grounded in the data.
- Aspect-register rows (clause 6.1.2): { activity, aspect, impact, significanceRationale } grounded in the data.

## Hard rules
1. Use ONLY the data above; never invent figures or sites.
2. Every block must reference the data it is based on in "dataRefs".
3. Formal EMS register language, ready to paste into documentation.
4. Do NOT claim conformity or certification — this is evidence for a transition audit.

Return ONLY a JSON object:
{
  "contentBlocks": [
    { "clause": "4.1", "title": "…", "body": "…", "dataRefs": ["which data fields this is based on"], "type": "context" | "aspectRow" }
  ],
  "notes": "caveats for the reviewer"
}`;

  const params = {
    model: config.anthropic.model,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: prompt }],
  };
  const response = costCtx
    ? await trackedAICall(getClient(), params, { ...costCtx, operation: 'ISO_REVERSE_EXPORT' })
    : await getClient().messages.create(params);

  const parsed = parseJsonBlock(response);
  if (!parsed || !Array.isArray(parsed.contentBlocks)) return null;

  // Non-certification disclaimer travels with the pack (spec C7 acceptance)
  return {
    contentBlocks: parsed.contentBlocks,
    notes: parsed.notes || null,
    disclaimer: NON_CERTIFICATION_DISCLAIMER,
    modelVersion: config.anthropic.model,
    promptVersion: PROMPT_VERSION,
  };
}

module.exports = {
  PROMPT_VERSION,
  extractCertificate,
  extractEvidence,
  draftDisclosure,
  generateReversePack,
};
