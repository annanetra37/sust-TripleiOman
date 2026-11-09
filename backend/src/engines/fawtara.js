/**
 * Fawtara e-invoicing engine (plan E5-01, E5-02, E5-05, E5-06, E5-08).
 * Builds UBL 2.1 XML following the PINT OM structure, validates business rules with plain-language
 * AR/EN "how to fix" messages, hashes the XML (SHA-256) and builds the B2C QR payload.
 * The exact PINT OM Schematron must be loaded from the official spec before go-live [VERIFY].
 */
const crypto = require('crypto');
const { applyRate, fromBaisa, sum, toBaisa } = require('../lib/money');
const { iso } = require('../lib/dates');

const xmlEsc = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const amt = (b) => fromBaisa(b);

/** Normalise lines and compute totals. Line input: { description, quantity, unitPriceOmr|unitPriceBaisa, discountBaisa?, vatCategory, exemptionReason? } */
function computeLines(lines, rules) {
  const cats = rules['vat.categories'];
  const out = (lines || []).map((l, i) => {
    const qty = Number(l.quantity || 0);
    const unit = l.unitPriceBaisa !== undefined ? BigInt(l.unitPriceBaisa) : toBaisa(l.unitPriceOmr || 0);
    const discount = BigInt(l.discountBaisa || 0);
    const net = BigInt(Math.round(Number(unit) * qty)) - discount;
    const cat = l.vatCategory || 'STANDARD';
    // Only standard-rated lines carry 5% on the invoice; for reverse charge the buyer self-assesses.
    const rateBp = cat === 'STANDARD' ? cats.STANDARD.rateBp : 0;
    const vat = applyRate(net, rateBp);
    return { lineNo: i + 1, description: l.description || '', descriptionAr: l.descriptionAr || '', itemCode: l.itemCode || '', unitCode: l.unitCode || 'C62', quantity: qty, unitPriceBaisa: unit, discountBaisa: discount, netBaisa: net, vatCategory: cat, rateBp, vatBaisa: vat, exemptionReason: l.exemptionReason || '' };
  });
  const net = sum(out.map((l) => l.netBaisa));
  const vat = sum(out.map((l) => l.vatBaisa));
  return { lines: out, netBaisa: net, vatBaisa: vat, totalBaisa: net + vat };
}

