import { useState } from 'react';
import { api, session } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Badge, Card, ErrorText, Field, Loading, Modal, PageHeader, StatusBadge, Tabs, useAsync } from '../components/ui';

function Rules() {
  const { L } = useI18n();
  const f = useFormat();
  const { user } = useAuth();
  const { data, reload } = useAsync(() => api.get('/admin/rules', { org: false }), []);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  if (!data) return <Loading />;
  const keys = [...new Set(data.map((r) => r.key))];
  return (
    <Card title={L('Tax rules library', 'مكتبة القواعد الضريبية')}>
      <Alert tone="info" className="mb-3">{L('Propose a new version with an effective date and source citation. A different specialist must approve it (four eyes). Past returns keep the version they used.', 'اقترح إصداراً جديداً بتاريخ سريان ومصدر. يجب أن يعتمده متخصص آخر.')}</Alert>
      {err && <ErrorText error={err} />}
      <div className="overflow-x-auto"><table className="table">
        <thead><tr><th>Key</th><th>v</th><th>{L('Effective', 'السريان')}</th><th>{L('Status', 'الحالة')}</th><th>{L('Source', 'المصدر')}</th><th /></tr></thead>
        <tbody>{keys.map((k) => data.filter((r) => r.key === k).map((r, i) => (
          <tr key={r.id} className={i ? 'text-slate-400' : ''}>
            <td className="font-mono text-xs">{r.key}</td><td>{r.version}</td><td className="text-xs">{f.date(r.effectiveFrom)}{r.effectiveTo && ` – ${f.date(r.effectiveTo)}`}</td>
            <td><Badge tone={r.status === 'APPROVED' ? 'green' : r.status === 'DRAFT' ? 'amber' : 'red'}>{r.status}</Badge></td><td className="max-w-xs truncate text-xs" title={r.sourceCitation}>{r.sourceCitation}</td>
            <td className="whitespace-nowrap text-end">
              {i === 0 && r.status === 'APPROVED' && <button type="button" className="btn-secondary btn-sm" onClick={() => setEdit({ key: r.key, value: JSON.stringify(r.value, null, 2), effectiveFrom: new Date().toISOString().slice(0, 10), sourceCitation: r.sourceCitation.replace(' [VERIFY]', ''), changeNote: '' })}>{L('New version', 'إصدار جديد')}</button>}
              {r.status === 'DRAFT' && r.createdById !== user.id && <><button type="button" className="btn-primary btn-sm" onClick={async () => { try { await api.post(`/admin/rules/${r.id}/approve`, {}, { org: false }); reload(); } catch (x) { setErr(x); } }}>{L('Approve', 'اعتماد')}</button><button type="button" className="btn-ghost btn-sm" onClick={async () => { await api.post(`/admin/rules/${r.id}/reject`, {}, { org: false }); reload(); }}>{L('Reject', 'رفض')}</button></>}
              {r.status === 'DRAFT' && r.createdById === user.id && <span className="text-xs text-slate-500">{L('awaiting another approver', 'بانتظار معتمد آخر')}</span>}
            </td>
          </tr>
        )))}</tbody>
      </table></div>
      {edit && (
        <Modal open wide onClose={() => setEdit(null)} title={`${edit.key} — ${L('propose new version', 'اقتراح إصدار جديد')}`} footer={<><button type="button" className="btn-secondary" onClick={() => setEdit(null)}>{L('Cancel', 'إلغاء')}</button><button type="button" className="btn-primary" onClick={async () => { try { await api.post('/admin/rules', edit, { org: false }); setEdit(null); reload(); } catch (x) { setErr(x); setEdit(null); } }}>{L('Submit for approval', 'إرسال للاعتماد')}</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={L('Effective from', 'ساري من')}><input type="date" className="input" value={edit.effectiveFrom} onChange={(e) => setEdit({ ...edit, effectiveFrom: e.target.value })} /></Field>
            <Field label={L('Source citation', 'المصدر')}><input className="input" value={edit.sourceCitation} onChange={(e) => setEdit({ ...edit, sourceCitation: e.target.value })} /></Field>
            <Field label={L('Change note (shown to customers)', 'ملاحظة التغيير')} className="sm:col-span-2"><input className="input" value={edit.changeNote} onChange={(e) => setEdit({ ...edit, changeNote: e.target.value })} /></Field>
            <Field label="JSON" className="sm:col-span-2"><textarea className="input font-mono text-xs" rows={14} dir="ltr" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Tenants() {
  const { L } = useI18n();
  const f = useFormat();
  const { data } = useAsync(() => api.get('/admin/tenants', { org: false }), []);
  const requests = useAsync(() => api.get('/admin/support-requests', { org: false }), []);
  const [req, setReq] = useState(null);
  const [msg, setMsg] = useState(null);
  if (!data) return <Loading />;
  return (
    <div className="space-y-6">
      {msg && <Alert tone="success">{msg}</Alert>}
      <Card title={L('Tenants', 'المستأجرون')} padded={false}>
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>{L('Organisation', 'المنشأة')}</th><th>VAT</th><th>{L('Plan', 'الباقة')}</th><th>{L('Users', 'المستخدمون')}</th><th>{L('Tx', 'معاملات')}</th><th>{L('E-inv.', 'فواتير')}</th><th>{L('Rejected', 'مرفوضة')}</th><th>{L('Created', 'الإنشاء')}</th><th /></tr></thead>
          <tbody>{data.map((o) => <tr key={o.id}><td>{o.legalNameEn}</td><td className="font-mono text-xs">{o.vatNumber}</td><td>{o.plan}</td><td>{o._count.memberships}</td><td>{o._count.transactions}</td><td>{o._count.einvoices}</td><td>{o.rejectedInvoices ? <Badge tone="red">{o.rejectedInvoices}</Badge> : 0}</td><td className="text-xs">{f.date(o.createdAt)}</td>
            <td><button type="button" className="btn-secondary btn-sm" onClick={() => setReq({ organisationId: o.id, name: o.legalNameEn, reason: '' })}>{L('Request access', 'طلب وصول')}</button></td></tr>)}</tbody>
        </table></div>
      </Card>
      <Card title={L('My support access requests', 'طلبات الوصول')}>
        <p className="mb-2 text-xs text-slate-500">{L('After the customer approves, use "Open (read-only)". Access expires automatically and every view is logged and shown to the customer.', 'بعد موافقة العميل استخدم "فتح (قراءة)". ينتهي الوصول تلقائياً ويتم تسجيل كل اطلاع وعرضه للعميل.')}</p>
        <table className="table"><tbody>{(requests.data || []).map((g) => <tr key={g.id}><td>{g.organisation.legalNameEn}</td><td className="text-xs">{g.reason}</td><td><StatusBadge status={g.status} /></td><td className="text-xs">{g.expiresAt && f.dateTime(g.expiresAt)}</td>
          <td>{g.status === 'APPROVED' && new Date(g.expiresAt) > new Date() && <button type="button" className="btn-primary btn-sm" onClick={() => { session.setOrg(g.organisationId); window.location.href = '/app'; }}>{L('Open (read-only)', 'فتح (قراءة)')}</button>}</td></tr>)}</tbody></table>
      </Card>
      {req && <Modal open onClose={() => setReq(null)} title={`${L('Request access to', 'طلب وصول إلى')} ${req.name}`} footer={<button type="button" className="btn-primary" disabled={!req.reason} onClick={async () => { await api.post('/admin/support-requests', req, { org: false }); setReq(null); setMsg(L('Request sent. The customer must approve it.', 'تم إرسال الطلب. يجب أن يوافق العميل.')); requests.reload(); }}>{L('Send request', 'إرسال')}</button>}><Field label={L('Reason (shown to the customer)', 'السبب (يظهر للعميل)')}><textarea className="input" rows={3} value={req.reason} onChange={(e) => setReq({ ...req, reason: e.target.value })} /></Field></Modal>}
    </div>
  );
}

function Users() {
  const { L } = useI18n();
  const f = useFormat();
  const { data, reload } = useAsync(() => api.get('/admin/users', { org: false }), []);
  if (!data) return <Loading />;
  return (
    <Card title={L('Users', 'المستخدمون')} padded={false}>
      <div className="overflow-x-auto"><table className="table">
        <thead><tr><th>{L('User', 'المستخدم')}</th><th>{L('Staff role', 'دور الموظف')}</th><th>MFA</th><th>{L('Last login', 'آخر دخول')}</th><th /></tr></thead>
        <tbody>{data.map((u) => <tr key={u.id}><td>{u.fullName}<div className="text-xs text-slate-500">{u.email}</div></td>
          <td><select className="input w-auto py-1 text-xs" value={u.platformRole || ''} onChange={async (e) => { try { await api.patch(`/admin/users/${u.id}`, { platformRole: e.target.value || null }, { org: false }); reload(); } catch (x) { alert(x.message); } }}><option value="">—</option><option value="SUPPORT">SUPPORT</option><option value="TAX_SPECIALIST">TAX_SPECIALIST</option><option value="PLATFORM_ADMIN">PLATFORM_ADMIN</option></select></td>
          <td>{u.mfaEnabled ? <Badge tone="green">✓</Badge> : '—'}</td><td className="text-xs">{f.dateTime(u.lastLoginAt)}</td>
          <td className="whitespace-nowrap">{u.mfaEnabled && <button type="button" className="btn-ghost btn-sm" onClick={async () => { const note = prompt(L('How was the identity re-verified? (required)', 'كيف تم التحقق من الهوية؟')); if (note) { await api.patch(`/admin/users/${u.id}`, { resetMfa: true, verificationNote: note }, { org: false }); reload(); } }}>{L('Reset MFA', 'إعادة تعيين MFA')}</button>}
            <button type="button" className="btn-ghost btn-sm" onClick={async () => { try { await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive }, { org: false }); reload(); } catch (x) { alert(x.message); } }}>{u.isActive ? L('Deactivate', 'تعطيل') : L('Activate', 'تفعيل')}</button></td></tr>)}</tbody>
      </table></div>
    </Card>
  );
}

export default function Admin() {
  const { L, t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState('rules');
  if (!user?.platformRole) return <Alert tone="error">{L('Staff only.', 'للموظفين فقط.')}</Alert>;
  return (
    <div>
      <PageHeader title={t('admin')} subtitle={L('Separate staff accounts and audit trail for Triple i Oman.', 'حسابات موظفين وسجل تدقيق منفصلان لتريبل آي عُمان.')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'rules', label: L('Rules library', 'مكتبة القواعد') }, { id: 'tenants', label: L('Tenants & support', 'المستأجرون والدعم') }, ...(user.platformRole === 'PLATFORM_ADMIN' ? [{ id: 'users', label: L('Users', 'المستخدمون') }] : [])]} />
      {tab === 'rules' && <Rules />}
      {tab === 'tenants' && <Tenants />}
      {tab === 'users' && <Users />}
    </div>
  );
}
