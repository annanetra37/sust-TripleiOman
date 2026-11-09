import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { MfaEnroll } from './Auth';
import { Alert, Badge, Card, Field, Loading, Modal, PageHeader, StatusBadge, Tabs, Toggle, useAsync } from '../components/ui';

function Profile() {
  const { L, setLang } = useI18n();
  const { user, refreshMe } = useAuth();
  const [v, setV] = useState({ fullName: user.fullName, phone: user.phone || '', locale: user.locale, digitStyle: user.digitStyle, showHijri: user.showHijri });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState(null);
  const [mfa, setMfa] = useState(false);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title={L('My profile & language', 'ملفي واللغة')}>
        {msg && <Alert tone={msg.tone} className="mb-3">{msg.text}</Alert>}
        <div className="space-y-3">
          <Field label={L('Full name', 'الاسم الكامل')}><input className="input" value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} /></Field>
          <Field label={L('Mobile (+968) for SMS reminders', 'الهاتف (+968) للتذكيرات')}><input className="input" dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
          <Field label={L('Language', 'اللغة')}><select className="input" value={v.locale} onChange={(e) => setV({ ...v, locale: e.target.value })}><option value="en">English</option><option value="ar">العربية</option></select></Field>
          <Field label={L('Digits', 'الأرقام')}><select className="input" value={v.digitStyle} onChange={(e) => setV({ ...v, digitStyle: e.target.value })}><option value="western">0123456789</option><option value="arabic">٠١٢٣٤٥٦٧٨٩</option></select></Field>
          <Toggle checked={v.showHijri} onChange={(x) => setV({ ...v, showHijri: x })} label={L('Also show Hijri dates (deadlines stay Gregorian)', 'عرض التاريخ الهجري أيضاً (المواعيد بالميلادي)')} />
          <button type="button" className="btn-primary" onClick={async () => { try { await api.patch('/auth/me', v, { org: false }); setLang(v.locale); await refreshMe(); setMsg({ tone: 'success', text: L('Saved.', 'تم الحفظ.') }); } catch (x) { setMsg({ tone: 'error', text: x.message }); } }}>{L('Save', 'حفظ')}</button>
        </div>
      </Card>
      <div className="space-y-6">
        <Card title={L('Two-step verification', 'التحقق بخطوتين')}>
          {user.mfaEnabled ? <Badge tone="green">{L('On — authenticator app', 'مفعل — تطبيق المصادقة')}</Badge> : <><Alert tone="warn">{L('Protect your account so nobody can file taxes in your name.', 'احمِ حسابك حتى لا يتمكن أحد من تقديم إقرارات باسمك.')}</Alert><button type="button" className="btn-primary mt-3" onClick={() => setMfa(true)}>{L('Turn on', 'تفعيل')}</button></>}
          <p className="mt-3 text-xs text-slate-500">{L('Lost your phone? Use a recovery code. Resetting two-step verification requires identity re-verification by Triple i Oman support.', 'فقدت هاتفك؟ استخدم رمز استرداد. إعادة تعيين التحقق تتطلب التحقق من الهوية عبر الدعم.')}</p>
        </Card>
        <Card title={L('Password', 'كلمة المرور')}>
          <div className="space-y-3">
            <Field label={L('Current password', 'كلمة المرور الحالية')}><input type="password" className="input" dir="ltr" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label={L('New password', 'كلمة المرور الجديدة')}><input type="password" className="input" dir="ltr" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <button type="button" className="btn-secondary" onClick={async () => { try { await api.post('/auth/change-password', pw, { org: false }); setPw({ currentPassword: '', newPassword: '' }); setMsg({ tone: 'success', text: L('Password changed. Other sessions were signed out.', 'تم تغيير كلمة المرور.') }); } catch (x) { setMsg({ tone: 'error', text: x.message }); } }}>{L('Change password', 'تغيير')}</button>
            <button type="button" className="btn-ghost text-sm" onClick={async () => { await api.post('/auth/logout-all', {}, { org: false }); setMsg({ tone: 'success', text: L('All other sessions will be signed out.', 'سيتم تسجيل خروج الجلسات الأخرى.') }); }}>{L('Sign out of all devices', 'الخروج من جميع الأجهزة')}</button>
          </div>
        </Card>
      </div>
      <Modal open={mfa} onClose={() => setMfa(false)} title={L('Two-step verification', 'التحقق بخطوتين')}><MfaEnroll onDone={async () => { setMfa(false); await refreshMe(); }} /></Modal>
    </div>
  );
}

