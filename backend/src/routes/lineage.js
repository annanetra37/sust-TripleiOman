const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/tier');
const { formatError } = require('../utils/errors');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = require('docx');

// Audit trail / lineage is a Professional+ feature.
router.use(authenticate, requireFeature('audit_lineage'));

// ─── Data Lineage ───────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { companyId } = req.user;
    const { topic, orgUnitId, userId } = req.query;

    // Always get ALL org units and users for filter dropdowns (unfiltered)
    const [orgUnits, users] = await Promise.all([
      prisma.orgUnit.findMany({ where: { companyId }, select: { id: true, name: true, country: true } }),
      prisma.user.findMany({ where: { companyId }, select: { id: true, firstName: true, lastName: true, email: true } }),
    ]);

    const orgUnitMap = {};
    orgUnits.forEach((u) => { orgUnitMap[u.id] = u; });

    // Build filtered query for uploads
    const where = { companyId };
    if (topic) where.fileType = topic;
    if (userId) where.userId = userId;

    // orgUnitId filter: check both orgUnitId field AND orgUnit text field
    if (orgUnitId) {
      const unit = orgUnitMap[orgUnitId];
      if (unit) {
        where.OR = [
          { orgUnitId },
          { orgUnit: unit.name },
        ];
      } else {
        where.orgUnitId = orgUnitId;
      }
    }

    const uploads = await prisma.uploadHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Build lineage tree: Topic → OrgUnit → User → Uploads
    const lineage = {};

    for (const upload of uploads) {
      const t = upload.fileType === 'E1' ? 'Environmental' : upload.fileType === 'S1' ? 'Social' : 'Governance';
      const topicKey = upload.fileType || 'Other';

      if (!lineage[topicKey]) {
        lineage[topicKey] = { label: t, key: topicKey, orgUnits: {} };
      }

      // Resolve org unit: prefer orgUnitId, fall back to orgUnit text
      const ouId = upload.orgUnitId || upload.orgUnit || 'unknown';
      const ouInfo = orgUnitMap[upload.orgUnitId] || orgUnitMap[ouId];
      const ouName = ouInfo?.name || upload.orgUnit || ouId;
      const ouCountry = ouInfo?.country || '';
      const ouKey = ouInfo?.id || ouName; // use ID if available, otherwise name

      if (!lineage[topicKey].orgUnits[ouKey]) {
        lineage[topicKey].orgUnits[ouKey] = { id: ouKey, name: ouName, country: ouCountry, users: {} };
      }

      const uId = upload.userId;
      const uName = `${upload.user?.firstName || ''} ${upload.user?.lastName || ''}`.trim();

      if (!lineage[topicKey].orgUnits[ouKey].users[uId]) {
        lineage[topicKey].orgUnits[ouKey].users[uId] = {
          id: uId, name: uName, email: upload.user?.email || '',
          uploads: [],
        };
      }

      lineage[topicKey].orgUnits[ouKey].users[uId].uploads.push({
        id: upload.id,
        fileName: upload.fileName,
        fileType: upload.fileType,
        status: upload.status,
        auditStatus: upload.auditStatus || 'pending',
        totalRows: upload.totalRows,
        processedRows: upload.processedRows,
        hasSourceFile: !!upload.storedFilePath,
        createdAt: upload.createdAt,
        completedAt: upload.completedAt,
      });
    }

    // Convert nested objects to arrays
    const tree = Object.values(lineage).map((topic) => ({
      ...topic,
      orgUnits: Object.values(topic.orgUnits).map((ou) => ({
        ...ou,
        users: Object.values(ou.users),
      })),
    }));

    // Building energy bills with a source document, so each value on the
    // Building Energy page can be traced back to its bill.
    const billRows = await prisma.assetEnergyRecord.findMany({
      where: { sourceDoc: { not: null }, asset: { companyId } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { asset: { select: { id: true, name: true, city: true } } },
    });
    const buildingBills = billRows.map((r) => ({
      id: r.id,
      assetId: r.asset.id,
      assetName: r.asset.name,
      city: r.asset.city,
      year: r.year,
      month: r.month,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      fuel: r.fuel,
      quantity: r.quantity,
      unit: r.unit,
      cost: r.cost,
      currency: r.currency,
      sourceDoc: r.sourceDoc,
      createdAt: r.createdAt,
    }));

    res.json({ tree, filters: { orgUnits, users }, buildingBills });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Export Audit Report ────────────────────────────────────

router.post('/export', async (req, res) => {
  try {
    const { companyId } = req.user;
    const { format, topic, orgUnitId, userId } = req.body;
    const fmt = format || 'pdf';

    const company = await prisma.company.findUnique({ where: { id: companyId } });

    const where = { companyId };
    if (topic) where.fileType = topic;
    if (userId) where.userId = userId;

    const orgUnits = await prisma.orgUnit.findMany({ where: { companyId } });
    const orgUnitMap = {};
    orgUnits.forEach((u) => { orgUnitMap[u.id] = u; });

    if (orgUnitId) {
      const unit = orgUnitMap[orgUnitId];
      if (unit) {
        where.OR = [{ orgUnitId }, { orgUnit: unit.name }];
      }
    }

    const uploads = await prisma.uploadHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    const creditTxns = await prisma.creditTransaction.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    // Use the backend's own URL for download links embedded in the export
    // PDF/docx.  The files are served by the backend (GET /api/history/:id/download),
    // so the link must point there — not at the frontend domain.
    const apiPort = process.env.PORT || 4000;
    const baseUrl = process.env.API_URL || process.env.BACKEND_URL || `http://localhost:${apiPort}`;

    if (fmt === 'pdf') {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ESG_Audit_Trail_${new Date().toISOString().split('T')[0]}.pdf"`);
      doc.pipe(res);

      doc.fontSize(20).font('Helvetica-Bold').text('ESG Data Lineage & Audit Trail', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').text(`${company.name} | Generated: ${new Date().toLocaleDateString()} | Standard: ${company.esgStandard}`, { align: 'center' });
      doc.moveDown(1);

      doc.fontSize(14).font('Helvetica-Bold').text('Summary');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Total uploads: ${uploads.length}`);
      doc.text(`Completed: ${uploads.filter((u) => u.status === 'COMPLETED').length}`);
      doc.text(`Failed: ${uploads.filter((u) => u.status === 'FAILED').length}`);
      doc.text(`Verified: ${uploads.filter((u) => u.auditStatus === 'verified').length}`);
      doc.text(`Flagged: ${uploads.filter((u) => u.auditStatus === 'flagged').length}`);
      doc.moveDown(1);

      doc.fontSize(14).font('Helvetica-Bold').text('Data Lineage');
      doc.moveDown(0.5);

      for (const upload of uploads) {
        const ouName = orgUnitMap[upload.orgUnitId]?.name || upload.orgUnit || '—';
        const userName = `${upload.user?.firstName || ''} ${upload.user?.lastName || ''}`.trim();

        doc.fontSize(10).font('Helvetica-Bold').text(upload.fileName);
        doc.fontSize(9).font('Helvetica');
        doc.text(`  Type: ${upload.fileType === 'E1' ? 'Environmental' : 'Social'} | Unit: ${ouName} | By: ${userName}`);
        doc.text(`  Status: ${upload.status} | Audit: ${upload.auditStatus || 'pending'} | Rows: ${upload.processedRows || 0}/${upload.totalRows || 0}`);
        doc.text(`  Date: ${new Date(upload.createdAt).toLocaleString()}`);

        if (upload.storedFilePath) {
          doc.fillColor('#1560f5').text(`  Source: ${baseUrl}/api/history/${upload.id}/download/0`, {
            link: `${baseUrl}/api/history/${upload.id}/download/0`, underline: true,
          });
          doc.fillColor('#000');
        }
        doc.moveDown(0.4);
        if (doc.y > 700) doc.addPage();
      }

      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text('Credit Usage');
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica');
      for (const txn of creditTxns.slice(0, 50)) {
        doc.text(`${new Date(txn.createdAt).toLocaleDateString()} | -${txn.creditsUsed} | ${txn.transactionType} | ${txn.description || ''}`);
      }

      doc.end();
    } else {
      const rows = uploads.map((upload) => {
        const ouName = orgUnitMap[upload.orgUnitId]?.name || upload.orgUnit || '—';
        const userName = `${upload.user?.firstName || ''} ${upload.user?.lastName || ''}`.trim();

        return new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: upload.fileType || '', size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ouName, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: userName, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: upload.fileName, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: upload.status, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: upload.auditStatus || 'pending', size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${upload.processedRows || 0}`, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: new Date(upload.createdAt).toLocaleDateString(), size: 18 })] })] }),
          ],
        });
      });

      const headerRow = new TableRow({
        children: ['Type', 'Unit', 'User', 'File', 'Status', 'Audit', 'Rows', 'Date'].map((h) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })],
            shading: { fill: 'f3f4f6' },
          })
        ),
      });

      const docx = new Document({
        sections: [{
          children: [
            new Paragraph({ children: [new TextRun({ text: 'ESG Data Lineage & Audit Trail', bold: true, size: 40 })], heading: HeadingLevel.TITLE }),
            new Paragraph({ children: [new TextRun({ text: `${company.name} | ${new Date().toLocaleDateString()} | ${company.esgStandard}`, size: 22 })] }),
            new Paragraph({ text: '' }),
            new Table({ rows: [headerRow, ...rows] }),
          ],
        }],
      });

      const buffer = await Packer.toBuffer(docx);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="ESG_Audit_Trail_${new Date().toISOString().split('T')[0]}.docx"`);
      res.send(buffer);
    }
  } catch (err) {
    console.error('Export error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
