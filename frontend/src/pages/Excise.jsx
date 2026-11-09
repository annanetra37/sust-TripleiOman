import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Card, ErrorText, Field, Loading, PageHeader, useAsync } from '../components/ui';

export default function Excise() {
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const navigate = useNavigate();
  const cats = useAsync(() => api.get('/calculators/excise/categories'), []);
  const [lines, setLines] = useState([{ category: 'TOBACCO', description: '', quantity: '', unitPriceOmr: '', referencePriceOmr: '' }]);
  const [period, setPeriod] = useState({ periodStart: '', periodEnd: '' });
  const [res, setRes] = useState(null);
  const [stamps, setStamps] = useState({ ordered: '', applied: '', sold: '', onHandCounted: '', upcomingShipmentUnits: '' });
  const [stampRes, setStampRes] = useState(null);
  const [err, setErr] = useState(null);
  if (!cats.data) return <Loading />;
  const setLine = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <div className="space-y-6">
      <PageHeader title={t('excise')} subtitle={L('100% on tobacco, energy drinks, pork and alcohol; 50% on carbonated and sweetened drinks. Quarterly return; digital tax stamps for tobacco and certain drinks.', '100% على التبغ ومشروبات الطاقة ولحم الخنزير والكحول؛ 50% على المشروبات الغازية والمحلاة. إقرار ربع سنوي وطوابع ضريبية رقمية.')} />
      {err && <ErrorText error={err} />}
      <Card title={L('Excise calculation', 'حساب الضريبة الانتقائية')} actions={<button type="button" className="btn-secondary btn-sm" onClick={() => setLines([...lines, { category: 'CARBONATED', description: '', quantity: '', unitPriceOmr: '', referencePriceOmr: '' }])}><Plus className="h-4 w-4" />{L('Product line', 'بند منتج')}</button>}>
        {lines.map((l, i) => (
          <div key={i} className="mb-2 grid gap-2 sm:grid-cols-12">
            <select className="input sm:col-span-3" value={l.category} onChange={(e) => setLine(i, 'category', e.target.value)}>{Object.entries(cats.data).map(([k, c]) => <option key={k} value={k}>{lang === 'ar' ? c.labelAr : c.labelEn} ({c.rateBp / 100}%)</option>)}</select>
            <input className="input sm:col-span-3" placeholder={t('description')} value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} />
            <input className="input sm:col-span-2" type="number" dir="ltr" placeholder={L('Units', 'الوحدات')} value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
            <input className="input sm:col-span-2" type="number" step="0.001" dir="ltr" placeholder={L('Retail price / unit', 'سعر التجزئة')} value={l.unitPriceOmr} onChange={(e) => setLine(i, 'unitPriceOmr', e.target.value)} />
            <input className="input sm:col-span-1" type="number" step="0.001" dir="ltr" placeholder={L('Ref.', 'مرجعي')} title={L('OTA reference price (if higher)', 'السعر المرجعي للجهاز')} value={l.referencePriceOmr} onChange={(e) => setLine(i, 'referencePriceOmr', e.target.value)} />
            <button type="button" className="btn-ghost sm:col-span-1" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <button type="button" className="btn-secondary" onClick={async () => { try { setRes(await api.post('/calculators/excise', { lines })); } catch (x) { setErr(x); } }}>{L('Calculate', 'احسب')}</button>
          <Field label={L('Return period from', 'الفترة من')}><input type="date" className="input" value={period.periodStart} onChange={(e) => setPeriod({ ...period, periodStart: e.target.value })} /></Field>
          <Field label={L('to', 'إلى')}><input type="date" className="input" value={period.periodEnd} onChange={(e) => setPeriod({ ...period, periodEnd: e.target.value })} /></Field>
          {can('return.prepare') && <button type="button" className="btn-primary" disabled={!period.periodStart || !period.periodEnd} onClick={async () => { try { const r = await api.post('/returns/excise', { ...period, lines }); navigate(`/app/returns/${r.id}`); } catch (x) { setErr(x); } }}>{L('Save as quarterly return', 'حفظ كإقرار ربع سنوي')}</button>}
        </div>
        {res && (
          <table className="table mt-4"><thead><tr><th>{L('Product', 'المنتج')}</th><th className="text-end">{L('Base', 'الوعاء')}</th><th>{L('Rate', 'النسبة')}</th><th className="text-end">{L('Excise', 'الضريبة')}</th></tr></thead>
            <tbody>{res.lines.map((l, i) => <tr key={i}><td>{l.label} {l.description}{l.stampsRequired && <span className="ms-1 text-xs text-amber-700">({L('stamps', 'طوابع')})</span>}</td><td className="text-end num">{f.omr(l.baseBaisa)}</td><td>{l.rateBp / 100}%</td><td className="text-end num">{f.omr(l.exciseBaisa)}</td></tr>)}
              <tr className="font-semibold"><td>{t('total')}</td><td className="text-end num">{f.omr(res.totalBaseBaisa)}</td><td /><td className="text-end num">{f.omr(res.totalExciseBaisa)}</td></tr></tbody></table>
        )}
        <p className="mt-2 text-xs text-slate-500">{L('Price base per current regulation (including 2025 changes) is to be confirmed with your adviser.', 'وعاء السعر وفق اللائحة الحالية (بما فيها تعديلات 2025) يُؤكد مع مستشارك.')}</p>
      </Card>
      <Card title={L('Digital tax stamp reconciliation', 'مطابقة الطوابع الضريبية الرقمية')}>
        <div className="grid gap-3 sm:grid-cols-5">
          {[['ordered', 'Ordered', 'المطلوبة'], ['applied', 'Applied', 'المستخدمة'], ['sold', 'Sold', 'المباعة'], ['onHandCounted', 'Counted on hand', 'المعدودة'], ['upcomingShipmentUnits', 'Next shipment units', 'وحدات الشحنة القادمة']].map(([k, en, ar]) => (
            <Field key={k} label={L(en, ar)}><input className="input" type="number" dir="ltr" value={stamps[k]} onChange={(e) => setStamps({ ...stamps, [k]: e.target.value })} /></Field>
          ))}
        </div>
        <button type="button" className="btn-secondary mt-3" onClick={async () => setStampRes(await api.post('/calculators/excise/stamps', Object.fromEntries(Object.entries(stamps).map(([k, v]) => [k, v === '' ? (k === 'onHandCounted' ? null : 0) : Number(v)]))))}>{L('Reconcile', 'مطابقة')}</button>
        {stampRes && <div className="mt-3 space-y-2"><div className="text-sm">{L('Expected on hand', 'المتوقع في المخزون')}: <b>{f.int(stampRes.expectedOnHand)}</b> · {L('Applied but unsold', 'مستخدمة غير مباعة')}: <b>{f.int(stampRes.unsoldApplied)}</b></div>{stampRes.alerts.map((a, i) => <Alert key={i} tone="warn">{a}</Alert>)}{!stampRes.alerts.length && <Alert tone="success">{L('Stamps reconcile.', 'الطوابع متطابقة.')}</Alert>}</div>}
      </Card>
    </div>
  );
}
