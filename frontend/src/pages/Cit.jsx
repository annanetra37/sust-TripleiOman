import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Card, ErrorText, Field, PageHeader, Toggle } from '../components/ui';

const ADJ = [['Non-deductible entertainment', 'ضيافة غير قابلة للخصم', 'ADD'], ['Accounting depreciation added back', 'إعادة إضافة الاستهلاك المحاسبي', 'ADD'], ['Tax depreciation allowed', 'الاستهلاك الضريبي المسموح', 'DEDUCT'], ['General provisions', 'المخصصات العامة', 'ADD'], ['Related-party adjustment', 'تعديل الأطراف ذات العلاقة', 'ADD'], ['Exempt income', 'دخل معفى', 'DEDUCT']];

/** Corporate income tax wizard (plan E6-01..E6-05). */
export default function Cit() {
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { can, org } = useAuth();
  const navigate = useNavigate();
  const [v, setV] = useState({ taxYear: new Date().getUTCFullYear() - 1, accountingProfitOmr: '', adjustments: [], losses: [], credits: [], provisionalPaidOmr: '', financialStatementsAttached: false, useSmall: !!org?.profile?.isSmallEnterprise, smallEnterprise: { paidUpCapitalOmr: Number(org?.paidUpCapitalBaisa || 0) / 1000, grossIncomeOmr: '', averageEmployees: org?.employees || 0, activity: org?.activities || '', omaniOwnedOrSoleProprietor: true } });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const run = async () => {
    setErr(null);
    try { const r = await api.post('/returns/cit', { ...v, smallEnterprise: v.useSmall ? v.smallEnterprise : null }); setRes(r); } catch (x) { setErr(x); }
  };
  const se = v.smallEnterprise;
  return (
    <div className="space-y-6">
      <PageHeader title={t('cit')} subtitle={L('15% on taxable income (3% for qualifying small enterprises). One annual return within 4 months after year-end (3 months for small enterprises).', '15% على الدخل الخاضع (3% للمؤسسات الصغيرة المؤهلة). إقرار سنوي واحد خلال 4 أشهر من نهاية السنة (3 أشهر للصغيرة).')} />
      {err && <ErrorText error={err} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title={L('1. Trial balance result', '1. نتيجة ميزان المراجعة')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={L('Tax year (year-end)', 'السنة الضريبية')}><input className="input" type="number" dir="ltr" value={v.taxYear} onChange={(e) => setV({ ...v, taxYear: e.target.value })} /></Field>
              <Field label={L('Accounting profit / (loss) before tax (OMR)', 'الربح المحاسبي قبل الضريبة')}><input className="input" type="number" step="0.001" dir="ltr" value={v.accountingProfitOmr} onChange={(e) => setV({ ...v, accountingProfitOmr: e.target.value })} /></Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">{L('Trial-balance import with account mapping is available in Transactions → Account mapping; unmapped accounts block approval.', 'استيراد ميزان المراجعة مع الربط متاح في المعاملات ← ربط الحسابات.')}</p>
          </Card>
          <Card title={L('2. Tax adjustments', '2. التعديلات الضريبية')} actions={<button type="button" className="btn-secondary btn-sm" onClick={() => setV({ ...v, adjustments: [...v.adjustments, { description: '', type: 'ADD', amountOmr: '' }] })}><Plus className="h-4 w-4" />{t('add')}</button>}>
            <div className="mb-3 flex flex-wrap gap-1">{ADJ.map(([en, ar, type]) => <button key={en} type="button" className="badge cursor-pointer bg-slate-100 hover:bg-slate-200" onClick={() => setV({ ...v, adjustments: [...v.adjustments, { description: en, type, amountOmr: '' }] })}>+ {L(en, ar)}</button>)}</div>
            {v.adjustments.map((a, i) => (
              <div key={i} className="mb-2 grid grid-cols-12 gap-2">
                <input className="input col-span-6" value={a.description} onChange={(e) => setV({ ...v, adjustments: v.adjustments.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                <select className="input col-span-2" value={a.type} onChange={(e) => setV({ ...v, adjustments: v.adjustments.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}><option value="ADD">+</option><option value="DEDUCT">−</option></select>
                <input className="input col-span-3" type="number" step="0.001" dir="ltr" value={a.amountOmr} onChange={(e) => setV({ ...v, adjustments: v.adjustments.map((x, j) => (j === i ? { ...x, amountOmr: e.target.value } : x)) })} />
                <button type="button" className="btn-ghost col-span-1" onClick={() => setV({ ...v, adjustments: v.adjustments.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </Card>
          <Card title={L('3. Losses brought forward & credits', '3. الخسائر المرحلة والخصومات')} actions={<button type="button" className="btn-secondary btn-sm" onClick={() => setV({ ...v, losses: [...v.losses, { year: v.taxYear - 1, amountOmr: '' }] })}><Plus className="h-4 w-4" />{L('Loss year', 'سنة خسارة')}</button>}>
            {v.losses.map((l, i) => (
              <div key={i} className="mb-2 grid grid-cols-12 gap-2">
                <input className="input col-span-4" type="number" dir="ltr" value={l.year} onChange={(e) => setV({ ...v, losses: v.losses.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)) })} />
                <input className="input col-span-7" type="number" step="0.001" dir="ltr" placeholder="OMR" value={l.amountOmr} onChange={(e) => setV({ ...v, losses: v.losses.map((x, j) => (j === i ? { ...x, amountOmr: e.target.value } : x)) })} />
                <button type="button" className="btn-ghost col-span-1" onClick={() => setV({ ...v, losses: v.losses.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Field label={L('Foreign tax credit (OMR)', 'خصم الضريبة الأجنبية')} className="mt-2"><input className="input" type="number" step="0.001" dir="ltr" value={v.credits[0]?.amountOmr || ''} onChange={(e) => setV({ ...v, credits: [{ description: 'Foreign tax credit', amountOmr: e.target.value }] })} /></Field>
            <Field label={L('Tax already paid for the year (OMR)', 'الضريبة المدفوعة مسبقاً')} className="mt-2"><input className="input" type="number" step="0.001" dir="ltr" value={v.provisionalPaidOmr} onChange={(e) => setV({ ...v, provisionalPaidOmr: e.target.value })} /></Field>
            <p className="mt-2 text-xs text-slate-500">{L('Losses older than the carry-forward period expire automatically [period to be confirmed].', 'تنتهي الخسائر الأقدم من فترة الترحيل تلقائياً [يُؤكد].')}</p>
          </Card>
          <Card title={L('4. Small-enterprise 3% check', '4. فحص معدل 3% للمؤسسات الصغيرة')}>
            <Toggle checked={v.useSmall} onChange={(x) => setV({ ...v, useSmall: x })} label={L('Check eligibility for the 3% rate', 'فحص الأهلية لمعدل 3%')} />
            {v.useSmall && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={L('Paid-up capital (OMR)', 'رأس المال المدفوع')}><input className="input" type="number" dir="ltr" value={se.paidUpCapitalOmr} onChange={(e) => setV({ ...v, smallEnterprise: { ...se, paidUpCapitalOmr: e.target.value } })} /></Field>
                <Field label={L('Gross income for the year (OMR)', 'إجمالي الدخل للسنة')}><input className="input" type="number" dir="ltr" value={se.grossIncomeOmr} onChange={(e) => setV({ ...v, smallEnterprise: { ...se, grossIncomeOmr: e.target.value } })} /></Field>
                <Field label={L('Average employees', 'متوسط الموظفين')}><input className="input" type="number" dir="ltr" value={se.averageEmployees} onChange={(e) => setV({ ...v, smallEnterprise: { ...se, averageEmployees: e.target.value } })} /></Field>
                <Field label={L('Main activity', 'النشاط الرئيسي')}><input className="input" value={se.activity} onChange={(e) => setV({ ...v, smallEnterprise: { ...se, activity: e.target.value } })} /></Field>
                <div className="sm:col-span-2"><Toggle checked={se.omaniOwnedOrSoleProprietor} onChange={(x) => setV({ ...v, smallEnterprise: { ...se, omaniOwnedOrSoleProprietor: x } })} label={L('Omani company or sole proprietorship', 'شركة عُمانية أو مؤسسة فردية')} /></div>
              </div>
            )}
          </Card>
          <Toggle checked={v.financialStatementsAttached} onChange={(x) => setV({ ...v, financialStatementsAttached: x })} label={L('Audited financial statements uploaded to the document vault', 'تم رفع القوائم المالية المدققة إلى الخزنة')} />
          {can('return.prepare') && <button type="button" className="btn-primary w-full" onClick={run}>{L('Compute & save draft return', 'احسب واحفظ مسودة الإقرار')}</button>}
        </div>
        <div className="space-y-6">
          {res ? (
            <>
              <Card title={L('Computation', 'الحساب')}>
                <table className="table"><tbody>{res.result.steps.map((s, i) => <tr key={i} className={/Taxable|Balance/.test(s.step) ? 'font-semibold' : ''}><td>{s.step}</td><td className="text-end num">{f.omr(s.amount)}</td></tr>)}</tbody></table>
                <div className="mt-4 flex justify-end"><button type="button" className="btn-primary" onClick={() => navigate(`/app/returns/${res.id}`)}>{L('Open return for review', 'فتح الإقرار للمراجعة')}</button></div>
              </Card>
              {res.result.smallEnterprise?.checks?.length > 0 && (
                <Card title={res.result.smallEnterprise.eligible ? L('Eligible for 3%', 'مؤهل لمعدل 3%') : L('Not eligible for 3% — 15% applies', 'غير مؤهل لـ 3% — يطبق 15%')}>
                  <ul className="space-y-1 text-sm">{res.result.smallEnterprise.checks.map((c) => <li key={c.id} className="flex items-center gap-2">{c.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-500" />}{lang === 'ar' ? c.labelAr : c.labelEn}</li>)}</ul>
                  <Alert tone="warn" className="mt-3">{res.result.smallEnterprise.noteEn}</Alert>
                </Card>
              )}
              {(res.result.lossesExpired.length > 0 || res.result.lossesCarriedForward.length > 0) && <Card title={L('Losses', 'الخسائر')}><div className="text-sm">{res.result.lossesExpired.map((l) => <div key={`e${l.year}`} className="text-red-600">{l.year}: {f.omr(l.amountBaisa)} {L('expired', 'منتهية')}</div>)}{res.result.lossesCarriedForward.map((l) => <div key={`c${l.year}`}>{l.year}: {f.omr(l.amountBaisa)} {L('carried forward', 'مرحلة')}</div>)}</div></Card>}
            </>
          ) : <Alert tone="info">{L('Enter your figures and compute. The draft follows the same review → approve → file workflow, with a filing companion for the TaxOman portal.', 'أدخل الأرقام واحسب. تتبع المسودة نفس مسار المراجعة والاعتماد والتقديم.')}</Alert>}
        </div>
      </div>
    </div>
  );
}
