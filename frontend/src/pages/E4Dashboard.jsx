import { useState, useEffect } from 'react';
import api from '../services/api';
import { TreePine, MapPin, Ruler, CheckCircle2, Plus, AlertTriangle, ChevronLeft, ChevronRight, Sparkles, Check, X, HelpCircle } from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';
import { useT } from '../i18n';
import useFeature from '../hooks/useFeature';
import FeatureLock from '../components/FeatureLock';
import clsx from 'clsx';

const LEAP_PHASES = ['locate', 'evaluate', 'assess', 'prepare'];

const STATUS_BADGE = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  complete: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  verified: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};

const DRIVER_KEYS = ['landUseChange', 'resourceExploitation', 'climateChange', 'pollution', 'invasiveSpecies'];

const SITE_TYPES = ['factory', 'office', 'warehouse', 'retail', 'dataCenter', 'other'];

const ECOSYSTEM_TYPES = [
  { key: 'forest', emoji: '\u{1F332}' },
  { key: 'wetland', emoji: '\u{1F33F}' },
  { key: 'grassland', emoji: '\u{1F33E}' },
  { key: 'marine', emoji: '\u{1F30A}' },
  { key: 'urban', emoji: '\u{1F3D9}️' },
  { key: 'agricultural', emoji: '\u{1F33B}' },
];

const DRIVER_META = {
  landUseChange: { emoji: '\u{1F3D7}️' },
  resourceExploitation: { emoji: '\u{1FAB5}' },
  climateChange: { emoji: '\u{1F321}️' },
  pollution: { emoji: '\u{1F3ED}' },
  invasiveSpecies: { emoji: '\u{1F343}' },
};

const WIZARD_STEPS = ['locate', 'evaluate', 'assess', 'prepare', 'results'];

function ToggleButton({ value, activeValue, activeColor, onClick, children }) {
  const colorMap = {
    green: 'bg-green-500 text-white dark:bg-green-600',
    red: 'bg-red-500 text-white dark:bg-red-600',
    amber: 'bg-amber-500 text-white dark:bg-amber-600',
  };
  const isActive = value === activeValue;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
        isActive
          ? colorMap[activeColor]
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      )}
    >
      {children}
    </button>
  );
}

