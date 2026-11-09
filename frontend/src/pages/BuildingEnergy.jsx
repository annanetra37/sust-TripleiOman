import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  Building2, Plus, Pencil, Trash2, Loader2, AlertCircle, AlertTriangle, ArrowLeft, Upload, Download,
  Info, Wrench, Check, X, TrendingDown, TrendingUp, Zap, Coins, Leaf, Lock,
} from 'lucide-react';
import api from '../services/api';
import { HelpBanner } from '../components/HelpSystem';
import FeatureLock from '../components/FeatureLock';
import useFeature from '../hooks/useFeature';
import { useTheme } from '../context/ThemeContext';
import { useT } from '../i18n';

// ─── Constants ──────────────────────────────────────────────────────────────

const ASSET_CLASSES = [
  'school', 'kindergarten', 'public_admin', 'healthcare', 'residential_multi',
  'office', 'retail', 'residential', 'industrial', 'logistics', 'hotel', 'mixed',
];
const FUELS = {
  electricity: ['kWh', 'MWh'],
  natural_gas: ['m3', 'kWh'],
  district_heat: ['kWh', 'MWh', 'Gcal'],
  district_cool: ['kWh', 'MWh'],
  lpg: ['litre', 'kg'],
  biomass: ['kg', 'm3'],
  oil: ['litre'],
};
// Fuel colours follow the fuel (fixed order, validated for light and dark).
const FUEL_COLORS = {
  light: { electricity: '#2a78d6', natural_gas: '#eb6834', district_heat: '#1baf7a', district_cool: '#eda100', lpg: '#e87ba4', biomass: '#008300', oil: '#4a3aa7' },
  dark: { electricity: '#3987e5', natural_gas: '#d95926', district_heat: '#199e70', district_cool: '#c98500', lpg: '#d55181', biomass: '#008300', oil: '#9085e9' },
};
// Countries with calibrated CRREM pathways (backend/src/sectors/real_estate).
const CRREM_COUNTRIES = ['DE', 'FR', 'NL', 'UK', 'US', 'EU'];
const CSV_COLUMNS = ['year', 'month', 'periodStart', 'periodEnd', 'fuel', 'quantity', 'unit', 'cost', 'currency', 'sourceDoc'];

const unitLabel = (u) => (u === 'm3' ? 'm³' : u);
const fmt = (n, dp = 0) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 }));
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const errText = (err, fallback) => err?.error || err?.message || fallback;

// ─── Page entry ─────────────────────────────────────────────────────────────

export default function BuildingEnergy() {
  const { id } = useParams();
  const feature = useFeature('building_energy');
  if (!feature.allowed) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <FeatureLock feature="building_energy" />
      </div>
    );
  }
  return id ? <BuildingDetail id={id} /> : <BuildingList />;
}

// ─── Shared bits ────────────────────────────────────────────────────────────

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-0.5">{hint}</span>}
    </label>
  );
}

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

function downloadCsvTemplate() {
  const rows = [
    CSV_COLUMNS.join(','),
    '2025,1,,,natural_gas,5800,m3,870000,AMD,gas-bill-2025-01.pdf',
    '2025,1,,,electricity,3600,kWh,172800,AMD,electricity-bill-2025-01.pdf',
    '2025,,2025-02-10,2025-03-09,natural_gas,4900,m3,735000,AMD,gas-bill-2025-02.pdf',
  ];
  const blob = new Blob([`${rows.join('\n')}\n`], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'building-energy-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// Minimal CSV parser (quoted fields, commas, CRLF).
function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { const v = (r[i] ?? '').trim(); if (v !== '') o[h] = v; });
    return o;
  });
}

// ─── Building form (create / edit) ──────────────────────────────────────────

