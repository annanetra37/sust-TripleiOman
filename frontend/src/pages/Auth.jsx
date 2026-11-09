import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import Logo from '../components/Logo';
import LangToggle from '../components/LangToggle';
import { Alert, Field, Spinner, CopyButton } from '../components/ui';

function Shell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between p-4"><Link to="/"><Logo /></Link><LangToggle /></header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6">
        <div className="w-full max-w-md">
          <div className="card">
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            <div className="mt-5">{children}</div>
          </div>
          {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** Second step: TOTP code (or recovery code). */
function MfaChallenge({ mfaToken, onDone }) {
  const { L } = useI18n();
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { onDone(await api.post('/auth/mfa/verify', useRecovery ? { mfaToken, recoveryCode: code } : { mfaToken, code }, { org: false })); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg bg-brand-50 p-3 text-sm text-brand-900"><ShieldCheck className="h-5 w-5" />{L('Enter the 6-digit code from your authenticator app.', 'أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة.')}</div>
      {err && <Alert tone="error">{err}</Alert>}
      <Field label={useRecovery ? L('Recovery code', 'رمز الاسترداد') : L('Verification code', 'رمز التحقق')}>
        <input className="input text-center text-lg tracking-[0.3em]" autoFocus inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.trim())} maxLength={useRecovery ? 12 : 6} required />
      </Field>
      <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}{L('Verify', 'تحقق')}</button>
      <button type="button" className="w-full text-sm text-brand-700" onClick={() => { setUseRecovery((r) => !r); setCode(''); }}>{useRecovery ? L('Use authenticator code', 'استخدم رمز التطبيق') : L('Use a recovery code', 'استخدم رمز استرداد')}</button>
    </form>
  );
}

/** First-login enrolment: show QR, confirm a code, display recovery codes (plan E0-04). */
export function MfaEnroll({ enrollToken, onDone }) {
  const { L } = useI18n();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [pending, setPending] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.post('/auth/mfa/setup', enrollToken ? { enrollToken } : {}, { org: false }).then(setSetup).catch((e) => setErr(e.message)); }, [enrollToken]);
  const confirm = async (e) => {
    e.preventDefault(); setErr(null);
    try { const r = await api.post('/auth/mfa/enable', enrollToken ? { enrollToken, code } : { code }, { org: false }); setCodes(r.recoveryCodes); setPending(r); } catch (x) { setErr(x.message); }
  };
  if (codes) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title={L('Two-step verification is on', 'تم تفعيل التحقق بخطوتين')}>{L('Save these recovery codes somewhere safe. Each can be used once if you lose your phone.', 'احفظ رموز الاسترداد في مكان آمن. يمكن استخدام كل رمز مرة واحدة إذا فقدت هاتفك.')}</Alert>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 font-mono text-sm" dir="ltr">{codes.map((c) => <span key={c}>{c}</span>)}</div>
        <div className="flex justify-between"><CopyButton value={codes.join('\n')} label="codes" /><button type="button" className="btn-primary" onClick={() => onDone(pending)}>{L('I saved them — continue', 'حفظتها — متابعة')}</button></div>
      </div>
    );
  }
  return (
    <form onSubmit={confirm} className="space-y-4">
      <p className="text-sm text-slate-600">{L('Triple i Oman requires two-step verification so nobody can file taxes in your name. Scan this QR code with Google Authenticator, Microsoft Authenticator or a similar app.', 'تتطلب تريبل آي عُمان التحقق بخطوتين حتى لا يتمكن أحد من تقديم إقرارات باسمك. امسح رمز QR باستخدام تطبيق مصادقة.')}</p>
      {err && <Alert tone="error">{err}</Alert>}
      {setup ? (
        <div className="flex flex-col items-center gap-2">
          <img src={setup.qrDataUrl} alt="QR code" className="h-48 w-48 rounded-lg border" />
          <div className="flex items-center gap-2 text-xs text-slate-500" dir="ltr"><KeyRound className="h-3.5 w-3.5" /><code className="break-all">{setup.secret}</code><CopyButton value={setup.secret} /></div>
        </div>
      ) : <Spinner />}
      <Field label={L('Enter the 6-digit code to confirm', 'أدخل الرمز المكون من 6 أرقام للتأكيد')}>
        <input className="input text-center text-lg tracking-[0.3em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.trim())} required />
      </Field>
      <button className="btn-primary w-full">{L('Turn on two-step verification', 'تفعيل التحقق بخطوتين')}</button>
    </form>
  );
}

function useFinish() {
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return async (res) => {
    await acceptSession(res);
    if (res.accessToken) navigate(params.get('next') || (res.user?.memberships?.length ? '/app' : '/app/onboarding'), { replace: true });
  };
}