export default function E4Dashboard() {
  const { t } = useT();
  const feature = useFeature('biodiversity');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [years] = useState(() => {
    const cur = new Date().getFullYear();
    return [cur, cur - 1, cur - 2, cur - 3];
  });

  /* Wizard state */
  const [showWizard, setShowWizard] = useState(false);
  const [wizStep, setWizStep] = useState(0);
  const [saving, setSaving] = useState(false);

  /* Step 0: Locate */
  const [sites, setSites] = useState([{ name: '', country: '', city: '', siteType: 'office' }]);

  /* Step 1: Evaluate */
  const [siteEvals, setSiteEvals] = useState({});

  /* Step 2: Assess */
  const [driverAnswers, setDriverAnswers] = useState({});

  /* Step 3: Prepare */
  const [existingActions, setExistingActions] = useState('');
  const [targets, setTargets] = useState('');

  useEffect(() => {
    if (!feature.allowed) return;
    setLoading(true);
    api.getBiodiversityDashboard(year)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year, feature.allowed]);

  if (!feature.allowed) {
    return (
      <div className="max-w-4xl mx-auto">
        <FeatureLock feature="biodiversity" />
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
  const assessments = data?.assessments || [];
  const dataSites = data?.sites || [];
  const leapProgress = data?.leapProgress || [];
  const drivers = data?.drivers || {};
  const hasData = data && (assessments.length > 0 || dataSites.length > 0);

  /* Wizard helpers */
  const updateSite = (idx, field, value) => {
    setSites((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const addSite = () => {
    setSites((prev) => [...prev, { name: '', country: '', city: '', siteType: 'office' }]);
  };

  const removeSite = (idx) => {
    setSites((prev) => prev.filter((_, i) => i !== idx));
    setSiteEvals((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      });
      return next;
    });
  };

  const updateSiteEval = (siteIdx, field, value) => {
    setSiteEvals((prev) => ({
      ...prev,
      [siteIdx]: { ...(prev[siteIdx] || {}), [field]: value },
    }));
  };

  const updateDriverAnswer = (driverKey, value) => {
    setDriverAnswers((prev) => ({ ...prev, [driverKey]: value }));
  };

  const canProceedStep0 = sites.every((s) => s.name.trim() !== '');
  const impactsIdentified = Object.values(driverAnswers).filter((v) => v === 'yes').length;

  const handleFinish = async () => {
    try {
      setSaving(true);
      for (const site of sites) {
        await api.createSite({ ...site, year });
      }
      await api.createBiodiversityAssessment({
        year,
        sites: sites.map((s, i) => ({
          ...s,
          ...siteEvals[i],
        })),
        drivers: driverAnswers,
        existingActions,
        targets,
      });
      const fresh = await api.getBiodiversityDashboard(year);
      setData(fresh);
      setShowWizard(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  /* Progress bar */
  const renderProgressBar = () => (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {t('biodiversity.wizard.stepOf', { current: wizStep + 1, total: 5 })}
        </span>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {t(`biodiversity.wizard.stepName_${WIZARD_STEPS[wizStep]}`)}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-600 transition-all duration-500"
          style={{ width: `${((wizStep + 1) / 5) * 100}%` }}
        />
      </div>
      <div className="flex justify-between mt-3">
        {WIZARD_STEPS.map((step, idx) => (
          <div key={step} className="flex flex-col items-center gap-1">
            <div
              className={clsx(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                idx < wizStep
                  ? 'bg-green-500 text-white'
                  : idx === wizStep
                    ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 dark:ring-emerald-700'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              )}
            >
              {idx < wizStep ? <Check className="w-4 h-4" /> : idx + 1}
            </div>
            <span
              className={clsx(
                'text-xs hidden sm:block',
                idx <= wizStep ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400 dark:text-gray-500'
              )}
            >
              {t(`biodiversity.wizard.stepName_${step}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  /* Step 0: Locate */
  const renderStep0 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          {t('biodiversity.wizard.locateTitle')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('biodiversity.wizard.locateSubtitle')}
        </p>
      </div>

      <InfoTip title={t('biodiversity.wizard.locateInfoTitle')}>
        {t('biodiversity.wizard.locateInfoBody')}
      </InfoTip>

      <div className="space-y-4">
        {sites.map((site, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {t('biodiversity.wizard.siteLabel')} {idx + 1}
              </span>
              {sites.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSite(idx)}
                  className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label={t('biodiversity.wizard.removeSite')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {t('biodiversity.wizard.siteName')}
                </label>
                <input
                  type="text"
                  value={site.name}
                  onChange={(e) => updateSite(idx, 'name', e.target.value)}
                  placeholder={t('biodiversity.wizard.siteNamePlaceholder')}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {t('biodiversity.wizard.country')}
                </label>
                <input
                  type="text"
                  value={site.country}
                  onChange={(e) => updateSite(idx, 'country', e.target.value)}
                  placeholder={t('biodiversity.wizard.countryPlaceholder')}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {t('biodiversity.wizard.city')}
                </label>
                <input
                  type="text"
                  value={site.city}
                  onChange={(e) => updateSite(idx, 'city', e.target.value)}
                  placeholder={t('biodiversity.wizard.cityPlaceholder')}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {t('biodiversity.wizard.siteType')}
                </label>
                <select
                  value={site.siteType}
                  onChange={(e) => updateSite(idx, 'siteType', e.target.value)}
                  className="input w-full"
                >
                  {SITE_TYPES.map((st) => (
                    <option key={st} value={st}>
                      {t(`biodiversity.wizard.siteType_${st}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addSite}
        className="flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t('biodiversity.wizard.addSite')}
      </button>
    </div>
  );

  /* Step 1: Evaluate */
  const renderStep1 = () => {
    const evalQuestions = [
      { key: 'nearNature', label: t('biodiversity.wizard.evalNearNature') },
      { key: 'usesNaturalWater', label: t('biodiversity.wizard.evalUsesWater') },
      { key: 'producesWaste', label: t('biodiversity.wizard.evalProducesWaste') },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            {t('biodiversity.wizard.evaluateTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('biodiversity.wizard.evaluateSubtitle')}
          </p>
        </div>

        {sites.map((site, idx) => {
          const evals = siteEvals[idx] || {};
          return (
            <div
              key={idx}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5 space-y-4"
            >
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {site.name || `${t('biodiversity.wizard.siteLabel')} ${idx + 1}`}
              </h3>

              {evalQuestions.map((q) => (
                <div key={q.key} className="space-y-2">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{q.label}</p>
                  <div className="flex items-center gap-2">
                    <ToggleButton
                      value={evals[q.key]}
                      activeValue="yes"
                      activeColor="green"
                      onClick={() => updateSiteEval(idx, q.key, 'yes')}
                    >
                      {t('biodiversity.wizard.yes')}
                    </ToggleButton>
                    <ToggleButton
                      value={evals[q.key]}
                      activeValue="no"
                      activeColor="red"
                      onClick={() => updateSiteEval(idx, q.key, 'no')}
                    >
                      {t('biodiversity.wizard.no')}
                    </ToggleButton>
                    <ToggleButton
                      value={evals[q.key]}
                      activeValue="unsure"
                      activeColor="amber"
                      onClick={() => updateSiteEval(idx, q.key, 'unsure')}
                    >
                      {t('biodiversity.wizard.unsure')}
                    </ToggleButton>
                  </div>
                </div>
              ))}

              <div className="space-y-2">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('biodiversity.wizard.ecosystemType')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ECOSYSTEM_TYPES.map((eco) => (
                    <button
                      key={eco.key}
                      type="button"
                      onClick={() => updateSiteEval(idx, 'ecosystem', eco.key)}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                        evals.ecosystem === eco.key
                          ? 'bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-900 dark:border-emerald-600 dark:text-emerald-200'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                      )}
                    >
                      <span>{eco.emoji}</span>
                      <span>{t(`biodiversity.wizard.ecosystem_${eco.key}`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* Step 2: Assess */
  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          {t('biodiversity.wizard.assessTitle')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('biodiversity.wizard.assessSubtitle')}
        </p>
      </div>

      {DRIVER_KEYS.map((dk) => (
        <div
          key={dk}
          className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5 space-y-3"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl" role="img" aria-label={dk}>
              {DRIVER_META[dk].emoji}
            </span>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {t(`biodiversity.wizard.driver_${dk}_title`)}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t(`biodiversity.wizard.driver_${dk}_desc`)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ToggleButton
              value={driverAnswers[dk]}
              activeValue="yes"
              activeColor="green"
              onClick={() => updateDriverAnswer(dk, 'yes')}
            >
              {t('biodiversity.wizard.yes')}
            </ToggleButton>
            <ToggleButton
              value={driverAnswers[dk]}
              activeValue="no"
              activeColor="red"
              onClick={() => updateDriverAnswer(dk, 'no')}
            >
              {t('biodiversity.wizard.no')}
            </ToggleButton>
            <ToggleButton
              value={driverAnswers[dk]}
              activeValue="unsure"
              activeColor="amber"
              onClick={() => updateDriverAnswer(dk, 'unsure')}
            >
              {t('biodiversity.wizard.unsure')}
            </ToggleButton>
          </div>
        </div>
      ))}
    </div>
  );

  /* Step 3: Prepare */
  const renderStep3 = () => {
    const yesDrivers = DRIVER_KEYS.filter((dk) => driverAnswers[dk] === 'yes');

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            {t('biodiversity.wizard.prepareTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('biodiversity.wizard.prepareSubtitle')}
          </p>
        </div>

        {yesDrivers.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('biodiversity.wizard.suggestedActions')}
            </h3>
            {yesDrivers.map((dk) => (
              <div
                key={dk}
                className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-4 flex items-start gap-3"
              >
                <span className="text-xl" role="img" aria-label={dk}>
                  {DRIVER_META[dk].emoji}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t(`biodiversity.wizard.driver_${dk}_title`)}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t(`biodiversity.wizard.driver_${dk}_suggestion`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('biodiversity.wizard.existingActions')}
          </label>
          <textarea
            value={existingActions}
            onChange={(e) => setExistingActions(e.target.value)}
            placeholder={t('biodiversity.wizard.existingActionsPlaceholder')}
            rows={4}
            className="input w-full resize-y"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('biodiversity.wizard.targets')}
          </label>
          <textarea
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            placeholder={t('biodiversity.wizard.targetsPlaceholder')}
            rows={4}
            className="input w-full resize-y"
          />
        </div>
      </div>
    );
  };

  /* Step 4: Results */
  const renderStep4 = () => (
    <div className="space-y-8 text-center">
      {/* Celebration checkmark with pulsing ring */}
      <div className="flex justify-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
            <Check className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-green-400 dark:border-green-600 animate-ping opacity-30" />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          {t('biodiversity.wizard.resultsTitle')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('biodiversity.wizard.resultsSubtitle')}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4">
          <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{sites.length}</span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('biodiversity.wizard.sitesAssessedLabel')}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4">
          <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{impactsIdentified}</span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('biodiversity.wizard.impactsLabel')}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4">
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {(existingActions.trim() ? 1 : 0) + (targets.trim() ? 1 : 0)}
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('biodiversity.wizard.actionsLabel')}</p>
        </div>
      </div>

      {/* What this means */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5 text-left max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('biodiversity.wizard.whatThisMeansTitle')}
          </h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('biodiversity.wizard.whatThisMeansBody')}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          disabled
          className="btn-secondary opacity-50 cursor-not-allowed flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {t('biodiversity.wizard.downloadReport')}
        </button>
        <button
          type="button"
          onClick={handleFinish}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? (
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {t('biodiversity.wizard.goToDashboard')}
        </button>
      </div>
    </div>
  );

  const renderWizardContent = () => {
    switch (wizStep) {
      case 0: return renderStep0();
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      default: return null;
    }
  };

  const canGoNext = () => {
    switch (wizStep) {
      case 0: return canProceedStep0;
      case 1: return true;
      case 2: return true;
      case 3: return true;
      default: return false;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('biodiversity.title')}</h1>
          <p className="text-gray-500">{t('biodiversity.subtitle')}</p>
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
        </div>
      </div>

      {!hasData ? (
        showWizard ? (
          /* TNFD-LEAP Wizard */
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-6 sm:p-8">
              {renderProgressBar()}

              <div className="transition-opacity duration-300" key={wizStep}>
                {renderWizardContent()}
              </div>

              {/* Navigation buttons (not shown on results step) */}
              {wizStep < 4 && (
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => {
                      if (wizStep === 0) {
                        setShowWizard(false);
                      } else {
                        setWizStep((s) => s - 1);
                      }
                    }}
                    className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {wizStep === 0 ? t('biodiversity.wizard.cancel') : t('biodiversity.wizard.back')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizStep((s) => s + 1)}
                    disabled={!canGoNext()}
                    className={clsx(
                      'flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                      canGoNext()
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                    )}
                  >
                    {t('biodiversity.wizard.next')}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="card text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mx-auto mb-4">
              <TreePine className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t('biodiversity.title')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto mb-6">
              {t('biodiversity.noAssessments')}
            </p>
            <div className="card max-w-xl mx-auto text-left bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('biodiversity.tnfdLeap')}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                The TNFD-LEAP framework guides organizations through four phases to assess nature-related dependencies and impacts:
              </p>
              <div className="flex items-center gap-2 mb-4">
                {LEAP_PHASES.map((phase, idx) => (
                  <div key={phase} className="flex items-center gap-1">
                    <span className="w-8 h-8 rounded-lg bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      {phase[0].toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400">{t(`biodiversity.${phase}`)}</span>
                    {idx < LEAP_PHASES.length - 1 && <span className="text-gray-300 dark:text-gray-600 mx-1">&rarr;</span>}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowWizard(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> {t('biodiversity.startAssessment')}
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.sitesAssessed')}</span>
                <InfoTip>{t('biodiversity.sitesAssessed')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">{stats.sitesAssessed || 0}</span>
            </div>
            <div className="stat-card">
              <MapPin className="w-5 h-5 text-red-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.protectedAreas')}</span>
                <InfoTip>{t('biodiversity.protectedAreas')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">{stats.protectedAreaSites || 0}</span>
            </div>
            <div className="stat-card">
              <Ruler className="w-5 h-5 text-amber-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.totalLandArea')}</span>
                <InfoTip>{t('biodiversity.totalLandArea')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {(stats.totalLandArea || 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">{t('biodiversity.hectares')}</span>
              </span>
            </div>
            <div className="stat-card">
              <CheckCircle2 className="w-5 h-5 text-blue-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.assessmentCompletion')}</span>
                <InfoTip>{t('biodiversity.assessmentCompletion')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {stats.completionPct != null ? `${stats.completionPct.toFixed(0)}%` : '0%'}
              </span>
            </div>
          </div>

          {/* TNFD-LEAP Progress */}
          {leapProgress.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4">{t('biodiversity.tnfdLeap')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      {LEAP_PHASES.map((phase) => (
                        <th key={phase} className="text-center py-2 px-3 text-gray-500 font-medium">
                          {t(`biodiversity.${phase}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leapProgress.map((site, idx) => (
                      <tr key={site.siteId || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{site.siteName}</td>
                        {LEAP_PHASES.map((phase) => {
                          const status = site[phase]; // 'done', 'in-progress', 'not-started'
                          return (
                            <td key={phase} className="py-2 px-3 text-center">
                              {status === 'done' ? (
                                <span className="inline-flex w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900 items-center justify-center">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                </span>
                              ) : status === 'in-progress' ? (
                                <span className="inline-flex w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900 items-center justify-center">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                </span>
                              ) : (
                                <span className="inline-flex w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center">
                                  <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sensitive Sites */}
          {dataSites.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />
                {t('biodiversity.sensitiveSites')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('biodiversity.protectedAreas')}</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">{t('biodiversity.totalLandArea')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataSites.map((site, idx) => (
                      <tr key={site.id || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{site.name}</td>
                        <td className="py-2 px-3">
                          {site.nearProtectedArea ? (
                            <span className="badge bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1 inline" />
                              {site.protectedAreaName || t('biodiversity.protectedAreas')}
                            </span>
                          ) : (
                            <span className="text-gray-400">{'—'}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-gray-600 dark:text-gray-400">
                          {(site.landArea || 0).toLocaleString()} {t('biodiversity.hectares')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Assessments */}
          {assessments.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4">{t('biodiversity.assessments')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.status')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessments.map((a, idx) => (
                      <tr key={a.id || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{a.siteName || a.name}</td>
                        <td className="py-2 px-3">
                          <span className={clsx('badge text-xs', STATUS_BADGE[a.status] || STATUS_BADGE.draft)}>
                            {t(`biodiversity.${a.status}`) || a.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-500">
                          {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Direct Drivers Heatmap */}
          {Object.keys(drivers).length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4">{t('biodiversity.directDrivers')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      {DRIVER_KEYS.map((dk) => (
                        <th key={dk} className="text-center py-2 px-3 text-gray-500 font-medium text-xs">
                          {t(`biodiversity.${dk}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(drivers).map(([siteName, driverFlags]) => (
                      <tr key={siteName} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{siteName}</td>
                        {DRIVER_KEYS.map((dk) => (
                          <td key={dk} className="py-2 px-3 text-center">
                            {driverFlags[dk] ? (
                              <span className="inline-block w-4 h-4 rounded bg-red-400 dark:bg-red-600" title={t(`biodiversity.${dk}`)} />
                            ) : (
                              <span className="inline-block w-4 h-4 rounded bg-gray-100 dark:bg-gray-800" />
                            )}
                          </td>
                        ))}
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
