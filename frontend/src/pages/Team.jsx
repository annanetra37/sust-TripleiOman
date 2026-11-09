import { useState } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Badge, Card, Field, Loading, PageHeader, useAsync } from '../components/ui';

const ROLE_HELP = {
  OWNER: ['Everything, including members and roles', 'كل الصلاحيات بما فيها الأعضاء والأدوار'],
  FINANCE_ADMIN: ['Manage data, prepare and approve returns, organisation settings', 'إدارة البيانات وإعداد واعتماد الإقرارات'],
  PREPARER: ['Import data, prepare returns and invoices — cannot approve', 'استيراد البيانات وإعداد الإقرارات — لا يعتمد'],
  APPROVER: ['Review and approve returns (not their own work)', 'مراجعة واعتماد الإقرارات (ليس من إعداده)'],
  VIEWER: ['Read-only', 'قراءة فقط'],
  EXTERNAL_ACCOUNTANT: ['Prepare on your behalf; actions labelled "by accountant"', 'يعد نيابة عنك؛ تُوسم الإجراءات "بواسطة المحاسب"'],
  AUDITOR: ['Read-only access to evidence and the audit trail', 'قراءة الأدلة وسجل التدقيق فقط'],
};

export default function Team() {
  const { L, t } = useI18n();
  const f = useFormat();
  const { can, user } = useAuth();
  const { data, reload } = useAsync(() => api.get('/orgs/current/members'), []);
  const [inv, setInv] = useState({ email: '', role: 'PREPARER' });
  const [msg, setMsg] = useState(null);
  if (!data) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHeader title={t('team')} subtitle={L('Roles are enforced by the server, not only the screen. Every permission change is logged.', 'تُطبق الأدوار في الخادم وليس في الواجهة فقط. يتم تسجيل كل تغيير في الصلاحيات.')} />
      {can('members.manage') && (
        <Card title={L('Invite someone', 'دعوة شخص')}>
          {msg && <Alert tone={msg.tone} className="mb-3">{msg.text}</Alert>}
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label={L('Email', 'البريد')} className="sm:col-span-2"><input className="input" dir="ltr" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
            <Field label={L('Role', 'الدور')} hint={L(...ROLE_HELP[inv.role])}><select className="input" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>{data.roles.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></Field>
            <div className="flex items-end"><button type="button" className="btn-primary w-full" onClick={async () => { try { const r = await api.post('/orgs/current/invitations', inv); setMsg({ tone: 'success', text: L(`Invitation sent to ${r.email}.`, `تم إرسال الدعوة إلى ${r.email}.`) + (r.devAcceptPath ? ` (dev: ${r.devAcceptPath})` : '') }); setInv({ ...inv, email: '' }); reload(); } catch (x) { setMsg({ tone: 'error', text: x.message }); } }}><UserPlus className="h-4 w-4" />{L('Invite', 'دعوة')}</button></div>
          </div>
        </Card>
      )}
      <Card padded={false}>
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>{L('Member', 'العضو')}</th><th>{L('Role', 'الدور')}</th><th>{L('Two-step', 'خطوتين')}</th><th>{L('Last sign-in', 'آخر دخول')}</th><th>{t('status')}</th></tr></thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.id}><td><div className="font-medium">{m.user.fullName}</div><div className="text-xs text-slate-500">{m.user.email}</div></td>
                <td>{can('members.manage') && m.user.id !== user.id ? <select className="input w-auto py-1 text-xs" value={m.role} onChange={async (e) => { try { await api.patch(`/orgs/current/members/${m.user.id}`, { role: e.target.value }); reload(); } catch (x) { alert(x.message); } }}>{data.roles.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select> : <Badge>{t(m.role)}</Badge>}</td>
                <td>{m.user.mfaEnabled ? <Badge tone="green">✓</Badge> : <Badge tone="amber">{L('off', 'غير مفعل')}</Badge>}</td>
                <td className="text-xs">{f.dateTime(m.user.lastLoginAt)}</td>
                <td>{can('members.manage') && m.user.id !== user.id ? <button type="button" className={`btn-sm ${m.status === 'ACTIVE' ? 'btn-ghost text-red-600' : 'btn-secondary'}`} onClick={async () => { try { await api.patch(`/orgs/current/members/${m.user.id}`, { status: m.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE' }); reload(); } catch (x) { alert(x.message); } }}>{m.status === 'ACTIVE' ? L('Revoke', 'إلغاء') : L('Restore', 'استعادة')}</button> : <Badge tone={m.status === 'ACTIVE' ? 'green' : 'gray'}>{m.status}</Badge>}</td></tr>
            ))}
            {data.invitations.map((i) => <tr key={i.id} className="bg-slate-50/50"><td className="text-slate-500">{i.email}</td><td><Badge>{t(i.role)}</Badge></td><td /><td className="text-xs text-slate-500">{L('Invited, expires', 'مدعو، تنتهي')} {f.date(i.expiresAt)}</td><td><button type="button" className="btn-ghost btn-sm text-red-600" onClick={async () => { await api.del(`/orgs/current/invitations/${i.id}`); reload(); }}><Trash2 className="h-4 w-4" /></button></td></tr>)}
          </tbody>
        </table></div>
      </Card>
      <Card title={L('What each role can do', 'صلاحيات كل دور')}>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">{Object.entries(ROLE_HELP).map(([r, h]) => <div key={r}><dt className="font-medium">{t(r)}</dt><dd className="text-slate-600">{L(...h)}</dd></div>)}</dl>
      </Card>
    </div>
  );
}