export function Login() {
  const { L, t } = useI18n();
  const finish = useFinish();
  const [form, setForm] = useState({ email: '', password: '' });
  const [step, setStep] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState({});
  useEffect(() => { api.get('/auth/config', { org: false }).then(setCfg).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api.post('/auth/login', form, { org: false });
      if (r.mfaRequired) setStep({ kind: 'mfa', token: r.mfaToken });
      else if (r.mfaEnrollRequired) setStep({ kind: 'enroll', token: r.enrollToken });
      else await finish(r);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <Shell title={L('Sign in to Triple i Oman', 'تسجيل الدخول إلى تريبل آي عُمان')} subtitle={L('Tax compliance for Oman — English / عربي', 'الامتثال الضريبي في عُمان')}
      footer={cfg.allowPublicSignup !== false && <>{L('New to Triple i Oman?', 'جديد في تريبل آي عُمان؟')} <Link className="font-medium text-brand-700" to="/signup">{L('Create an account', 'إنشاء حساب')}</Link></>}>
      {step?.kind === 'mfa' && <MfaChallenge mfaToken={step.token} onDone={finish} />}
      {step?.kind === 'enroll' && <MfaEnroll enrollToken={step.token} onDone={finish} />}
      {!step && (
        <form onSubmit={submit} className="space-y-4">
          {err && <Alert tone="error">{err}</Alert>}
          <Field label={L('Email', 'البريد الإلكتروني')}><input className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" /></Field>
          <Field label={L('Password', 'كلمة المرور')}><input className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" /></Field>
          <div className="flex justify-end text-sm"><Link to="/forgot-password" className="text-brand-700">{L('Forgot password?', 'نسيت كلمة المرور؟')}</Link></div>
          <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}{t('signIn')}</button>
          <p className="text-xs text-slate-500">{L('Triple i (sustainability) accounts do not work here — the two products have separate accounts.', 'حسابات تريبل آي (الاستدامة) لا تعمل هنا — لكل منتج حسابات منفصلة.')}</p>
        </form>
      )}
    </Shell>
  );
}

export function Signup() {
  const { L, lang } = useI18n();
  const finish = useFinish();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', acceptPrivacy: false, acceptTerms: false });
  const [enroll, setEnroll] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api.post('/auth/signup', { ...form, locale: lang }, { org: false });
      if (r.mfaEnrollRequired) setEnroll(r.enrollToken); else await finish(r);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Shell title={L('Create your Triple i Oman account', 'أنشئ حسابك في تريبل آي عُمان')} subtitle={L('It takes under 15 minutes to set up your company and see every tax obligation.', 'أقل من 15 دقيقة لإعداد منشأتك ومعرفة جميع التزاماتك الضريبية.')}
      footer={<>{L('Already have an account?', 'لديك حساب؟')} <Link className="font-medium text-brand-700" to="/login">{L('Sign in', 'تسجيل الدخول')}</Link></>}>
      {enroll ? <MfaEnroll enrollToken={enroll} onDone={finish} /> : (
        <form onSubmit={submit} className="space-y-4">
          {err && <Alert tone="error">{err}</Alert>}
          <Field label={L('Full name', 'الاسم الكامل')}><input className="input" required value={form.fullName} onChange={set('fullName')} /></Field>
          <Field label={L('Work email', 'البريد الإلكتروني')}><input className="input" type="email" required value={form.email} onChange={set('email')} dir="ltr" /></Field>
          <Field label={L('Mobile (optional)', 'الهاتف (اختياري)')} hint="+968 9XXXXXXX"><input className="input" value={form.phone} onChange={set('phone')} dir="ltr" placeholder="+968" /></Field>
          <Field label={L('Password', 'كلمة المرور')} hint={L('At least 10 characters with letters and numbers.', '10 أحرف على الأقل تتضمن حروفاً وأرقاماً.')}><input className="input" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} dir="ltr" /></Field>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.acceptPrivacy} onChange={set('acceptPrivacy')} className="mt-0.5" />{L('I have read the privacy notice. My data is processed under Oman\'s Personal Data Protection Law (RD 6/2022) and kept separate from original Triple i.', 'قرأت إشعار الخصوصية. تتم معالجة بياناتي وفق قانون حماية البيانات الشخصية العُماني (م.س 6/2022) وتُحفظ منفصلة عن تريبل آي.')}</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.acceptTerms} onChange={set('acceptTerms')} className="mt-0.5" />{L('I accept the terms of service. Triple i Oman prepares; I (or my organisation) approve and file.', 'أوافق على شروط الخدمة. تريبل آي عُمان تُعد؛ وأنا (أو منشأتي) أعتمد وأقدّم.')}</label>
          <button className="btn-primary w-full" disabled={busy || !form.acceptPrivacy || !form.acceptTerms}>{busy && <Spinner className="h-4 w-4 text-white" />}{L('Create account', 'إنشاء الحساب')}</button>
        </form>
      )}
    </Shell>
  );
}

