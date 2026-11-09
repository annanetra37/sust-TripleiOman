import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { RefreshCw, Send, CheckCircle2, XCircle, HelpCircle, ExternalLink, Upload, Lock, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Badge, Card, CopyButton, ErrorText, Field, Loading, Modal, PageHeader, StatusBadge, Tabs, Toggle, useAsync } from '../components/ui';

const STEPS = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SUBMITTED', 'PAID'];

function Workflow({ status }) {
  const { t } = useI18n();
  const idx = status === 'REJECTED' ? 0 : STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 font-medium ${i < idx ? 'bg-emerald-100 text-emerald-800' : i === idx ? 'bg-brand-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}. {t(s)}</span>
          {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
        </li>
      ))}
      {status === 'REJECTED' && <StatusBadge status="REJECTED" />}
    </ol>
  );
}

function Drill({ ret, boxId, onClose }) {
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { data } = useAsync(() => api.get(`/returns/${ret.id}/box/${boxId}`), [boxId]);
  const ex = useAsync(() => api.get(`/assistant/explain/${ret.id}/${boxId}?lang=${lang}`), [boxId, lang]);
  return (
    <Modal open wide onClose={onClose} title={`${L('Box', 'المربع')} ${boxId}`}>
      {ex.data && <Alert tone="info" title={L('Explain this number', 'اشرح هذا الرقم')}>{ex.data.text}</Alert>}
      {!data ? <Loading /> : (
        <div className="mt-4 overflow-x-auto">
          <table className="table"><thead><tr><th>{t('date')}</th><th>{L('Invoice', 'الفاتورة')}</th><th>{L('Party', 'الطرف')}</th><th className="text-end">{t('net')}</th><th className="text-end">{t('vat')}</th><th>{L('Category', 'الفئة')}</th></tr></thead>
            <tbody>{data.transactions.map((tx) => <tr key={tx.id}><td>{f.date(tx.date)}</td><td>{tx.invoiceNumber}</td><td>{tx.counterpartyName}</td><td className="text-end num">{f.omr(tx.netBaisa)}</td><td className="text-end num">{f.omr(tx.vatBaisa)}</td><td>{t(tx.vatCategory)}</td></tr>)}
              {!data.transactions.length && <tr><td colSpan={6} className="p-4 text-center text-slate-500">{L('This box is computed from other boxes.', 'هذا المربع محسوب من مربعات أخرى.')}</td></tr>}</tbody></table>
          {data.explanation.blocked?.length > 0 && <Alert tone="warn" className="mt-3">{L(`${data.explanation.blocked.length} purchase(s) excluded from input VAT (blocked item, no tax invoice or supplier not registered).`, `تم استبعاد ${data.explanation.blocked.length} مشتريات من ضريبة المدخلات.`)}</Alert>}
        </div>
      )}
    </Modal>
  );
}

