import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Alert, Card, Field, PageHeader } from '../components/ui';
import { toOmrInput } from '../lib/format';

const LEGAL_FORMS = ['LLC', 'SAOC', 'SAOG', 'Sole proprietorship', 'Branch of foreign company', 'Partnership', 'Other'];
const GOVS = ['Muscat', 'Dhofar', 'Musandam', 'Al Buraimi', 'Ad Dakhiliyah', 'North Al Batinah', 'South Al Batinah', 'South Ash Sharqiyah', 'North Ash Sharqiyah', 'Adh Dhahirah', 'Al Wusta'];

/** Smart onboarding (plan E1-01..E1-03): organisation + tax identifiers + plain-language questionnaire. */
export default function Onboarding() {
  const { L, t, lang } = useI18n();
  const { org, refreshMe, switchOrg } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const creating = !org || params.get('new') === '1';
  const [step, setStep] = useState(creating ? 1 : 2);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [o, setO] = useState(creating ? { legalNameEn: '', legalNameAr: '', crNumber: '', legalForm: 'LLC', activities: '', address: '', governorate: 'Muscat', fiscalYearEndMonth: 12, tin: '', vatNumber: '' } : {
    legalNameEn: org.legalNameEn, legalNameAr: org.legalNameAr || '', crNumber: org.crNumber || '', legalForm: org.legalForm || 'LLC', activities: org.activities || '', address: org.address || '', governorate: org.governorate || 'Muscat', fiscalYearEndMonth: org.fiscalYearEndMonth, tin: org.tin || '', vatNumber: org.vatNumber || '' });
  const p = org?.profile || {};
  const [q, setQ] = useState({ vatRegistered: p.vatRegistered ?? !!org?.vatRegistered, annualSalesOmr: p.annualSalesOmr ?? (org ? Number(toOmrInput(org.annualSuppliesBaisa)) : ''), importsGoods: !!p.importsGoods, paysForeignParties: !!p.paysForeignParties, exciseGoods: !!p.exciseGoods, employees: p.employees ?? 0, isSmallEnterprise: !!p.isSmallEnterprise, ownerIncomeAbovePitThreshold: !!p.ownerIncomeAbovePitThreshold, sellsToConsumers: !!p.sellsToConsumers, vatQuarterStartMonth: p.vatQuarterStartMonth || 1 });
  const setF = (k) => (e) => setO({ ...o, [k]: e.target.value });

  const saveOrg = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (creating) {
        const created = await api.post('/orgs', o, { org: false });
        await refreshMe(); await switchOrg(created.id);
      } else {
        await api.patch('/orgs/current', o);
      }
      setStep(2);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const saveQ = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { setResult(await api.post('/orgs/current/questionnaire', q)); await refreshMe(); setStep(3); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  const Yes = ({ k, en, ar, hint }) => (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3">
      <div><div className="text-sm font-medium">{L(en[0], ar[0])}</div>{hint && <div className="text-xs text-slate-500">{L(hint[0], hint[1])}</div>}</div>
      <div className="flex shrink-0 gap-1">
        {[true, false].map((v) => <button key={String(v)} type="button" onClick={() => setQ({ ...q, [k]: v })} className={`btn-sm btn ${q[k] === v ? 'bg-brand-800 text-white' : 'border border-slate-300 bg-white'}`}>{v ? L('Yes', 'نعم') : L('No', 'لا')}</button>)}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={creating ? L('Set up your organisation', 'إعداد منشأتك') : L('Organisation profile & tax questionnaire', 'ملف المنشأة والاستبيان الضريبي')} subtitle={L('Step', 'الخطوة') + ` ${step} / 3`} />
      {err && <Alert tone="error" className="mb-4">{err}</Alert>}
      {step === 1 && (
        <Card>
          <form onSubmit={saveOrg} className="grid gap-4 sm:grid-cols-2">
            <Field label={L('Legal name (English)', 'الاسم القانوني (إنجليزي)')}><input className="input" required value={o.legalNameEn} onChange={setF('legalNameEn')} /></Field>
            <Field label={L('Legal name (Arabic)', 'الاسم القانوني (عربي)')}><input className="input" dir="rtl" value={o.legalNameAr} onChange={setF('legalNameAr')} /></Field>
            <Field label={L('Commercial Registration (CR) number', 'رقم السجل التجاري')} hint={L('Automatic lookup will be added when a government data service is available.', 'سيُضاف البحث التلقائي عند توفر خدمة حكومية.')}><input className="input" inputMode="numeric" value={o.crNumber} onChange={setF('crNumber')} dir="ltr" /></Field>
            <Field label={L('Legal form', 'الشكل القانوني')}><select className="input" value={o.legalForm} onChange={setF('legalForm')}>{LEGAL_FORMS.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label={L('Tax Identification Number (TIN)', 'الرقم الضريبي')}><input className="input" value={o.tin} onChange={setF('tin')} dir="ltr" /></Field>
            <Field label={L('VAT number', 'رقم التسجيل في ضريبة القيمة المضافة')} hint="OM + 10"><input className="input" value={o.vatNumber} onChange={setF('vatNumber')} placeholder="OM1100012345" dir="ltr" /></Field>
            <Field label={L('Main activities', 'الأنشطة الرئيسية')} className="sm:col-span-2"><input className="input" value={o.activities} onChange={setF('activities')} /></Field>
            <Field label={L('Registered address', 'العنوان المسجل')}><input className="input" value={o.address} onChange={setF('address')} /></Field>
            <Field label={L('Governorate', 'المحافظة')}><select className="input" value={o.governorate} onChange={setF('governorate')}>{GOVS.map((g) => <option key={g}>{g}</option>)}</select></Field>
            <Field label={L('Financial year ends in', 'تنتهي السنة المالية في')}><select className="input" value={o.fiscalYearEndMonth} onChange={setF('fiscalYearEndMonth')}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { month: 'long' }).format(new Date(2027, i, 1))}</option>)}</select></Field>
            <div className="flex justify-end sm:col-span-2"><button className="btn-primary" disabled={busy}>{L('Continue', 'متابعة')}</button></div>
          </form>
        </Card>
      )}
      {step === 2 && (
        <Card title={L('A few plain-language questions', 'بعض الأسئلة البسيطة')}>
          <form onSubmit={saveQ}>
            <Field label={L('Roughly how much do you sell in a year (OMR)?', 'كم تبلغ مبيعاتك السنوية تقريباً (ر.ع)؟')} hint={L('Used for the VAT threshold (OMR 38,500) and your e-invoicing wave (OMR 5 million).', 'تستخدم لحد التسجيل (38,500) ولتحديد مرحلة الفوترة الإلكترونية (5 ملايين).')}>
              <input className="input" type="number" min="0" required value={q.annualSalesOmr} onChange={(e) => setQ({ ...q, annualSalesOmr: e.target.value })} dir="ltr" />
            </Field>
            <Yes k="vatRegistered" en={['Are you registered for VAT?']} ar={['هل أنت مسجل في ضريبة القيمة المضافة؟']} />
            {q.vatRegistered && (
              <Field label={L('Your VAT quarters start in', 'تبدأ أرباعك الضريبية في')} hint={L('TaxOman assigns your tax periods — check your VAT certificate.', 'يحدد جهاز الضرائب فتراتك — راجع شهادة التسجيل.')} className="py-3">
                <select className="input" value={q.vatQuarterStartMonth} onChange={(e) => setQ({ ...q, vatQuarterStartMonth: Number(e.target.value) })}>
                  <option value={1}>{L('January / April / July / October', 'يناير / أبريل / يوليو / أكتوبر')}</option>
                  <option value={2}>{L('February / May / August / November', 'فبراير / مايو / أغسطس / نوفمبر')}</option>
                  <option value={3}>{L('March / June / September / December', 'مارس / يونيو / سبتمبر / ديسمبر')}</option>
                </select>
              </Field>
            )}
            <Yes k="importsGoods" en={['Do you import goods into Oman?']} ar={['هل تستورد سلعاً إلى عُمان؟']} />
            <Yes k="paysForeignParties" en={['Do you pay foreign companies for services, royalties, software, interest or dividends?']} ar={['هل تدفع لشركات أجنبية مقابل خدمات أو إتاوات أو برامج أو فوائد أو أرباح؟']} hint={['This may require 10% withholding tax.', 'قد يتطلب ذلك ضريبة استقطاع 10%.']} />
            <Yes k="exciseGoods" en={['Do you import or produce tobacco, energy drinks, sweetened/carbonated drinks, pork or alcohol?']} ar={['هل تستورد أو تنتج التبغ أو مشروبات الطاقة أو المشروبات المحلاة/الغازية أو لحم الخنزير أو الكحول؟']} />
            <Yes k="sellsToConsumers" en={['Do you sell to consumers (shop, restaurant, online)?']} ar={['هل تبيع للمستهلكين (متجر، مطعم، عبر الإنترنت)؟']} hint={['You will need simplified (B2C) e-invoices with a QR code.', 'ستحتاج إلى فواتير مبسطة مع رمز QR.']} />
            <Yes k="isSmallEnterprise" en={['Is the company a small Omani enterprise (capital ≤ OMR 50k, income ≤ OMR 100k, ≤ 15 staff)?']} ar={['هل الشركة منشأة عُمانية صغيرة (رأس المال ≤ 50 ألف، الدخل ≤ 100 ألف، ≤ 15 موظفاً)؟']} hint={['May qualify for the 3% corporate tax rate.', 'قد تكون مؤهلة لمعدل 3%.']} />
            <Yes k="ownerIncomeAbovePitThreshold" en={['Does an owner earn more than OMR 42,000 a year personally?']} ar={['هل يتجاوز الدخل الشخصي لأحد الملاك 42,000 ريال سنوياً؟']} hint={['Personal income tax from 1 January 2028.', 'ضريبة الدخل الشخصي من 1 يناير 2028.']} />
            <Field label={L('Number of employees', 'عدد الموظفين')} className="py-3"><input className="input" type="number" min="0" value={q.employees} onChange={(e) => setQ({ ...q, employees: e.target.value })} dir="ltr" /></Field>
            <div className="flex justify-between pt-2">
              {creating ? <span /> : <button type="button" className="btn-secondary" onClick={() => setStep(1)}>{L('Edit company details', 'تعديل بيانات المنشأة')}</button>}
              <button className="btn-primary" disabled={busy}>{L('Work out my obligations', 'حدد التزاماتي')}</button>
            </div>
          </form>
        </Card>
      )}
      {step === 3 && result && (
        <Card>
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-emerald-700"><CheckCircle2 className="h-6 w-6" />{L('Here is what you need to do with TaxOman', 'هذا ما عليك فعله مع جهاز الضرائب')}</div>
          <ul className="space-y-3">{result.obligations.map((ob) => <li key={ob.taxType} className="rounded-lg border border-slate-200 p-3"><div className="font-medium">{t(ob.taxType)}</div><div className="text-sm text-slate-600">{lang === 'ar' ? ob.whyAr : ob.whyEn}</div></li>)}</ul>
          <p className="mt-4 text-sm text-slate-500">{L('Your calendar and reminders are ready. You can re-run this questionnaire at any time from Settings.', 'التقويم والتذكيرات جاهزة. يمكنك إعادة الاستبيان في أي وقت من الإعدادات.')}</p>
          <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => navigate('/app/calendar')}>{t('calendar')}</button><button type="button" className="btn-primary" onClick={() => navigate('/app')}>{t('dashboard')}</button></div>
        </Card>
      )}
    </div>
  );
}