function OrgSettings() {
  const { L } = useI18n();
  const { org, can } = useAuth();
  const plans = useAsync(() => api.get('/plans', { org: false }), []);
  const changelog = useAsync(() => api.get('/rules/changelog', { org: false }), []);
  const f = useFormat();
  if (!org) return <Alert tone="info">{L('Create an organisation first.', 'أنشئ منشأة أولاً.')}</Alert>;
  return (
    <div className="space-y-6">
      <Card title={L('Organisation', 'المنشأة')} actions={can('org.manage') && <Link className="btn-secondary btn-sm" to="/app/onboarding">{L('Edit profile & questionnaire', 'تعديل الملف والاستبيان')}</Link>}>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {[[L('Legal name', 'الاسم القانوني'), `${org.legalNameEn}${org.legalNameAr ? ` / ${org.legalNameAr}` : ''}`], [L('CR number', 'السجل التجاري'), org.crNumber], [L('TIN', 'الرقم الضريبي'), org.tin], [L('VAT number', 'رقم ضريبة القيمة المضافة'), org.vatNumber], [L('Excise number', 'رقم الانتقائية'), org.exciseNumber], [L('Year end', 'نهاية السنة'), org.fiscalYearEndMonth], [L('Address', 'العنوان'), org.address], [L('Plan', 'الباقة'), org.plan]].map(([k, v]) => <div key={k}><dt className="text-xs uppercase text-slate-500">{k}</dt><dd className="font-medium">{v || '—'}</dd></div>)}
        </dl>
      </Card>
      <Card title={L('Plans (OMR)', 'الباقات (ر.ع)')}>
        {!plans.data ? <Loading /> : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{plans.data.plans.map((p) => (
            <div key={p.id} className={`rounded-lg border p-3 ${org.plan === p.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
              <div className="font-semibold">{L(p.nameEn, p.nameAr)}</div><div className="text-xl font-semibold num">{p.priceOmrMonthly ? `${f.num(p.priceOmrMonthly, 0, 0)}` : L('Free', 'مجاني')}<span className="text-xs font-normal text-slate-500">{p.priceOmrMonthly ? L(' OMR/mo', ' ر.ع/شهر') : ''}</span></div>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">{(L(p.featuresEn, p.featuresAr) || p.featuresEn).map((x) => <li key={x}>• {x}</li>)}</ul>
            </div>
          ))}</div>
          <p className="mt-3 text-xs text-slate-500">{plans.data.noteEn} {L('Triple i Oman\'s own invoices are issued as Fawtara e-invoices.', 'تصدر فواتير تريبل آي عُمان نفسها كفواتير إلكترونية عبر فوترة.')}</p>
        </>}
      </Card>
      <Card title={L('Tax rules changelog', 'سجل تغييرات القواعد الضريبية')}>
        <p className="mb-2 text-sm text-slate-600">{L('Rates, thresholds and deadlines are versioned with effective dates and approved by two Triple i Oman tax specialists. Past returns keep the version they used.', 'النسب والحدود والمواعيد لها إصدارات بتواريخ سريان ويعتمدها متخصصان. تحتفظ الإقرارات السابقة بالإصدار المستخدم.')}</p>
        <div className="max-h-72 overflow-y-auto"><table className="table"><tbody>{(changelog.data || []).map((r) => <tr key={`${r.key}${r.version}`}><td className="font-mono text-xs">{r.key} v{r.version}</td><td className="text-xs">{f.date(r.effectiveFrom)}</td><td className="text-xs text-slate-500">{r.sourceCitation}</td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}

function Privacy() {
  const { L } = useI18n();
  const f = useFormat();
  const { org, can, logout } = useAuth();
  const grants = useAsync(() => (org ? api.get('/orgs/current/support-grants') : Promise.resolve({ grants: [], views: [] })), [org?.id]);
  const [del, setDel] = useState('');
  const [hours, setHours] = useState(4);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {org && (
        <Card title={L('Support access (just-in-time)', 'وصول الدعم (مؤقت)')} className="lg:col-span-2">
          <p className="mb-3 text-sm text-slate-600">{L('Triple i Oman staff can only see your data after you approve a request, for at most 24 hours. Every view is logged and listed here.', 'لا يرى موظفو تريبل آي عُمان بياناتك إلا بعد موافقتك، ولمدة 24 ساعة كحد أقصى. يتم تسجيل كل اطلاع.')}</p>
          {!grants.data ? <Loading /> : <>
            <table className="table"><thead><tr><th>{L('Requested', 'الطلب')}</th><th>{L('Staff', 'الموظف')}</th><th>{L('Reason', 'السبب')}</th><th>{L('Status', 'الحالة')}</th><th /></tr></thead>
              <tbody>{grants.data.grants.map((g) => <tr key={g.id}><td className="text-xs">{f.dateTime(g.createdAt)}</td><td className="text-xs">{g.staff?.fullName}</td><td className="text-xs">{g.reason}</td><td><StatusBadge status={g.status} />{g.expiresAt && g.status === 'APPROVED' && <div className="text-[10px] text-slate-500">{L('until', 'حتى')} {f.dateTime(g.expiresAt)}</div>}</td>
                <td className="whitespace-nowrap text-end">{can('support.grant') && g.status === 'REQUESTED' && <><select className="input inline w-auto py-1 text-xs" value={hours} onChange={(e) => setHours(e.target.value)}>{[1, 4, 8, 24].map((h) => <option key={h} value={h}>{h}h</option>)}</select><button type="button" className="btn-primary btn-sm ms-1" onClick={async () => { await api.post(`/orgs/current/support-grants/${g.id}/approve`, { hours }); grants.reload(); }}>{L('Approve', 'موافقة')}</button><button type="button" className="btn-ghost btn-sm" onClick={async () => { await api.post(`/orgs/current/support-grants/${g.id}/deny`); grants.reload(); }}>{L('Deny', 'رفض')}</button></>}
                  {can('support.grant') && g.status === 'APPROVED' && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={async () => { await api.post(`/orgs/current/support-grants/${g.id}/revoke`); grants.reload(); }}>{L('Revoke', 'إلغاء')}</button>}</td></tr>)}
                {!grants.data.grants.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">{L('No requests.', 'لا توجد طلبات.')}</td></tr>}</tbody></table>
            {grants.data.views.length > 0 && <div className="mt-3 text-xs text-slate-500"><div className="font-medium">{L('Support views', 'اطلاعات الدعم')}</div>{grants.data.views.slice(0, 10).map((v, i) => <div key={i}>{f.dateTime(v.createdAt)} · {v.actorLabel} · {v.objectId}</div>)}</div>}
          </>}
        </Card>
      )}
      <Card title={L('My data (Oman PDPL)', 'بياناتي (قانون حماية البيانات)')}>
        <p className="text-sm text-slate-600">{L('Download everything we hold about you personally.', 'نزّل كل ما نحتفظ به عنك شخصياً.')}</p>
        <button type="button" className="btn-secondary mt-3" onClick={() => api.download('/privacy/export', 'my-triplei-oman-data.json')}>{L('Export my data', 'تصدير بياناتي')}</button>
      </Card>
      <Card title={L('Delete my account', 'حذف حسابي')}>
        <p className="text-sm text-slate-600">{L('Your personal data is deleted. Organisation tax records (returns, invoices, audit log) are kept for the legal retention period (at least 10 years).', 'يتم حذف بياناتك الشخصية. تُحفظ السجلات الضريبية للمنشأة للمدة القانونية (10 سنوات على الأقل).')}</p>
        <div className="mt-3 flex gap-2"><input className="input" placeholder="DELETE" value={del} onChange={(e) => setDel(e.target.value)} dir="ltr" /><button type="button" className="btn-danger" disabled={del !== 'DELETE'} onClick={async () => { try { await api.post('/privacy/delete-account', { confirm: 'DELETE' }, { org: false }); logout(); } catch (x) { alert(x.message); } }}>{L('Delete', 'حذف')}</button></div>
      </Card>
    </div>
  );
}

export default function Settings() {
  const { L, t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'profile';
  return (
    <div>
      <PageHeader title={t('settings')} />
      <Tabs value={tab} onChange={(id) => setParams({ tab: id })} tabs={[{ id: 'profile', label: L('My account', 'حسابي') }, { id: 'org', label: L('Organisation & plan', 'المنشأة والباقة') }, { id: 'access', label: L('Privacy & access', 'الخصوصية والوصول') }]} />
      {tab === 'profile' && <Profile />}
      {tab === 'org' && <OrgSettings />}
      {tab === 'access' && <Privacy />}
    </div>
  );
}