function VatBoxes({ ret, onDrill }) {
  const { L, lang } = useI18n();
  const f = useFormat();
  let section = null;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>{L('Box', 'المربع')}</th><th>{L('Description', 'الوصف')}</th><th className="text-end">{L('Amount', 'المبلغ')}</th><th className="text-end">{L('VAT', 'الضريبة')}</th><th className="text-end">{L('vs prev.', 'مقابل السابق')}</th><th /></tr></thead>
        <tbody>
          {ret.form.map((b) => {
            const v = ret.boxes[b.id] || {};
            const ex = ret.explanation[b.id] || {};
            const head = b.section !== section; section = b.section;
            const total = ['4a', '5d', '6a'].includes(b.id);
            return [
              head && <tr key={`${b.id}-h`}><td colSpan={6} className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">{b.section}</td></tr>,
              <tr key={b.id} className={total ? 'bg-brand-50/60 font-semibold' : ''}>
                <td className="font-mono">{b.id}</td>
                <td>{lang === 'ar' ? b.labelAr : b.labelEn}</td>
                <td className="whitespace-nowrap text-end num">{b.kind.includes('value') ? f.omr(v.value) : ''}</td>
                <td className="whitespace-nowrap text-end num">{b.kind.includes('tax') ? f.omr(v.tax) : ''}</td>
                <td className="text-end text-xs">{ex.variancePct !== undefined && ex.variancePct !== null && <Badge tone={Math.abs(ex.variancePct) >= 50 ? 'amber' : 'gray'}>{ex.variancePct > 0 ? '+' : ''}{f.num(ex.variancePct, 0, 0)}%</Badge>}</td>
                <td className="text-end"><button type="button" className="btn-ghost btn-sm" onClick={() => onDrill(b.id)} title={L('Where does this come from?', 'من أين جاء هذا الرقم؟')}><HelpCircle className="h-4 w-4" />{ex.count ? <span className="text-xs">{ex.count}</span> : null}</button></td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function GenericBoxes({ ret }) {
  const { L } = useI18n();
  const f = useFormat();
  const steps = ret.explanation?.steps;
  const lines = ret.explanation?.lines;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(ret.boxes).map(([k, v]) => <div key={k} className="rounded-lg border border-slate-200 p-3"><div className="text-xs uppercase text-slate-500">{k}</div><div className="text-lg font-semibold num">{v.tax !== undefined ? f.omr(v.tax) : v.value}</div></div>)}
      </div>
      {steps && <table className="table"><tbody>{steps.map((s, i) => <tr key={i}><td>{s.step}</td><td className="text-end num">{s.amount !== undefined ? f.omr(s.amount) : ''}</td></tr>)}</tbody></table>}
      {lines && (
        <table className="table"><thead><tr>{Object.keys(lines[0] || {}).filter((k) => !['id'].includes(k)).map((k) => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>{lines.map((l, i) => <tr key={i}>{Object.entries(l).filter(([k]) => k !== 'id').map(([k, v]) => <td key={k} className="text-xs">{/Baisa$|^gross$|^wht$/.test(k) ? f.omr(v) : String(v)}</td>)}</tr>)}</tbody></table>
      )}
      {!steps && !lines && <p className="text-sm text-slate-500">{L('No breakdown.', 'لا تفاصيل.')}</p>}
    </div>
  );
}

function Companion({ ret, onChange }) {
  const { L, lang } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const { data } = useAsync(() => api.get(`/returns/${ret.id}/companion`), [ret.status]);
  const [ref, setRef] = useState('');
  const [payRef, setPayRef] = useState('');
  const [err, setErr] = useState(null);
  const docs = useAsync(() => api.get(`/documents?relatedType=return&relatedId=${ret.id}`), [ret.id]);
  const uploadDoc = async (file, category) => {
    const fd = new FormData(); fd.append('file', file); fd.append('category', category); fd.append('relatedType', 'return'); fd.append('relatedId', ret.id); fd.append('title', `${ret.taxType} ${category.toLowerCase()}`);
    await api.upload('/documents', fd); docs.reload();
  };
  if (!data) return <Loading />;
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-4">
        <Alert tone="warn" title={L('Filing companion', 'دليل التقديم')}>{L('You submit in your own TaxOman session. We never ask for or store your TaxOman password or digital-ID PIN.', 'تقدّم الإقرار في جلستك الخاصة على بوابة جهاز الضرائب. لا نطلب ولا نخزن كلمة مرورك أو رمز الهوية الرقمية.')}</Alert>
        <ol className="space-y-2 text-sm">{data.steps.map((s, i) => <li key={i} className="flex gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{i + 1}</span><span>{lang === 'ar' ? s.ar : s.en}</span></li>)}</ol>
        <a href={data.portalUrl} target="_blank" rel="noreferrer" className="btn-secondary w-full"><ExternalLink className="h-4 w-4" />{L('Open TaxOman portal', 'فتح بوابة جهاز الضرائب')}</a>
        <p className="text-xs text-slate-400">{data.portalVersionNote}</p>
      </div>
      <div className="lg:col-span-3 space-y-4">
        {!data.canFile && <Alert tone="info">{L('The return must be approved before you file it.', 'يجب اعتماد الإقرار قبل تقديمه.')}</Alert>}
        <div className="rounded-lg border border-slate-200">
          {data.fields.map((fl) => (
            <div key={`${fl.box}-${fl.part}`} className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-0">
              <span className="min-w-0">{lang === 'ar' ? fl.labelAr : fl.labelEn}</span>
              <span className="flex shrink-0 items-center gap-2"><span className="font-mono num" dir="ltr">{fl.value}</span>{data.canFile && <CopyButton value={fl.value} label={fl.box} />}</span>
            </div>
          ))}
        </div>
        {err && <Alert tone="error">{err}</Alert>}
        {ret.status === 'APPROVED' && can('return.file') && (
          <div className="card space-y-3">
            <Field label={L('Submission reference from the TaxOman portal', 'الرقم المرجعي من بوابة جهاز الضرائب')}><input className="input font-mono" dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
            <label className="btn-secondary cursor-pointer"><Upload className="h-4 w-4" />{L('Upload acknowledgement PDF', 'رفع إشعار الاستلام')}<input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => e.target.files[0] && uploadDoc(e.target.files[0], 'ACKNOWLEDGEMENT')} /></label>
            <button type="button" className="btn-primary" onClick={async () => { setErr(null); try { await api.post(`/returns/${ret.id}/record-submission`, { submissionRef: ref }); onChange(); } catch (x) { setErr(x.message); } }}>{L('Mark as submitted', 'تحديد كمقدَّم')}</button>
          </div>
        )}
        {ret.status === 'SUBMITTED' && can('return.file') && (
          <div className="card space-y-3">
            <div className="text-sm">{L('Amount to pay', 'المبلغ المستحق')}: <b className="num">{f.omr(ret.amountDueBaisa)}</b> {data.dueDate && <>· {L('due', 'مستحق')} {f.date(data.dueDate)}</>}</div>
            <Field label={L('Payment / bank reference', 'مرجع الدفع')}><input className="input font-mono" dir="ltr" value={payRef} onChange={(e) => setPayRef(e.target.value)} /></Field>
            <label className="btn-secondary cursor-pointer"><Upload className="h-4 w-4" />{L('Upload proof of payment', 'رفع إثبات الدفع')}<input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => e.target.files[0] && uploadDoc(e.target.files[0], 'PAYMENT_PROOF')} /></label>
            <button type="button" className="btn-primary" onClick={async () => { await api.post(`/returns/${ret.id}/record-payment`, { paymentRef: payRef }); onChange(); }}>{Number(ret.amountDueBaisa) <= 0 ? L('Record refund claim / nil payment', 'تسجيل طلب الاسترداد') : L('Record payment', 'تسجيل الدفع')}</button>
          </div>
        )}
        {(docs.data || []).length > 0 && <div className="text-sm"><div className="mb-1 font-medium">{L('Attached', 'المرفقات')}</div>{docs.data.map((d) => <button type="button" key={d.id} className="flex items-center gap-1 text-brand-700" onClick={() => api.download(`/documents/${d.id}/download`, d.filename)}><FileText className="h-4 w-4" />{d.title}</button>)}</div>}
      </div>
    </div>
  );
}

export default function ReturnDetail() {
  const { id } = useParams();
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { can, user } = useAuth();
  const { data: ret, error, loading, reload } = useAsync(() => api.get(`/returns/${id}`), [id]);
  const [tab, setTab] = useState('boxes');
  const [drill, setDrill] = useState(null);
  const [modal, setModal] = useState(null);
  const [comment, setComment] = useState('');
  const [confirmChk, setConfirmChk] = useState(false);
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState(null);
  if (loading && !ret) return <Loading />;
  if (error) return <ErrorText error={error} />;

  const act = async (fn) => { setErr(null); try { await fn(); setModal(null); setComment(''); reload(); } catch (x) { setErr(x); } };
  const errors = (ret.exceptions || []).filter((e) => e.severity === 'error');
  const warnings = (ret.exceptions || []).filter((e) => e.severity !== 'error');
  const preparer = ret.people.find((p) => p.id === ret.preparedById);
  const reviewer = ret.people.find((p) => p.id === ret.reviewedById);

  return (
    <div className="space-y-6">
      <PageHeader title={`${t(ret.taxType)} · ${f.date(ret.periodStart)} – ${f.date(ret.periodEnd)}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={ret.status} />{ret.locked && <span className="inline-flex items-center gap-1 text-xs"><Lock className="h-3 w-3" />{L('Locked', 'مقفل')}</span>}<span>{L('Prepared by', 'أعده')} {preparer?.fullName}</span>{reviewer && <span>· {L('Reviewed by', 'راجعه')} {reviewer.fullName}</span>}</span>}
        actions={<>
          {ret.taxType === 'VAT' && !ret.locked && can('return.prepare') && <button type="button" className="btn-secondary" onClick={() => act(() => api.post(`/returns/${ret.id}/recompute`))}><RefreshCw className="h-4 w-4" />{L('Recalculate', 'إعادة الحساب')}</button>}
          {['DRAFT', 'REJECTED'].includes(ret.status) && can('return.prepare') && <button type="button" className="btn-primary" onClick={() => setModal('submit')}><Send className="h-4 w-4" />{L('Submit for review', 'إرسال للمراجعة')}</button>}
          {ret.status === 'IN_REVIEW' && can('return.approve') && <>
            <button type="button" className="btn-secondary" onClick={() => setModal('reject')}><XCircle className="h-4 w-4" />{L('Send back', 'إعادة')}</button>
            <button type="button" className="btn-primary" disabled={ret.preparedById === user.id} title={ret.preparedById === user.id ? L('You prepared this return — someone else must approve it.', 'أنت من أعد الإقرار — يجب أن يعتمده شخص آخر.') : ''} onClick={() => setModal('approve')}><CheckCircle2 className="h-4 w-4" />{L('Approve', 'اعتماد')}</button>
          </>}
        </>} />
      <Workflow status={ret.status} />
      {err && <ErrorText error={err} />}
      {ret.reviewComment && <Alert tone={ret.status === 'REJECTED' ? 'error' : 'info'} title={L('Reviewer comment', 'تعليق المراجع')}>{ret.reviewComment}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><div className="text-xs uppercase text-slate-500">{Number(ret.amountDueBaisa) >= 0 ? L('Payable to TaxOman', 'مستحق لجهاز الضرائب') : L('Refundable / carry forward', 'قابل للاسترداد / الترحيل')}</div><div className="mt-1 text-2xl font-semibold num">{f.omr(Math.abs(Number(ret.amountDueBaisa)))}</div></div>
        <div className="card"><div className="text-xs uppercase text-slate-500">{L('Data errors', 'أخطاء البيانات')}</div><div className={`mt-1 text-2xl font-semibold ${errors.length ? 'text-red-600' : 'text-emerald-600'}`}>{errors.length}</div></div>
        <div className="card"><div className="text-xs uppercase text-slate-500">{L('Rule versions', 'إصدارات القواعد')}</div><div className="mt-1 truncate text-xs text-slate-600">{Object.entries(ret.ruleVersions || {}).filter(([k]) => k.startsWith(ret.taxType.toLowerCase()) || k.startsWith('vat')).slice(0, 4).map(([k, v]) => `${k} v${v}`).join(', ')}</div>{ret.signatureHash && <div className="mt-1 truncate font-mono text-[10px] text-slate-400" title={ret.signatureHash}>sig {ret.signatureHash.slice(0, 16)}…</div>}</div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'boxes', label: L('Return', 'الإقرار') }, { id: 'exceptions', label: L('Checklist & exceptions', 'قائمة التحقق والاستثناءات'), count: (ret.exceptions || []).length }, { id: 'file', label: L('File & pay', 'التقديم والدفع') }]} />
      {tab === 'boxes' && <Card>{ret.taxType === 'VAT' && ret.form ? <VatBoxes ret={ret} onDrill={setDrill} /> : <GenericBoxes ret={ret} />}</Card>}
      {tab === 'exceptions' && (
        <Card>
          {(ret.exceptions || []).length === 0 ? <Alert tone="success">{L('No exceptions. Data passed all checks.', 'لا توجد استثناءات. اجتازت البيانات جميع الفحوصات.')}</Alert> : (
            <ul className="space-y-2">
              {[...errors, ...warnings].map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-sm"><Badge tone={e.severity === 'error' ? 'red' : 'amber'}>{e.code}</Badge><span>{lang === 'ar' ? e.messageAr || e.messageEn : e.messageEn}{e.invoiceNumber && <span className="text-slate-500"> · {e.invoiceNumber}</span>}</span></li>
              ))}
            </ul>
          )}
          {errors.length > 0 && <Link to="/app/transactions?flagged=1" className="btn-secondary mt-4">{L('Fix in transactions', 'التصحيح في المعاملات')}</Link>}
          <div className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-600">
            <div className="mb-2 font-medium">{L('Reviewer checklist', 'قائمة المراجع')}</div>
            <ul className="list-disc space-y-1 ps-5">
              <li>{L('All sales and purchases for the period are imported (compare with your ledger and Fawtara e-invoices).', 'تم استيراد جميع المبيعات والمشتريات للفترة (قارن مع الدفاتر والفواتير الإلكترونية).')}</li>
              <li>{L('Zero-rated exports have export evidence; exempt supplies are correct.', 'الصادرات الخاضعة لنسبة الصفر لديها إثبات تصدير.')}</li>
              <li>{L('Input VAT is supported by valid tax invoices; blocked items excluded.', 'ضريبة المدخلات مدعومة بفواتير صحيحة؛ البنود المحظورة مستبعدة.')}</li>
              <li>{L('Large changes vs the previous quarter are explained.', 'التغيرات الكبيرة عن الربع السابق مبررة.')}</li>
            </ul>
          </div>
        </Card>
      )}
      {tab === 'file' && <Companion ret={ret} onChange={reload} />}
      {drill && <Drill ret={ret} boxId={drill} onClose={() => setDrill(null)} />}

      <Modal open={modal === 'submit'} onClose={() => setModal(null)} title={L('Submit for review', 'إرسال للمراجعة')} footer={<><button type="button" className="btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button><button type="button" className="btn-primary" onClick={() => act(() => api.post(`/returns/${ret.id}/submit-review`, { acknowledgeExceptions: ack }))}>{L('Submit', 'إرسال')}</button></>}>
        <p className="text-sm">{L('An approver in your organisation will be notified. Someone other than you must approve.', 'سيتم إشعار المعتمِد في منشأتك. يجب أن يعتمد شخص غيرك.')}</p>
        {errors.length > 0 && <div className="mt-3"><Alert tone="warn">{L(`${errors.length} data error(s) remain.`, `تبقى ${errors.length} أخطاء.`)}</Alert><div className="mt-2"><Toggle checked={ack} onChange={setAck} label={L('I have reviewed these and want to continue anyway', 'راجعتها وأريد المتابعة')} /></div></div>}
      </Modal>
      <Modal open={modal === 'approve'} onClose={() => setModal(null)} title={L('Approve return', 'اعتماد الإقرار')} footer={<><button type="button" className="btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button><button type="button" className="btn-primary" disabled={!confirmChk} onClick={() => act(() => api.post(`/returns/${ret.id}/approve`, { confirm: true, comment }))}>{L('Approve and lock', 'اعتماد وقفل')}</button></>}>
        <div className="space-y-3 text-sm">
          <p>{L('Approving records your name, the time and a signature hash of the return. The period and its transactions are then locked.', 'يسجل الاعتماد اسمك والوقت وبصمة الإقرار، ثم تُقفل الفترة ومعاملاتها.')}</p>
          <Field label={L('Comment (optional)', 'تعليق (اختياري)')}><textarea className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
          <Toggle checked={confirmChk} onChange={setConfirmChk} label={L(`I reviewed this return and its exceptions; amount ${f.omr(ret.amountDueBaisa)}.`, `راجعت هذا الإقرار واستثناءاته؛ المبلغ ${f.omr(ret.amountDueBaisa)}.`)} />
        </div>
      </Modal>
      <Modal open={modal === 'reject'} onClose={() => setModal(null)} title={L('Send back to preparer', 'إعادة إلى المُعِد')} footer={<><button type="button" className="btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button><button type="button" className="btn-danger" disabled={!comment} onClick={() => act(() => api.post(`/returns/${ret.id}/reject`, { comment }))}>{L('Send back', 'إعادة')}</button></>}>
        <Field label={L('What needs to change?', 'ما الذي يجب تغييره؟')}><textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