/** Validate an invoice against PINT OM business rules (subset) with plain-language messages. */
function validate(inv, rules) {
  const errors = [];
  const vatPattern = new RegExp(rules['registration.vatNumberFormat'].pattern);
  const e = (rule, field, en, ar, fixEn, fixAr) => errors.push({ rule, field, messageEn: en, messageAr: ar, fixEn, fixAr });
  const seller = inv.seller || {};
  const buyer = inv.buyer || {};

  if (!inv.number) e('BR-02', 'number', 'Invoice number is missing.', 'رقم الفاتورة مفقود.', 'Give the invoice a unique sequential number.', 'أعطِ الفاتورة رقماً تسلسلياً فريداً.');
  if (!inv.issueDate) e('BR-03', 'issueDate', 'Issue date is missing.', 'تاريخ الإصدار مفقود.', 'Enter the date the invoice is issued.', 'أدخل تاريخ إصدار الفاتورة.');
  if (!seller.name) e('BR-06', 'seller.name', 'Seller legal name is missing.', 'اسم البائع مفقود.', 'Complete your organisation profile (Settings → Organisation).', 'أكمل ملف المنشأة.');
  if (!seller.vatNumber || !vatPattern.test(String(seller.vatNumber))) e('BR-OM-01', 'seller.vatNumber', 'Seller VAT number is missing or not in the format OM + 10 characters.', 'رقم التسجيل الضريبي للبائع مفقود أو غير صحيح.', 'Add your VAT number in Settings → Organisation.', 'أضف رقم التسجيل الضريبي في الإعدادات.');
  if (!seller.address) e('BR-08', 'seller.address', 'Seller address is missing.', 'عنوان البائع مفقود.', 'Add your registered address in Settings.', 'أضف العنوان المسجل.');
  if (inv.kind === 'B2B') {
    if (!buyer.name) e('BR-07', 'buyer.name', 'Buyer name is missing.', 'اسم المشتري مفقود.', 'Choose or create the customer.', 'اختر العميل أو أنشئه.');
    if ((!buyer.country || buyer.country === 'OM') && buyer.vatNumber && !vatPattern.test(String(buyer.vatNumber))) e('BR-OM-02', 'buyer.vatNumber', `Buyer VAT number "${buyer.vatNumber}" is not valid.`, 'رقم التسجيل الضريبي للمشتري غير صحيح.', 'Check the number on the customer\'s VAT certificate (OM + 10 characters).', 'تحقق من الرقم في شهادة العميل.');
    if ((!buyer.country || buyer.country === 'OM') && !buyer.vatNumber && !buyer.crNumber) e('BR-OM-03', 'buyer.vatNumber', 'An Omani business buyer needs a VAT number (or CR number if not VAT-registered).', 'المشتري العُماني يحتاج رقم تسجيل ضريبي أو سجل تجاري.', 'Add the customer\'s VAT or CR number.', 'أضف رقم التسجيل الضريبي أو السجل التجاري للعميل.');
    if (!buyer.address && (!buyer.country || buyer.country === 'OM')) e('BR-10', 'buyer.address', 'Buyer address is missing.', 'عنوان المشتري مفقود.', 'Add the customer address.', 'أضف عنوان العميل.');
  }
  if (!inv.lines || !inv.lines.length) e('BR-16', 'lines', 'The invoice has no lines.', 'الفاتورة لا تحتوي على بنود.', 'Add at least one product or service line.', 'أضف بنداً واحداً على الأقل.');
  (inv.lines || []).forEach((l) => {
    if (!l.description) e('BR-25', `lines[${l.lineNo}].description`, `Line ${l.lineNo}: description is missing.`, `البند ${l.lineNo}: الوصف مفقود.`, 'Describe the goods or service.', 'صف السلعة أو الخدمة.');
    if (!(l.quantity > 0)) e('BR-22', `lines[${l.lineNo}].quantity`, `Line ${l.lineNo}: quantity must be greater than zero.`, `البند ${l.lineNo}: يجب أن تكون الكمية أكبر من صفر.`, 'Use a credit note for returns instead of negative quantities.', 'استخدم إشعاراً دائناً للمرتجعات.');
    if (BigInt(l.unitPriceBaisa) < 0n) e('BR-27', `lines[${l.lineNo}].unitPrice`, `Line ${l.lineNo}: price cannot be negative.`, `البند ${l.lineNo}: لا يمكن أن يكون السعر سالباً.`, 'Enter a positive price.', 'أدخل سعراً موجباً.');
    if (['ZERO_RATED', 'EXEMPT', 'OUT_OF_SCOPE', 'REVERSE_CHARGE'].includes(l.vatCategory) && !l.exemptionReason) {
      e('BR-E-10', `lines[${l.lineNo}].exemptionReason`, `Line ${l.lineNo}: a ${l.vatCategory.toLowerCase().replace(/_/g, '-')} line needs an exemption/zero-rating reason.`, `البند ${l.lineNo}: يلزم ذكر سبب الإعفاء أو نسبة الصفر.`, 'Add the reason, e.g. "Export of goods" or "Financial services".', 'أضف السبب، مثل "تصدير سلع".');
    }
  });
  if (inv.docType === 'CREDIT_NOTE' || inv.docType === 'DEBIT_NOTE') {
    if (!inv.originalNumber) e('BR-55', 'originalNumber', 'Credit and debit notes must reference the original invoice.', 'يجب أن يشير الإشعار إلى الفاتورة الأصلية.', 'Select the original invoice.', 'اختر الفاتورة الأصلية.');
    if (!inv.note) e('BR-OM-10', 'note', 'Give the reason for the credit/debit note.', 'اذكر سبب الإشعار.', 'E.g. "Goods returned" or "Price correction".', 'مثال: "إرجاع بضائع".');
  }
  if (inv.currency && inv.currency !== 'OMR' && !inv.exchangeRate) e('BR-OM-05', 'currency', 'Invoices in a foreign currency must state the VAT amount in OMR (exchange rate missing).', 'يجب ذكر مبلغ الضريبة بالريال العُماني.', 'Enter the Central Bank of Oman exchange rate.', 'أدخل سعر صرف البنك المركزي العُماني.');
  // Totals consistency
  const calc = sum((inv.lines || []).map((l) => l.netBaisa));
  if (inv.netBaisa !== undefined && BigInt(inv.netBaisa) !== calc) e('BR-CO-10', 'totals', 'Invoice total does not equal the sum of lines.', 'إجمالي الفاتورة لا يساوي مجموع البنود.', 'Recalculate the invoice.', 'أعد احتساب الفاتورة.');
  return { valid: errors.length === 0, errors };
}

