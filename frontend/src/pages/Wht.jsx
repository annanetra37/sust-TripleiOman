import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat, isoDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Badge, Card, ErrorText, Field, Loading, PageHeader, Toggle, useAsync } from '../components/ui';

export default function Wht() {
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const navigate = useNavigate();
  const rates = useAsync(() => api.get('/wht/rates'), []);
  const suppliers = useAsync(() => api.get('/parties?kind=SUPPLIER'), []);
  const payments = useAsync(() => api.get('/wht'), []);
  const [form, setForm] = useState({ partyId: '', category: 'TECHNICAL_SERVICES', amountOmr: '', paymentDate: isoDate(new Date()), netOfTax: false, description: '' });
  const [preview, setPreview] = useState(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [err, setErr] = useState(null);
  if (!rates.data || !suppliers.data) return <Loading />;
  const foreign = suppliers.data.filter((p) => p.country !== 'OM');
  const calc = async (body = form) => { setErr(null); try { setPreview(await api.post('/wht/calculate', body)); } catch (x) { setErr(x); } };

  return (
    <div className="space-y-6">
      <PageHeader title={t('wht')} subtitle={L('10% withholding tax on payments to non-residents without a permanent establishment in Oman (royalties, services, management fees, software, R&D, equipment rental…), reduced by tax treaties where a valid residency certificate is on file.', 'ضريبة استقطاع 10% على المدفوعات لغير المقيمين بدون منشأة دائمة في عُمان، وتخفض وفق الاتفاقيات الضريبية عند وجود شهادة إقامة سارية.')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={L('Record a payment to a foreign party', 'تسجيل دفعة لطرف أجنبي')}>
          {foreign.length === 0 && <Alert tone="info" className="mb-3">{L('Add foreign suppliers first (country, PE status, residency certificate).', 'أضف الموردين الأجانب أولاً.')} <Link to="/app/parties" className="underline">{t('parties')}</Link></Alert>}
          {err && <ErrorText error={err} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={L('Payee', 'المستفيد')} className="sm:col-span-2"><select className="input" value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}><option value="">{L('Choose…', 'اختر…')}</option>{foreign.map((p) => <option key={p.id} value={p.id}>{p.nameEn} ({p.country}){p.residencyCertExpiry ? ' ✓' : ''}</option>)}</select></Field>
            <Field label={L('Payment type', 'نوع الدفعة')}><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(rates.data.categories).map(([k, c]) => <option key={k} value={k}>{lang === 'ar' ? c.labelAr : c.labelEn}</option>)}</select></Field>
            <Field label={L('Payment date', 'تاريخ الدفع')}><input type="date" className="input" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} /></Field>
            <Field label={L('Amount (OMR)', 'المبلغ (ر.ع)')}><input className="input" type="number" step="0.001" dir="ltr" value={form.amountOmr} onChange={(e) => setForm({ ...form, amountOmr: e.target.value })} /></Field>
            <div className="pt-6"><Toggle checked={form.netOfTax} onChange={(v) => setForm({ ...form, netOfTax: v })} label={L('Contract says "net of tax" (gross-up)', 'العقد "صافٍ من الضريبة" (رفع إجمالي)')} /></div>
            <Field label={t('description')} className="sm:col-span-2"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex gap-2"><button type="button" className="btn-secondary" disabled={!form.partyId || !form.amountOmr} onClick={() => calc()}>{L('Calculate', 'احسب')}</button>{can('data.write') && <button type="button" className="btn-primary" disabled={!preview} onClick={async () => { await api.post('/wht', form); setPreview(null); setForm({ ...form, amountOmr: '', description: '' }); payments.reload(); }}>{L('Record payment', 'تسجيل الدفعة')}</button>}</div>
          {preview && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center"><div><div className="text-xs text-slate-500">{L('Gross', 'الإجمالي')}</div><div className="font-semibold num">{f.omr(preview.grossBaisa)}</div></div><div><div className="text-xs text-slate-500">{L('WHT', 'الاستقطاع')} ({preview.rateBp / 100}%)</div><div className="font-semibold num text-accent-600">{f.omr(preview.whtBaisa)}</div></div><div><div className="text-xs text-slate-500">{L('Pay supplier', 'يُدفع للمورد')}</div><div className="font-semibold num">{f.omr(preview.netPaidBaisa)}</div></div></div>
              <ul className="mt-3 list-disc space-y-1 ps-5 text-xs text-slate-600">{preview.steps.map((s, i) => <li key={i}>{s.step}</li>)}</ul>
            </div>
          )}
        </Card>
        <Card title={L('Monthly WHT statement', 'كشف الاستقطاع الشهري')}>
          <p className="mb-3 text-sm text-slate-600">{L('Prepare the statement for a month; it then follows the same review → approve → file workflow as other returns.', 'أعد الكشف لشهر معين؛ ثم يتبع نفس مسار المراجعة والاعتماد والتقديم.')}</p>
          <div className="flex gap-2"><input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />{can('return.prepare') && <button type="button" className="btn-primary" onClick={async () => { const r = await api.post('/returns/wht', { month }); navigate(`/app/returns/${r.id}`); }}>{L('Prepare statement', 'إعداد الكشف')}</button>}</div>
          <p className="mt-3 text-xs text-slate-500">{L('Remittance deadline per the rules library (14 days after month-end) [to be confirmed with your adviser].', 'موعد التوريد وفق مكتبة القواعد (14 يوماً بعد نهاية الشهر) [يُؤكد مع مستشارك].')}</p>
        </Card>
      </div>
      <Card title={L('Payments', 'المدفوعات')} padded={false}>
        {!payments.data ? <Loading /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>{t('date')}</th><th>{L('Payee', 'المستفيد')}</th><th>{L('Type', 'النوع')}</th><th className="text-end">{L('Gross', 'الإجمالي')}</th><th>{L('Rate', 'النسبة')}</th><th className="text-end">WHT</th><th /></tr></thead>
            <tbody>{payments.data.map((p) => (
              <tr key={p.id}><td>{f.date(p.paymentDate)}</td><td>{p.party.nameEn} <span className="text-xs text-slate-500">({p.party.country})</span></td><td className="text-xs">{lang === 'ar' ? rates.data.categories[p.category]?.labelAr : rates.data.categories[p.category]?.labelEn}</td><td className="text-end num">{f.omr(p.grossBaisa)}</td><td>{p.rateBp / 100}% {p.treatyApplied && <Badge tone="blue">{L('treaty', 'اتفاقية')}</Badge>}</td><td className="text-end num">{f.omr(p.whtBaisa)}</td>
                <td className="text-end">{can('data.write') && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={async () => { await api.del(`/wht/${p.id}`); payments.reload(); }}><Trash2 className="h-4 w-4" /></button>}</td></tr>
            ))}{!payments.data.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">{t('none')}</td></tr>}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
