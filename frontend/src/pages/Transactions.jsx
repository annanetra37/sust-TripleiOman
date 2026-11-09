import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Upload, Download, Plus, RefreshCw, Trash2, Lock, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat, isoDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Badge, Card, ErrorText, Field, Loading, Modal, PageHeader, Tabs, Toggle, useAsync } from '../components/ui';

const CATS = ['STANDARD', 'ZERO_RATED', 'EXEMPT', 'OUT_OF_SCOPE', 'REVERSE_CHARGE'];

function ImportPanel({ onDone }) {
  const { L } = useI18n();
  const ref = useRef();
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr(null); setRes(null);
    const fd = new FormData(); fd.append('file', file);
    try { setRes(await api.upload('/transactions/import', fd)); onDone(); } catch (x) { setErr(x); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <Card title={L('Import sales & purchases', 'استيراد المبيعات والمشتريات')} actions={<button type="button" className="btn-secondary btn-sm" onClick={() => api.download('/transactions/template', 'triplei-oman-transactions-template.xlsx')}><Download className="h-4 w-4" />{L('Template (AR/EN)', 'القالب (عربي/إنجليزي)')}</button>}>
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-6 text-center"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files[0]); }}>
        <Upload className="h-6 w-6 text-slate-400" />
        <p className="text-sm text-slate-600">{L('Drag an Excel or CSV file here, or', 'اسحب ملف Excel أو CSV هنا، أو')}</p>
        <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => ref.current?.click()}>{busy ? L('Importing…', 'جارٍ الاستيراد…') : L('Choose file', 'اختر ملفاً')}</button>
        <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => upload(e.target.files[0])} />
        <p className="text-xs text-slate-500">{L('Odoo, Zoho Books, QuickBooks, Dynamics 365 BC, SAP B1 and Tally exports work if columns match the template. Direct ERP connectors are on the roadmap.', 'تعمل ملفات التصدير من Odoo وZoho وQuickBooks وغيرها إذا طابقت أعمدة القالب. الربط المباشر مع أنظمة ERP قادم.')}</p>
      </div>
      {err && <div className="mt-3"><ErrorText error={err} /></div>}
      {res && (
        <Alert tone={res.errors.length ? 'warn' : 'success'} className="mt-3" title={L(`${res.imported} rows imported`, `تم استيراد ${res.imported} صف`)}>
          {L(`${res.flagged} flagged for review, ${res.needsCategory} need a VAT category.`, `${res.flagged} تحتاج مراجعة، و${res.needsCategory} تحتاج فئة ضريبية.`)}
          {res.errors.length > 0 && <ul className="mt-1 list-disc ps-5">{res.errors.slice(0, 10).map((e) => <li key={e.row}>{L('Row', 'الصف')} {e.row}: {e.message}</li>)}</ul>}
        </Alert>
      )}
    </Card>
  );
}

