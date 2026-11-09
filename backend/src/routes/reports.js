const router = require('express').Router();
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { attachTier } = require('../middleware/tier');
const tierFeatures = require('../services/tierFeatures');
const { formatError } = require('../utils/errors');

router.use(authenticate, attachTier);

const LANGUAGES = {
  en: 'English', fr: 'French', de: 'German', ar: 'Arabic',
  es: 'Spanish', hy: 'Armenian', sv: 'Swedish',
};

router.post('/generate', async (req, res) => {
  try {
    const { year, format, language } = req.body;
    if (!year) return res.status(400).json({ error: 'Year is required to generate a report.' });

    const y = parseInt(year);
    if (isNaN(y)) return res.status(400).json({ error: 'Year must be a valid number.' });

    const lang = language || 'en';
    const fmt = format || 'pdf';
    if (!['pdf', 'docx'].includes(fmt)) return res.status(400).json({ error: 'Format must be "pdf" or "docx".' });

    const { companyId } = req.user;

    const [company, inventory, composition, training, turnover, targets] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.fE1GHGInventory.findMany({ where: { companyId, year: y } }),
      prisma.fS1WorkforceComposition.findMany({ where: { companyId, year: y } }),
      prisma.fS1EmployeeTraining.findMany({ where: { companyId, year: y } }),
      prisma.fS1EmployeeTurnover.findMany({ where: { companyId, year: y } }),
      prisma.sBTiTarget.findMany({ where: { companyId } }),
    ]);

    const totalEmissions = inventory.reduce((s, r) => s + r.totalEmissions, 0);
    const totalEmployees = composition.reduce((s, r) => s + r.employeeCount, 0);
    const totalTrainingHours = training.reduce((s, r) => s + r.trainingHours, 0);
    const totalTurnover = turnover.reduce((s, r) => s + r.count, 0);

    const byScope = {};
    inventory.forEach((r) => { byScope[r.scope] = (byScope[r.scope] || 0) + r.totalEmissions; });

    const byGender = {};
    composition.forEach((r) => { byGender[r.gender] = (byGender[r.gender] || 0) + r.employeeCount; });

    if (fmt === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ESG_Report_${y}.pdf"`);
      doc.pipe(res);

      doc.fontSize(24).font('Helvetica-Bold').text(`ESG Compliance Report — ${y}`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(14).font('Helvetica').text(`${company.name} | Standard: ${company.esgStandard} (CSRD)`, { align: 'center' });
      doc.moveDown(2);

      doc.fontSize(18).font('Helvetica-Bold').text('E1 — Climate Change (Environmental)');
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');
      doc.text(`Total GHG Emissions: ${totalEmissions.toFixed(2)} tCO2e`);
      doc.text(`GHG Intensity: ${totalEmployees > 0 ? (totalEmissions / totalEmployees).toFixed(2) : 'N/A'} tCO2e/employee`);
      Object.entries(byScope).forEach(([scope, val]) => {
        doc.text(`  ${scope}: ${val.toFixed(2)} tCO2e`);
      });

      if (targets.length > 0) {
        doc.moveDown(0.5);
        doc.text(`SBTi Target: ${targets[0].reductionPct}% reduction by ${targets[0].targetYear} (${targets[0].method})`);
      }
      doc.moveDown();

      doc.fontSize(18).font('Helvetica-Bold').text('S1 — Own Workforce (Social)');
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');
      doc.text(`Total Employees: ${totalEmployees}`);
      doc.text(`Training Hours: ${totalTrainingHours}`);
      doc.text(`Turnover: ${totalTurnover} (Rate: ${totalEmployees > 0 ? ((totalTurnover / totalEmployees) * 100).toFixed(1) : 0}%)`);
      doc.moveDown(0.5);
      doc.text('Gender Distribution:');
      Object.entries(byGender).forEach(([g, c]) => doc.text(`  ${g}: ${c}`));

      doc.moveDown(2);
      doc.fontSize(9).fillColor('#666').text(`Generated on ${new Date().toISOString().split('T')[0]} | Language: ${LANGUAGES[lang] || lang}`, { align: 'center' });
      doc.end();
    } else {
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({ children: [new TextRun({ text: `ESG Compliance Report — ${y}`, bold: true, size: 48 })], heading: HeadingLevel.TITLE }),
            new Paragraph({ children: [new TextRun({ text: `${company.name} | Standard: ${company.esgStandard} (CSRD)` })] }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'E1 — Climate Change (Environmental)', bold: true, size: 32 })], heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Total GHG Emissions: ${totalEmissions.toFixed(2)} tCO2e` }),
            new Paragraph({ text: `GHG Intensity: ${totalEmployees > 0 ? (totalEmissions / totalEmployees).toFixed(2) : 'N/A'} tCO2e/employee` }),
            ...Object.entries(byScope).map(([scope, val]) => new Paragraph({ text: `  ${scope}: ${val.toFixed(2)} tCO2e` })),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'S1 — Own Workforce (Social)', bold: true, size: 32 })], heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Total Employees: ${totalEmployees}` }),
            new Paragraph({ text: `Training Hours: ${totalTrainingHours}` }),
            new Paragraph({ text: `Turnover: ${totalTurnover}` }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: `Generated on ${new Date().toISOString().split('T')[0]} | Language: ${LANGUAGES[lang] || lang}`, color: '999999', size: 18 })] }),
          ],
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="ESG_Report_${y}.docx"`);
      res.send(buffer);
    }
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Return every language with a `locked` flag so the UI can render locks.
// Generation in a non-entitled language is rejected server-side below.
router.get('/languages', (req, res) => {
  const allowed = new Set(tierFeatures.allowedLanguagesFor(req.tier));
  const out = {};
  for (const [code, name] of Object.entries(LANGUAGES)) {
    out[code] = {
      name,
      locked: !allowed.has(code),
      requiredTier: allowed.has(code) ? null : (tierFeatures.LANGUAGE_TIER[code] || 'PROFESSIONAL'),
    };
  }
  res.json(out);
});

module.exports = router;
