import { useEffect, useState } from 'react';
import api from '../services/api';
import { Cpu, Car, Building2, Landmark, Utensils, Layers, Loader2, Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

// Icon map by sector key — falls back to Layers for unknown keys.
const ICONS = {
  electronics: Cpu,
  automotive: Car,
  real_estate: Building2,
  financial: Landmark,
  food_beverage: Utensils,
  generic: Layers,
};

// Card copy for packs that don't yet exist on the backend, so the picker
// can preview the roadmap visually even before those packs ship.
const ROADMAP_STUBS = [
  { key: 'automotive', name: 'Automotive', description: 'OEMs, Tier-1/2 suppliers — Catena-X, SASB TR-AU.', availableFrom: 'Q4 2026' },
  { key: 'real_estate', name: 'Real Estate', description: 'REITs, asset managers — GRESB, CRREM stranded-asset pathways.', availableFrom: 'Q1 2027' },
  { key: 'financial', name: 'Financial Services', description: 'Banks, asset managers — PCAF financed emissions, SFDR PAI.', availableFrom: 'Q1 2027' },
  { key: 'food_beverage', name: 'Food & Beverage', description: 'Coming later.', availableFrom: 'TBD' },
];

export default function SectorPicker({ onSelect, showRoadmap = true, compact = false }) {
  const { user } = useAuth();
  const { t } = useT();
  const [packs, setPacks] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'ADMIN';

  const load = async () => {
    setLoading(true);
    try {
      const [list, curr] = await Promise.all([api.listSectors(), api.getCurrentSector()]);
      setPacks(list);
      setCurrent(curr);
    } catch (err) {
      setError(err.error || 'Could not load sector packs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const choose = async (key) => {
    if (!isAdmin) {
      setError(t('settings.adminOnly'));
      return;
    }
    setSaving(key);
    setError('');
    try {
      await api.selectSector(key);
      await load();
      if (onSelect) onSelect(key);
    } catch (err) {
      setError(err.error || 'Could not select sector pack.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;
  }

  // Merge installed packs with roadmap stubs — installed packs take precedence.
  const installedKeys = new Set(packs.map((p) => p.key));
  const stubs = showRoadmap ? ROADMAP_STUBS.filter((s) => !installedKeys.has(s.key)) : [];

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
        {packs.map((p) => {
          const Icon = ICONS[p.key] || Layers;
          const isCurrent = current?.sectorKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              disabled={!isAdmin || saving !== null}
              onClick={() => choose(p.key)}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                isCurrent
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 ring-1 ring-brand-400'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              } ${!isAdmin && 'cursor-default'}`}
            >
              {isCurrent && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-bold text-brand-700 dark:text-brand-400 bg-brand-100 dark:bg-brand-900 px-2 py-0.5 rounded-full">
                  <Check className="w-3 h-3" /> {t('settings.active')}
                </span>
              )}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-950 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                </div>
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{p.name}</p>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{p.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {(p.frameworks || []).slice(0, 4).map((f) => (
                  <span key={f} className="text-[9px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">{f}</span>
                ))}
              </div>
              {saving === p.key && (
                <div className="absolute inset-0 bg-white/70 dark:bg-black/30 flex items-center justify-center rounded-xl">
                  <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
                </div>
              )}
            </button>
          );
        })}

        {stubs.map((s) => {
          const Icon = ICONS[s.key] || Layers;
          return (
            <div
              key={s.key}
              className="relative p-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800 opacity-60 cursor-not-allowed"
              title={`Available from ${s.availableFrom}`}
            >
              <span className="absolute top-2 right-2 text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                {s.availableFrom}
              </span>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-gray-400" />
                </div>
                <p className="font-semibold text-sm text-gray-600 dark:text-gray-400">{s.name}</p>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.description}</p>
            </div>
          );
        })}
      </div>

      {!isAdmin && (
        <p className="text-xs text-gray-400">{t('settings.adminOnly')}</p>
      )}
    </div>
  );
}