function TxForm({ initial, onSave, onClose }) {
  const { L, t } = useI18n();
  const [v, setV] = useState(initial || { direction: 'SALE', date: isoDate(new Date()), counterpartyCountry: 'OM', netOmr: '', vatOmr: '', hasTaxInvoice: true });
  const [err, setErr] = useState(null);
  const s = (k) => (e) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={L('Transaction', 'معاملة')} footer={<><button type="button" className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button type="button" className="btn-primary" onClick={async () => { try { await onSave(v); } catch (x) { setErr(x.message); } }}>{t('save')}</button></>}>
      {err && <Alert tone="error" className="mb-3">{err}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={L('Type', 'النوع')}><select className="input" value={v.direction} onChange={s('direction')}><option value="SALE">{L('Sale', 'بيع')}</option><option value="PURCHASE">{L('Purchase', 'شراء')}</option></select></Field>
        <Field label={t('date')}><input type="date" className="input" value={v.date} onChange={s('date')} /></Field>
        <Field label={L('Invoice number', 'رقم الفاتورة')}><input className="input" value={v.invoiceNumber || ''} onChange={s('invoiceNumber')} /></Field>
        <Field label={L('Counterparty', 'الطرف الآخر')}><input className="input" value={v.counterpartyName || ''} onChange={s('counterpartyName')} /></Field>
        <Field label={L('Counterparty VAT number', 'الرقم الضريبي للطرف')}><input className="input" dir="ltr" value={v.counterpartyVat || ''} onChange={s('counterpartyVat')} /></Field>
        <Field label={L('Country (ISO code)', 'الدولة (رمز)')}><input className="input" dir="ltr" maxLength={2} value={v.counterpartyCountry} onChange={s('counterpartyCountry')} /></Field>
        <Field label={`${t('net')} (OMR)`}><input className="input" dir="ltr" type="number" step="0.001" value={v.netOmr} onChange={s('netOmr')} /></Field>
        <Field label={`${t('vat')} (OMR)`}><input className="input" dir="ltr" type="number" step="0.001" value={v.vatOmr} onChange={s('vatOmr')} /></Field>
        <Field label={t('description')} className="sm:col-span-2"><input className="input" value={v.description || ''} onChange={s('description')} /></Field>
        <Field label={L('VAT category', 'فئة الضريبة')}><select className="input" value={v.vatCategory || ''} onChange={s('vatCategory')}><option value="">{L('Suggest for me', 'اقترح لي')}</option>{CATS.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></Field>
        <div className="flex flex-col gap-2 pt-6">
          <Toggle checked={v.isService} onChange={(x) => setV({ ...v, isService: x })} label={L('Service', 'خدمة')} />
          <Toggle checked={v.isImport} onChange={(x) => setV({ ...v, isImport: x })} label={L('Import of goods', 'استيراد سلع')} />
          <Toggle checked={v.isCreditNote} onChange={(x) => setV({ ...v, isCreditNote: x })} label={L('Credit note', 'إشعار دائن')} />
          {v.direction === 'PURCHASE' && <Toggle checked={v.hasTaxInvoice} onChange={(x) => setV({ ...v, hasTaxInvoice: x })} label={L('Valid tax invoice held', 'فاتورة ضريبية متوفرة')} />}
        </div>
      </div>
    </Modal>
  );
}

function Mappings() {
  const { L, t } = useI18n();
  const { data, reload } = useAsync(() => api.get('/transactions/account-mappings'), []);
  if (!data) return <Loading />;
  const rows = [...data.mappings.map((m) => ({ ...m, mapped: true })), ...data.unmapped];
  return (
    <Card title={L('Chart of accounts → VAT category', 'دليل الحسابات ← فئة الضريبة')}>
      <p className="mb-3 text-sm text-slate-500">{L('Map each account code once; future imports use the mapping automatically. Every change is kept in history.', 'اربط كل حساب مرة واحدة؛ ستستخدم الاستيرادات القادمة الربط تلقائياً. يتم حفظ سجل لكل تغيير.')}</p>
      {rows.length === 0 ? <p className="text-sm text-slate-500">{L('Import transactions with an account code column to start.', 'استورد معاملات تحتوي على عمود رمز الحساب للبدء.')}</p> : (
        <table className="table"><thead><tr><th>{L('Account', 'الحساب')}</th><th>{L('Category', 'الفئة')}</th><th>{L('History', 'السجل')}</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.accountCode}><td className="font-mono">{r.accountCode}{r.count ? <span className="ms-2 text-xs text-slate-400">({r.count})</span> : null}</td>
              <td><select className="input w-auto py-1 text-xs" value={r.taxCategory || ''} onChange={async (e) => { await api.put(`/transactions/account-mappings/${encodeURIComponent(r.accountCode)}`, { taxCategory: e.target.value }); reload(); }}><option value="" disabled>—</option>{CATS.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></td>
              <td className="text-xs text-slate-500">{(r.history || []).slice(-2).map((h) => `${h.by}: ${h.to}`).join(' · ')}</td></tr>
          ))}
        </tbody></table>
      )}
    </Card>
  );
}

