import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import Logo from '../components/Logo';
import LangToggle from '../components/LangToggle';
import { Field } from '../components/ui';

const TYPES = [['EMPLOYMENT', 'Salary & allowances', 'الراتب والبدلات'], ['RENTAL', 'Rental income', 'دخل الإيجار'], ['SELF_EMPLOYMENT', 'Business / freelance', 'عمل حر / تجاري'], ['DIVIDENDS', 'Dividends & interest', 'أرباح وفوائد'], ['OTHER', 'Other', 'أخرى']];

/** Free "Am I affected?" checker — no sign-up, nothing stored (plan E9-01). */
export default function AmIAffected() {
  const { L, lang } = useI18n();
  const [gross, setGross] = useState('');
  const [types, setTypes] = useState(['EMPLOYMENT']);
  const [res, setRes] = useState(null);
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between p-4"><Link to="/"><Logo /></Link><LangToggle /></header>
      <main className="mx-auto max-w-xl px-4 pb-16">
        <div className="card">
          <h1 className="text-xl font-semibold">{L('Personal income tax: am I affected?', 'ضريبة الدخل الشخصي: هل أنا معني؟')}</h1>
          <p className="mt-1 text-sm text-slate-600">{L('Oman introduces a 5% personal income tax on 1 January 2028, only on income above OMR 42,000 a year. Answer two questions — nothing is stored.', 'تطبق عُمان ضريبة دخل شخصي بنسبة 5% اعتباراً من 1 يناير 2028 على الدخل الذي يتجاوز 42,000 ريال سنوياً فقط. أجب عن سؤالين — لا يتم تخزين أي شيء.')}</p>
          <form className="mt-5 space-y-4" onSubmit={async (e) => { e.preventDefault(); setRes(await api.post('/pit/am-i-affected', { estimatedGrossOmr: Number(gross), incomeTypes: types }, { org: false })); }}>
            <fieldset>
              <legend className="label">{L('What kinds of income do you have?', 'ما أنواع دخلك؟')}</legend>
              <div className="flex flex-wrap gap-2">
                {TYPES.map(([k, en, ar]) => (
                  <label key={k} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${types.includes(k) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300'}`}>
                    <input type="checkbox" className="sr-only" checked={types.includes(k)} onChange={(e) => setTypes(e.target.checked ? [...types, k] : types.filter((x) => x !== k))} />{L(en, ar)}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label={L('Estimated total yearly income (OMR), including allowances', 'إجمالي الدخل السنوي التقديري (ر.ع) شاملاً البدلات')}>
              <input className="input" type="number" min="0" step="100" required value={gross} onChange={(e) => setGross(e.target.value)} dir="ltr" />
            </Field>
            <button className="btn-primary w-full">{L('Check', 'تحقق')}</button>
          </form>
          {res && (
            <div className={`mt-6 rounded-lg p-4 ${res.affected ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`} role="status">
              <div className="flex items-center gap-2 font-semibold">{res.affected ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}{res.affected ? L('You are likely affected', 'من المرجح أنك معني') : L('You are most likely not affected', 'على الأرجح أنك غير معني')}</div>
              <p className="mt-2 text-sm">{lang === 'ar' ? res.messageAr : res.messageEn}</p>
              {res.affected && <Link to="/signup" className="btn-primary mt-4">{L('Track income & deductions all year', 'تتبع الدخل والخصومات طوال العام')}</Link>}
            </div>
          )}
          <p className="mt-6 text-xs text-slate-500">{L('Estimate only, based on Royal Decree 56/2025. Executive regulations are pending; this is not tax advice.', 'تقدير فقط وفق المرسوم السلطاني 56/2025. اللائحة التنفيذية قيد الإصدار؛ هذا ليس استشارة ضريبية.')}</p>
        </div>
      </main>
    </div>
  );
}
