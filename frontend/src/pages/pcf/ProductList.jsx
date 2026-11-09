import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Package, Plus, Loader2, AlertCircle, CheckCircle, Clock, ChevronRight,
} from 'lucide-react';
import { HelpBanner } from '../../components/HelpSystem';
import { useT } from '../../i18n';

export default function ProductList() {
  const { t } = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ sku: '', name: '', sector: 'electronics', functionalUnit: '1 piece', massKg: '' });

  const load = async () => {
    setLoading(true);
    try {
      setProducts(await api.getProducts());
    } catch (err) {
      setError(err.error || 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const p = await api.createProduct(form);
      setShowCreate(false);
      setForm({ sku: '', name: '', sector: 'electronics', functionalUnit: '1 piece', massKg: '' });
      navigate(`/pcf/${p.id}`);
    } catch (err) {
      setError(err.error || 'Could not create product.');
    } finally {
      setCreating(false);
    }
  };

  const statusBadge = (calc) => {
    if (!calc) return <span className="badge bg-gray-100 text-gray-500 text-[10px]">No PCF yet</span>;
    const colors = { draft: 'bg-amber-100 text-amber-700', final: 'bg-green-100 text-green-700', verified: 'bg-brand-100 text-brand-700' };
    return <span className={`badge text-[10px] ${colors[calc.status] || 'bg-gray-100 text-gray-500'}`}>{calc.status}</span>;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('pcf.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('pcf.subtitle')}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('pcf.newProduct')}
        </button>
      </div>

      <HelpBanner id="pcf-products-guide" title={t('pcf.howItWorks')} variant="info">
        {t('pcf.howItWorksBody')}
      </HelpBanner>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('pcf.newProduct')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('pcf.sku')} *</span>
                <input className="input mt-1" required placeholder="e.g. SSD-2TB-NVMe" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('pcf.mass')}</span>
                <input type="number" step="0.001" className="input mt-1" placeholder="0.120" value={form.massKg} onChange={(e) => setForm({ ...form, massKg: e.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('pcf.productName')} *</span>
              <input className="input mt-1" required placeholder="e.g. Enterprise NVMe SSD 2TB" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('pcf.sector')}</span>
                <select className="input mt-1" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
                  <option value="electronics">{t('pcf.sectorElectronics')}</option>
                  <option value="automotive">{t('pcf.sectorAutomotive')}</option>
                  <option value="generic">{t('pcf.sectorGeneric')}</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('pcf.functionalUnit')}</span>
                <input className="input mt-1" placeholder="1 SSD module" value={form.functionalUnit} onChange={(e) => setForm({ ...form, functionalUnit: e.target.value })} />
              </label>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">{t('common.cancel')}</button>
              <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t('common.create')}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : products.length === 0 ? (
        <div className="card text-center py-12">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('pcf.noProducts')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('pcf.noProductsDesc')}</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t('pcf.newProduct')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <Link
              key={p.id}
              to={`/pcf/${p.id}`}
              className="card flex items-center gap-4 hover:border-brand-400 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-950 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{p.name}</p>
                  <span className="text-[10px] font-mono text-gray-400">{p.sku}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  <span>{p.sector}</span>
                  <span>{p.bomCount} {t('pcf.components')}</span>
                  {p.massKg && <span>{p.massKg} kg</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                {p.latestCalc ? (
                  <>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {p.latestCalc.totalKgCo2e.toFixed(2)} <span className="text-xs font-normal text-gray-400">kgCO2e</span>
                    </p>
                    <p className="text-[10px] text-gray-400">{Math.round(p.latestCalc.primaryDataPct * 100)}% {t('pcf.primaryData')}</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">—</p>
                )}
              </div>
              {statusBadge(p.latestCalc)}
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
