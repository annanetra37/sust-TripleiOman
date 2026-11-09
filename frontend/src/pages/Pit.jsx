import { useEffect, useState } from 'react';
import { Plus, Trash2, Upload, Plane, Wallet, HeartPulse } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { Alert, Badge, Card, Loading, PageHeader, ProgressBar, Stat, Toggle, useAsync } from '../components/ui';

const INCOME = { EMPLOYMENT: ['Employment (salary & allowances)', 'التوظيف (الراتب والبدلات)'], RENTAL: ['Rental income', 'دخل الإيجار'], SELF_EMPLOYMENT: ['Business / self-employment', 'عمل حر / تجاري'], DIVIDENDS: ['Dividends', 'أرباح الأسهم'], INTEREST: ['Interest', 'الفوائد'], ROYALTIES: ['Royalties', 'الإتاوات'], CAPITAL_GAINS: ['Capital gains', 'الأرباح الرأسمالية'], OTHER: ['Other', 'أخرى'] };
const DED = { EDUCATION: ['Education', 'التعليم'], HEALTHCARE: ['Healthcare', 'الرعاية الصحية'], PRIMARY_HOUSING: ['Primary housing', 'السكن الرئيسي'], ZAKAT: ['Zakat', 'الزكاة'], DONATIONS: ['Donations', 'التبرعات'], INHERITANCE: ['Inheritance-related', 'متعلق بالميراث'] };

