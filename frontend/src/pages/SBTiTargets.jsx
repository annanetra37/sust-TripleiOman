import { useState, useEffect } from 'react';
import api from '../services/api';
import { Target, Plus, Trash2, TrendingDown, Calendar, Percent, Activity } from 'lucide-react';
import { HelpBanner, FieldLabel, InfoTip } from '../components/HelpSystem';
import { useT } from '../i18n';

export default function SBTiTargets() {
  const { t } = useT();

  const METHODS = [
    { value: 'absolute', label: t('sbti.absoluteContraction'), desc: t('sbti.absoluteContractionDesc') },
    { value: 'intensity', label: t('sbti.intensityBased'), desc: t('sbti.intensityBasedDesc') },
    { value: 'renewable_share', label: t('sbti.renewableShare'), desc: t('sbti.renewableShareDesc') },
  ];

  const SCOPES = [
    { value: 'Scope 1+2', label: t('sbti.scope12'), desc: t('sbti.scope12Desc') },
    { value: 'Scope 3', label: t('sbti.scope3'), desc: t('sbti.scope3Desc') },
    { value: 'All', label: t('sbti.allScopes'), desc: t('sbti.allScopesDesc') },
  ];

  const TIMEFRAMES = [
    { label: t('sbti.nearTerm'), desc: t('sbti.nearTermDesc') },
    { label: t('sbti.longTerm'), desc: t('sbti.longTermDesc') },
  ];

  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    baseYear: new Date().getFullYear() - 1,
    targetYear: new Date().getFullYear() + 7,
    method: 'absolute',
    reductionPct: 42,
    absoluteTarget: '',
    scope: 'Scope 1+2',
    description: '',
  });

  const load = () => {
    setLoading(true);
    api.getSBTiTargets().then(setTargets).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.createSBTiTarget(form);
      setShowCreate(false);
      setForm({ baseYear: new Date().getFullYear() - 1, targetYear: new Date().getFullYear() + 7, method: 'absolute', reductionPct: 42, absoluteTarget: '', scope: 'Scope 1+2', description: '' });
      load();
    } catch (err) {
      alert(err.error || t('sbti.createFailed'));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(t('sbti.deleteConfirm'))) return;
    await api.deleteSBTiTarget(id);
    load();
  };

  const selectedMethod = METHODS.find((m) => m.value === form.method);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('sbti.title')}</h1>
          <p className="text-gray-500">{t('sbti.subtitle')}</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> {t('sbti.newTarget')}
        </button>
      </div>

      <HelpBanner id="sbti-guide" title={t('sbti.helpTitle')} variant="info">
        {t('sbti.helpBody')}
      </HelpBanner>

      {/* Create target form */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" /> {t('sbti.setNewTarget')}
            </h2>

            {/* Timeframe info */}
            <div className="grid grid-cols-2 gap-3">
              {TIMEFRAMES.map((tf) => (
                <div key={tf.label} className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="font-medium text-purple-900 text-sm">{tf.label}</p>
                  <p className="text-xs text-purple-700 mt-0.5">{tf.desc}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label={t('sbti.baseYear')} required info={t('sbti.baseYearInfo')} />
                <input type="number" className="input" min="2010" max="2030" required value={form.baseYear}
                  onChange={(e) => setForm({ ...form, baseYear: e.target.value })} />
              </div>
              <div>
                <FieldLabel label={t('sbti.targetYear')} required info={t('sbti.targetYearInfo')} />
                <input type="number" className="input" min="2025" max="2060" required value={form.targetYear}
                  onChange={(e) => setForm({ ...form, targetYear: e.target.value })} />
              </div>
            </div>

            <div>
              <FieldLabel label={t('sbti.reductionMethod')} required info={t('sbti.reductionMethodInfo')} />
              <div className="space-y-2">
                {METHODS.map((m) => (
                  <label key={m.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.method === m.value ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="method" value={m.value} checked={form.method === m.value}
                      onChange={(e) => setForm({ ...form, method: e.target.value })} className="mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{m.label}</p>
                      <p className="text-xs text-gray-500">{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel label={t('sbti.scopeCoverage')} required info={t('sbti.scopeCoverageInfo')} />
              <div className="space-y-2">
                {SCOPES.map((s) => (
                  <label key={s.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.scope === s.value ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="scope" value={s.value} checked={form.scope === s.value}
                      onChange={(e) => setForm({ ...form, scope: e.target.value })} className="mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{s.label}</p>
                      <p className="text-xs text-gray-500">{s.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label={t('sbti.reductionPct')} info={t('sbti.reductionPctInfo')} />
                <div className="relative">
                  <input type="number" className="input pr-8" min="1" max="100" step="0.1" value={form.reductionPct}
                    onChange={(e) => setForm({ ...form, reductionPct: e.target.value })} />
                  <span className="absolute right-3 top-2.5 text-gray-400">%</span>
                </div>
                {form.baseYear && form.targetYear && form.reductionPct && (
                  <p className="text-xs text-gray-400 mt-1">
                    ≈ {(parseFloat(form.reductionPct) / (parseInt(form.targetYear) - parseInt(form.baseYear))).toFixed(1)}{t('sbti.perYear')}
                  </p>
                )}
              </div>
              <div>
                <FieldLabel label={t('sbti.absoluteTargetLabel')} info={t('sbti.absoluteTargetInfo')} />
                <input type="number" className="input" placeholder={t('common.optional')} value={form.absoluteTarget}
                  onChange={(e) => setForm({ ...form, absoluteTarget: e.target.value })} />
              </div>
            </div>

            <div>
              <FieldLabel label={t('common.description')} info={t('sbti.descriptionInfo')} />
              <textarea className="input" rows={2} placeholder={t('sbti.descriptionPlaceholder')}
                value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
              <button type="submit" className="btn-primary flex-1">{t('sbti.createTarget')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Existing targets */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">{t('common.loading')}</div>
      ) : targets.length === 0 ? (
        <div className="card text-center py-12">
          <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{t('sbti.noTargets')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('sbti.noTargetsHint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {targets.map((tgt) => {
            const methodInfo = METHODS.find((m) => m.value === tgt.method) || {};
            const yearSpan = tgt.targetYear - tgt.baseYear;
            const annualRate = tgt.reductionPct ? (tgt.reductionPct / yearSpan).toFixed(1) : '—';

            return (
              <div key={tgt.id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                      <Target className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{tgt.scope} — {methodInfo.label || tgt.method}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{tgt.description || t('sbti.reductionFromTo', { pct: tgt.reductionPct, from: tgt.baseYear, to: tgt.targetYear })}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(tgt.id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">{t('sbti.baseYear')}</p>
                      <p className="font-semibold">{tgt.baseYear}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">{t('sbti.targetYear')}</p>
                      <p className="font-semibold">{tgt.targetYear}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Percent className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">{t('sbti.totalReduction')}</p>
                      <p className="font-semibold">{tgt.reductionPct}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingDown className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">{t('sbti.annualRate')}</p>
                      <p className="font-semibold">{annualRate}{t('sbti.perYear')}</p>
                    </div>
                  </div>
                </div>

                {tgt.absoluteTarget && (
                  <div className="mt-3 p-2 bg-gray-50 rounded-lg text-sm text-gray-600">
                    {t('sbti.absoluteTargetBy', { amount: tgt.absoluteTarget.toLocaleString(), year: tgt.targetYear })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SBTi reference */}
      <div className="card bg-purple-50 border-purple-200">
        <h3 className="font-semibold text-purple-900 mb-2">{t('sbti.minRequirements')}</h3>
        <div className="grid grid-cols-2 gap-4 text-sm text-purple-700">
          <div>
            <p className="font-medium">{t('sbti.nearTermAligned')}</p>
            <ul className="text-xs mt-1 space-y-0.5 list-disc ml-4">
              <li>{t('sbti.scope12Requirement')}</li>
              <li>{t('sbti.scope3Requirement')}</li>
              <li>{t('sbti.targetYearRequirement')}</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">{t('sbti.longTermNetZero')}</p>
            <ul className="text-xs mt-1 space-y-0.5 list-disc ml-4">
              <li>{t('sbti.netzeroReduction')}</li>
              <li>{t('sbti.netzeroYear')}</li>
              <li>{t('sbti.netzeroRemaining')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
