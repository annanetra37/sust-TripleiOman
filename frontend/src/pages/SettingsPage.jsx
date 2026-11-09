import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, AlertTriangle, Search, Loader2, Upload } from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';
import COUNTRIES from '../utils/countries';
import SectorPicker from '../components/SectorPicker';
import { useT } from '../i18n';

const STANDARDS = ['ESRS', 'TCFD', 'GRI', 'SASB', 'CDP', 'IFRS'];

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useT();
  const isAdmin = user?.role === 'ADMIN';
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'org-units';
  const [tab, setTab] = useState(initialTab);
  const [orgUnits, setOrgUnits] = useState([]);
  const [standard, setStandard] = useState('ESRS');
  const [credits, setCredits] = useState({ transactions: [], balance: 0 });
  const [newUnit, setNewUnit] = useState({ name: '', country: '' });
  const [resetForm, setResetForm] = useState({ year: new Date().getFullYear(), quarter: '', orgUnitId: '', type: 's1' });
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [resetPreview, setResetPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    api.getOrgUnits().then(setOrgUnits);
    api.getEsgStandard().then((d) => setStandard(d.standard));
    api.getCredits(dateRange).then(setCredits);
  }, []);

  const addUnit = async (e) => {
    e.preventDefault();
    await api.createOrgUnit(newUnit);
    setNewUnit({ name: '', country: '' });
    api.getOrgUnits().then(setOrgUnits);
  };

  const deleteUnit = async (id) => {
    if (!confirm('Delete this org unit? Related data will also be removed.')) return;
    await api.deleteOrgUnit(id);
    api.getOrgUnits().then(setOrgUnits);
  };

  const handleReset = async () => {
    try {
      if (resetForm.type === 's1') {
        await api.resetS1({ year: parseInt(resetForm.year), quarter: resetForm.quarter || undefined, orgUnitId: resetForm.orgUnitId || undefined });
      } else {
        await api.resetE1({ year: parseInt(resetForm.year) });
      }
      setShowResetConfirm(false);
      alert('Data reset successfully');
    } catch (err) {
      alert(err.error || 'Reset failed');
    }
  };

  const loadCredits = () => api.getCredits(dateRange).then(setCredits);

  const [logoUrl, setLogoUrl] = useState(null);
  const [logoLoading, setLogoLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const base = api.getApiBase();
    fetch(`${base}/settings/logo?token=${token}`)
      .then(r => { if (r.ok) setLogoUrl(`${base}/settings/logo?token=${token}&t=${Date.now()}`); })
      .catch(() => {});
  }, []);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoLoading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      await api.uploadLogo(fd);
      const token = localStorage.getItem('accessToken');
      setLogoUrl(`${api.getApiBase()}/settings/logo?token=${token}&t=${Date.now()}`);
    } catch (err) {
      alert(err.error || 'Logo upload failed');
    } finally {
      setLogoLoading(false);
    }
  };

  const handleLogoDelete = async () => {
    try {
      await api.deleteLogo();
      setLogoUrl(null);
    } catch (err) {
      alert(err.error || 'Failed to remove logo');
    }
  };

  const tabs = [
    { key: 'org-units', label: t('settings.orgUnits'), tip: t('settings.orgUnitsDesc') },
    { key: 'branding', label: t('settings.branding'), tip: t('settings.brandingDesc') },
    { key: 'standards', label: t('settings.standards'), tip: t('settings.standardsDesc') },
    { key: 'sector', label: t('settings.sectorPack'), tip: t('settings.sectorPackDesc') },
    { key: 'reset', label: t('settings.dataReset'), tip: t('settings.dataResetDesc') },
    { key: 'credits', label: t('settings.creditTransactions'), tip: t('settings.creditTransactionsDesc') },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('settings.title')}</h1>

      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${tab === t.key ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.tip && <InfoTip>{t.tip}</InfoTip>}
          </button>
        ))}
      </div>

      {tab === 'org-units' && (
        <div className="card space-y-4">
          {isAdmin && (
            <form onSubmit={addUnit} className="flex gap-3">
              <input className="input flex-1" placeholder={t('settings.unitName')} required value={newUnit.name} onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })} />
              <select className="input w-48" required value={newUnit.country} onChange={(e) => setNewUnit({ ...newUnit, country: e.target.value })}>
                <option value="">{t('common.country')}...</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="submit" className="btn-primary flex items-center gap-1"><Plus className="w-4 h-4" /> {t('common.add')}</button>
            </form>
          )}
          <div className="divide-y">
            {orgUnits.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">{u.name}</p>
                  <p className="text-xs text-gray-400">{u.country}</p>
                </div>
                {isAdmin && (
                  <button className="text-gray-400 hover:text-red-600" onClick={() => deleteUnit(u.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'branding' && (
        <div className="card space-y-6">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{t('settings.companyLogo')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('settings.logoUsage')}</p>
          </div>

          <div className="flex items-start gap-6">
            {/* Preview */}
            <div className="w-40 h-40 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-800 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" className="max-w-full max-h-full object-contain p-2" />
              ) : (
                <div className="text-center text-gray-400">
                  <Upload className="w-8 h-8 mx-auto mb-1" />
                  <p className="text-xs">{t('settings.noLogo')}</p>
                </div>
              )}
            </div>

            {/* Upload controls */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="btn-primary inline-flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {logoLoading ? t('common.loading') : logoUrl ? t('settings.changeLogo') : t('settings.uploadLogo')}
                  <input type="file" className="hidden" accept=".png,.jpg,.jpeg,.webp" onChange={handleLogoUpload} disabled={logoLoading} />
                </label>
              </div>
              {logoUrl && (
                <button onClick={handleLogoDelete} className="text-sm text-red-500 hover:text-red-700 hover:underline">
                  Remove logo
                </button>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('settings.logoFormat')}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('settings.logoDisplayNote')}</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'standards' && (
        <div className="card space-y-4">
          <p className="text-sm text-gray-500">{t('settings.selectStandard')}</p>
          <div className="grid grid-cols-2 gap-3">
            {STANDARDS.map((s) => (
              <button
                key={s}
                className={`p-3 rounded-lg border text-left transition-colors ${standard === s ? 'border-brand-500 bg-brand-50 dark:bg-brand-950' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                onClick={async () => { if (isAdmin) { await api.setEsgStandard(s); setStandard(s); } }}
              >
                <p className="font-medium">{s}</p>
                <p className="text-xs text-gray-400">
                  {s === 'ESRS' ? 'European Sustainability Reporting Standards' :
                   s === 'TCFD' ? 'Task Force on Climate-related Financial Disclosures' :
                   s === 'GRI' ? 'Global Reporting Initiative' :
                   s === 'SASB' ? 'Sustainability Accounting Standards Board' :
                   s === 'CDP' ? 'Carbon Disclosure Project' : 'IFRS Sustainability Disclosure Standards (S1 & S2)'}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'sector' && (
        <>
          <div className="card space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('settings.sectorPackTitle')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('settings.sectorPackBody')}
                {t('settings.sectorPackPreserved')}
              </p>
            </div>
            <SectorPicker />
          </div>
          <BenchmarkOptInCard isAdmin={isAdmin} />
        </>
      )}

      {tab === 'reset' && isAdmin && (
        <div className="card space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-400">Data reset is permanent and cannot be undone. Preview the data below before deleting.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Type</label>
              <select className="input" value={resetForm.type} onChange={(e) => { setResetForm({ ...resetForm, type: e.target.value }); setResetPreview(null); }}>
                <option value="s1">S1 — Workforce & Employees</option>
                <option value="e1">E1 — Climate & Emissions</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Year *</label>
              <input type="number" className="input" required value={resetForm.year} onChange={(e) => { setResetForm({ ...resetForm, year: e.target.value }); setResetPreview(null); }} />
            </div>
          </div>

          {resetForm.type === 's1' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quarter (optional)</label>
                <select className="input" value={resetForm.quarter} onChange={(e) => { setResetForm({ ...resetForm, quarter: e.target.value }); setResetPreview(null); }}>
                  <option value="">All</option>
                  <option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Org Unit (optional)</label>
                <select className="input" value={resetForm.orgUnitId} onChange={(e) => { setResetForm({ ...resetForm, orgUnitId: e.target.value }); setResetPreview(null); }}>
                  <option value="">All</option>
                  {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Preview button */}
          <button
            className="btn-secondary w-full flex items-center justify-center gap-2"
            disabled={previewLoading || !resetForm.year}
            onClick={async () => {
              setPreviewLoading(true);
              try {
                const data = await api.previewReset(resetForm);
                setResetPreview(data);
              } catch (err) {
                alert(err.error || 'Preview failed');
              } finally {
                setPreviewLoading(false);
              }
            }}
          >
            {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Preview Data to Delete
          </button>

          {/* Preview results */}
          {resetPreview && (
            <div className="space-y-4">
              {resetPreview.total === 0 ? (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-gray-500 dark:text-gray-400">
                  No records found matching this criteria. Nothing to delete.
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                    <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">
                      {resetPreview.total} records will be permanently deleted
                    </h4>

                    {/* Breakdown by table */}
                    <div className="space-y-1.5">
                      {resetPreview.breakdown.map((b) => (
                        <div key={b.table} className="flex items-center justify-between text-sm">
                          <span className="text-red-700 dark:text-red-400">{b.table}</span>
                          <span className="font-mono font-semibold text-red-800 dark:text-red-300">{b.count} records</span>
                        </div>
                      ))}
                    </div>

                    {/* Total emissions for E1 */}
                    {resetPreview.totalEmissions > 0 && (
                      <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-700">
                        <p className="text-sm text-red-700 dark:text-red-400">
                          Total emissions to be removed: <strong>{resetPreview.totalEmissions.toFixed(4)} tCO2e</strong>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Sample records */}
                  {resetPreview.samples.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sample records (first 5):</h4>
                      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              {Object.keys(resetPreview.samples[0]).map((key) => (
                                <th key={key} className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {resetPreview.samples.map((sample, i) => (
                              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                {Object.values(sample).map((val, j) => (
                                  <td key={j} className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                    {typeof val === 'number' ? val.toLocaleString() : String(val ?? '—')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Delete button */}
                  <button className="btn-danger w-full" onClick={() => setShowResetConfirm(true)}>
                    Delete {resetPreview.total} Records Permanently
                  </button>
                </>
              )}
            </div>
          )}

          {/* Final confirmation modal */}
          {showResetConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md space-y-4">
                <h3 className="font-bold text-red-600 text-lg">Final Confirmation</h3>
                <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    You are about to permanently delete <strong>{resetPreview?.total || 0} records</strong> of {resetForm.type === 's1' ? 'Workforce' : 'Emissions'} data for year <strong>{resetForm.year}</strong>.
                  </p>
                  {resetPreview?.totalEmissions > 0 && (
                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                      This includes <strong>{resetPreview.totalEmissions.toFixed(4)} tCO2e</strong> of emission records.
                    </p>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">This action <strong>cannot be undone</strong>. Type the year below to confirm:</p>
                <input
                  type="text"
                  className="input text-center font-mono text-lg"
                  placeholder={String(resetForm.year)}
                  id="confirm-year"
                />
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={() => setShowResetConfirm(false)}>Cancel</button>
                  <button
                    className="btn-danger flex-1"
                    onClick={() => {
                      const input = document.getElementById('confirm-year');
                      if (input.value !== String(resetForm.year)) {
                        alert('Year does not match. Please type the correct year to confirm.');
                        return;
                      }
                      handleReset();
                      setShowResetConfirm(false);
                      setResetPreview(null);
                    }}
                  >
                    I understand, delete permanently
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'credits' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">Balance: <span className="text-brand-600">{credits.balance} credits</span></p>
            <div className="flex gap-2">
              <input type="date" className="input w-auto" value={dateRange.from} onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })} />
              <input type="date" className="input w-auto" value={dateRange.to} onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })} />
              <button className="btn-secondary" onClick={loadCredits}>Filter</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b dark:border-gray-700">
              <tr className="text-gray-700 dark:text-gray-300">
                <th className="text-left py-2 font-medium">Type</th>
                <th className="text-left py-2 font-medium">Credits</th>
                <th className="text-left py-2 font-medium">User</th>
                <th className="text-left py-2 font-medium">Description</th>
                <th className="text-left py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {credits.transactions?.map((t) => (
                <tr key={t.id}>
                  <td className="py-2"><span className="badge bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{t.transactionType}</span></td>
                  <td className="py-2 font-medium text-red-600 dark:text-red-400">-{t.creditsUsed}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">{t.user?.firstName} {t.user?.lastName}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">{t.description}</td>
                  <td className="py-2 text-gray-500 dark:text-gray-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Benchmark opt-in card (PCF-08) ────────────────────────────────────────
// Lives inside the Sector Pack tab because benchmark cohorts are scoped
// per-sector — it's the natural spot for users to reason about both.
function BenchmarkOptInCard({ isAdmin }) {
  const [optedIn, setOptedIn] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getBenchmarkOptIn().then((r) => setOptedIn(r.optedIn)).catch(() => setOptedIn(false));
  }, []);

  const toggle = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setErr('');
    try {
      const r = await api.setBenchmarkOptIn(!optedIn);
      setOptedIn(r.optedIn);
    } catch (e) {
      setErr(e.error || 'Could not update benchmark opt-in.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Anonymous benchmark cohort</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Share anonymised KPI values to unlock peer benchmarks. Your data is never linked to your
          company name and only aggregated statistics (p25 / p50 / p75) are ever shown to anyone —
          never raw values. Cohorts with fewer than 10 companies are hidden entirely (k-anonymity).
          You can withdraw at any time; withdrawal is retroactive.
        </p>
      </div>

      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <button
          type="button"
          onClick={toggle}
          disabled={!isAdmin || saving || optedIn === null}
          className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
            optedIn ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'
          } ${!isAdmin && 'opacity-50 cursor-not-allowed'}`}
        >
          <span
            className={`inline-block w-5 h-5 bg-white rounded-full transform transition-transform mt-0.5 ${
              optedIn ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {optedIn === null ? 'Loading...' : optedIn ? 'Opted in — contributing to cohorts' : 'Not opted in'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {optedIn
              ? 'Your aggregated data counts toward sector benchmarks and you can see percentile rankings on dashboards.'
              : 'You can contribute and see peer benchmarks once you opt in.'}
          </p>
        </div>
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}
      {!isAdmin && <p className="text-xs text-gray-400">Only admins can change the opt-in setting.</p>}
    </div>
  );
}
