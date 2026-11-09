import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Droplets, Upload, TrendingDown, Percent, Users, AlertTriangle,
  ChevronRight, ChevronLeft, Sparkles, CloudRain, Waves, GlassWater,
  Recycle, Check, Droplet,
} from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';
import CopyableChart from '../components/CopyableChart';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useT } from '../i18n';
import useFeature from '../hooks/useFeature';
import FeatureLock from '../components/FeatureLock';
import clsx from 'clsx';

const SOURCE_COLORS = {
  surface: '#3b82f6',
  ground: '#8b5cf6',
  thirdParty: '#f59e0b',
  seawater: '#06b6d4',
  produced: '#64748b',
  rainwater: '#10b981',
};

const STRESS_BADGE = {
  Low: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  Medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  High: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  'Extremely High': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

/* ── Water source definitions for wizard ──────────────────────────── */
const WATER_SOURCES = [
  { key: 'municipal', icon: GlassWater, color: 'blue', labelKey: 'water.wizard.municipal' },
  { key: 'surface', icon: Waves, color: 'cyan', labelKey: 'water.wizard.surfaceWater' },
  { key: 'ground', icon: Droplet, color: 'purple', labelKey: 'water.wizard.groundwater' },
  { key: 'seawater', icon: Waves, color: 'teal', labelKey: 'water.wizard.seawater' },
  { key: 'rainwater', icon: CloudRain, color: 'green', labelKey: 'water.wizard.rainwater' },
];

const COLOR_MAP = {
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/40', ring: 'ring-blue-400', text: 'text-blue-600 dark:text-blue-400', activeBg: 'bg-blue-50 dark:bg-blue-950/60' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/40', ring: 'ring-cyan-400', text: 'text-cyan-600 dark:text-cyan-400', activeBg: 'bg-cyan-50 dark:bg-cyan-950/60' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/40', ring: 'ring-purple-400', text: 'text-purple-600 dark:text-purple-400', activeBg: 'bg-purple-50 dark:bg-purple-950/60' },
  teal: { bg: 'bg-teal-100 dark:bg-teal-900/40', ring: 'ring-teal-400', text: 'text-teal-600 dark:text-teal-400', activeBg: 'bg-teal-50 dark:bg-teal-950/60' },
  green: { bg: 'bg-green-100 dark:bg-green-900/40', ring: 'ring-green-400', text: 'text-green-600 dark:text-green-400', activeBg: 'bg-green-50 dark:bg-green-950/60' },
};

const UNIT_OPTIONS = [
  { value: 'm3', label: 'water.wizard.unitM3', factor: 1 },
  { value: 'litres', label: 'water.wizard.unitLitres', factor: 0.001 },
  { value: 'gallons', label: 'water.wizard.unitGallons', factor: 0.00378541 },
];

/* ── Unit conversion helper ───────────────────────────────────────── */
function toM3(value, unit) {
  const opt = UNIT_OPTIONS.find((u) => u.value === unit);
  return (parseFloat(value) || 0) * (opt?.factor ?? 1);
}

/* ── Confetti CSS (injected once) ─────────────────────────────────── */
const CONFETTI_STYLE_ID = 'water-wizard-confetti-style';
function ensureConfettiStyle() {
  if (document.getElementById(CONFETTI_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CONFETTI_STYLE_ID;
  style.textContent = `
    @keyframes ww-confetti-fall {
      0%   { transform: translateY(-10px) rotate(0deg); opacity: 1; }
      100% { transform: translateY(420px) rotate(720deg); opacity: 0; }
    }
    .ww-confetti-container { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .ww-confetti-piece {
      position: absolute;
      width: 8px; height: 8px;
      border-radius: 2px;
      opacity: 0;
      animation: ww-confetti-fall var(--dur) var(--delay) ease-in forwards;
    }
  `;
  document.head.appendChild(style);
}

function ConfettiOverlay() {
  useEffect(() => { ensureConfettiStyle(); }, []);
  const pieces = Array.from({ length: 40 }, (_, i) => {
    const colors = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    return {
      left: `${Math.random() * 100}%`,
      color: colors[i % colors.length],
      delay: `${Math.random() * 1.5}s`,
      dur: `${1.5 + Math.random() * 1.5}s`,
      size: `${6 + Math.random() * 6}px`,
    };
  });
  return (
    <div className="ww-confetti-container">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="ww-confetti-piece"
          style={{
            left: p.left,
            backgroundColor: p.color,
            width: p.size,
            height: p.size,
            '--delay': p.delay,
            '--dur': p.dur,
          }}
        />
      ))}
    </div>
  );
}

