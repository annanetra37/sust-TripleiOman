import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Send, Download, FileMinus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Card, ErrorText, Field, Loading, Modal, PageHeader, StatusBadge, useAsync } from '../components/ui';

export default function EInvoiceDetail() {
  const { id } = useParams();
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data: inv, error, loading, reload } = useAsync(() => api.get(`/einvoices/${id}`), [id]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cn, setCn] = useState(false);
  const [note, setNote] = useState('');
  const [showXml, setShowXml] = useState(false);
  if (loading && !inv) return <Loading />;
  if (error) return <ErrorText error={error} />;
  const sent = ['SENT', 'ACCEPTED', 'DELIVERED'].includes(inv.status);

  return (
    <div className="space-y-6">
      <PageHeader title={`${inv.docType === 'INVOICE' ? L('Invoice', 'فاتورة') : inv.docType === 'CREDIT_NOTE' ? L('Credit note', 'إشعار دائن') : L('Debit note', 'إشعار مدين')} ${inv.number}`}
        subtitle={<span className="flex items-center gap-2"><StatusBadge status={inv.status} />{inv.aspMessageId && <span className="font-mono text-xs">ASP {inv.aspMessageId}</span>}{inv.originalNumber && <span>{L('for', 'عن')} {inv.originalNumber}</span>}</span>}
        actions={<>
          {inv.xml && <button type="button" className="btn-secondary" onClick={() => api.download(`/einvoices/${inv.id}/xml`, `${inv.number}.xml`)}><Download className="h-4 w-4" />XML</button>}
          {inv.direction === 'OUTBOUND' && ['VALID', 'INVALID', 'REJECTED'].includes(inv.status) && can('data.write') && <Link to={`/app/einvoices/${inv.id}/edit`} className="btn-secondary"><Pencil className="h-4 w-4" />{t('edit')}</Link>}
          {inv.direction === 'OUTBOUND' && ['VALID', 'INVALID'].includes(inv.status) && can('data.write') && <button type="button" className="btn-ghost text-red-600" onClick={async () => { if (confirm(L('Delete this draft?', 'حذف هذه المسودة؟'))) { await api.del(`/einvoices/${inv.id}`); navigate('/app/einvoices'); } }}><Trash2 className="h-4 w-4" /></button>}
          {inv.direction === 'OUTBOUND' && inv.docType === 'INVOICE' && sent && can('data.write') && <button type="button" className="btn-secondary" onClick={() => setCn(true)}><FileMinus className="h-4 w-4" />{L('Credit note', 'إشعار دائن')}</button>}
          {inv.direction === 'OUTBOUND' && ['VALID', 'REJECTED'].includes(inv.status) && can('einvoice.send') && <button type="button" className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { await api.post(`/einvoices/${inv.id}/send`); reload(); } catch (x) { setErr(x); } finally { setBusy(false); } }}><Send className="h-4 w-4" />{L('Send via Fawtara', 'إرسال عبر فوترة')}</button>}
        </>} />
      {err && <ErrorText error={err} />}
      {inv.status === 'INVALID' && <Alert tone="warn" title={L('Needs fixes before sending', 'يحتاج تصحيحاً قبل الإرسال')}><ul className="mt-1 space-y-1">{inv.validationErrors.map((e, i) => <li key={i}>{lang === 'ar' ? e.messageAr : e.messageEn} — {lang === 'ar' ? e.fixAr : e.fixEn}</li>)}</ul></Alert>}
      {inv.status === 'REJECTED' && <Alert tone="error" title={L('Rejected by the e-invoicing network', 'رفضتها شبكة الفوترة')}>{inv.statusHistory.filter((s) => s.reason).slice(-1)[0]?.reason}</Alert>}
      {sent && <Alert tone="success">{L('Accepted by the partner ASP, delivered to the buyer and reported to TaxOman. A sales entry was added to your VAT ledger automatically.', 'قبلها مزود الخدمة وسلمها للمشتري وأبلغ جهاز الضرائب. تمت إضافة قيد مبيعات تلقائياً.')}</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div><div className="text-xs uppercase text-slate-500">{L('Seller', 'البائع')}</div><div className="font-medium">{inv.seller?.name}</div><div className="font-mono text-xs">{inv.seller?.vatNumber}</div><div className="text-slate-500">{inv.seller?.address}</div></div>
            <div><div className="text-xs uppercase text-slate-500">{L('Buyer', 'المشتري')}</div><div className="font-medium">{inv.buyer?.name || L('Consumer', 'مستهلك')}</div><div className="font-mono text-xs">{inv.buyer?.vatNumber}</div><div className="text-slate-500">{inv.buyer?.address}</div></div>
            <div><div className="text-xs uppercase text-slate-500">{L('Issue date', 'تاريخ الإصدار')}</div>{f.date(inv.issueDate)}</div>
            {inv.sha256 && <div><div className="text-xs uppercase text-slate-500">SHA-256</div><div className="break-all font-mono text-[10px] text-slate-500">{inv.sha256}</div></div>}
          </div>
          {inv.lines?.length > 0 && (
            <table className="table mt-4"><thead><tr><th>#</th><th>{t('description')}</th><th className="text-end">{L('Qty', 'الكمية')}</th><th className="text-end">{L('Price', 'السعر')}</th><th>{t('vat')}</th><th className="text-end">{t('net')}</th></tr></thead>
              <tbody>{inv.lines.map((l) => <tr key={l.lineNo}><td>{l.lineNo}</td><td>{l.description}{l.descriptionAr && <div className="text-xs text-slate-500" dir="rtl">{l.descriptionAr}</div>}{l.exemptionReason && <div className="text-xs text-slate-500">{l.exemptionReason}</div>}</td><td className="text-end num">{l.quantity}</td><td className="text-end num">{f.omr(l.unitPriceBaisa)}</td><td className="text-xs">{t(l.vatCategory)}</td><td className="text-end num">{f.omr(l.netBaisa)}</td></tr>)}</tbody></table>
          )}
          <div className="mt-4 flex flex-col items-end gap-1 text-sm"><div>{t('net')}: <span className="num">{f.omr(inv.netBaisa)}</span></div><div>{t('vat')}: <span className="num">{f.omr(inv.vatBaisa)}</span></div><div className="text-lg font-semibold">{t('total')}: <span className="num">{f.omr(inv.totalBaisa)}</span></div></div>
        </Card>
        <div className="space-y-6">
          {inv.qrDataUrl && <Card title={L('Receipt QR code', 'رمز QR للإيصال')}><img src={inv.qrDataUrl} alt="QR" className="mx-auto h-44 w-44" /><p className="mt-2 text-center text-xs text-slate-500">{L('QR layout to be aligned with the official OTA specification before go-live.', 'سيتم مواءمة رمز QR مع مواصفات الجهاز الرسمية قبل الإطلاق.')}</p></Card>}
          <Card title={L('History', 'السجل')}>
            <ol className="space-y-2 text-xs">{(inv.statusHistory || []).map((h, i) => <li key={i}><StatusBadge status={h.status} /> <span className="text-slate-500">{f.dateTime(h.at)} · {h.by}</span>{h.reason && <div className="text-red-600">{h.reason}</div>}</li>)}</ol>
            {inv.linkedNotes?.length > 0 && <div className="mt-3 border-t pt-2 text-xs">{inv.linkedNotes.map((n) => <Link key={n.id} to={`/app/einvoices/${n.id}`} className="block text-brand-700">{n.number} · {f.omr(n.totalBaisa)}</Link>)}</div>}
          </Card>
          {inv.xml && <button type="button" className="btn-ghost w-full" onClick={() => setShowXml(true)}>{L('View XML', 'عرض XML')}</button>}
        </div>
      </div>
      <Modal open={showXml} onClose={() => setShowXml(false)} title="UBL 2.1 / PINT OM" wide><pre className="overflow-x-auto whitespace-pre text-[11px]" dir="ltr">{inv.xml}</pre></Modal>
      <Modal open={cn} onClose={() => setCn(false)} title={L('Issue credit note', 'إصدار إشعار دائن')} footer={<><button type="button" className="btn-secondary" onClick={() => setCn(false)}>{t('cancel')}</button><button type="button" className="btn-primary" onClick={async () => { try { const r = await api.post(`/einvoices/${inv.id}/credit-note`, { note }); navigate(`/app/einvoices/${r.id}/edit`); } catch (x) { setErr(x); setCn(false); } }}>{L('Create draft', 'إنشاء مسودة')}</button></>}>
        <p className="mb-3 text-sm text-slate-600">{L('A draft credit note linked to this invoice will be created with the same lines — adjust quantities for a partial credit.', 'سيتم إنشاء مسودة إشعار دائن مرتبطة بنفس البنود — عدّل الكميات للخصم الجزئي.')}</p>
        <Field label={L('Reason', 'السبب')}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('Goods returned', 'إرجاع بضائع')} /></Field>
      </Modal>
    </div>
  );
}
