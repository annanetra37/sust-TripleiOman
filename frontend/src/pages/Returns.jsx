import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat, isoDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Card, ErrorText, Field, Loading, Modal, PageHeader, StatusBadge, useAsync } from '../components/ui';

export default function Returns() {
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, error, loading } = useAsync(() => api.get('/returns'), []);
  const obs = useAsync(() => api.get('/obligations?taxType=VAT'), []);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState({ obligationId: '', periodStart: '', periodEnd: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const prepare = async (body) => {
    setBusy(true); setErr(null);
    try { const r = await api.post('/returns/vat', body); navigate(`/app/returns/${r.id}`); } catch (x) { setErr(x); setOpen(true); } finally { setBusy(false); }
  };
  useEffect(() => { if (params.get('prepare')) prepare({ obligationId: params.get('prepare') }); /* eslint-disable-next-line */ }, []);
  if (loading || busy) return <Loading />;
  const openVat = (obs.data || []).filter((o) => !['SUBMITTED', 'PAID', 'ACKNOWLEDGED'].includes(o.status) && new Date(o.periodEnd) < new Date(Date.now() + 90 * 86400000));

  return (
    <div className="space-y-6">
      <PageHeader title={t('returns')} subtitle={L('Prepare → review → approve (four eyes) → file on the TaxOman portal with the filing companion → record payment.', 'إعداد ← مراجعة ← اعتماد (أربع أعين) ← التقديم في بوابة جهاز الضرائب ← تسجيل الدفع.')}
        actions={can('return.prepare') && <button type="button" className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{L('Prepare VAT return', 'إعداد إقرار ضريبة القيمة المضافة')}</button>} />
      <ErrorText error={error} />
      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>{L('Tax', 'الضريبة')}</th><th>{t('period')}</th><th>{t('status')}</th><th className="text-end">{L('Payable / (refund)', 'المستحق / (المسترد)')}</th><th>{L('Submission ref.', 'مرجع التقديم')}</th><th /></tr></thead>
            <tbody>
              {(data || []).map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{t(r.taxType)}</td>
                  <td className="whitespace-nowrap">{f.date(r.periodStart)} – {f.date(r.periodEnd)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="whitespace-nowrap text-end num">{f.omr(r.amountDueBaisa)}</td>
                  <td className="font-mono text-xs">{r.submissionRef || '—'}</td>
                  <td className="text-end"><Link className="btn-secondary btn-sm" to={`/app/returns/${r.id}`}>{L('Open', 'فتح')}</Link></td>
                </tr>
              ))}
              {!data?.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">{L('No returns yet.', 'لا توجد إقرارات بعد.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-sm text-slate-500">{L('Corporate income tax, withholding tax and excise returns are prepared from their own pages.', 'تُعد إقرارات ضريبة الدخل والاستقطاع والانتقائية من صفحاتها الخاصة.')} <Link to="/app/cit" className="text-brand-700">{t('cit')}</Link> · <Link to="/app/wht" className="text-brand-700">{t('wht')}</Link> · <Link to="/app/excise" className="text-brand-700">{t('excise')}</Link></p>
      <Modal open={open} onClose={() => setOpen(false)} title={L('Prepare VAT return', 'إعداد إقرار ضريبة القيمة المضافة')}
        footer={<><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t('cancel')}</button><button type="button" className="btn-primary" onClick={() => prepare(sel.obligationId ? { obligationId: sel.obligationId } : { periodStart: sel.periodStart, periodEnd: sel.periodEnd })}>{L('Calculate', 'احسب')}</button></>}>
        {err && <div className="mb-3"><ErrorText error={err} /></div>}
        <Field label={L('VAT period from your calendar', 'فترة من التقويم')}>
          <select className="input" value={sel.obligationId} onChange={(e) => setSel({ ...sel, obligationId: e.target.value })}>
            <option value="">{L('Custom period…', 'فترة مخصصة…')}</option>
            {openVat.map((o) => <option key={o.id} value={o.id}>{lang === 'ar' ? o.titleAr : o.title} ({L('due', 'مستحق')} {f.date(o.dueDate)})</option>)}
          </select>
        </Field>
        {!sel.obligationId && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label={L('From', 'من')}><input type="date" className="input" value={sel.periodStart} onChange={(e) => setSel({ ...sel, periodStart: e.target.value })} max={isoDate(new Date())} /></Field>
            <Field label={L('To', 'إلى')}><input type="date" className="input" value={sel.periodEnd} onChange={(e) => setSel({ ...sel, periodEnd: e.target.value })} /></Field>
          </div>
        )}
        <Alert tone="info" className="mt-4">{L('Every box is traceable to source transactions and the rule versions used are stored with the return.', 'كل مربع قابل للتتبع إلى المعاملات المصدرية، وتُحفظ إصدارات القواعد مع الإقرار.')}</Alert>
      </Modal>
    </div>
  );
}
