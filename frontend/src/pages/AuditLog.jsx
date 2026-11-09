import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Download, Package } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat, isoDate } from '../lib/format';
import { Alert, Card, Field, Loading, PageHeader, useAsync } from '../components/ui';

export default function AuditLog() {
  const { L, t } = useI18n();
  const f = useFormat();
  const [filter, setFilter] = useState('');
  const { data } = useAsync(() => api.get(`/audit?limit=300${filter ? `&action=${filter}` : ''}`), [filter]);
  const [verify, setVerify] = useState(null);
  const [pack, setPack] = useState({ from: `${new Date().getUTCFullYear()}-01-01`, to: isoDate(new Date()) });
  return (
    <div className="space-y-6">
      <PageHeader title={t('audit')} subtitle={L('Append-only, hash-chained log of who did what. Any change to past entries breaks the chain and is detected.', 'سجل غير قابل للتعديل ومتسلسل بالبصمات لكل إجراء. أي تغيير في السجلات السابقة يكسر السلسلة ويتم اكتشافه.')}
        actions={<>
          <button type="button" className="btn-secondary" onClick={async () => setVerify(await api.get('/audit/verify'))}><ShieldCheck className="h-4 w-4" />{L('Verify chain', 'تحقق من السلسلة')}</button>
          <button type="button" className="btn-secondary" onClick={() => api.download('/audit/export.csv', 'audit-log.csv')}><Download className="h-4 w-4" />CSV</button>
        </>} />
      {verify && (verify.valid ? <Alert tone="success" title={L('Chain intact', 'السلسلة سليمة')}>{L(`${verify.checked} entries verified.`, `تم التحقق من ${verify.checked} سجل.`)}</Alert> : <Alert tone="error" title={L('Chain broken', 'السلسلة مكسورة')}><ShieldAlert className="inline h-4 w-4" /> {L('At entry', 'عند السجل')} #{verify.brokenAt}</Alert>)}
      <Card title={<span className="flex items-center gap-2"><Package className="h-4 w-4" />{L('Audit-ready pack', 'حزمة جاهزة للتدقيق')}</span>}>
        <p className="mb-3 text-sm text-slate-600">{L('One ZIP with returns and workings, source transactions, e-invoice XML, supporting documents and the audit log for the period.', 'ملف ZIP واحد يضم الإقرارات والمعاملات والفواتير الإلكترونية والمستندات وسجل التدقيق للفترة.')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={L('From', 'من')}><input type="date" className="input" value={pack.from} onChange={(e) => setPack({ ...pack, from: e.target.value })} /></Field>
          <Field label={L('To', 'إلى')}><input type="date" className="input" value={pack.to} onChange={(e) => setPack({ ...pack, to: e.target.value })} /></Field>
          <button type="button" className="btn-primary" onClick={() => api.download(`/audit/pack?from=${pack.from}&to=${pack.to}`, `audit-pack_${pack.from}_${pack.to}.zip`)}><Download className="h-4 w-4" />{L('Download pack', 'تنزيل الحزمة')}</button>
        </div>
      </Card>
      <Card padded={false}>
        <div className="p-3"><input className="input max-w-xs" placeholder={L('Filter by action (e.g. return.)', 'تصفية حسب الإجراء')} value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
        {!data ? <Loading /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>#</th><th>{L('When', 'الوقت')}</th><th>{L('Who', 'من')}</th><th>{L('Action', 'الإجراء')}</th><th>{L('Object', 'العنصر')}</th><th>{L('Hash', 'البصمة')}</th></tr></thead>
            <tbody>{data.map((r) => <tr key={r.seq}><td className="text-xs text-slate-400">{r.seq}</td><td className="whitespace-nowrap text-xs">{f.dateTime(r.createdAt)}</td><td className="text-xs">{r.actorLabel}</td><td className="font-mono text-xs">{r.action}</td><td className="text-xs">{r.objectType} {r.details && Object.keys(r.details).length > 0 && <div className="max-w-xs truncate text-slate-400">{JSON.stringify(r.details)}</div>}</td><td className="font-mono text-[10px] text-slate-400">{r.hash.slice(0, 10)}…</td></tr>)}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
