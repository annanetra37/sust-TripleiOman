import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
  TrendingUp,
  Zap,
  Cloud,
  FileCheck2,
  Users,
  Loader2,
  Save,
  AlertCircle,
  Pencil,
  Sparkles,
} from 'lucide-react';
import { HelpBanner } from '../components/HelpSystem';
import FeatureLock from '../components/FeatureLock';
import useFeature from '../hooks/useFeature';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

// Format a number as a USD currency string.  We keep the symbol in the
// component (instead of relying on Intl with locale) so the display looks
// identical whether the backend returns `currency: "USD"` or anything else.
function formatUsd(value, currency = 'USD') {
  if (value == null || !isFinite(value)) return '—';
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${prefix}${(n / 1_000).toFixed(1)}K`;
  return `${prefix}${n.toFixed(0)}`;
}

function formatNumber(n, suffix = '') {
  if (n == null || !isFinite(n)) return '—';
  return `${Number(n).toLocaleString()}${suffix}`;
}

// ─── Top banner card (mirrors the roadmap mockup) ───────────────────────────
function HeaderBanner({ onEditFinancials, t }) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-slate-800 dark:bg-slate-900 px-6 py-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('roi.title')}</h1>
          <p className="text-sm text-slate-300 mt-1">
            {t('roi.subtitle')}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 bg-brand-500 text-white text-xs font-bold px-4 py-2 rounded">
          <Sparkles className="w-3.5 h-3.5" />
          {t('roi.live')}
        </span>
      </div>
      <div className="bg-brand-50 dark:bg-slate-800 px-6 py-5 border-t-4 border-brand-500">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('roi.connectFinancial')}{' '}
          <button
            type="button"
            onClick={onEditFinancials}
            className="font-bold underline decoration-2 underline-offset-2 text-slate-800 dark:text-white hover:text-brand-600 transition-colors"
          >
            {t('roi.financialData')}
          </button>
          . {t('roi.platformTranslates')}
        </p>
      </div>
    </div>
  );
}

// ─── One of the four pillar cards ───────────────────────────────────────────
function PillarCard({ icon: Icon, title, description, children, accent = 'bg-brand-500' }) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
      <div className={`h-1.5 ${accent}`} />
      <div className="p-6 flex-1 flex flex-col">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-950 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
          </div>
        </div>
        <div className="mt-2 flex-1">{children}</div>
      </div>
    </div>
  );
}

// Big hero metric + optional caption.
function HeroMetric({ value, caption, color = 'text-brand-600' }) {
  return (
    <div>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {caption && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{caption}</p>}
    </div>
  );
}

// Inline key/value row — keeps pillar cards compact.
function Stat({ label, value }) {
  return (
    <div className="flex items-center justify-between text-xs border-t border-gray-100 dark:border-gray-800 py-1.5 first:border-t-0">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-semibold text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}

// ─── Financials editor modal ────────────────────────────────────────────────
function FinancialsModal({ initial, onClose, onSaved, canEdit, t }) {
  const [form, setForm] = useState({
    electricityPricePerKwh: initial?.electricityPricePerKwh ?? 0.15,
    carbonTaxPerTco2e: initial?.carbonTaxPerTco2e ?? 85,
    avgRecruitingCostPerHire: initial?.avgRecruitingCostPerHire ?? 4700,
    annualRevenue: initial?.annualRevenue ?? '',
    esgDependentRevenueShare: (initial?.esgDependentRevenueShare ?? 0.35) * 100,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const payload = {
        electricityPricePerKwh: Number(form.electricityPricePerKwh),
        carbonTaxPerTco2e: Number(form.carbonTaxPerTco2e),
        avgRecruitingCostPerHire: Number(form.avgRecruitingCostPerHire),
        esgDependentRevenueShare: Number(form.esgDependentRevenueShare) / 100,
      };
      if (form.annualRevenue !== '' && form.annualRevenue != null) {
        payload.annualRevenue = Number(form.annualRevenue);
      }
      const saved = await api.updateRoiFinancials(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.error || t('roi.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('roi.financialDataTitle')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('roi.financialDataDesc')}
            </p>
          </div>
        </div>

        {!canEdit && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t('roi.adminOnlyFinancials')}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('roi.electricityPrice')}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input mt-1"
              value={form.electricityPricePerKwh}
              onChange={change('electricityPricePerKwh')}
              disabled={!canEdit}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('roi.carbonPrice')}
            </span>
            <input
              type="number"
              step="1"
              min="0"
              className="input mt-1"
              value={form.carbonTaxPerTco2e}
              onChange={change('carbonTaxPerTco2e')}
              disabled={!canEdit}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('roi.recruitingCost')}
            </span>
            <input
              type="number"
              step="100"
              min="0"
              className="input mt-1"
              value={form.avgRecruitingCostPerHire}
              onChange={change('avgRecruitingCostPerHire')}
              disabled={!canEdit}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('roi.annualRevenue')}
            </span>
            <input
              type="number"
              step="10000"
              min="0"
              placeholder="e.g. 50000000"
              className="input mt-1"
              value={form.annualRevenue}
              onChange={change('annualRevenue')}
              disabled={!canEdit}
            />
          </label>
          <label className="block col-span-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('roi.esgRevenueShare')}
            </span>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              className="input mt-1"
              value={form.esgDependentRevenueShare}
              onChange={change('esgDependentRevenueShare')}
              disabled={!canEdit}
            />
          </label>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            {canEdit ? t('common.cancel') : t('common.close')}
          </button>
          {canEdit && (
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('roi.saveAssumptions')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function ROIDashboard() {
  const { t } = useT();
  const { user } = useAuth();
  const roiFeature = useFeature('sustainability_roi');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFinancials, setShowFinancials] = useState(false);
  const [baselineYear, setBaselineYear] = useState('');
  const [currentYear, setCurrentYear] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (baselineYear) params.baselineYear = baselineYear;
      if (currentYear) params.currentYear = currentYear;
      const data = await api.getRoiSummary(params);
      setSummary(data);
      if (!baselineYear && data.baselineYear) setBaselineYear(String(data.baselineYear));
      if (!currentYear && data.currentYear) setCurrentYear(String(data.currentYear));
    } catch (err) {
      // The requireFeature middleware returns a structured 403 — react gracefully.
      if (err.error === 'FEATURE_NOT_IN_PLAN') {
        setSummary(null);
      } else {
        setError(err.error || t('roi.failedToLoad'));
      }
    } finally {
      setLoading(false);
    }
  }, [baselineYear, currentYear]);

  useEffect(() => {
    if (roiFeature.allowed) load();
  }, [roiFeature.allowed, load]);

  // Tier gate — render the standard upsell card if the plan doesn't include
  // the ROI module.  We wrap it with the header banner so the UX stays
  // consistent with the screenshot mockup.
  if (!roiFeature.allowed) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <HeaderBanner onEditFinancials={() => {}} t={t} />
        <FeatureLock feature="sustainability_roi" />
      </div>
    );
  }

  const canEditFinancials = user?.role === 'ADMIN';
  const currency = summary?.financials?.currency || 'USD';
  const pillars = summary?.pillars;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <HeaderBanner onEditFinancials={() => setShowFinancials(true)} t={t} />

      <HelpBanner id="roi-module-guide" title={t('roi.howRoiWorks')} variant="info">
        {t('roi.howRoiBody')}
      </HelpBanner>

      {/* Year + baseline + financials toolbar */}
      {summary?.hasData && (
        <div className="card flex items-center gap-4 flex-wrap">
          <div>
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">{t('roi.baselineYear')}</label>
            <select
              className="input mt-1"
              value={baselineYear}
              onChange={(e) => setBaselineYear(e.target.value)}
            >
              {summary.years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">{t('roi.currentYear')}</label>
            <select
              className="input mt-1"
              value={currentYear}
              onChange={(e) => setCurrentYear(e.target.value)}
            >
              {summary.years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          {summary.totalRoiUsd > 0 && (
            <div className="text-right">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{t('roi.totalAnnualImpact')}</p>
              <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                {formatUsd(summary.totalRoiUsd, currency)}
              </p>
            </div>
          )}
          <button
            type="button"
            className="btn-secondary flex items-center gap-2"
            onClick={() => setShowFinancials(true)}
          >
            <Pencil className="w-4 h-4" />
            {t('roi.financialDataTitle')}
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      )}

      {!loading && summary && !summary.hasData && (
        <div className="card text-center py-12">
          <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('roi.noEsgData')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
            {t('roi.noEsgDataDesc')}
          </p>
        </div>
      )}

      {/* Pillars grid */}
      {!loading && pillars && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── 1. Energy cost savings ── */}
          <PillarCard
            icon={Zap}
            title={t('roi.energySavings')}
            description={t('roi.energySavingsDesc')}
          >
            <HeroMetric
              value={formatUsd(pillars.energy.savingsUsd, currency)}
              caption={t('roi.savedVsBaseline', { year: pillars.energy.baselineYear })}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <div className="mt-3">
              <Stat label={t('roi.baselineSpend')} value={formatUsd(pillars.energy.baselineSpendUsd, currency)} />
              <Stat label={t('roi.currentSpend')} value={formatUsd(pillars.energy.currentSpendUsd, currency)} />
              <Stat label={t('roi.energyReduction')} value={`${pillars.energy.reductionPct}%`} />
              <Stat label={t('roi.avoidedKwh')} value={formatNumber(pillars.energy.avoidedKwh, ' kWh')} />
              <Stat label={t('roi.priceAssumption')} value={`${formatUsd(pillars.energy.electricityPricePerKwh, currency)} / kWh`} />
            </div>
          </PillarCard>

          {/* ── 2. Carbon tax avoidance ── */}
          <PillarCard
            icon={Cloud}
            title={t('roi.carbonTax')}
            description={t('roi.carbonTaxDesc')}
          >
            <HeroMetric
              value={formatUsd(pillars.carbon.avoidedLiabilityUsd, currency)}
              caption={t('roi.avoidedVsBaseline', { year: pillars.carbon.baselineYear })}
              color="text-sky-600 dark:text-sky-400"
            />
            <div className="mt-3">
              <Stat label={t('roi.baselineEmissions')} value={formatNumber(pillars.carbon.baselineTco2, ' tCO2e')} />
              <Stat label={t('roi.currentEmissions')} value={formatNumber(pillars.carbon.currentTco2, ' tCO2e')} />
              <Stat label={t('roi.reduction')} value={`${pillars.carbon.reductionPct}%`} />
              <Stat label={t('roi.remainingLiability')} value={formatUsd(pillars.carbon.currentLiabilityUsd, currency)} />
              <Stat label={t('roi.carbonPriceLabel')} value={`${formatUsd(pillars.carbon.carbonTaxPerTco2e, currency)} / tCO2e`} />
            </div>
          </PillarCard>

          {/* ── 3. Contract eligibility ── */}
          <PillarCard
            icon={FileCheck2}
            title={t('roi.contractEligibility')}
            description={t('roi.contractDesc')}
          >
            {pillars.contract.revenueKnown ? (
              <>
                <HeroMetric
                  value={formatUsd(pillars.contract.protectedRevenueUsd, currency)}
                  caption={t('roi.protectedRevenue', { amount: formatUsd(pillars.contract.atRiskRevenueUsd, currency) })}
                  color="text-brand-600 dark:text-brand-400"
                />
                <div className="mt-3">
                  <Stat label={t('roi.annualRevenueLabel')} value={formatUsd(pillars.contract.annualRevenue, currency)} />
                  <Stat label={t('roi.esgDependentShare')} value={`${pillars.contract.esgDependentRevenueShare}%`} />
                  <Stat label={t('roi.dataCoverageScore')} value={`${pillars.contract.coverageScore} / 100`} />
                  <Stat label={t('roi.revenueGap')} value={formatUsd(pillars.contract.gapRevenueUsd, currency)} />
                  <Stat label={t('roi.hasSbtiTarget')} value={pillars.contract.hasSbti ? t('common.yes') : t('common.no')} />
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                <p className="mb-2" dangerouslySetInnerHTML={{ __html: t('roi.enterRevenue') }} />
                <button
                  type="button"
                  onClick={() => setShowFinancials(true)}
                  className="btn-primary text-xs"
                >
                  {t('roi.addRevenue')}
                </button>
              </div>
            )}
          </PillarCard>

          {/* ── 4. HR & talent ROI ── */}
          <PillarCard
            icon={Users}
            title={t('roi.hrTalent')}
            description={t('roi.hrTalentDesc')}
          >
            <HeroMetric
              value={formatUsd(pillars.hr.recruitingCostAvoidedUsd, currency)}
              caption={t('roi.fewerLeavers', { count: pillars.hr.avoidedLeavers, year: pillars.hr.baselineYear })}
              color="text-violet-600 dark:text-violet-400"
            />
            <div className="mt-3">
              <Stat label={t('roi.currentHeadcount')} value={formatNumber(pillars.hr.totalEmployees)} />
              <Stat
                label={t('roi.turnoverRate')}
                value={`${pillars.hr.currentTurnoverRate}%  (was ${pillars.hr.baselineTurnoverRate}%)`}
              />
              <Stat label={t('roi.diversityScore')} value={`${pillars.hr.diversityScore} / 100`} />
              <Stat label={t('roi.trainingHours')} value={formatNumber(pillars.hr.trainingHours, ' hrs')} />
              <Stat label={t('roi.recruitingCostPerHire')} value={formatUsd(pillars.hr.avgRecruitingCostPerHire, currency)} />
            </div>
          </PillarCard>
        </div>
      )}

      {showFinancials && summary?.financials && (
        <FinancialsModal
          initial={summary.financials}
          canEdit={canEditFinancials}
          t={t}
          onClose={() => setShowFinancials(false)}
          onSaved={(saved) => {
            setSummary((prev) => (prev ? { ...prev, financials: saved } : prev));
            setShowFinancials(false);
            load();
          }}
        />
      )}
    </div>
  );
}
