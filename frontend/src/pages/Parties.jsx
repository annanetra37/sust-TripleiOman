import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat, isoDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Badge, Card, Field, Loading, Modal, PageHeader, Tabs, Toggle, useAsync } from '../components/ui';

export default function Parties() {
  const { L, t } = useI18n();
  const f = useFormat();
  const { can } = useAuth();
  const [tab, setTab] = useState('CUSTOMER');
  const { data, reload } = useAsync(() => api.get(`/parties?kind=${tab}`), [tab]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null);
    try { if (edit.id) await api.patch(`/parties/${edit.id}`, edit); else await api.post('/parties', edit); setEdit(null); reload(); } catch (x) { setErr(x.message); }
  };
  const s = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  return (
    <div className="space-y-6">
      <PageHeader title={t('parties')} subtitle={L('Customer and supplier master data. Complete VAT numbers and addresses are required for e-invoicing; supplier country, PE status and residency certificates drive withholding tax.', 'البيانات الرئيسية للعملاء والموردين. أرقام التسجيل والعناوين مطلوبة للفوترة الإلكترونية؛ ودولة المورد وشهادة الإقامة تحدد ضريبة الاستقطاع.')}
        actions={can('data.write') && <button type="button" className="btn-primary" onClick={() => setEdit({ kind: tab, country: 'OM' })}><Plus className="h-4 w-4" />{t('add')}</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'CUSTOMER', label: L('Customers', 'العملاء') }, { id: 'SUPPLIER', label: L('Suppliers', 'الموردون') }]} />
      <Card padded={false}>
        {!data ? <Loading /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>{L('Name', 'الاسم')}</th><th>{L('VAT / CR', 'الرقم الضريبي / السجل')}</th><th>{L('Country', 'الدولة')}</th><th>{L('Address', 'العنوان')}</th>{tab === 'SUPPLIER' && <th>{L('Residency certificate', 'شهادة الإقامة')}</th>}<th /></tr></thead>
            <tbody>{data.map((p) => (
              <tr key={p.id}>
                <td><div className="font-medium">{p.nameEn}</div>{p.nameAr && <div className="text-xs text-slate-500" dir="rtl">{p.nameAr}</div>}</td>
                <td className="font-mono text-xs">{p.vatNumber || p.crNumber || <Badge tone="amber">{L('missing', 'ناقص')}</Badge>}</td>
                <td>{p.country}{p.hasOmanPE && <Badge tone="blue" className="ms-1">PE</Badge>}</td>
                <td className="text-xs">{p.address || <Badge tone="amber">{L('missing', 'ناقص')}</Badge>}</td>
                {tab === 'SUPPLIER' && <td className="text-xs">{p.residencyCertExpiry ? <Badge tone={new Date(p.residencyCertExpiry) < new Date() ? 'red' : 'green'}>{f.date(p.residencyCertExpiry)}</Badge> : '—'}</td>}
                <td className="whitespace-nowrap text-end">{can('data.write') && <><button type="button" className="btn-ghost btn-sm" onClick={() => setEdit({ ...p, residencyCertExpiry: isoDate(p.residencyCertExpiry) })}><Pencil className="h-4 w-4" /></button><button type="button" className="btn-ghost btn-sm text-red-600" onClick={async () => { try { await api.del(`/parties/${p.id}`); reload(); } catch (x) { alert(x.message); } }}><Trash2 className="h-4 w-4" /></button></>}</td>
              </tr>
            ))}{!data.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">{t('none')}</td></tr>}</tbody>
          </table></div>
        )}
      </Card>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? t('edit') : t('add')} footer={<><button type="button" className="btn-secondary" onClick={() => setEdit(null)}>{t('cancel')}</button><button type="button" className="btn-primary" onClick={save}>{t('save')}</button></>}>
          {err && <Alert tone="error" className="mb-3">{err}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={L('Name (English)', 'الاسم (إنجليزي)')}><input className="input" value={edit.nameEn || ''} onChange={s('nameEn')} /></Field>
            <Field label={L('Name (Arabic)', 'الاسم (عربي)')}><input className="input" dir="rtl" value={edit.nameAr || ''} onChange={s('nameAr')} /></Field>
            <Field label={L('Type', 'النوع')}><select className="input" value={edit.kind} onChange={s('kind')}><option value="CUSTOMER">{L('Customer', 'عميل')}</option><option value="SUPPLIER">{L('Supplier', 'مورد')}</option><option value="BOTH">{L('Both', 'كلاهما')}</option></select></Field>
            <Field label={L('Country (ISO code)', 'الدولة (رمز)')}><input className="input" dir="ltr" maxLength={2} value={edit.country || ''} onChange={s('country')} /></Field>
            <Field label={L('VAT number', 'الرقم الضريبي')}><input className="input" dir="ltr" value={edit.vatNumber || ''} onChange={s('vatNumber')} /></Field>
            <Field label={L('CR number', 'السجل التجاري')}><input className="input" dir="ltr" value={edit.crNumber || ''} onChange={s('crNumber')} /></Field>
            <Field label={L('Address', 'العنوان')}><input className="input" value={edit.address || ''} onChange={s('address')} /></Field>
            <Field label={L('City', 'المدينة')}><input className="input" value={edit.city || ''} onChange={s('city')} /></Field>
            <Field label={L('Email', 'البريد')}><input className="input" dir="ltr" value={edit.email || ''} onChange={s('email')} /></Field>
            <Field label={L('Peppol participant ID', 'معرّف Peppol')}><input className="input" dir="ltr" value={edit.peppolId || ''} onChange={s('peppolId')} /></Field>
            {edit.kind !== 'CUSTOMER' && <>
              <Field label={L('Tax residency certificate valid until', 'شهادة الإقامة الضريبية سارية حتى')}><input type="date" className="input" value={edit.residencyCertExpiry || ''} onChange={s('residencyCertExpiry')} /></Field>
              <div className="pt-6"><Toggle checked={edit.hasOmanPE} onChange={(v) => setEdit({ ...edit, hasOmanPE: v })} label={L('Has a permanent establishment in Oman', 'لديه منشأة دائمة في عُمان')} /></div>
            </>}
          </div>
        </Modal>
      )}
    </div>
  );
}