export function ForgotPassword() {
  const { L } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <Shell title={L('Reset your password', 'إعادة تعيين كلمة المرور')} footer={<Link to="/login" className="text-brand-700">{L('Back to sign in', 'العودة لتسجيل الدخول')}</Link>}>
      {sent ? <Alert tone="success">{L('If an account exists for this email, we sent a reset link. It expires in 1 hour.', 'إذا كان هناك حساب بهذا البريد، أرسلنا رابط إعادة التعيين. ينتهي خلال ساعة.')}</Alert> : (
        <form onSubmit={async (e) => { e.preventDefault(); await api.post('/auth/forgot-password', { email }, { org: false }).catch(() => {}); setSent(true); }} className="space-y-4">
          <Field label={L('Email', 'البريد الإلكتروني')}><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" /></Field>
          <button className="btn-primary w-full">{L('Send reset link', 'إرسال الرابط')}</button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const { L } = useI18n();
  const [params] = useSearchParams();
  const [pw, setPw] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  return (
    <Shell title={L('Choose a new password', 'اختر كلمة مرور جديدة')} footer={<Link to="/login" className="text-brand-700">{L('Back to sign in', 'العودة لتسجيل الدخول')}</Link>}>
      {done ? <Alert tone="success">{L('Password updated. You can now sign in. Your two-step verification is unchanged.', 'تم تحديث كلمة المرور. التحقق بخطوتين لم يتغير.')}</Alert> : (
        <form onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api.post('/auth/reset-password', { token: params.get('token'), password: pw }, { org: false }); setDone(true); } catch (x) { setErr(x.message); } }} className="space-y-4">
          {err && <Alert tone="error">{err}</Alert>}
          <Field label={L('New password', 'كلمة المرور الجديدة')}><input className="input" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} dir="ltr" /></Field>
          <button className="btn-primary w-full">{L('Update password', 'تحديث')}</button>
        </form>
      )}
    </Shell>
  );
}

export function AcceptInvite() {
  const { L, t } = useI18n();
  const finish = useFinish();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ fullName: '', password: '', acceptPrivacy: false });
  const [step, setStep] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get(`/auth/invite/${token}`, { org: false }).then(setInfo).catch((e) => setErr(e.message)); }, [token]);
  const submit = async (e) => {
    e.preventDefault(); setErr(null);
    try {
      const r = await api.post('/auth/accept-invite', { token, ...form }, { org: false });
      if (r.mfaRequired) setStep({ kind: 'mfa', token: r.mfaToken });
      else if (r.mfaEnrollRequired) setStep({ kind: 'enroll', token: r.enrollToken });
      else await finish(r);
    } catch (x) { setErr(x.message); }
  };
  return (
    <Shell title={L('Join your team on Triple i Oman', 'انضم إلى فريقك في تريبل آي عُمان')}>
      {err && <Alert tone="error" className="mb-4">{err}</Alert>}
      {step?.kind === 'mfa' && <MfaChallenge mfaToken={step.token} onDone={finish} />}
      {step?.kind === 'enroll' && <MfaEnroll enrollToken={step.token} onDone={finish} />}
      {!step && info && (
        <form onSubmit={submit} className="space-y-4">
          <Alert tone="info">{L('You are invited to', 'أنت مدعو إلى')} <b>{L(info.organisation.legalNameEn, info.organisation.legalNameAr || info.organisation.legalNameEn)}</b> {L('as', 'بدور')} <b>{t(info.role)}</b> ({info.email}).</Alert>
          {!info.hasAccount && <Field label={L('Full name', 'الاسم الكامل')}><input className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>}
          <Field label={info.hasAccount ? L('Your Triple i Oman password', 'كلمة مرورك') : L('Choose a password', 'اختر كلمة مرور')}><input className="input" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" /></Field>
          {!info.hasAccount && <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.acceptPrivacy} onChange={(e) => setForm({ ...form, acceptPrivacy: e.target.checked })} />{L('I accept the privacy notice and terms.', 'أوافق على إشعار الخصوصية والشروط.')}</label>}
          <button className="btn-primary w-full">{L('Accept invitation', 'قبول الدعوة')}</button>
        </form>
      )}
    </Shell>
  );
}