function BuildingForm({ initial, onClose, onSaved, t }) {
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    assetClass: initial?.assetClass || 'school',
    country: initial?.country || 'AM',
    city: initial?.city || '',
    grossFloorAreaM2: initial?.grossFloorAreaM2 ?? '',
    heatedAreaM2: initial?.heatedAreaM2 ?? '',
    yearBuilt: initial?.yearBuilt ?? '',
    occupancyPct: initial?.occupancyPct ?? '',
    retrofitDate: initial?.retrofitDate ? String(initial.retrofitDate).slice(0, 10) : '',
    retrofitDescription: initial?.retrofitDescription || '',
    retrofitCost: initial?.retrofitCost ?? '',
    retrofitCurrency: initial?.retrofitCurrency || 'AMD',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setError('');
    for (const k of ['grossFloorAreaM2', 'heatedAreaM2', 'yearBuilt', 'occupancyPct', 'retrofitCost']) {
      if (form[k] !== '' && !(Number(form[k]) > 0)) { setError(t('buildings.errors.positive', { field: t(`buildings.fields.${k}`) })); return; }
    }
    if (!form.name.trim() || !form.city.trim() || !(Number(form.grossFloorAreaM2) > 0)) { setError(t('buildings.errors.required')); return; }
    const payload = {
      ...form,
      grossFloorAreaM2: Number(form.grossFloorAreaM2),
      heatedAreaM2: form.heatedAreaM2 === '' ? null : Number(form.heatedAreaM2),
      yearBuilt: form.yearBuilt === '' ? null : Number(form.yearBuilt),
      occupancyPct: form.occupancyPct === '' ? null : Number(form.occupancyPct),
      retrofitDate: form.retrofitDate || null,
      retrofitCost: form.retrofitCost === '' ? null : Number(form.retrofitCost),
    };
    setSaving(true);
    try {
      const saved = initial ? await api.updateAsset(initial.id, payload) : await api.createAsset(payload);
      onSaved(saved);
    } catch (err) {
      setError(errText(err, t('buildings.errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={initial ? t('buildings.editBuilding') : t('buildings.addBuilding')}
      onClose={onClose}
      footer={(
        <>
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary flex items-center gap-2" onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <ErrorBox message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={`${t('buildings.fields.name')} *`}><input className="input" value={form.name} onChange={set('name')} /></Field>
          <Field label={t('buildings.fields.assetClass')}>
            <select className="input" value={form.assetClass} onChange={set('assetClass')}>
              {ASSET_CLASSES.map((c) => <option key={c} value={c}>{t(`buildings.classes.${c}`)}</option>)}
            </select>
          </Field>
          <Field label={`${t('buildings.fields.country')} *`} hint={t('buildings.hints.country')}>
            <input className="input uppercase" maxLength={3} value={form.country} onChange={set('country')} />
          </Field>
          <Field label={`${t('buildings.fields.city')} *`}><input className="input" value={form.city} onChange={set('city')} /></Field>
          <Field label={`${t('buildings.fields.grossFloorAreaM2')} *`}><input className="input" type="number" min="0" value={form.grossFloorAreaM2} onChange={set('grossFloorAreaM2')} /></Field>
          <Field label={t('buildings.fields.heatedAreaM2')} hint={t('buildings.hints.heatedArea')}><input className="input" type="number" min="0" value={form.heatedAreaM2} onChange={set('heatedAreaM2')} /></Field>
          <Field label={t('buildings.fields.yearBuilt')}><input className="input" type="number" min="1800" max={new Date().getFullYear()} value={form.yearBuilt} onChange={set('yearBuilt')} /></Field>
          <Field label={t('buildings.fields.occupancyPct')}><input className="input" type="number" min="0" max="100" value={form.occupancyPct} onChange={set('occupancyPct')} /></Field>
        </div>
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2"><Wrench className="w-4 h-4" />{t('buildings.retrofit')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('buildings.fields.retrofitDate')}><input className="input" type="date" value={form.retrofitDate} onChange={set('retrofitDate')} /></Field>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Field label={t('buildings.fields.retrofitCost')}><input className="input" type="number" min="0" value={form.retrofitCost} onChange={set('retrofitCost')} /></Field>
              <Field label={t('buildings.fields.currency')}><input className="input uppercase" maxLength={3} value={form.retrofitCurrency} onChange={set('retrofitCurrency')} /></Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t('buildings.fields.retrofitDescription')}>
                <textarea className="input" rows={2} value={form.retrofitDescription} onChange={set('retrofitDescription')} placeholder={t('buildings.hints.retrofitDescription')} />
              </Field>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Building list (/buildings) ─────────────────────────────────────────────

function BuildingList() {
  const { t } = useT();
  const navigate = useNavigate();
  const [assets, setAssets] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setError('');
    api.getAssets().then(setAssets).catch((err) => { setError(errText(err, t('buildings.errors.loadFailed'))); setAssets([]); });
  }, [t]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />{t('buildings.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('buildings.subtitle')}</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />{t('buildings.addBuilding')}
        </button>
      </div>

      <HelpBanner id="building-energy-guide" title={t('buildings.help.title')} variant="info">
        {t('buildings.help.body')}
      </HelpBanner>

      <ErrorBox message={error} />

      {assets === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>
      ) : assets.length === 0 ? (
        <div className="card text-center py-12 px-4">
          <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('buildings.empty.title')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">{t('buildings.empty.body')}</p>
          <div className="flex justify-center gap-2 mt-5 flex-wrap">
            <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" />{t('buildings.addBuilding')}</button>
            <button className="btn-secondary flex items-center gap-2" onClick={downloadCsvTemplate}><Download className="w-4 h-4" />{t('buildings.csvTemplate')}</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {assets.map((a) => {
            const pct = a.summary?.changePct;
            return (
              <Link key={a.id} to={`/buildings/${a.id}`} className="card hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all block">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white break-words">{a.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{a.city} · {a.country} · {t(`buildings.classes.${a.assetClass}`)}</p>
                  </div>
                  {a.retrofitDate && (
                    <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] shrink-0">
                      {t('buildings.retrofitted')} {String(a.retrofitDate).slice(0, 7)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('buildings.area')}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{fmt(a.heatedAreaM2 || a.grossFloorAreaM2)} m²</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('buildings.latestEui')}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{fmt(a.summary?.latestKwhPerM2, 1)}</p>
                    <p className="text-[10px] text-gray-400">kWh/m²</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('buildings.vsBaseline')}</p>
                    <p className={`font-semibold ${pct == null ? 'text-gray-400' : pct <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {pct == null ? '—' : `${pct > 0 ? '+' : ''}${fmt(pct, 1)}%`}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-3">{t('buildings.recordCount', { n: a._count?.energyRecords ?? 0 })}</p>
              </Link>
            );
          })}
        </div>
      )}

      {showForm && (
        <BuildingForm
          t={t}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => { setShowForm(false); navigate(`/buildings/${saved.id}`); }}
        />
      )}
    </div>
  );
}

// ─── Building detail (/buildings/:id) ───────────────────────────────────────

function Kpi({ icon: Icon, label, value, unit, sub, tone = 'default' }) {
  const tones = {
    default: 'text-gray-900 dark:text-white',
    good: 'text-emerald-600 dark:text-emerald-400',
    bad: 'text-red-600 dark:text-red-400',
  };
  return (
    <div className="card !p-4">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}{label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${tones[tone]}`}>{value}</p>
      {unit && <p className="text-[11px] text-gray-500 dark:text-gray-400">{unit}</p>}
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function FactorsPanel({ factors, t }) {
  const [open, setOpen] = useState(false);
  const statusTone = (s) => (s === 'sourced' || s === 'standard'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300');
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-xs text-brand-600 dark:text-brand-400 flex items-center gap-1 hover:underline"
        aria-expanded={open}
      >
        <Info className="w-3.5 h-3.5" />{t('buildings.factorsUsed')}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-[min(34rem,calc(100vw-2rem))] card !p-3 shadow-lg text-xs space-y-2">
          {factors.length === 0 && <p className="text-gray-500">{t('buildings.noFactors')}</p>}
          {factors.map((f) => (
            <div key={`${f.fuel}-${f.unit}`} className="border-b last:border-b-0 border-gray-100 dark:border-gray-800 pb-2 last:pb-0">
              <p className="font-semibold text-gray-800 dark:text-gray-200">{t(`buildings.fuels.${f.fuel}`)} ({unitLabel(f.unit)})</p>
              <p className="text-gray-600 dark:text-gray-400">
                1 {unitLabel(f.unit)} = {f.toKwh == null ? '—' : fmt(f.toKwh, 4)} kWh
                <span className={`badge ml-1.5 text-[10px] ${statusTone(f.toKwhStatus)}`}>{t(`buildings.factorStatus.${f.toKwhStatus}`)}</span>
              </p>
              <p className="text-gray-400">{f.toKwhSource}{f.toKwhYear ? `, ${f.toKwhYear}` : ''}</p>
              <p className="text-gray-600 dark:text-gray-400 mt-0.5">
                {fmt(f.kgCo2ePerKwh, 4)} kgCO₂e/kWh{f.biogenic ? ` (${t('buildings.biogenic')})` : ''}
                <span className={`badge ml-1.5 text-[10px] ${statusTone(f.emissionStatus)}`}>{t(`buildings.factorStatus.${f.emissionStatus}`)}</span>
              </p>
              <p className="text-gray-400">{f.emissionSource}{f.emissionYear ? `, ${f.emissionYear}` : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntensityChart({ data, retrofitMonth, t, dark }) {
  const colors = dark ? FUEL_COLORS.dark : FUEL_COLORS.light;
  const fuels = Object.keys(FUELS).filter((f) => data.some((m) => m.byFuelKwhPerM2[f] != null));
  const rows = data.map((m) => ({ month: m.month, period: m.period, ...m.byFuelKwhPerM2 }));
  const axis = dark ? '#9ca3af' : '#6b7280';
  const grid = dark ? '#1f2937' : '#e5e7eb';
  const surface = dark ? '#111827' : '#ffffff';

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} margin={{ top: 16, right: 8, left: -12, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: axis }} tickFormatter={(m) => m.slice(2)} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tick={{ fontSize: 11, fill: axis }} width={52} />
        <Tooltip
          cursor={{ fill: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}
          contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: dark ? '#f9fafb' : '#111827', fontWeight: 600 }}
          itemStyle={{ color: dark ? '#d1d5db' : '#374151' }}
          formatter={(v, name) => [`${fmt(v, 2)} kWh/m²`, name]}
          labelFormatter={(m) => {
            const row = rows.find((r) => r.month === m);
            return `${m} · ${t(`buildings.period.${row?.period || 'baseline'}`)}`;
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: axis }} />
        {fuels.map((f, i) => (
          <Bar
            key={f}
            dataKey={f}
            name={t(`buildings.fuels.${f}`)}
            stackId="eui"
            fill={colors[f]}
            stroke={surface}
            strokeWidth={1}
            radius={i === fuels.length - 1 ? [4, 4, 0, 0] : 0}
            maxBarSize={28}
          />
        ))}
        {retrofitMonth && (
          <ReferenceLine
            x={retrofitMonth}
            stroke={dark ? '#e5e7eb' : '#111827'}
            strokeDasharray="4 3"
            label={{ value: t('buildings.retrofit'), position: 'top', fontSize: 11, fill: dark ? '#e5e7eb' : '#111827' }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

function CrremCard({ asset, t }) {
  const supported = CRREM_COUNTRIES.includes(asset.country);
  const results = asset.crremPathways || [];
  return (
    <div className="card border-dashed">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-gray-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('buildings.crrem.title')}</p>
          {!supported ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {asset.country === 'AM' ? t('buildings.crrem.notCalibratedAm') : t('buildings.crrem.notCalibrated', { country: asset.country })}
            </p>
          ) : results.length ? (
            <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 space-y-0.5">
              {results.map((r) => (
                <p key={r.pathway}>{r.pathway}: {r.strandedFromYear ? t('buildings.crrem.stranded', { year: r.strandedFromYear }) : t('buildings.crrem.aligned')}</p>
              ))}
              <p className="text-[11px] text-gray-400">{t('buildings.crrem.source')}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('buildings.crrem.nextStep')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const emptyRecord = () => ({
  mode: 'month', month: thisMonth(), periodStart: '', periodEnd: '',
  fuel: 'natural_gas', quantity: '', unit: 'm3', cost: '', currency: 'AMD', sourceDoc: '',
});

// Convert form state → API payload; returns { payload } or { error }.
function recordPayload(r, t) {
  if (!(Number(r.quantity) > 0)) return { error: t('buildings.errors.quantity') };
  if (r.cost !== '' && r.cost != null && !(Number(r.cost) >= 0)) return { error: t('buildings.errors.positive', { field: t('buildings.fields.cost') }) };
  const base = {
    fuel: r.fuel, quantity: Number(r.quantity), unit: r.unit,
    cost: r.cost === '' || r.cost == null ? null : Number(r.cost),
    currency: r.currency || 'AMD', sourceDoc: r.sourceDoc || null,
  };
  if (r.mode === 'range') {
    if (!r.periodStart || !r.periodEnd) return { error: t('buildings.errors.period') };
    if (r.periodEnd < r.periodStart) return { error: t('buildings.errors.periodOrder') };
    if (r.periodEnd > today()) return { error: t('buildings.errors.future') };
    return { payload: { ...base, year: Number(r.periodEnd.slice(0, 4)), month: null, periodStart: r.periodStart, periodEnd: r.periodEnd } };
  }
  if (!r.month) return { error: t('buildings.errors.period') };
  if (r.month > thisMonth()) return { error: t('buildings.errors.future') };
  return { payload: { ...base, year: Number(r.month.slice(0, 4)), month: Number(r.month.slice(5, 7)), periodStart: null, periodEnd: null } };
}

function recordToForm(rec) {
  const range = !!rec.periodStart;
  return {
    mode: range ? 'range' : 'month',
    month: rec.month ? `${rec.year}-${String(rec.month).padStart(2, '0')}` : `${rec.year}-01`,
    periodStart: range ? String(rec.periodStart).slice(0, 10) : '',
    periodEnd: range ? String(rec.periodEnd).slice(0, 10) : '',
    fuel: rec.fuel, quantity: rec.quantity, unit: rec.unit,
    cost: rec.cost ?? '', currency: rec.currency || 'AMD', sourceDoc: rec.sourceDoc || '',
  };
}

function periodLabel(rec, t) {
  if (rec.periodStart) return `${String(rec.periodStart).slice(0, 10)} → ${String(rec.periodEnd).slice(0, 10)}`;
  if (rec.month) return `${rec.year}-${String(rec.month).padStart(2, '0')}`;
  return `${rec.year} (${t('buildings.annual')})`;
}

function RecordFields({ value, onChange, t }) {
  const set = (k) => (e) => {
    const v = e.target.value;
    onChange((r) => {
      const next = { ...r, [k]: v };
      if (k === 'fuel' && !FUELS[v].includes(r.unit)) next.unit = FUELS[v][0];
      return next;
    });
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Field label={t('buildings.fields.periodType')}>
        <select className="input" value={value.mode} onChange={set('mode')}>
          <option value="month">{t('buildings.periodMonth')}</option>
          <option value="range">{t('buildings.periodRange')}</option>
        </select>
      </Field>
      {value.mode === 'month' ? (
        <Field label={t('buildings.fields.month')}><input className="input" type="month" max={thisMonth()} value={value.month} onChange={set('month')} /></Field>
      ) : (
        <>
          <Field label={t('buildings.fields.periodStart')}><input className="input" type="date" max={today()} value={value.periodStart} onChange={set('periodStart')} /></Field>
          <Field label={t('buildings.fields.periodEnd')}><input className="input" type="date" max={today()} value={value.periodEnd} onChange={set('periodEnd')} /></Field>
        </>
      )}
      <Field label={t('buildings.fields.fuel')}>
        <select className="input" value={value.fuel} onChange={set('fuel')}>
          {Object.keys(FUELS).map((f) => <option key={f} value={f}>{t(`buildings.fuels.${f}`)}</option>)}
        </select>
      </Field>
      <Field label={t('buildings.fields.quantity')}><input className="input" type="number" min="0" step="any" value={value.quantity} onChange={set('quantity')} /></Field>
      <Field label={t('buildings.fields.unit')}>
        <select className="input" value={value.unit} onChange={set('unit')}>
          {FUELS[value.fuel].map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
        </select>
      </Field>
      <Field label={t('buildings.fields.cost')}><input className="input" type="number" min="0" step="any" value={value.cost} onChange={set('cost')} /></Field>
      <Field label={t('buildings.fields.currency')}><input className="input uppercase" maxLength={3} value={value.currency} onChange={set('currency')} /></Field>
      <div className="col-span-2 sm:col-span-4">
        <Field label={t('buildings.fields.sourceDoc')}><input className="input" value={value.sourceDoc} onChange={set('sourceDoc')} placeholder="gas-bill-2025-01.pdf" /></Field>
      </div>
    </div>
  );
}

function BuildingDetail({ id }) {
  const { t } = useT();
  const { dark } = useTheme();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [intensity, setIntensity] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newRec, setNewRec] = useState(emptyRecord);
  const [rowEdit, setRowEdit] = useState(null); // { id, form }
  const [busy, setBusy] = useState(false);
  const [recError, setRecError] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [a, i] = await Promise.all([api.getAsset(id), api.getIntensity(id)]);
      setAsset(a); setIntensity(i); setError('');
    } catch (err) {
      if (err?.status === 404) setNotFound(true);
      else setError(errText(err, t('buildings.errors.loadFailed')));
    }
  }, [id, t]);
  useEffect(() => { load(); }, [load]);

  const addRecord = async () => {
    setRecError('');
    const { payload, error: e } = recordPayload(newRec, t);
    if (e) { setRecError(e); return; }
    setBusy(true);
    try {
      await api.addEnergyRecord(id, payload);
      setNewRec((r) => ({ ...emptyRecord(), fuel: r.fuel, unit: r.unit, currency: r.currency }));
      setAdding(false);
      await load();
    } catch (err) { setRecError(errText(err, t('buildings.errors.saveFailed'))); } finally { setBusy(false); }
  };

  const saveRow = async () => {
    setRecError('');
    const { payload, error: e } = recordPayload(rowEdit.form, t);
    if (e) { setRecError(e); return; }
    setBusy(true);
    try {
      await api.updateEnergyRecord(id, rowEdit.id, payload);
      setRowEdit(null);
      await load();
    } catch (err) { setRecError(errText(err, t('buildings.errors.saveFailed'))); } finally { setBusy(false); }
  };

  const deleteRow = async (rec) => {
    if (!window.confirm(t('buildings.confirmDeleteRecord', { period: periodLabel(rec, t) }))) return;
    setRecError('');
    try { await api.deleteEnergyRecord(id, rec.id); await load(); } catch (err) { setRecError(errText(err, t('buildings.errors.saveFailed'))); }
  };

  const deleteBuilding = async () => {
    if (!window.confirm(t('buildings.confirmDeleteBuilding', { name: asset.name }))) return;
    try { await api.deleteAsset(id); navigate('/buildings'); } catch (err) { setError(errText(err, t('buildings.errors.saveFailed'))); }
  };

  const importCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportMsg(''); setRecError('');
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) { setRecError(t('buildings.errors.csvEmpty')); return; }
      setBusy(true);
      const res = await api.bulkEnergyRecords(id, rows);
      setImportMsg(t('buildings.imported', { n: res.imported }));
      await load();
    } catch (err) {
      setRecError(errText(err, t('buildings.errors.saveFailed')));
    } finally { setBusy(false); }
  };

  const kpis = useMemo(() => {
    if (!intensity) return null;
    const b = intensity.baseline; const p = intensity.post; const c = intensity.change;
    return { b, p, c };
  }, [intensity]);

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto card text-center py-12">
        <p className="text-gray-600 dark:text-gray-300">{t('buildings.notFound')}</p>
        <Link to="/buildings" className="btn-secondary inline-flex items-center gap-2 mt-4"><ArrowLeft className="w-4 h-4" />{t('buildings.backToList')}</Link>
      </div>
    );
  }
  if (!asset || !intensity) {
    return error
      ? <div className="max-w-3xl mx-auto"><ErrorBox message={error} /></div>
      : <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;
  }

  const { b, p, c } = kpis;
  const hasRetrofit = !!intensity.retrofitDate;
  const cost = c?.costSaved;
  const pctTone = c?.kwhPerM2Pct == null ? 'default' : c.kwhPerM2Pct <= 0 ? 'good' : 'bad';

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <Link to="/buildings" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" />{t('buildings.backToList')}
      </Link>

      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white break-words">{asset.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {asset.city} · {asset.country} · {t(`buildings.classes.${asset.assetClass}`)}
              {asset.yearBuilt ? ` · ${t('buildings.built', { year: asset.yearBuilt })}` : ''}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('buildings.fields.grossFloorAreaM2')}: {fmt(asset.grossFloorAreaM2)} m²
              {asset.heatedAreaM2 ? ` · ${t('buildings.fields.heatedAreaM2')}: ${fmt(asset.heatedAreaM2)} m²` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex items-center gap-1.5 text-sm" onClick={() => setEditing(true)}><Pencil className="w-4 h-4" />{t('common.edit')}</button>
            <button className="btn-danger flex items-center gap-1.5 text-sm" onClick={deleteBuilding}><Trash2 className="w-4 h-4" />{t('common.delete')}</button>
          </div>
        </div>
        {hasRetrofit ? (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-sm">
            <Wrench className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div className="text-emerald-800 dark:text-emerald-200">
              <span className="font-semibold">{t('buildings.retrofit')} {intensity.retrofitDate}</span>
              {asset.retrofitDescription && <span> — {asset.retrofitDescription}</span>}
              {asset.retrofitCost != null && <span> · {fmt(asset.retrofitCost)} {asset.retrofitCurrency || ''}</span>}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t('buildings.noRetrofit')}</p>
        )}
      </div>

      <ErrorBox message={error} />

      {/* KPI row */}
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {hasRetrofit ? t('buildings.beforeAfter') : t('buildings.latest12')}
            <span className="font-normal text-gray-400"> · {t(`buildings.areaBasis.${intensity.areaBasis}`)}</span>
          </h2>
          <FactorsPanel factors={intensity.factors} t={t} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi icon={Zap} label={hasRetrofit ? t('buildings.kpi.before') : t('buildings.kpi.eui')} value={fmt(b?.kwhPerM2, 1)} unit="kWh/m²" sub={b ? `${b.from} → ${b.to}` : null} />
          {hasRetrofit && (
            <>
              <Kpi icon={Zap} label={t('buildings.kpi.after')} value={fmt(p?.kwhPerM2, 1)} unit="kWh/m²" sub={p ? `${p.from} → ${p.to}` : null} />
              <Kpi icon={c?.kwhPerM2Pct > 0 ? TrendingUp : TrendingDown} label={t('buildings.kpi.change')} value={c?.kwhPerM2Pct == null ? '—' : `${c.kwhPerM2Pct > 0 ? '+' : ''}${fmt(c.kwhPerM2Pct, 1)}%`} tone={pctTone} />
              <Kpi icon={Zap} label={t('buildings.kpi.kwhSaved')} value={fmt(c?.kwhSaved)} unit={t('buildings.kpi.kwhPerYear')} tone={c?.kwhSaved > 0 ? 'good' : 'default'} />
              <Kpi
                icon={Coins}
                label={cost?.estimated ? t('buildings.kpi.costSavedEstimated') : t('buildings.kpi.costSaved')}
                value={cost ? fmt(cost[cost.currency]) : '—'}
                unit={cost ? `${cost.currency} ${t('buildings.kpi.perYear')}` : t('buildings.kpi.noCost')}
                sub={cost && cost.currency !== 'USD' ? (cost.USD != null ? `≈ $${fmt(cost.USD)}` : t('buildings.kpi.noUsd')) : null}
                tone={cost && cost[cost.currency] > 0 ? 'good' : 'default'}
              />
              <Kpi icon={Leaf} label={t('buildings.kpi.co2Avoided')} value={fmt(c?.tco2eAvoided, 1)} unit={t('buildings.kpi.tco2PerYear')} tone={c?.tco2eAvoided > 0 ? 'good' : 'default'} />
            </>
          )}
          {!hasRetrofit && (
            <>
              <Kpi icon={Zap} label={t('buildings.kpi.totalKwh')} value={fmt(b?.kwh)} unit="kWh" />
              <Kpi icon={Leaf} label={t('buildings.kpi.emissions')} value={fmt(b?.tco2e, 1)} unit="tCO₂e" />
            </>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0" />{t('buildings.notWeatherNormalised')}
        </p>
      </div>

      {/* Warnings / coverage */}
      {intensity.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{t('buildings.dataNotes')}</p>
          <ul className="mt-1.5 text-sm text-amber-800 dark:text-amber-200 list-disc pl-5 space-y-0.5">
            {intensity.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
          {[b, p].filter((x) => x && x.missingMonths?.length).map((x) => (
            <p key={x.from} className="text-xs text-amber-700 dark:text-amber-300 mt-1.5">
              {t('buildings.missingMonths', { from: x.from, to: x.to })}: {x.missingMonths.join(', ')}
            </p>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('buildings.chartTitle')}</h2>
        {intensity.monthly.length ? (
          <IntensityChart data={intensity.monthly} retrofitMonth={intensity.retrofitMonth} t={t} dark={dark} />
        ) : (
          <p className="text-sm text-gray-500 py-10 text-center">{t('buildings.noRecordsYet')}</p>
        )}
      </div>

      {/* Records */}
      <div className="card">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('buildings.records')} ({asset.energyRecords.length})</h2>
          <div className="flex gap-2 flex-wrap">
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={downloadCsvTemplate}><Download className="w-4 h-4" />{t('buildings.csvTemplate')}</button>
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="w-4 h-4" />{t('buildings.importCsv')}</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
            <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => { setAdding((v) => !v); setRecError(''); }}><Plus className="w-4 h-4" />{t('buildings.addRecord')}</button>
          </div>
        </div>

        <div className="space-y-3">
          <ErrorBox message={recError} />
          {importMsg && <p className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5"><Check className="w-4 h-4" />{importMsg}</p>}
          {adding && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
              <RecordFields value={newRec} onChange={setNewRec} t={t} />
              <div className="flex justify-end gap-2">
                <button className="btn-secondary text-sm" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
                <button className="btn-primary text-sm flex items-center gap-1.5" onClick={addRecord} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button>
              </div>
            </div>
          )}
        </div>

        {asset.energyRecords.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">{t('buildings.noRecordsYet')}</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0 mt-3">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                  <th className="py-2 px-2 font-medium">{t('buildings.fields.period')}</th>
                  <th className="py-2 px-2 font-medium">{t('buildings.fields.fuel')}</th>
                  <th className="py-2 px-2 font-medium text-right">{t('buildings.fields.quantity')}</th>
                  <th className="py-2 px-2 font-medium text-right">kWh</th>
                  <th className="py-2 px-2 font-medium text-right">{t('buildings.fields.cost')}</th>
                  <th className="py-2 px-2 font-medium">{t('buildings.fields.sourceDoc')}</th>
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {asset.energyRecords.map((rec) => (rowEdit?.id === rec.id ? (
                  <tr key={rec.id} className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
                    <td colSpan={7} className="p-3">
                      <RecordFields value={rowEdit.form} onChange={(fn) => setRowEdit((r) => ({ ...r, form: fn(r.form) }))} t={t} />
                      <div className="flex justify-end gap-2 mt-2">
                        <button className="btn-secondary text-sm" onClick={() => { setRowEdit(null); setRecError(''); }}>{t('common.cancel')}</button>
                        <button className="btn-primary text-sm flex items-center gap-1.5" onClick={saveRow} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={rec.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="py-2 px-2 whitespace-nowrap text-gray-800 dark:text-gray-200">{periodLabel(rec, t)}</td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: (dark ? FUEL_COLORS.dark : FUEL_COLORS.light)[rec.fuel] }} />
                      <span className="text-gray-800 dark:text-gray-200">{t(`buildings.fuels.${rec.fuel}`)}</span>
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap text-gray-800 dark:text-gray-200">{fmt(rec.quantity, 2)} {unitLabel(rec.unit)}</td>
                    <td className="py-2 px-2 text-right text-gray-800 dark:text-gray-200">{fmt(rec.kwh)}</td>
                    <td className="py-2 px-2 text-right whitespace-nowrap text-gray-800 dark:text-gray-200">{rec.cost == null ? '—' : `${fmt(rec.cost)} ${rec.currency || ''}`}</td>
                    <td className="py-2 px-2 text-gray-500 dark:text-gray-400 max-w-[12rem] truncate" title={rec.sourceDoc || ''}>{rec.sourceDoc || '—'}</td>
                    <td className="py-2 px-2 whitespace-nowrap text-right">
                      <button className="p-1.5 text-gray-400 hover:text-brand-600" title={t('common.edit')} aria-label={t('common.edit')} onClick={() => { setRowEdit({ id: rec.id, form: recordToForm(rec) }); setRecError(''); }}><Pencil className="w-4 h-4" /></button>
                      <button className="p-1.5 text-gray-400 hover:text-red-600" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => deleteRow(rec)}><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CrremCard asset={asset} t={t} />

      {editing && (
        <BuildingForm
          initial={asset}
          t={t}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await load(); }}
        />
      )}
    </div>
  );
}
