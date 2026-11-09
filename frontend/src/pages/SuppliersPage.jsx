import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Users, Plus, Send, Loader2, AlertCircle, CheckCircle, Clock, Trash2,
  ChevronRight, Mail, Globe, Building2,
} from 'lucide-react';
import { HelpBanner } from '../components/HelpSystem';
import { useT } from '../i18n';

const STATUS_COLORS = {
  sent: 'bg-gray-100 text-gray-600',
  opened: 'bg-blue-100 text-blue-700',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function SuppliersPage() {
  const { t } = useT();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add supplier form
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', contactEmail: '', country: '', category: '' });
  const [adding, setAdding] = useState(false);

  // Request modal
  const [requestTarget, setRequestTarget] = useState(null);
  const [reqYear, setReqYear] = useState(new Date().getFullYear());
  const [sending, setSending] = useState(false);

  // Detail panel
  const [detail, setDetail] = useState(null);
  const [approving, setApproving] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setSuppliers(await api.getSuppliers()); } catch (e) { setError(e.error || 'Failed to load.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      await api.addSupplier(addForm);
      setShowAdd(false);
      setAddForm({ name: '', contactEmail: '', country: '', category: '' });
      await load();
    } catch (e) { setError(e.error || 'Failed to add supplier.'); }
    finally { setAdding(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this supplier and all their data requests?')) return;
    try { await api.deleteSupplier(id); await load(); setDetail(null); }
    catch (e) { setError(e.error || 'Failed to delete.'); }
  };

  const handleSendRequest = async () => {
    setSending(true);
    try {
      await api.sendSupplierRequest(requestTarget.id, { reportingYear: reqYear });
      setRequestTarget(null);
      await load();
      if (detail?.id === requestTarget.id) {
        setDetail(await api.getSupplier(requestTarget.id));
      }
    } catch (e) { setError(e.error || 'Failed to send request.'); }
    finally { setSending(false); }
  };

  const handleApprove = async (supplierId, reqId) => {
    setApproving(reqId);
    try {
      await api.approveSupplierRequest(supplierId, reqId);
      setDetail(await api.getSupplier(supplierId));
      await load();
    } catch (e) { setError(e.error || 'Failed to approve.'); }
    finally { setApproving(null); }
  };

  const openDetail = async (s) => {
    try { setDetail(await api.getSupplier(s.id)); } catch {}
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('suppliers.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('suppliers.subtitle')}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('suppliers.addSupplier')}
        </button>
      </div>

      <HelpBanner id="suppliers-guide" title={t('suppliers.howItWorks')} variant="info">
        {t('suppliers.howItWorksBody')}
      </HelpBanner>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
          <button onClick={() => setError('')} className="ml-auto text-red-500 text-xs hover:underline">{t('suppliers.dismiss')}</button>
        </div>
      )}

      {/* Add supplier modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{t('suppliers.addSupplier')}</h2>
            <input className="input" required placeholder={t('suppliers.companyName')} value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} />
            <input className="input" required type="email" placeholder={t('suppliers.contactEmail')} value={addForm.contactEmail} onChange={e => setAddForm({...addForm, contactEmail: e.target.value})} />
            <input className="input" required placeholder={t('common.country')} value={addForm.country} onChange={e => setAddForm({...addForm, country: e.target.value})} />
            <select className="input" value={addForm.category} onChange={e => setAddForm({...addForm, category: e.target.value})}>
              <option value="">{t('suppliers.category')}</option>
              <option value="tier1_direct">{t('suppliers.tier1Direct')}</option>
              <option value="tier1_indirect">{t('suppliers.tier1Indirect')}</option>
              <option value="logistics">{t('suppliers.logistics')}</option>
              <option value="services">{t('suppliers.services')}</option>
            </select>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">{t('common.cancel')}</button>
              <button type="submit" disabled={adding} className="btn-primary flex items-center gap-2">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t('common.add')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Send request modal */}
      {requestTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRequestTarget(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{t('suppliers.sendDataRequest')}</h2>
            <p className="text-sm text-gray-500">{t('suppliers.sendingTo')} <strong>{requestTarget.name}</strong> ({requestTarget.contactEmail})</p>
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('suppliers.reportingYear')}</span>
              <input type="number" className="input mt-1" value={reqYear} onChange={e => setReqYear(parseInt(e.target.value))} />
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setRequestTarget(null)} className="btn-secondary">{t('common.cancel')}</button>
              <button onClick={handleSendRequest} disabled={sending} className="btn-primary flex items-center gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t('suppliers.sendRequest')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content: list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Supplier list */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
          ) : suppliers.length === 0 ? (
            <div className="card text-center py-10">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">{t('suppliers.noSuppliers')}</p>
            </div>
          ) : suppliers.map(s => (
            <div
              key={s.id}
              onClick={() => openDetail(s)}
              className={`card flex items-center gap-3 cursor-pointer hover:border-brand-400 transition-colors ${detail?.id === s.id ? 'border-brand-500 ring-1 ring-brand-300' : ''}`}
            >
              <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-950 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{s.name}</p>
                <p className="text-[11px] text-gray-400 flex items-center gap-2">
                  <span>{s.country}</span>
                  {s.category && <span>{s.category.replace(/_/g, ' ')}</span>}
                </p>
              </div>
              <div className="text-right shrink-0">
                {s.responseRate !== null ? (
                  <p className={`text-sm font-bold ${s.responseRate >= 80 ? 'text-green-600' : s.responseRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                    {s.responseRate}%
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">{t('suppliers.noRequests')}</p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {detail && (
          <div className="card space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{detail.name}</h3>
                <p className="text-sm text-gray-500 flex items-center gap-2 mt-0.5">
                  <Mail className="w-3.5 h-3.5" /> {detail.contactEmail}
                  <Globe className="w-3.5 h-3.5 ml-2" /> {detail.country}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setRequestTarget(detail)} className="btn-primary text-sm flex items-center gap-1">
                  <Send className="w-3.5 h-3.5" /> {t('suppliers.sendRequest')}
                </button>
                {isAdmin && (
                  <button onClick={() => handleDelete(detail.id)} className="text-gray-400 hover:text-red-500" title={t('common.delete')}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Request history */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('suppliers.dataRequests')}</p>
              {(detail.requests || []).length === 0 ? (
                <p className="text-sm text-gray-400">{t('suppliers.noRequests')}</p>
              ) : detail.requests.map(r => (
                <div key={r.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Year {r.reportingYear}</span>
                    <span className={`badge text-[10px] ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                    <span className="text-xs text-gray-400 flex-1">{new Date(r.sentAt).toLocaleDateString()}</span>
                    {r.status === 'submitted' && isAdmin && (
                      <button
                        onClick={() => handleApprove(detail.id, r.id)}
                        disabled={approving === r.id}
                        className="btn-primary text-xs flex items-center gap-1"
                      >
                        {approving === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        {t('suppliers.approveIngest')}
                      </button>
                    )}
                  </div>
                  {r.submission && (
                    <pre className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32">
                      {JSON.stringify(r.submission, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