function partyXml(tag, p) {
  return `  <cac:${tag}>
    <cac:Party>
${p.peppolId ? `      <cbc:EndpointID schemeID="0235">${xmlEsc(p.peppolId)}</cbc:EndpointID>\n` : ''}      <cac:PartyName><cbc:Name>${xmlEsc(p.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlEsc(p.address || '')}</cbc:StreetName>
        <cbc:CityName>${xmlEsc(p.city || '')}</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>${xmlEsc(p.country || 'OM')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
${p.vatNumber ? `      <cac:PartyTaxScheme><cbc:CompanyID>${xmlEsc(p.vatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>\n` : ''}      <cac:PartyLegalEntity><cbc:RegistrationName>${xmlEsc(p.name)}</cbc:RegistrationName>${p.crNumber ? `<cbc:CompanyID>${xmlEsc(p.crNumber)}</cbc:CompanyID>` : ''}</cac:PartyLegalEntity>
    </cac:Party>
  </cac:${tag}>`;
}

/** Build UBL 2.1 XML (PINT OM profile). */
function buildXml(inv, rules) {
  const spec = rules['einvoicing.spec'];
  const isCredit = inv.docType === 'CREDIT_NOTE';
  const root = isCredit ? 'CreditNote' : 'Invoice';
  const ns = isCredit ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2' : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
  const typeTag = isCredit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode';
  const lineTag = isCredit ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyTag = isCredit ? 'CreditedQuantity' : 'InvoicedQuantity';
  const code = spec.invoiceTypeCodes[inv.docType] || '380';
  const catCode = (c) => spec.taxCategoryCodes[c] || 'S';
  const groups = {};
  for (const l of inv.lines) {
    const k = `${l.vatCategory}|${l.rateBp}`;
    groups[k] = groups[k] || { cat: l.vatCategory, rateBp: l.rateBp, net: 0n, vat: 0n, reason: l.exemptionReason };
    groups[k].net += l.netBaisa; groups[k].vat += l.vatBaisa;
  }
  const subtotals = Object.values(groups).map((g) => `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="OMR">${amt(g.net)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="OMR">${amt(g.vat)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${catCode(g.cat)}</cbc:ID><cbc:Percent>${(g.rateBp / 100).toFixed(2)}</cbc:Percent>${g.reason ? `<cbc:TaxExemptionReason>${xmlEsc(g.reason)}</cbc:TaxExemptionReason>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>`).join('\n');
  const lines = inv.lines.map((l) => `  <cac:${lineTag}>
    <cbc:ID>${l.lineNo}</cbc:ID>
    <cbc:${qtyTag} unitCode="${xmlEsc(l.unitCode)}">${l.quantity}</cbc:${qtyTag}>
    <cbc:LineExtensionAmount currencyID="OMR">${amt(l.netBaisa)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${xmlEsc(l.description)}</cbc:Name>${l.descriptionAr ? `\n      <cbc:Description>${xmlEsc(l.descriptionAr)}</cbc:Description>` : ''}${l.itemCode ? `\n      <cac:SellersItemIdentification><cbc:ID>${xmlEsc(l.itemCode)}</cbc:ID></cac:SellersItemIdentification>` : ''}
      <cac:ClassifiedTaxCategory><cbc:ID>${catCode(l.vatCategory)}</cbc:ID><cbc:Percent>${(l.rateBp / 100).toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="OMR">${amt(l.unitPriceBaisa)}</cbc:PriceAmount></cac:Price>
  </cac:${lineTag}>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${ns}" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${spec.customizationId}</cbc:CustomizationID>
  <cbc:ProfileID>${spec.profileId}</cbc:ProfileID>
  <cbc:ID>${xmlEsc(inv.number)}</cbc:ID>
  <cbc:IssueDate>${iso(inv.issueDate)}</cbc:IssueDate>
  <cbc:${typeTag}>${code}</cbc:${typeTag}>
${inv.note ? `  <cbc:Note>${xmlEsc(inv.note)}</cbc:Note>\n` : ''}  <cbc:DocumentCurrencyCode>OMR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>OMR</cbc:TaxCurrencyCode>
${inv.originalNumber ? `  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${xmlEsc(inv.originalNumber)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>\n` : ''}${partyXml('AccountingSupplierParty', inv.seller)}
${partyXml('AccountingCustomerParty', inv.kind === 'B2C' && !inv.buyer?.name ? { name: 'Consumer', country: 'OM' } : inv.buyer)}
${inv.supplyDate ? `  <cac:Delivery><cbc:ActualDeliveryDate>${iso(inv.supplyDate)}</cbc:ActualDeliveryDate></cac:Delivery>\n` : ''}  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="OMR">${amt(inv.vatBaisa)}</cbc:TaxAmount>
${subtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="OMR">${amt(inv.netBaisa)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="OMR">${amt(inv.netBaisa)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="OMR">${amt(inv.totalBaisa)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="OMR">${amt(inv.totalBaisa)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</${root}>
`;
}

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * B2C QR payload: TLV (tag-length-value) base64 of seller name, VAT number, timestamp, total, VAT.
 * Structure follows the GCC convention; the official OTA QR spec must replace this before go-live [VERIFY].
 */
function qrPayload(inv) {
  const fields = [inv.seller?.name || '', inv.seller?.vatNumber || '', new Date(inv.issueDate).toISOString(), amt(inv.totalBaisa), amt(inv.vatBaisa)];
  const parts = fields.map((v, i) => {
    const val = Buffer.from(String(v), 'utf8');
    return Buffer.concat([Buffer.from([i + 1, val.length]), val]);
  });
  return Buffer.concat(parts).toString('base64');
}

/** Readiness checklist score (plan E5-09). */
function readiness({ org, parties = [], invoices = [], aspLinked }) {
  const customers = parties.filter((p) => p.kind !== 'SUPPLIER');
  const omani = customers.filter((p) => p.country === 'OM');
  const withVat = omani.filter((p) => p.vatNumber || p.crNumber);
  const withAddr = customers.filter((p) => p.address);
  const passedTests = invoices.filter((i) => ['VALID', 'SENT', 'ACCEPTED', 'DELIVERED'].includes(i.status)).length;
  const items = [
    { id: 'vatNumber', weight: 20, passed: !!org.vatNumber && /^OM[0-9A-Z]{10}$/.test(org.vatNumber), labelEn: 'Your VAT number is recorded and valid', labelAr: 'رقم التسجيل الضريبي مسجل وصحيح' },
    { id: 'address', weight: 10, passed: !!org.address, labelEn: 'Registered address completed', labelAr: 'العنوان المسجل مكتمل' },
    { id: 'customerVat', weight: 20, passed: omani.length > 0 && withVat.length === omani.length, labelEn: `Omani customers have VAT/CR numbers (${withVat.length}/${omani.length})`, labelAr: 'أرقام التسجيل للعملاء العُمانيين مكتملة' },
    { id: 'customerAddress', weight: 10, passed: customers.length > 0 && withAddr.length === customers.length, labelEn: `Customer addresses complete (${withAddr.length}/${customers.length})`, labelAr: 'عناوين العملاء مكتملة' },
    { id: 'taxCategories', weight: 10, passed: invoices.length > 0, labelEn: 'Products/services have VAT categories (at least one invoice created)', labelAr: 'تم تحديد فئات الضريبة للمنتجات' },
    { id: 'aspLinked', weight: 15, passed: !!aspLinked, labelEn: 'Triple i Oman partner ASP linked on the Fawtara portal', labelAr: 'تم ربط مزود الخدمة المعتمد في بوابة فوترة' },
    { id: 'testInvoices', weight: 15, passed: passedTests >= 3, labelEn: `Test invoices passed validation (${passedTests}/3)`, labelAr: 'اجتازت الفواتير التجريبية التحقق' },
  ];
  const score = items.reduce((a, i) => a + (i.passed ? i.weight : 0), 0);
  return { score, items };
}

module.exports = { computeLines, validate, buildXml, sha256, qrPayload, readiness };