export default function Transactions() {
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('flagged') === '1' ? 'flagged' : params.get('tab') || 'all';
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const { data, error, loading, reload } = useAsync(() => api.get(`/transactions?${new URLSearchParams({ ...(tab === 'flagged' ? { flagged: '1' } : {}), ...(q ? { q } : {}), limit: 500 })}`), [tab, q]);
  const setTab = (id) => setParams(id === 'flagged' ? { flagged: '1' } : id === 'all' ? {} : { tab: id });

  const setCategory = async (tx, vatCategory) => { try { await api.patch(`/transactions/${tx.id}`, { vatCategory }); reload(); } catch (e) { alert(e.message); } };
  const save = async (v) => {
    const body = { ...v, netOmr: v.netOmr === '' ? undefined : Number(v.netOmr), vatOmr: v.vatOmr === '' ? 0 : Number(v.vatOmr) };
    if (v.id) await api.patch(`/transactions/${v.id}`, body); else await api.post('/transactions', body);
    setEditing(null); reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('transactions')} subtitle={L('Sales and purchases that feed your VAT return. Triple i Oman suggests a VAT category and checks data quality; anything uncertain waits for you to confirm.', 'المبيعات والمشتريات التي تغذي إقرار ضريبة القيمة المضافة. تقترح تريبل آي عُمان الفئة وتتحقق من جودة البيانات؛ وأي شيء غير مؤكد ينتظر تأكيدك.')}
        actions={can('data.write') && <><button type="button" className="btn-secondary" onClick={async () => { await api.post('/transactions/reclassify'); reload(); }}><RefreshCw className="h-4 w-4" />{L('Re-check all', 'إعادة الفحص')}</button><button type="button" className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />{t('add')}</button></>} />
      {can('data.write') && tab !== 'mappings' && <ImportPanel onDone={reload} />}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: L('All', 'الكل') }, { id: 'flagged', label: L('Needs attention', 'تحتاج انتباه') }, { id: 'mappings', label: L('Account mapping', 'ربط الحسابات') }]} />
      {tab === 'mappings' ? <Mappings /> : (
        <Card padded={false}>
          <div className="flex items-center gap-2 p-3"><input className="input max-w-xs" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} /><span className="text-sm text-slate-500">{data ? L(`${data.total} transactions`, `${data.total} معاملة`) : ''}</span></div>
          <ErrorText error={error} />
          {loading && !data ? <Loading /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>{t('date')}</th><th>{L('Type', 'النوع')}</th><th>{L('Invoice / party', 'الفاتورة / الطرف')}</th><th className="text-end">{t('net')}</th><th className="text-end">{t('vat')}</th><th>{L('VAT category', 'فئة الضريبة')}</th><th>{L('Checks', 'الفحوصات')}</th><th /></tr></thead>
                <tbody>
                  {data?.rows.map((tx) => (
                    <tr key={tx.id}>
                      <td className="whitespace-nowrap">{f.date(tx.date)}</td>
                      <td><Badge tone={tx.direction === 'SALE' ? 'green' : 'blue'}>{tx.direction === 'SALE' ? L('Sale', 'بيع') : L('Purchase', 'شراء')}</Badge>{tx.isCreditNote && <Badge tone="violet" className="ms-1">CN</Badge>}</td>
                      <td className="max-w-[240px]"><div className="truncate font-medium">{tx.invoiceNumber || '—'}</div><div className="truncate text-xs text-slate-500">{tx.counterpartyName} {tx.counterpartyCountry !== 'OM' && `(${tx.counterpartyCountry})`}</div><div className="truncate text-xs text-slate-400">{tx.description}</div></td>
                      <td className="whitespace-nowrap text-end num">{f.omr(tx.netBaisa)}</td>
                      <td className="whitespace-nowrap text-end num">{f.omr(tx.vatBaisa)}</td>
                      <td>
                        {tx.lockedByReturnId ? <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Lock className="h-3 w-3" />{tx.vatCategory ? t(tx.vatCategory) : '—'}</span> : (
                          <select disabled={!can('data.write')} className={`input w-auto py-1 text-xs ${!tx.vatCategory ? 'border-red-300 bg-red-50' : ''}`} value={tx.vatCategory || ''} onChange={(e) => setCategory(tx, e.target.value)}>
                            <option value="">{L('Choose…', 'اختر…')}</option>{CATS.map((c) => <option key={c} value={c}>{t(c)}</option>)}
                          </select>
                        )}
                        {tx.categorySource && <div className="mt-0.5 text-[10px] uppercase text-slate-400">{tx.categorySource === 'USER' ? L('confirmed', 'مؤكد') : tx.categorySource === 'RULE' ? L('suggested', 'مقترح') : L('from file', 'من الملف')}</div>}
                      </td>
                      <td className="max-w-[260px]">
                        {(tx.flags || []).length === 0 ? <span className="text-xs text-emerald-600">✓</span> : (tx.flags || []).map((fl) => (
                          <div key={fl.code} className="mb-0.5 flex items-start gap-1 text-xs"><AlertCircle className={`mt-0.5 h-3 w-3 shrink-0 ${fl.severity === 'error' ? 'text-red-500' : fl.severity === 'warning' ? 'text-amber-500' : 'text-sky-500'}`} /><span title={fl.code}>{lang === 'ar' ? fl.messageAr : fl.messageEn}</span></div>
                        ))}
                      </td>
                      <td className="whitespace-nowrap text-end">
                        {can('data.write') && !tx.lockedByReturnId && <>
                          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing({ ...tx, date: isoDate(tx.date), netOmr: Number(tx.netBaisa) / 1000, vatOmr: Number(tx.vatBaisa) / 1000 })}>{t('edit')}</button>
                          <button type="button" className="btn-ghost btn-sm text-red-600" onClick={async () => { if (confirm(L('Delete this transaction?', 'حذف هذه المعاملة؟'))) { await api.del(`/transactions/${tx.id}`); reload(); } }} aria-label={t('delete')}><Trash2 className="h-4 w-4" /></button>
                        </>}
                      </td>
                    </tr>
                  ))}
                  {data && !data.rows.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">{tab === 'flagged' ? L('Nothing needs attention. 🎉', 'لا شيء يحتاج انتباهاً.') : L('No transactions yet. Import your first file above.', 'لا توجد معاملات بعد. استورد أول ملف أعلاه.')}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {editing && <TxForm initial={editing.id ? editing : null} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}