/* ── Step progress indicator ──────────────────────────────────────── */
function StepProgress({ current, total, labels, t }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const isCompleted = step < current;
        const isCurrent = step === current;
        return (
          <div key={step} className="flex items-center">
            {/* circle */}
            <div
              className={clsx(
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 shrink-0',
                isCompleted && 'bg-green-500 text-white',
                isCurrent && 'bg-blue-600 text-white ring-4 ring-blue-200 dark:ring-blue-900',
                !isCompleted && !isCurrent && 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
              )}
            >
              {isCompleted ? <Check className="w-4 h-4" /> : step}
            </div>
            {/* connector */}
            {step < total && (
              <div
                className={clsx(
                  'w-12 h-0.5 transition-all duration-300',
                  isCompleted ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */
export default function E3Dashboard() {
  const { t } = useT();
  const feature = useFeature('water_resources');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [years] = useState(() => {
    const cur = new Date().getFullYear();
    return [cur, cur - 1, cur - 2, cur - 3];
  });

  /* Wizard state */
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSources, setWizardSources] = useState({});
  const [wizardVolumes, setWizardVolumes] = useState({});
  const [wizardUnit, setWizardUnit] = useState('m3');
  const [wizardRecycles, setWizardRecycles] = useState(false);
  const [wizardRecycleVolume, setWizardRecycleVolume] = useState('');
  const [wizardSaving, setWizardSaving] = useState(false);

  useEffect(() => {
    if (!feature.allowed) return;
    setLoading(true);
    api.getWaterDashboard(year)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year, feature.allowed]);

  if (!feature.allowed) {
    return (
      <div className="max-w-4xl mx-auto">
        <FeatureLock feature="water_resources" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const charts = data?.charts || {};
  const sites = data?.sites || [];
  const hasData = data && (stats.totalWithdrawal > 0 || sites.length > 0);

  // Build source bar data
  const sourceData = [
    { source: t('water.surfaceWater'), value: stats.surfaceWater || 0 },
    { source: t('water.groundWater'), value: stats.groundWater || 0 },
    { source: t('water.thirdParty'), value: stats.thirdParty || 0 },
    { source: t('water.seawater'), value: stats.seawater || 0 },
    { source: t('water.produced'), value: stats.produced || 0 },
    { source: t('water.rainwater'), value: stats.rainwater || 0 },
  ];

  // Build flow comparison data
  const flowData = charts.flowComparison || [
    { name: t('water.totalWithdrawal'), value: stats.totalWithdrawal || 0 },
    { name: t('water.flowComparison').split(' vs ')[1] || 'Discharge', value: stats.totalDischarge || 0 },
    { name: t('water.totalConsumption'), value: stats.totalConsumption || 0 },
  ];

  /* ── Wizard helpers ─────────────────────────────────────────────── */
  const selectedSources = WATER_SOURCES.filter((s) => wizardSources[s.key]);

  function toggleSource(key) {
    setWizardSources((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setVolume(sourceKey, field, value) {
    setWizardVolumes((prev) => ({
      ...prev,
      [sourceKey]: { ...(prev[sourceKey] || {}), [field]: value },
    }));
  }

  function getVolume(sourceKey, field) {
    return wizardVolumes[sourceKey]?.[field] || '';
  }

  function computeConsumption(sourceKey) {
    const w = parseFloat(getVolume(sourceKey, 'withdrawal')) || 0;
    const d = parseFloat(getVolume(sourceKey, 'discharge')) || 0;
    return Math.max(0, w - d);
  }

  /* Total KPIs for results step */
  function computeTotals() {
    let totalWithdrawal = 0;
    let totalDischarge = 0;
    selectedSources.forEach((s) => {
      totalWithdrawal += toM3(getVolume(s.key, 'withdrawal'), wizardUnit);
      totalDischarge += toM3(getVolume(s.key, 'discharge'), wizardUnit);
    });
    const totalConsumption = Math.max(0, totalWithdrawal - totalDischarge);
    const recycledM3 = wizardRecycles ? toM3(wizardRecycleVolume, wizardUnit) : 0;
    const recycledPct = totalWithdrawal > 0 ? (recycledM3 / totalWithdrawal) * 100 : 0;
    return { totalWithdrawal, totalDischarge, totalConsumption, recycledM3, recycledPct };
  }

  function canProceed() {
    if (wizardStep === 1) return selectedSources.length > 0;
    if (wizardStep === 2) return selectedSources.every((s) => parseFloat(getVolume(s.key, 'withdrawal')) > 0);
    return true;
  }

  async function handleWizardSubmit() {
    setWizardSaving(true);
    try {
      const totals = computeTotals();
      const formData = new FormData();
      formData.append('year', year);
      formData.append('totalWithdrawal', totals.totalWithdrawal);
      formData.append('totalDischarge', totals.totalDischarge);
      formData.append('totalConsumption', totals.totalConsumption);
      formData.append('recycledVolume', totals.recycledM3);

      selectedSources.forEach((s) => {
        formData.append(`source_${s.key}_withdrawal`, toM3(getVolume(s.key, 'withdrawal'), wizardUnit));
        formData.append(`source_${s.key}_discharge`, toM3(getVolume(s.key, 'discharge'), wizardUnit));
      });

      await api.uploadWaterData(formData);
      const refreshed = await api.getWaterDashboard(year);
      setData(refreshed);
    } catch {
      // stay on results page so user can retry
    } finally {
      setWizardSaving(false);
    }
  }

  /* ── Wizard Step Renderers ──────────────────────────────────────── */
  function renderStep1() {
    return (
      <div className="space-y-6 transition-opacity duration-300">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t('water.wizard.step1Title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
            {t('water.wizard.step1Subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl mx-auto">
          {WATER_SOURCES.map((src) => {
            const active = !!wizardSources[src.key];
            const cm = COLOR_MAP[src.color];
            const Icon = src.icon;
            return (
              <button
                key={src.key}
                type="button"
                onClick={() => toggleSource(src.key)}
                className={clsx(
                  'relative flex items-center gap-3 rounded-xl px-4 py-4 text-left transition-all duration-200',
                  'border-2',
                  active
                    ? `${cm.activeBg} border-current ${cm.text} shadow-sm`
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600',
                )}
              >
                <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', cm.bg)}>
                  <Icon className={clsx('w-5 h-5', cm.text)} />
                </div>
                <span className={clsx('font-medium text-sm', active ? cm.text : 'text-gray-700 dark:text-gray-300')}>
                  {t(src.labelKey)}
                </span>
                {active && (
                  <div className={clsx('absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center', 'bg-green-500 text-white')}>
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-md mx-auto">
          {t('water.wizard.step1Explain')}
        </p>
      </div>
    );
  }

  function renderStep2() {
    const unitLabel = UNIT_OPTIONS.find((u) => u.value === wizardUnit)?.label || 'water.wizard.unitM3';

    return (
      <div className="space-y-6 transition-opacity duration-300">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t('water.wizard.step2Title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
            {t('water.wizard.step2Subtitle')}
          </p>
        </div>

        {/* Unit selector */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('water.wizard.unitLabel')}:</span>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {UNIT_OPTIONS.map((u) => (
              <button
                key={u.value}
                type="button"
                onClick={() => setWizardUnit(u.value)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  wizardUnit === u.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700',
                )}
              >
                {t(u.label)}
              </button>
            ))}
          </div>
        </div>

        {/* Source volume inputs */}
        <div className="space-y-4 max-w-xl mx-auto">
          {selectedSources.map((src) => {
            const cm = COLOR_MAP[src.color];
            const Icon = src.icon;
            const consumption = computeConsumption(src.key);
            const displayUnit = t(unitLabel);
            return (
              <div key={src.key} className={clsx('rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3', 'bg-white dark:bg-gray-800')}>
                <div className="flex items-center gap-2">
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', cm.bg)}>
                    <Icon className={clsx('w-4 h-4', cm.text)} />
                  </div>
                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{t(src.labelKey)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {t('water.wizard.withdrawalLabel')} ({displayUnit})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={getVolume(src.key, 'withdrawal')}
                      onChange={(e) => setVolume(src.key, 'withdrawal', e.target.value)}
                      placeholder="0"
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {t('water.wizard.dischargeLabel')} ({displayUnit})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={getVolume(src.key, 'discharge')}
                      onChange={(e) => setVolume(src.key, 'discharge', e.target.value)}
                      placeholder="0"
                      className="input w-full text-sm"
                    />
                  </div>
                </div>
                {/* Auto-calculated consumption */}
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-gray-400 dark:text-gray-500">{t('water.wizard.consumptionCalc')}:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {consumption.toLocaleString(undefined, { maximumFractionDigits: 2 })} {displayUnit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-md mx-auto">
          {t('water.wizard.estimatesOk')}
        </p>
      </div>
    );
  }

  function renderStep3() {
    const unitLabel = UNIT_OPTIONS.find((u) => u.value === wizardUnit)?.label || 'water.wizard.unitM3';
    const displayUnit = t(unitLabel);

    return (
      <div className="space-y-6 transition-opacity duration-300">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t('water.wizard.step3Title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
            {t('water.wizard.step3Subtitle')}
          </p>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          {/* Yes / No toggle */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setWizardRecycles(true)}
              className={clsx(
                'flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium border-2 transition-all duration-200',
                wizardRecycles
                  ? 'border-green-500 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300',
              )}
            >
              <Recycle className="w-4 h-4" />
              {t('water.wizard.recycleYes')}
            </button>
            <button
              type="button"
              onClick={() => { setWizardRecycles(false); setWizardRecycleVolume(''); }}
              className={clsx(
                'flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium border-2 transition-all duration-200',
                !wizardRecycles
                  ? 'border-gray-500 bg-gray-50 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300',
              )}
            >
              {t('water.wizard.recycleNo')}
            </button>
          </div>

          {/* Volume input (shown when Yes) */}
          {wizardRecycles && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2 transition-all duration-300">
              <label className="block text-xs text-gray-500 dark:text-gray-400">
                {t('water.wizard.recycleVolume')} ({displayUnit})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={wizardRecycleVolume}
                onChange={(e) => setWizardRecycleVolume(e.target.value)}
                placeholder="0"
                className="input w-full text-sm"
              />
            </div>
          )}

          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4">
            <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
              {t('water.wizard.recycleExplain')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  function renderStep4() {
    const totals = computeTotals();

    return (
      <div className="space-y-6 transition-opacity duration-300 relative">
        <ConfettiOverlay />

        <div className="text-center relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-7 h-7 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            {t('water.wizard.step4Title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('water.wizard.step4Subtitle')}
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto relative z-10">
          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4 text-center">
            <Droplets className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('water.totalWithdrawal')}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {totals.totalWithdrawal.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              <span className="text-xs font-normal text-gray-400 ml-1">{t('water.m3')}</span>
            </p>
          </div>
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-100 dark:border-cyan-900 p-4 text-center">
            <TrendingDown className="w-5 h-5 text-cyan-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('water.totalConsumption')}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {totals.totalConsumption.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              <span className="text-xs font-normal text-gray-400 ml-1">{t('water.m3')}</span>
            </p>
          </div>
          <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 p-4 text-center">
            <Recycle className="w-5 h-5 text-green-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('water.recycledReused')}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {totals.recycledPct.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Standards note */}
        <div className="max-w-xl mx-auto rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-4 relative z-10">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {t('water.wizard.whatThisMeans')}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {t('water.wizard.gri303Explain')}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-3 relative z-10">
          <button
            type="button"
            onClick={() => setWizardStep(2)}
            className="px-5 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {t('water.wizard.addMoreDetail')}
          </button>
          <button
            type="button"
            disabled={wizardSaving}
            onClick={handleWizardSubmit}
            className={clsx(
              'btn-primary flex items-center gap-2 px-6 py-2.5 text-sm',
              wizardSaving && 'opacity-60 pointer-events-none',
            )}
          >
            {wizardSaving ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {t('water.wizard.goToDashboard')}
          </button>
        </div>
      </div>
    );
  }

  /* ── Wizard container ───────────────────────────────────────────── */
  function renderWizard() {
    const stepLabels = [
      t('water.wizard.step1Title'),
      t('water.wizard.step2Title'),
      t('water.wizard.step3Title'),
      t('water.wizard.step4Title'),
    ];

    return (
      <div className="card py-10 px-6 sm:px-10 overflow-hidden relative">
        {/* Step header */}
        <p className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 mb-4">
          {t('water.wizard.stepOf', { current: wizardStep, total: 4 })}
        </p>

        <StepProgress current={wizardStep} total={4} labels={stepLabels} t={t} />

        {/* Step content */}
        <div className="min-h-[320px] flex flex-col justify-center">
          {wizardStep === 1 && renderStep1()}
          {wizardStep === 2 && renderStep2()}
          {wizardStep === 3 && renderStep3()}
          {wizardStep === 4 && renderStep4()}
        </div>

        {/* Navigation */}
        {wizardStep < 4 && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setWizardStep((s) => Math.max(1, s - 1))}
              disabled={wizardStep === 1}
              className={clsx(
                'flex items-center gap-1 text-sm font-medium px-4 py-2 rounded-lg transition-colors',
                wizardStep === 1
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              {t('water.wizard.back')}
            </button>
            <button
              type="button"
              onClick={() => setWizardStep((s) => Math.min(4, s + 1))}
              disabled={!canProceed()}
              className={clsx(
                'btn-primary flex items-center gap-1 text-sm px-5 py-2',
                !canProceed() && 'opacity-40 pointer-events-none',
              )}
            >
              {t('water.wizard.next')}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('water.title')}</h1>
          <p className="text-gray-500">{t('water.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input py-2 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => {/* open upload modal or navigate */}}
            className="btn-primary flex items-center gap-2"
          >
            <Upload className="w-4 h-4" /> {t('water.connectData')}
          </button>
        </div>
      </div>

      {!hasData ? (
        /* Guided water wizard */
        renderWizard()
      ) : (
        <>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <Droplets className="w-5 h-5 text-blue-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('water.totalWithdrawal')}</span>
                <InfoTip>{t('water.totalWithdrawal')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {(stats.totalWithdrawal || 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">{t('water.m3')}</span>
              </span>
            </div>
            <div className="stat-card">
              <TrendingDown className="w-5 h-5 text-cyan-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('water.totalConsumption')}</span>
                <InfoTip>{t('water.totalConsumption')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {(stats.totalConsumption || 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">{t('water.m3')}</span>
              </span>
            </div>
            <div className="stat-card">
              <Percent className="w-5 h-5 text-green-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('water.recycledReused')}</span>
                <InfoTip>{t('water.recycledReused')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {stats.recycledPct != null ? `${stats.recycledPct.toFixed(1)}%` : '0%'}
              </span>
            </div>
            <div className="stat-card">
              <Users className="w-5 h-5 text-purple-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('water.waterIntensity')}</span>
                <InfoTip>{t('water.waterIntensity')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {(stats.waterIntensity || 0).toFixed(2)} <span className="text-sm font-normal text-gray-400">{t('water.perEmployee')}</span>
              </span>
            </div>
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="stat-card py-3 px-4">
              <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">{t('water.surfaceWater')}</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {(stats.surfaceWater || 0).toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{t('water.m3')}</span>
              </span>
            </div>
            <div className="stat-card py-3 px-4">
              <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide">{t('water.groundWater')}</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {(stats.groundWater || 0).toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{t('water.m3')}</span>
              </span>
            </div>
            <div className="stat-card py-3 px-4">
              <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">{t('water.thirdParty')}</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {(stats.thirdParty || 0).toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{t('water.m3')}</span>
              </span>
            </div>
            <div className="stat-card py-3 px-4">
              <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">{t('water.stressedSites')}</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {stats.stressedSitesPct != null ? `${stats.stressedSitesPct.toFixed(1)}%` : '0%'}
              </span>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Withdrawal by Source */}
            <CopyableChart title={t('water.withdrawalBySource')}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sourceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="source" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(v) => `${v.toLocaleString()} ${t('water.m3')}`} />
                  <Bar dataKey="value" name={t('water.m3')} fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CopyableChart>

            {/* Withdrawal vs Discharge vs Consumption */}
            <CopyableChart title={t('water.flowComparison')}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={flowData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(v) => `${v.toLocaleString()} ${t('water.m3')}`} />
                  <Bar dataKey="value" name={t('water.m3')} fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CopyableChart>
          </div>

          {/* Water-Stressed Sites */}
          {sites.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {t('water.siteRisk')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('water.waterStress')}</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">{t('water.totalWithdrawal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site, idx) => (
                      <tr key={site.id || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{site.name}</td>
                        <td className="py-2 px-3">
                          <span className={clsx('badge text-xs', STRESS_BADGE[site.stressLevel] || 'bg-gray-100 text-gray-500')}>
                            {site.stressLevel || '—'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-gray-600 dark:text-gray-400">
                          {(site.withdrawal || 0).toLocaleString()} {t('water.m3')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