/** Personal income tax tracker — "TurboTax for Oman" tracking half (plan E9-02..E9-05, E9-07). */
export default function Pit() {
  const { L, lang } = useI18n();
  const f = useFormat();
  const [year, setYear] = useState(Math.max(2028, new Date().getUTCFullYear()));
  const { data, loading, setData } = useAsync(() => api.get(`/pit/profile/${year}`, { org: false }), [year]);
  const receipts = useAsync(() => api.get('/documents/personal', { org: false }), []);
  const [d, setD] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setD(data.data); }, [data]);
  if (loading || !d) return <Loading />;
  const s = data.summary;

  const save = async (next = d) => { setSaving(true); try { const r = await api.put(`/pit/profile/${year}`, next, { org: false }); setData((x) => ({ ...x, data: r.data, summary: r.summary })); } finally { setSaving(false); } };
  const upd = (k, i, field, value) => setD({ ...d, [k]: d[k].map((x, j) => (j === i ? { ...x, [field]: value } : x)) });
  const del = (k, i) => { const next = { ...d, [k]: d[k].filter((_, j) => j !== i) }; setD(next); save(next); };
  const uploadReceipt = async (file, idx) => {
    const fd = new FormData(); fd.append('file', file); fd.append('title', file.name); fd.append('relatedType', 'pit');
    const doc = await api.upload('/documents/personal', fd, { org: false });
    receipts.reload();
    const next = { ...d, deductions: d.deductions.map((x, j) => (j === idx ? { ...x, documentId: doc.id } : x)) };
    setD(next); save(next);
  };
  const res = s.residency;

  return (
    <div className="space-y-6">
      <PageHeader title={L('Personal income tax', 'ضريبة الدخل الشخصي')} subtitle={L('5% on taxable income above OMR 42,000 from 1 January 2028. Track income, deductions and days in Oman all year; file by 30 June of the following year. This space is personal — your employer cannot see it.', '5% على الدخل الخاضع فوق 42,000 ريال اعتباراً من 1 يناير 2028. تتبع الدخل والخصومات وأيام الإقامة طوال العام؛ والتقديم بحلول 30 يونيو من العام التالي. هذه المساحة شخصية — لا يراها صاحب العمل.')}
        actions={<select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[2027, 2028, 2029, 2030].map((y) => <option key={y} value={y}>{L('Tax year', 'السنة الضريبية')} {y}</option>)}</select>} />
      {year < 2028 && <Alert tone="info">{L('Personal income tax does not apply before 2028. Use this year as a dry run.', 'لا تطبق ضريبة الدخل الشخصي قبل 2028. استخدم هذه السنة كتجربة.')}</Alert>}
      <Alert tone="warn">{L('Executive regulations (forms, withholding, deduction caps) are pending. Figures are estimates; the filing interview opens once official forms are published.', 'اللائحة التنفيذية قيد الإصدار. الأرقام تقديرية؛ وستفتح مقابلة التقديم عند نشر النماذج الرسمية.')}</Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Wallet} label={L('Income so far', 'الدخل حتى الآن')} value={f.omr(s.grossIncomeBaisa)} />
        <Stat icon={HeartPulse} label={L('Deductions', 'الخصومات')} value={f.omr(s.deductionsBaisa)} sub={s.estimatedDeductionSavingsBaisa ? L(`Saves about ${f.omr(s.estimatedDeductionSavingsBaisa)}`, `توفر حوالي ${f.omr(s.estimatedDeductionSavingsBaisa)}`) : ''} />
        <Stat label={L('Estimated tax', 'الضريبة التقديرية')} value={f.omr(s.payableBaisa)} tone={Number(s.payableBaisa) > 0 ? 'amber' : undefined} sub={L(`Due ${s.dueDate}`, `مستحقة ${s.dueDate}`)} />
        <Stat icon={Plane} label={L('Days in Oman', 'أيام في عُمان')} value={`${f.int(res.daysInOman)} / ${res.threshold}`} sub={res.resident ? L('Tax resident', 'مقيم ضريبياً') : L(`${res.daysToThreshold} days to residency`, `${res.daysToThreshold} يوماً للإقامة`)} tone={res.warning ? 'amber' : undefined} />
      </div>

      <Card title={L('Tax so far', 'الضريبة حتى الآن')}>
        <div className="mb-2"><ProgressBar value={Math.min(100, (Number(s.netIncomeBaisa) / Number(s.thresholdBaisa)) * 100)} tone={Number(s.taxableBaisa) > 0 ? 'amber' : 'brand'} /></div>
        <p className="text-xs text-slate-500">{L('Net income vs the OMR 42,000 tax-free threshold', 'صافي الدخل مقابل حد الإعفاء 42,000 ريال')}</p>
        <table className="table mt-3"><tbody>{s.steps.map((st, i) => <tr key={i} className={i === s.steps.length - 1 ? 'font-semibold' : ''}><td>{st.step}</td><td className="text-end num">{f.omr(st.amount)}</td></tr>)}</tbody></table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={L('Income', 'الدخل')} actions={<button type="button" className="btn-secondary btn-sm" onClick={() => setD({ ...d, incomes: [...d.incomes, { category: 'EMPLOYMENT', description: '', amountOmr: 0, foreign: false, foreignTaxPaidOmr: 0 }] })}><Plus className="h-4 w-4" /></button>}>
          {d.incomes.map((x, i) => (
            <div key={i} className="mb-3 rounded-lg border border-slate-200 p-3">
              <div className="grid grid-cols-12 gap-2">
                <select className="input col-span-5" value={x.category} onChange={(e) => upd('incomes', i, 'category', e.target.value)}>{Object.entries(INCOME).map(([k, [en, ar]]) => <option key={k} value={k}>{L(en, ar)}</option>)}</select>
                <input className="input col-span-4" placeholder={L('Source', 'المصدر')} value={x.description} onChange={(e) => upd('incomes', i, 'description', e.target.value)} />
                <input className="input col-span-2" type="number" dir="ltr" value={x.amountOmr} onChange={(e) => upd('incomes', i, 'amountOmr', e.target.value)} />
                <button type="button" className="btn-ghost col-span-1" onClick={() => del('incomes', i)}><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <Toggle checked={x.foreign} onChange={(v) => upd('incomes', i, 'foreign', v)} label={L('Foreign income', 'دخل أجنبي')} />
                {x.foreign && <label className="flex items-center gap-2">{L('Tax paid abroad (OMR)', 'الضريبة المدفوعة بالخارج')}<input className="input w-28" type="number" dir="ltr" value={x.foreignTaxPaidOmr} onChange={(e) => upd('incomes', i, 'foreignTaxPaidOmr', e.target.value)} /></label>}
                {x.category === 'RENTAL' && <select className="input w-auto" value={x.rentalCostMethod || ''} onChange={(e) => upd('incomes', i, 'rentalCostMethod', e.target.value)}><option value="">{L('Cost method…', 'طريقة التكاليف…')}</option><option value="PRESUMED">{L('Presumed costs', 'تكاليف افتراضية')}</option><option value="ACTUAL">{L('Actual costs', 'تكاليف فعلية')}</option></select>}
              </div>
            </div>
          ))}
          {!d.incomes.length && <p className="text-sm text-slate-500">{L('Add your salary, rental and other income.', 'أضف راتبك ودخل الإيجار وغيره.')}</p>}
          <button type="button" className="btn-primary mt-2" disabled={saving} onClick={() => save()}>{L('Save', 'حفظ')}</button>
        </Card>
        <Card title={L('Deductions & receipt vault', 'الخصومات وخزنة الإيصالات')} actions={<button type="button" className="btn-secondary btn-sm" onClick={() => setD({ ...d, deductions: [...d.deductions, { category: 'EDUCATION', description: '', amountOmr: 0 }] })}><Plus className="h-4 w-4" /></button>}>
          {d.deductions.map((x, i) => (
            <div key={i} className="mb-2 grid grid-cols-12 items-center gap-2">
              <select className="input col-span-4" value={x.category} onChange={(e) => upd('deductions', i, 'category', e.target.value)}>{Object.entries(DED).map(([k, [en, ar]]) => <option key={k} value={k}>{L(en, ar)}</option>)}</select>
              <input className="input col-span-3" placeholder={t2(L)} value={x.description} onChange={(e) => upd('deductions', i, 'description', e.target.value)} />
              <input className="input col-span-2" type="number" dir="ltr" value={x.amountOmr} onChange={(e) => upd('deductions', i, 'amountOmr', e.target.value)} />
              <label className="btn-ghost col-span-2 cursor-pointer justify-center" title={L('Attach receipt (photo/PDF)', 'إرفاق إيصال')}>{x.documentId ? <Badge tone="green">✓</Badge> : <Upload className="h-4 w-4" />}<input type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={(e) => e.target.files[0] && uploadReceipt(e.target.files[0], i)} /></label>
              <button type="button" className="btn-ghost col-span-1" onClick={() => del('deductions', i)}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {!d.deductions.length && <p className="text-sm text-slate-500">{L('Snap receipts for school fees, medical bills, housing loan interest, zakat and donations as you go.', 'صوّر إيصالات الرسوم الدراسية والفواتير الطبية وفوائد قرض السكن والزكاة والتبرعات أولاً بأول.')}</p>}
          <button type="button" className="btn-primary mt-2" disabled={saving} onClick={() => save()}>{L('Save', 'حفظ')}</button>
          {(receipts.data || []).length > 0 && <p className="mt-3 text-xs text-slate-500">{L(`${receipts.data.length} receipt(s) in your personal vault.`, `${receipts.data.length} إيصال في خزنتك الشخصية.`)}</p>}
        </Card>
      </div>

      <Card title={L('Residency day counter (183-day test)', 'عداد أيام الإقامة (اختبار 183 يوماً)')} actions={<button type="button" className="btn-secondary btn-sm" onClick={() => setD({ ...d, travelLog: [...d.travelLog, { from: `${year}-01-01`, to: `${year}-01-31`, note: '' }] })}><Plus className="h-4 w-4" />{L('Period in Oman', 'فترة في عُمان')}</button>}>
        <p className="mb-3 text-sm text-slate-600">{L('Log the periods you were physically in Oman. You get a warning as you approach 183 days.', 'سجّل الفترات التي كنت فيها في عُمان. ستحصل على تنبيه عند الاقتراب من 183 يوماً.')}</p>
        {d.travelLog.map((x, i) => (
          <div key={i} className="mb-2 grid grid-cols-12 gap-2">
            <input type="date" className="input col-span-4" value={x.from} onChange={(e) => upd('travelLog', i, 'from', e.target.value)} />
            <input type="date" className="input col-span-4" value={x.to} onChange={(e) => upd('travelLog', i, 'to', e.target.value)} />
            <input className="input col-span-3" placeholder={L('Note', 'ملاحظة')} value={x.note} onChange={(e) => upd('travelLog', i, 'note', e.target.value)} />
            <button type="button" className="btn-ghost col-span-1" onClick={() => del('travelLog', i)}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <div className="mt-2 flex items-center gap-3"><button type="button" className="btn-primary" onClick={() => save()}>{L('Save', 'حفظ')}</button>{res.warning && <Badge tone="amber">{L('Approaching 183 days', 'تقترب من 183 يوماً')}</Badge>}{res.resident && <Badge tone="blue">{L('Resident for this year', 'مقيم لهذه السنة')}</Badge>}</div>
      </Card>
      <p className="text-xs text-slate-400">{lang === 'ar' ? 'المصدر: المرسوم السلطاني 56/2025.' : 'Source: Royal Decree 56/2025.'}</p>
    </div>
  );
}

function t2(L) { return L('Details', 'التفاصيل'); }
