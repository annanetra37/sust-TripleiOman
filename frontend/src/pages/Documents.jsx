import { useState } from 'react';
import { Upload, Download, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Badge, Card, Field, Loading, PageHeader, useAsync } from '../components/ui';

const CATS = { CR_CERTIFICATE: ['CR certificate', 'شهادة السجل التجاري'], TAX_CARD: ['Tax card', 'البطاقة الضريبية'], VAT_CERTIFICATE: ['VAT certificate', 'شهادة التسجيل الضريبي'], ACKNOWLEDGEMENT: ['Filing acknowledgement', 'إشعار استلام'], PAYMENT_PROOF: ['Payment proof', 'إثبات دفع'], LETTER: ['TaxOman letter', 'خطاب الجهاز'], FINANCIAL_STATEMENTS: ['Financial statements', 'القوائم المالية'], RESIDENCY_CERT: ['Residency / clearance certificate', 'شهادة إقامة / براءة ذمة'], CUSTOMS_DECLARATION: ['Customs declaration', 'بيان جمركي'], RECEIPT: ['Receipt', 'إيصال'], OTHER: ['Other', 'أخرى'] };

export default function Documents() {
  const { L, t } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const [filter, setFilter] = useState('');
  const { data, reload } = useAsync(() => api.get(`/documents${filter ? `?category=${filter}` : ''}`), [filter]);
  const [form, setForm] = useState({ category: 'CR_CERTIFICATE', title: '', expiresAt: '', file: null });
  const [err, setErr] = useState(null);
  const upload = async () => {
    setErr(null);
    const fd = new FormData(); fd.append('file', form.file); fd.append('category', form.category); fd.append('title', form.title || form.file.name); if (form.expiresAt) fd.append('expiresAt', form.expiresAt);
    try { await api.upload('/documents', fd); setForm({ ...form, title: '', expiresAt: '', file: null }); reload(); } catch (x) { setErr(x.message); }
  };
  return (
    <div className="space-y-6">
      <PageHeader title={t('documents')} subtitle={L('Certificates, acknowledgements, payment proofs and evidence — fingerprinted (SHA-256), with expiry reminders. Tax records are retained for at least 10 years.', 'الشهادات وإشعارات الاستلام وإثباتات الدفع — مع بصمة SHA-256 وتذكيرات الانتهاء. تُحفظ السجلات الضريبية 10 سنوات على الأقل.')} />
      {can('data.write') && (
        <Card title={L('Upload', 'رفع')}>
          {err && <Alert tone="error" className="mb-3">{err}</Alert>}
          <div className="grid gap-3 sm:grid-cols-5">
            <Field label={L('Category', 'الفئة')}><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(CATS).map(([k, [en, ar]]) => <option key={k} value={k}>{L(en, ar)}</option>)}</select></Field>
            <Field label={L('Title', 'العنوان')}><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label={L('Expires on', 'تاريخ الانتهاء')}><input type="date" className="input" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field>
            <Field label={L('File', 'الملف')}><input type="file" className="input py-1.5" onChange={(e) => setForm({ ...form, file: e.target.files[0] })} /></Field>
            <div className="flex items-end"><button type="button" className="btn-primary w-full" disabled={!form.file} onClick={upload}><Upload className="h-4 w-4" />{t('upload')}</button></div>
          </div>
        </Card>
      )}
      <Card padded={false}>
        <div className="p-3"><select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">{L('All categories', 'كل الفئات')}</option>{Object.entries(CATS).map(([k, [en, ar]]) => <option key={k} value={k}>{L(en, ar)}</option>)}</select></div>
        {!data ? <Loading /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>{L('Title', 'العنوان')}</th><th>{L('Category', 'الفئة')}</th><th>{L('Uploaded', 'تاريخ الرفع')}</th><th>{L('Expires', 'الانتهاء')}</th><th>SHA-256</th><th /></tr></thead>
            <tbody>{data.map((d) => {
              const exp = d.expiresAt ? f.daysUntil(d.expiresAt) : null;
              return (
                <tr key={d.id}><td className="font-medium">{d.title}<div className="text-xs text-slate-500">{d.filename} · {Math.round(d.sizeBytes / 1024)} KB</div></td><td className="text-xs">{L(...(CATS[d.category] || [d.category, d.category]))}</td><td className="text-xs">{f.date(d.createdAt)}</td>
                  <td>{d.expiresAt ? <Badge tone={exp < 0 ? 'red' : exp < 60 ? 'amber' : 'gray'}>{f.date(d.expiresAt)}</Badge> : '—'}</td><td className="font-mono text-[10px] text-slate-400">{d.sha256.slice(0, 12)}…</td>
                  <td className="whitespace-nowrap text-end"><button type="button" className="btn-ghost btn-sm" onClick={() => api.download(`/documents/${d.id}/download`, d.filename)}><Download className="h-4 w-4" /></button>{can('org.manage') && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={async () => { try { await api.del(`/documents/${d.id}`); reload(); } catch (x) { alert(x.message); } }}><Trash2 className="h-4 w-4" /></button>}</td></tr>
              );
            })}{!data.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">{t('none')}</td></tr>}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
