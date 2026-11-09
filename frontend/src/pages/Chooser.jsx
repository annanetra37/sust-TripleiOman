import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Leaf, Landmark, ArrowRight, Calculator, ShieldCheck, Receipt } from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import Logo from '../components/Logo';
import LangToggle from '../components/LangToggle';

const CHOICE_COOKIE = 'triplei_portal';

/**
 * Login chooser (plan E0-01): two product cards. Navigation only — the products share no accounts.
 * The last choice is remembered on this device in a cookie (no account link).
 */
export default function Chooser() {
  const { L } = useI18n();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState({ tripleiUrl: 'https://app.triplei.io' });
  useEffect(() => { api.get('/auth/config', { org: false }).then(setCfg).catch(() => {}); }, []);
  const last = typeof document !== 'undefined' ? (document.cookie.match(/(?:^|; )triplei_portal=([^;]+)/) || [])[1] : null;
  const choose = (which) => {
    document.cookie = `${CHOICE_COOKIE}=${which}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax`;
    if (which === 'oman') navigate('/login');
    else window.location.href = cfg.tripleiUrl;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-4"><Logo /><LangToggle /></header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        <h1 className="text-center text-3xl font-semibold text-slate-900">{L('Where would you like to sign in?', 'أين تريد تسجيل الدخول؟')}</h1>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">{L('Triple i and Triple i Oman are separate products with separate accounts. Your choice is remembered on this device only.', 'تريبل آي وتريبل آي عُمان منتجان منفصلان بحسابات منفصلة. يتم تذكر اختيارك على هذا الجهاز فقط.')}</p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <button type="button" onClick={() => choose('triplei')} className={`card group text-start transition hover:-translate-y-0.5 hover:shadow-md ${last === 'triplei' ? 'ring-2 ring-brand-400' : ''}`}>
            <div className="mb-4 inline-flex rounded-xl bg-emerald-50 p-3 text-emerald-700"><Leaf className="h-7 w-7" /></div>
            <h2 className="text-xl font-semibold">Triple i</h2>
            <p className="text-sm font-medium text-emerald-700">{L('Sustainability data', 'بيانات الاستدامة')}</p>
            <p className="mt-3 text-sm text-slate-600">{L('ESG data, carbon and sustainability reporting.', 'بيانات الحوكمة البيئية والاجتماعية والكربون وتقارير الاستدامة.')}</p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-emerald-700">{L('Continue to Triple i', 'المتابعة إلى تريبل آي')}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></span>
          </button>
          <button type="button" onClick={() => choose('oman')} className={`card group border-brand-200 text-start transition hover:-translate-y-0.5 hover:shadow-md ${last === 'oman' ? 'ring-2 ring-brand-500' : ''}`}>
            <div className="mb-4 inline-flex rounded-xl bg-brand-800 p-3 text-white"><Landmark className="h-7 w-7" /></div>
            <h2 className="text-xl font-semibold">Triple i Oman <span className="font-arabic text-slate-500">· تريبل آي عُمان</span></h2>
            <p className="text-sm font-medium text-brand-700">{L('Tax compliance (English / عربي)', 'الامتثال الضريبي (عربي / English)')}</p>
            <p className="mt-3 text-sm text-slate-600">{L('VAT returns, Fawtara e-invoicing, corporate, withholding, excise and personal income tax — everything you do with TaxOman.', 'إقرارات ضريبة القيمة المضافة والفوترة الإلكترونية وضريبة الدخل والاستقطاع والانتقائية والدخل الشخصي — كل ما تحتاجه مع جهاز الضرائب.')}</p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-800">{L('Continue to Triple i Oman', 'المتابعة إلى تريبل آي عُمان')}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></span>
          </button>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            [Receipt, L('Fawtara-ready', 'جاهز لمنظومة فوترة'), L('E-invoicing becomes mandatory on 1 April 2027 (> OMR 5m) and 1 October 2027 (all VAT-registered).', 'الفوترة الإلكترونية إلزامية من 1 أبريل 2027 (أكثر من 5 ملايين) و1 أكتوبر 2027 (جميع المسجلين).')],
            [Calculator, L('VAT in minutes', 'ضريبة القيمة المضافة في دقائق'), L('Every box traceable to source transactions, with a filing companion for the TaxOman portal.', 'كل مربع قابل للتتبع إلى المعاملات، مع دليل تقديم لبوابة جهاز الضرائب.')],
            [ShieldCheck, L('Humans approve', 'الاعتماد بشري'), L('Nothing is submitted without a named approval. We never store your TaxOman password.', 'لا يُقدَّم شيء دون اعتماد. لا نخزن كلمة مرور جهاز الضرائب.')],
          ].map(([Icon, h, p]) => (
            <div key={h} className="rounded-xl bg-white/70 p-4 text-sm"><Icon className="mb-2 h-5 w-5 text-brand-700" /><div className="font-semibold">{h}</div><p className="mt-1 text-slate-600">{p}</p></div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-slate-600">
          {L('Personal income tax starts on 1 January 2028.', 'تبدأ ضريبة الدخل الشخصي في 1 يناير 2028.')}{' '}
          <Link to="/am-i-affected" className="font-medium text-brand-700 underline">{L('Am I affected? Free check, no sign-up', 'هل أنا معني؟ فحص مجاني بدون تسجيل')}</Link>
        </p>
      </main>
    </div>
  );
}
