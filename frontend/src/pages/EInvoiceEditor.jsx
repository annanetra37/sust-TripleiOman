import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat, isoDate } from '../lib/format';
import { Alert, Card, ErrorText, Field, Loading, PageHeader, useAsync } from '../components/ui';

const CATS = ['STANDARD', 'ZERO_RATED', 'EXEMPT', 'OUT_OF_SCOPE', 'REVERSE_CHARGE'];
const blank = { description: '', descriptionAr: '', quantity: 1, unitPriceOmr: '', vatCategory: 'STANDARD', exemptionReason: '' };

/** Simple e-invoice form for micro-businesses (plan E5-10) and the editor for drafts. */
export default function EInvoiceEditor() {
  const { id } = useParams();
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const navigate = useNavigate();
  const parties = useAsync(() => api.get('/parties?kind=CUSTOMER'), []);
  const [inv, setInv] = useState({ kind: 'B2B', buyerPartyId: '', issueDate: isoDate(new Date()), supplyDate: '', note: '', lines: [{ ...blank }] });
  const [loaded, setLoaded] = useState(!id);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/einvoices/${id}`).then((x) => {
      setInv({ kind: x.kind, buyerPartyId: x.buyer?.partyId || '', issueDate: isoDate(x.issueDate), supplyDate: isoDate(x.supplyDate), note: x.note || '', lines: x.lines.map((l) => ({ description: l.description, descriptionAr: l.descriptionAr, quantity: l.quantity, unitPriceOmr: Number(l.unitPriceBaisa) / 1000, vatCategory: l.vatCategory, exemptionReason: l.exemptionReason })) });
      setResult(x); setLoaded(true);
    });
  }, [id]);

  const totals = useMemo(() => {
    let net = 0; let vat = 0;
    for (const l of inv.lines) { const n = Math.round(Number(l.unitPriceOmr || 0) * 1000 * Number(l.quantity || 0)); net += n; vat += l.vatCategory === 'STANDARD' ? Math.round(n * 0.05) : 0; }
    return { net, vat, total: net + vat };
  }, [inv.lines]);

  const setLine = (i, k, v) => setInv({ ...inv, lines: inv.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) });
  const save = async () => {
    setErr(null);
    const body = { ...inv, buyerPartyId: inv.kind === 'B2B' ? inv.buyerPartyId : undefined, lines: inv.lines.map((l) => ({ ...l, quantity: Number(l.quantity) })) };
    try {
      const r = id ? await api.patch(`/einvoices/${id}`, body) : await api.post('/einvoices', body);
      if (r.status === 'VALID') navigate(`/app/einvoices/${r.id}`);
      else { setResult(r); if (!id) navigate(`/app/einvoices/${r.id}/edit`, { replace: true }); }
    } catch (x) { setErr(x); }
  };
  if (!loaded || !parties.data) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title={id ? L('Edit e-invoice', 'تعديل الفاتورة') : L('New e-invoice', 'فاتورة إلكترونية جديدة')} subtitle={L('Fields required by the PINT OM specification are checked before sending. Errors are explained in plain language.', 'يتم التحقق من الحقول المطلوبة وفق مواصفات PINT OM قبل الإرسال، مع شرح الأخطاء بلغة واضحة.')} />
      {err && <ErrorText error={err} />}
      {result?.status === 'INVALID' && (
        <Alert tone="warn" title={L('Please fix these before sending', 'يرجى تصحيح ما يلي قبل الإرسال')}>
          <ul className="mt-1 space-y-1">{result.validationErrors.map((e, i) => <li key={i}><b>{lang === 'ar' ? e.messageAr : e.messageEn}</b> — {lang === 'ar' ? e.fixAr : e.fixEn} <span className="text-xs text-slate-500">({e.rule})</span></li>)}</ul>
        </Alert>
      )}
      <Card>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={L('Invoice type', 'نوع الفاتورة')}><select className="input" value={inv.kind} onChange={(e) => setInv({ ...inv, kind: e.target.value })}><option value="B2B">{L('Tax invoice (business customer)', 'فاتورة ضريبية (عميل تجاري)')}</option><option value="B2C">{L('Simplified (consumer, with QR)', 'مبسطة (مستهلك، مع QR)')}</option></select></Field>
          {inv.kind === 'B2B' && (
            <Field label={L('Customer', 'العميل')} className="sm:col-span-2" hint={<Link to="/app/parties" className="text-brand-700">{L('Add a customer', 'إضافة عميل')}</Link>}>
              <select className="input" value={inv.buyerPartyId} onChange={(e) => setInv({ ...inv, buyerPartyId: e.target.value })}><option value="">{L('Choose…', 'اختر…')}</option>{parties.data.map((p) => <option key={p.id} value={p.id}>{L(p.nameEn, p.nameAr || p.nameEn)} {p.vatNumber ? `· ${p.vatNumber}` : ''}</option>)}</select>
            </Field>
          )}
          <Field label={L('Issue date', 'تاريخ الإصدار')}><input type="date" className="input" value={inv.issueDate} onChange={(e) => setInv({ ...inv, issueDate: e.target.value })} /></Field>
          <Field label={L('Supply date (if different)', 'تاريخ التوريد (إن اختلف)')}><input type="date" className="input" value={inv.supplyDate} onChange={(e) => setInv({ ...inv, supplyDate: e.target.value })} /></Field>
          <Field label={L('Note', 'ملاحظة')} className="sm:col-span-3"><input className="input" value={inv.note} onChange={(e) => setInv({ ...inv, note: e.target.value })} /></Field>
        </div>
      </Card>
      <Card title={L('Lines', 'البنود')} actions={<button type="button" className="btn-secondary btn-sm" onClick={() => setInv({ ...inv, lines: [...inv.lines, { ...blank }] })}><Plus className="h-4 w-4" />{L('Add line', 'إضافة بند')}</button>}>
        <div className="space-y-3">
          {inv.lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12">
              <Field label={t('description')} className="sm:col-span-3"><input className="input" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} /></Field>
              <Field label={L('Arabic description', 'الوصف بالعربية')} className="sm:col-span-3"><input className="input" dir="rtl" value={l.descriptionAr} onChange={(e) => setLine(i, 'descriptionAr', e.target.value)} /></Field>
              <Field label={L('Qty', 'الكمية')} className="sm:col-span-1"><input className="input" type="number" min="0" step="any" dir="ltr" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} /></Field>
              <Field label={L('Unit price (OMR)', 'سعر الوحدة')} className="sm:col-span-2"><input className="input" type="number" step="0.001" dir="ltr" value={l.unitPriceOmr} onChange={(e) => setLine(i, 'unitPriceOmr', e.target.value)} /></Field>
              <Field label={L('VAT', 'الضريبة')} className="sm:col-span-2"><select className="input" value={l.vatCategory} onChange={(e) => setLine(i, 'vatCategory', e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></Field>
              <div className="flex items-end justify-end sm:col-span-1"><button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setInv({ ...inv, lines: inv.lines.filter((_, j) => j !== i) })} aria-label={t('delete')}><Trash2 className="h-4 w-4" /></button></div>
              {l.vatCategory !== 'STANDARD' && <Field label={L('Exemption / zero-rating reason', 'سبب الإعفاء / نسبة الصفر')} className="sm:col-span-12"><input className="input" value={l.exemptionReason} onChange={(e) => setLine(i, 'exemptionReason', e.target.value)} placeholder={L('e.g. Export of goods', 'مثال: تصدير سلع')} /></Field>}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          <div>{t('net')}: <span className="num">{f.omr(totals.net)}</span></div>
          <div>{t('vat')}: <span className="num">{f.omr(totals.vat)}</span></div>
          <div className="text-lg font-semibold">{t('total')}: <span className="num">{f.omr(totals.total)}</span></div>
        </div>
      </Card>
      <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => navigate('/app/einvoices')}>{t('cancel')}</button><button type="button" className="btn-primary" onClick={save}>{L('Validate & save', 'تحقق واحفظ')}</button></div>
    </div>
  );
}
