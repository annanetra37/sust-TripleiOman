import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, RefreshCw, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Badge, Card, ErrorText, Field, Loading, Modal, PageHeader, StatusBadge, Tabs, useAsync } from '../components/ui';

const STATUSES = ['NOT_STARTED', 'DATA_MISSING', 'READY_FOR_REVIEW', 'APPROVED', 'SUBMITTED', 'PAID', 'ACKNOWLEDGED'];
const RETURN_TYPES = { VAT: '/app/returns?new=VAT', CIT: '/app/cit', WHT: '/app/wht', EXCISE: '/app/excise' };

/** Compliance calendar + status board (plan E2-01, E2-03). */
export default function Calendar() {
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const [view, setView] = useState('list');
  const [type, setType] = useState('');
  const [adding, setAdding] = useState(false);
  const [newOb, setNewOb] = useState({ title: '', dueDate: '' });
  const { data, error, loading, reload } = useAsync(() => api.get(`/obligations${type ? `?taxType=${type}` : ''}`), [type]);
  const types = useMemo(() => [...new Set((data || []).map((o) => o.taxType))], [data]);
  if (loading && !data) return <Loading />;
  const now = Date.now();
  const rows = (data || []).filter((o) => view !== 'list' || new Date(o.dueDate).getTime() > now - 120 * 86400000);

  const setStatus = async (o, status) => { await api.patch(`/obligations/${o.id}`, { status }).catch((e) => alert(e.message)); reload(); };

  return (
    <div>
      <PageHeader title={t('calendar')} subtitle={L('Every TaxOman deadline for your organisation. Weekends (Fri–Sat) and public holidays are shifted to the next working day.', 'جميع مواعيد جهاز الضرائب لمنشأتك. تُرحَّل المواعيد الواقعة في عطلة نهاية الأسبوع (الجمعة والسبت) والعطل الرسمية إلى يوم العمل التالي.')}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => api.download('/obligations/export.ics', 'triplei-oman-tax-calendar.ics')}><Download className="h-4 w-4" />iCal</button>
          {can('org.manage') && <button type="button" className="btn-secondary" onClick={async () => { await api.post('/obligations/regenerate'); reload(); }}><RefreshCw className="h-4 w-4" />{L('Regenerate', 'إعادة إنشاء')}</button>}
          {can('data.write') && <button type="button" className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{L('Custom deadline', 'موعد مخصص')}</button>}
        </>} />
      <ErrorText error={error} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={view} onChange={setView} tabs={[{ id: 'list', label: L('List', 'قائمة') }, { id: 'board', label: L('Status board', 'لوحة الحالة') }]} />
        <select className="input ms-auto w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="tax type">
          <option value="">{L('All taxes', 'كل الضرائب')}</option>{['VAT', 'CIT', 'WHT', 'EXCISE', 'EINVOICING', 'REGISTRATION', 'PIT', 'LETTER', 'OTHER', ...types].filter((v, i, a) => a.indexOf(v) === i).map((x) => <option key={x} value={x}>{t(x)}</option>)}
        </select>
      </div>
      {view === 'list' ? (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{t('dueDate')}</th><th>{L('Obligation', 'الالتزام')}</th><th>{t('period')}</th><th>{t('status')}</th><th /></tr></thead>
              <tbody>
                {rows.map((o) => {
                  const days = f.daysUntil(o.dueDate);
                  const done = ['SUBMITTED', 'PAID', 'ACKNOWLEDGED'].includes(o.status);
                  return (
                    <tr key={o.id} className={!done && days < 0 ? 'bg-red-50/50' : ''}>
                      <td className="whitespace-nowrap"><div className="font-medium">{f.date(o.dueDate)}</div>{!done && <Badge tone={days < 0 ? 'red' : days <= 7 ? 'amber' : 'gray'}>{days < 0 ? L(`${-days} d overdue`, `متأخر ${-days} يوم`) : L(`in ${days} d`, `بعد ${days} يوم`)}</Badge>}</td>
                      <td><div className="font-medium">{lang === 'ar' ? o.titleAr || o.title : o.title}</div><div className="text-xs text-slate-500">{t(o.taxType)}</div></td>
                      <td className="whitespace-nowrap text-xs text-slate-500">{o.periodStart && o.periodEnd && o.taxType !== 'EINVOICING' ? `${f.date(o.periodStart)} – ${f.date(o.periodEnd)}` : '—'}</td>
                      <td>
                        {can('return.prepare') && !['VAT', 'CIT', 'WHT', 'EXCISE'].includes(o.taxType) ? (
                          <select className="input w-auto py-1 text-xs" value={o.status} onChange={(e) => setStatus(o, e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
                        ) : <StatusBadge status={o.status} />}
                      </td>
                      <td className="text-end">
                        {o.returns?.[0] ? <Link className="btn-ghost btn-sm" to={`/app/returns/${o.returns[0].id}`}>{L('Open return', 'فتح الإقرار')}</Link>
                          : RETURN_TYPES[o.taxType] && can('return.prepare') && !done && <Link className="btn-secondary btn-sm" to={o.taxType === 'VAT' ? `/app/returns?prepare=${o.id}` : RETURN_TYPES[o.taxType]}>{L('Prepare', 'إعداد')}</Link>}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">{L('No obligations yet — complete onboarding.', 'لا توجد التزامات — أكمل الإعداد.')}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-4 xl:grid-cols-7">
          {STATUSES.map((s) => (
            <div key={s} className="min-w-[180px] rounded-xl bg-slate-100 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-slate-500">{t(s)}<span>{rows.filter((o) => o.status === s).length}</span></div>
              <div className="space-y-2">
                {rows.filter((o) => o.status === s).slice(0, 30).map((o) => (
                  <div key={o.id} className="rounded-lg bg-white p-2 text-xs shadow-sm"><div className="font-medium">{lang === 'ar' ? o.titleAr || o.title : o.title}</div><div className="text-slate-500">{f.date(o.dueDate)}</div></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title={L('Add a custom deadline', 'إضافة موعد مخصص')} footer={<><button type="button" className="btn-secondary" onClick={() => setAdding(false)}>{t('cancel')}</button><button type="button" className="btn-primary" onClick={async () => { await api.post('/obligations', newOb); setAdding(false); setNewOb({ title: '', dueDate: '' }); reload(); }}>{t('save')}</button></>}>
        <div className="space-y-3">
          <Field label={L('Title', 'العنوان')}><input className="input" value={newOb.title} onChange={(e) => setNewOb({ ...newOb, title: e.target.value })} /></Field>
          <Field label={t('dueDate')}><input className="input" type="date" value={newOb.dueDate} onChange={(e) => setNewOb({ ...newOb, dueDate: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
