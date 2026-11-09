import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Upload, CheckCircle2, Circle } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Badge, Card, ErrorText, Loading, PageHeader, ProgressBar, StatusBadge, Tabs, useAsync } from '../components/ui';

function Readiness() {
  const { L, lang } = useI18n();
  const { can } = useAuth();
  const { data, reload } = useAsync(() => api.get('/einvoices/readiness'), []);
  const ov = useAsync(() => api.get('/orgs/current/overview'), []);
  if (!data) return <Loading />;
  const w = ov.data?.einvoicing;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2" title={L('Fawtara readiness checklist', 'قائمة الجاهزية لمنظومة فوترة')}>
        <div className="mb-4 flex items-center gap-4"><div className="text-3xl font-semibold num">{data.score}%</div><div className="flex-1"><ProgressBar value={data.score} tone={data.score < 50 ? 'red' : data.score < 80 ? 'amber' : 'brand'} /></div></div>
        <ul className="space-y-2">{data.items.map((i) => <li key={i.id} className="flex items-center gap-2 text-sm">{i.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}<span className={i.passed ? '' : 'text-slate-700'}>{lang === 'ar' ? i.labelAr : i.labelEn}</span><span className="ms-auto text-xs text-slate-400">{i.weight}%</span></li>)}</ul>
        {can('org.manage') && !data.items.find((i) => i.id === 'aspLinked').passed && <button type="button" className="btn-secondary mt-4" onClick={async () => { await api.post('/einvoices/readiness/asp-linked', { linked: true }); reload(); }}>{L('I linked Triple i Oman\'s partner ASP on the Fawtara portal', 'ربطت مزود الخدمة الشريك في بوابة فوترة')}</button>}
      </Card>
      <Card title={L('Your go-live date', 'موعد البدء')}>
        {w?.applies ? <><div className="text-2xl font-semibold">{w.date}</div><div className="text-sm text-slate-500">{lang === 'ar' ? w.labelAr : w.labelEn}</div><p className="mt-3 text-sm">{lang === 'ar' ? w.explanationAr : w.explanationEn}</p><Badge tone={w.daysLeft < 90 ? 'red' : 'amber'} className="mt-3">{L(`${w.daysLeft} days left`, `متبقٍ ${w.daysLeft} يوم`)}</Badge></> : <p className="text-sm text-slate-600">{lang === 'ar' ? w?.explanationAr : w?.explanationEn}</p>}
        <p className="mt-4 text-xs text-slate-500">{L('Triple i Oman sends e-invoices through an accredited partner service provider (ASP) using the Peppol PINT OM format.', 'ترسل تريبل آي عُمان الفواتير عبر مزود خدمة معتمد شريك بصيغة Peppol PINT OM.')}</p>
      </Card>
    </div>
  );
}

export default function EInvoices() {
  const { L, t } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('out');
  const [msg, setMsg] = useState(null);
  const q = tab === 'out' ? '?direction=OUTBOUND' : tab === 'in' ? '?direction=INBOUND' : tab === 'rejected' ? '?status=REJECTED,INVALID' : '';
  const { data, error, loading, reload } = useAsync(() => (tab === 'ready' ? Promise.resolve([]) : api.get(`/einvoices${q}`)), [tab]);

  const inbound = async (file) => {
    const fd = new FormData(); fd.append('file', file);
    try { const r = await api.upload('/einvoices/inbound', fd); setMsg({ tone: 'success', text: L(`Received ${r.number}. A purchase entry was created for your VAT return.`, `تم استلام ${r.number} وإنشاء قيد شراء.`) }); reload(); } catch (x) { setMsg({ tone: 'error', text: x.message }); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('einvoicing')} subtitle={L('Create, validate and send legally valid e-invoices; receive supplier e-invoices straight into your purchase ledger.', 'أنشئ فواتير إلكترونية صالحة قانونياً وتحقق منها وأرسلها؛ واستلم فواتير الموردين مباشرة في سجل المشتريات.')}
        actions={can('data.write') && <>
          <label className="btn-secondary cursor-pointer"><Upload className="h-4 w-4" />{L('Receive supplier XML', 'استلام فاتورة مورد XML')}<input type="file" accept=".xml" className="hidden" onChange={(e) => e.target.files[0] && inbound(e.target.files[0])} /></label>
          <button type="button" className="btn-primary" onClick={() => navigate('/app/einvoices/new')}><Plus className="h-4 w-4" />{L('New invoice', 'فاتورة جديدة')}</button>
        </>} />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'out', label: L('Issued', 'الصادرة') }, { id: 'in', label: L('Received', 'المستلمة') }, { id: 'rejected', label: L('Rejected / needs fixes', 'مرفوضة / تحتاج تصحيح') }, { id: 'ready', label: L('Readiness', 'الجاهزية') }]} />
      {tab === 'ready' ? <Readiness /> : (
        <Card padded={false}>
          <ErrorText error={error} />
          {loading ? <Loading /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>{L('Number', 'الرقم')}</th><th>{L('Type', 'النوع')}</th><th>{t('date')}</th><th>{tab === 'in' ? L('Supplier', 'المورد') : L('Customer', 'العميل')}</th><th className="text-end">{t('total')}</th><th>{t('status')}</th><th /></tr></thead>
                <tbody>
                  {(data || []).map((i) => (
                    <tr key={i.id}>
                      <td className="font-mono text-xs">{i.number}</td>
                      <td className="text-xs">{i.docType === 'INVOICE' ? L('Invoice', 'فاتورة') : i.docType === 'CREDIT_NOTE' ? L('Credit note', 'إشعار دائن') : L('Debit note', 'إشعار مدين')} · {i.kind}</td>
                      <td className="whitespace-nowrap">{f.date(i.issueDate)}</td>
                      <td>{(i.direction === 'INBOUND' ? i.seller?.name : i.buyer?.name) || L('Consumer', 'مستهلك')}</td>
                      <td className="whitespace-nowrap text-end num">{f.omr(i.totalBaisa)}</td>
                      <td><StatusBadge status={i.status} />{i.status === 'INVALID' && <span className="ms-1 text-xs text-amber-700">{i.validationErrors?.length}</span>}</td>
                      <td className="text-end"><Link to={`/app/einvoices/${i.id}`} className="btn-secondary btn-sm">{L('Open', 'فتح')}</Link></td>
                    </tr>
                  ))}
                  {!data?.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">{L('No e-invoices here.', 'لا توجد فواتير.')}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
