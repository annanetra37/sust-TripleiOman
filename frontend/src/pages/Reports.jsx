import { useState, useEffect } from 'react';
import api from '../services/api';
import { FileText, Download, Loader2, CheckCircle, XCircle, AlertTriangle, Info, Upload, Lock } from 'lucide-react';
import { HelpBanner, FieldLabel } from '../components/HelpSystem';
import ProcessingScreen from '../components/ProcessingScreen';
import CreditPreview from '../components/CreditPreview';
import TierBadge from '../components/TierBadge';
import { useT } from '../i18n';

export default function Reports() {
  const { t } = useT();
  const [standards, setStandards] = useState([]);
  const [selectedStandard, setSelectedStandard] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [years, setYears] = useState([]);
  const [language, setLanguage] = useState('en');
  const [languages, setLanguages] = useState({});
  const [exportFormat, setExportFormat] = useState('pdf');
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [allTopics, setAllTopics] = useState(true);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [companyDescription, setCompanyDescription] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  // Live credit estimate populated by <CreditPreview/>
  const [reportEstimate, setReportEstimate] = useState(null);

  useEffect(() => {
    Promise.all([api.getStandards(), api.getLanguages(), api.getDataYears()]).then(([stds, langs, yrs]) => {
      setStandards(stds);
      setLanguages(langs);
      setYears(yrs.length > 0 ? yrs : [new Date().getFullYear()]);
      if (yrs.length > 0) setYear(yrs[0]);
      // Default to the first standard the user is actually entitled to
      const firstUnlocked = stds.find((s) => !s.locked) || stds[0];
      if (firstUnlocked) {
        setSelectedStandard(firstUnlocked.key);
        setSelectedTopics(firstUnlocked.topics.map((t) => t.key));
      }
    });
  }, []);

  const currentStandard = standards.find((s) => s.key === selectedStandard);

  const handleStandardChange = (key) => {
    const std = standards.find((s) => s.key === key);
    // Clicking a locked standard is a no-op — the button renders a lock badge
    // and a tooltip, so this is belt-and-braces against keyboard / edge cases.
    if (!std || std.locked) return;
    setSelectedStandard(key);
    setSelectedTopics(std.topics.map((t) => t.key));
    setAllTopics(true);
    setValidation(null);
    setGenerated(false);
  };

  const toggleTopic = (key) => {
    const next = selectedTopics.includes(key) ? selectedTopics.filter((t) => t !== key) : [...selectedTopics, key];
    setSelectedTopics(next);
    setAllTopics(next.length === currentStandard?.topics.length);
    setValidation(null);
  };

  const toggleAll = () => {
    if (allTopics) { setSelectedTopics([]); setAllTopics(false); }
    else { setSelectedTopics(currentStandard?.topics.map((t) => t.key) || []); setAllTopics(true); }
    setValidation(null);
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await api.validateReport({ year, standard: selectedStandard, topics: selectedTopics });
      setValidation(result);
      setShowValidation(true);
    } catch (err) { alert(err.error || t('reports.validationFailed')); }
    finally { setValidating(false); }
  };

  // Cost is shown inline via <CreditPreview/> alongside the validation
  // results.  Clicking Generate runs the action directly — the user has
  // already seen the cost above the button.
  const handleGenerate = async (withoutMissing = false) => {
    setGenerating(true);
    setGenerated(false);
    try {
      await api.generateReportV2({
        year, standard: selectedStandard, topics: selectedTopics,
        language, format: exportFormat, generateWithoutMissing: withoutMissing, companyDescription,
      });
      setGenerated(true);
    } catch (err) {
      alert(err.error || t('reports.reportGenFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const PILLAR_COLORS = {
    Environmental: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    Social: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
    Governance: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  };

  // If generating, show processing screen
  if (generating) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('reports.generatingReport')}</h1>
        <div className="card overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-emerald-500/5" />
          <div className="relative z-10 flex flex-col items-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center mb-6">
              <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('reports.buildingReport', { standard: selectedStandard, year })}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md">
              {t('reports.compilingDisclosures')}
            </p>
            <div className="mt-6 flex gap-3 text-xs text-gray-400">
              <span className="badge bg-brand-50 text-brand-600 dark:bg-brand-900 dark:text-brand-400">{selectedStandard}</span>
              <span className="badge bg-gray-100 text-gray-500 dark:bg-gray-800">{selectedTopics.length} {t('reports.topics')}</span>
              <span className="badge bg-gray-100 text-gray-500 dark:bg-gray-800">{year}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('reports.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('reports.subtitle')}</p>
      </div>

      {/* Success message */}
      {generated && (
        <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500 shrink-0" />
          <div>
            <p className="font-semibold text-green-800 dark:text-green-300">{t('reports.reportGenerated')}</p>
            <p className="text-sm text-green-600 dark:text-green-400">
              {t('reports.checkDownloads', { format: exportFormat === 'docx' ? t('reports.wordDocument') : 'PDF' })}
            </p>
          </div>
        </div>
      )}

      <HelpBanner id="reports-v2-guide" title={t('reports.howReportWorks')} variant="info">
        {t('reports.howReportWorksBody')}
      </HelpBanner>

      {/* Step 1: Standard */}
      <div className="card space-y-4">
        <FieldLabel label={t('reports.reportingStandard')} required info={t('reports.reportingStandardInfo')} />
        <div className="grid grid-cols-2 gap-3">
          {standards.map((s) => (
            <button
              key={s.key}
              onClick={() => handleStandardChange(s.key)}
              disabled={s.locked}
              title={s.locked ? t('dashboard.upgradeToUnlock', { key: s.key }) : undefined}
              className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                s.locked
                  ? 'border-gray-200 dark:border-gray-800 opacity-60 cursor-not-allowed'
                  : selectedStandard === s.key
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 ring-1 ring-brand-400'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm">{s.key}</p>
                {s.locked && (
                  <span className="flex items-center gap-1 shrink-0">
                    <Lock className="w-3 h-3 text-gray-400" />
                    <TierBadge tier={s.requiredTier} size="sm" />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{s.name}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.framework} {s.version}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Year + Language + Description */}
      <div className="card space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <FieldLabel label={t('reports.reportingYear')} required />
            <select className="input" value={year} onChange={(e) => { setYear(parseInt(e.target.value)); setValidation(null); }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel label={t('reports.language')} />
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {Object.entries(languages).map(([code, info]) => {
                // Backend returns { name, locked, requiredTier } per language.
                const name = typeof info === 'string' ? info : info.name;
                const locked = typeof info === 'object' && info.locked;
                return (
                  <option key={code} value={code} disabled={locked}>
                    {name}{locked ? `  —  ${t('dashboard.professionalPlan')}` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <FieldLabel label={t('reports.companyDescription')} info={t('reports.companyDescInfo')} />
            <input className="input" placeholder={t('reports.companyDescPlaceholder')} value={companyDescription} onChange={(e) => setCompanyDescription(e.target.value)} />
          </div>
        </div>

        {/* Export format selection */}
        <div>
          <FieldLabel label={t('reports.exportFormat')} required info={t('reports.exportFormatInfo')} />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setExportFormat('pdf')}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                exportFormat === 'pdf'
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 ring-1 ring-brand-400'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-500" />
                <p className="font-semibold text-sm">{t('reports.pdfDocument')}</p>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{t('reports.pdfDesc')}</p>
            </button>
            <button
              type="button"
              onClick={() => setExportFormat('docx')}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                exportFormat === 'docx'
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 ring-1 ring-brand-400'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <p className="font-semibold text-sm">{t('reports.wordDocument')}</p>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{t('reports.wordDesc')}</p>
            </button>
          </div>
        </div>
      </div>

      {/* Step 3: Topics */}
      {currentStandard && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <FieldLabel label={t('reports.reportTopics')} required info={t('reports.reportTopicsInfo')} />
            <button onClick={toggleAll} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
              {allTopics ? t('reports.deselectAll') : t('reports.selectAll')}
            </button>
          </div>
          <div className="space-y-2">
            {currentStandard.topics.map((t) => (
              <label key={t.key} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedTopics.includes(t.key) ? 'border-brand-400 bg-brand-50/50 dark:bg-brand-950/30' : 'border-gray-200 dark:border-gray-700'}`}>
                <input type="checkbox" className="w-4 h-4 rounded accent-brand-600" checked={selectedTopics.includes(t.key)} onChange={() => toggleTopic(t.key)} />
                <div className="flex-1">
                  <p className="font-medium text-sm">{t.code} — {t.name}</p>
                </div>
                <span className={`badge text-[10px] ${PILLAR_COLORS[t.pillar] || 'bg-gray-100'}`}>{t.pillar}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Validate */}
      <button onClick={handleValidate} disabled={validating || selectedTopics.length === 0} className="btn-secondary w-full flex items-center justify-center gap-2">
        {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        {validating ? t('reports.checkingCoverage') : t('reports.validateCoverage')}
      </button>

      {/* Validation results */}
      {validation && showValidation && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('reports.dataCoverageReport')}</h3>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5">
            <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> {t('reports.dataAvailable')}</span>
            <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-500" /> {t('reports.missingData')}</span>
            <span className="flex items-center gap-1"><Info className="w-3.5 h-3.5 text-blue-500" /> {t('reports.narrativeAuto')}</span>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{validation.available.length}</p>
              <p className="text-[10px] text-green-600">{t('reports.dataAvailable')}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-700 dark:text-red-400">{validation.missing.length}</p>
              <p className="text-[10px] text-red-600">{t('reports.missingData')}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                {validation.topics.reduce((s, t) => s + t.disclosures.filter(d => d.isNarrative).length, 0)}
              </p>
              <p className="text-[10px] text-blue-600">{t('reports.narrativeSections')}</p>
            </div>
          </div>

          {/* Topic details */}
          {validation.topics.map((topic) => (
            <div key={topic.key} className="border dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 font-semibold text-sm flex items-center gap-2">
                <span className={`badge text-[10px] ${PILLAR_COLORS[topic.pillar]}`}>{topic.pillar}</span>
                {topic.code} — {topic.name}
              </div>
              <div className="divide-y dark:divide-gray-700">
                {topic.disclosures.map((disc) => (
                  <div key={disc.code} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    {disc.hasData ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : disc.isNarrative ? (
                      <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}
                    <span className="font-mono text-gray-400 w-14 shrink-0">{disc.code}</span>
                    <span className="flex-1 text-gray-700 dark:text-gray-300">{disc.name}</span>
                    {disc.hasData && <span className="text-green-600 font-medium">{disc.count} {t('reports.records')}</span>}
                    {disc.isNarrative && <span className="text-blue-400">{t('reports.autoGenerated')}</span>}
                    {!disc.hasData && !disc.isNarrative && <span className="text-red-500">{t('reports.noData')}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Inline credit preview — shown above the Generate button so the
              user sees exactly what this report will cost before clicking */}
          <CreditPreview
            action="report-gen"
            params={{ year, standard: selectedStandard, topics: selectedTopics }}
            label={t('reports.generatingCostLabel', { standard: selectedStandard })}
            onEstimate={setReportEstimate}
          />

          {/* Generate */}
          <div className="space-y-2 pt-2">
            {validation.missing.length === 0 ? (
              <button
                onClick={() => handleGenerate(false)}
                disabled={generating || (reportEstimate && !reportEstimate.sufficient)}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                {reportEstimate && !reportEstimate.sufficient
                  ? t('reports.insufficientCreditsNeed', { amount: reportEstimate.credits.toLocaleString() })
                  : reportEstimate
                    ? t('reports.generateFullReportCredits', { credits: reportEstimate.credits.toLocaleString() })
                    : t('reports.generateReport')}
              </button>
            ) : (
              <>
                <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
                  {t('reports.missingDisclosures', { count: validation.missing.length })}
                </div>
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={generating || (reportEstimate && !reportEstimate.sufficient)}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {reportEstimate && !reportEstimate.sufficient
                    ? t('reports.insufficientCreditsNeed', { amount: reportEstimate.credits.toLocaleString() })
                    : reportEstimate
                      ? t('reports.generateWithOmissionsCredits', { credits: reportEstimate.credits.toLocaleString(), count: validation.missing.length })
                      : t('reports.generateWithOmissionsCount', { count: validation.missing.length })}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
