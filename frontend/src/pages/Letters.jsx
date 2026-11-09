import { useState } from 'react';
import { Plus, FileSignature } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat, isoDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Badge, Card, CopyButton, Field, Loading, Modal, PageHeader, StatusBadge, Tabs, useAsync } from '../components/ui';

const TYPES = { INFORMATION_REQUEST: ['Information request', 'طلب معلومات'], ASSESSMENT: ['Tax assessment', 'ربط ضريبي'], AUDIT_NOTICE: ['Audit notice', 'إشعار تدقيق'], PENALTY: ['Penalty', 'غرامة'], REFUND: ['Refund', 'استرداد'], OTHER: ['Other', 'أخرى'] };

/** TaxOman letters inbox, deadline tracking and objection drafting (plan E11-02, E11-03). */
export default function Letters() {
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const { data, reload } = useAsync(() => api.get('/letters'), []);
  const [form, setForm] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [tplLang, setTplLang] = useState(lang);
  if (!data) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHeader title={t('letters')} subtitle={L('Log every letter from the Tax Authority, never miss a response deadline, and prepare objections with a bilingual template and evidence checklist.', 'سجّل كل خطاب من جهاز الضرائب، ولا تفوت موعد الرد، وأعد الاعتراضات بقالب ثنائي اللغة وقائمة مستندات.')}
        actions={can('data.write') && <button type="button" className="btn-primary" onClick={() => setForm({ letterType: 'INFORMATION_REQUEST', subject: '', reference: '', receivedAt: isoDate(new Date()), responseDueAt: '', notes: '' })}><Plus className="h-4 w-4" />{L('Log a letter', 'تسجيل خطاب')}</button>} />
      <Card padded={false}>
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>{L('Received', 'الاستلام')}</th><th>{L('Subject', 'الموضوع')}</th><th>{L('Type', 'النوع')}</th><th>{L('Reply by', 'الرد قبل')}</th><th>{t('status')}</th><th /></tr></thead>
          <tbody>{data.map((l) => {
            const days = l.responseDueAt ? f.daysUntil(l.responseDueAt) : null;
            return (
              <tr key={l.id}><td className="whitespace-nowrap">{f.date(l.receivedAt)}</td><td><div className="font-medium">{l.subject}</div><div className="font-mono text-xs text-slate-500">{l.reference}</div></td><td className="text-xs">{L(...TYPES[l.letterType])}</td>
                <td>{l.responseDueAt ? <Badge tone={l.status !== 'OPEN' ? 'gray' : days < 0 ? 'red' : days <= 7 ? 'amber' : 'gray'}>{f.date(l.responseDueAt)}</Badge> : '—'}</td>
                <td>{can('data.write') ? <select className="input w-auto py-1 text-xs" value={l.status} onChange={async (e) => { await api.patch(`/letters/${l.id}`, { status: e.target.value }); reload(); }}>{['OPEN', 'RESPONDED', 'OBJECTED', 'CLOSED'].map((s) => <option key={s} value={s}>{t(s)}</option>)}</select> : <StatusBadge status={l.status} />}</td>
                <td className="text-end">{['ASSESSMENT', 'PENALTY'].includes(l.letterType) && <button type="button" className="btn-secondary btn-sm" onClick={async () => setTpl(await api.get(`/letters/${l.id}/objection-template`))}><FileSignature className="h-4 w-4" />{L('Objection', 'اعتراض')}</button>}</td></tr>
            );
          })}{!data.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">{L('No letters logged.', 'لا توجد خطابات.')}</td></tr>}</tbody>
        </table></div>
      </Card>
      {form && (
        <Modal open onClose={() => setForm(null)} title={L('Log a TaxOman letter', 'تسجيل خطاب')} footer={<><button type="button" className="btn-secondary" onClick={() => setForm(null)}>{t('cancel')}</button><button type="button" className="btn-primary" onClick={async () => { await api.post('/letters', form); setForm(null); reload(); }}>{t('save')}</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={L('Type', 'النوع')}><select className="input" value={form.letterType} onChange={(e) => setForm({ ...form, letterType: e.target.value })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{L(...v)}</option>)}</select></Field>
            <Field label={L('Reference', 'المرجع')}><input className="input" dir="ltr" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
            <Field label={L('Subject', 'الموضوع')} className="sm:col-span-2"><input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
            <Field label={L('Received on', 'تاريخ الاستلام')}><input type="date" className="input" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></Field>
            <Field label={L('Reply / objection deadline', 'موعد الرد / الاعتراض')} hint={L('Added to your tax calendar with reminders.', 'يُضاف إلى التقويم مع تذكيرات.')}><input type="date" className="input" value={form.responseDueAt} onChange={(e) => setForm({ ...form, responseDueAt: e.target.value })} /></Field>
            <Field label={L('Notes', 'ملاحظات')} className="sm:col-span-2"><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {tpl && (
        <Modal open wide onClose={() => setTpl(null)} title={L('Objection letter template', 'قالب خطاب الاعتراض')}>
          <Alert tone="warn" className="mb-3">{lang === 'ar' ? tpl.guidanceAr : tpl.guidanceEn}</Alert>
          <Tabs value={tplLang} onChange={setTplLang} tabs={[{ id: 'en', label: 'English' }, { id: 'ar', label: 'العربية' }]} />
          <div className="relative"><pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm" dir={tplLang === 'ar' ? 'rtl' : 'ltr'}>{tpl[tplLang]}</pre><div className="absolute end-2 top-2"><CopyButton value={tpl[tplLang]} /></div></div>
          <div className="mt-4 text-sm"><div className="mb-1 font-medium">{L('Evidence checklist', 'قائمة المستندات')}</div><ul className="list-disc ps-5">{tpl.checklist.map((c) => <li key={c}>{c}</li>)}</ul></div>
        </Modal>
      )}
    </div>
  );
}
