import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  GitMerge,
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Filter,
  Sparkles,
  Plug,
  X,
  Info,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Rocket,
} from 'lucide-react';
import { HelpBanner } from '../components/HelpSystem';
import FeatureLock from '../components/FeatureLock';
import useFeature from '../hooks/useFeature';
import { useT } from '../i18n';

// ── Platform definitions ─────────────────────────────────────────────────────
const PLATFORMS = [
  { key: 'intelex', name: 'Intelex', desc: 'EHS & sustainability platform', standards: ['ISO 14001', 'ISO 45001', 'ISO 50001'] },
  { key: 'sphera', name: 'Sphera', desc: 'Integrated risk management', standards: ['ISO 14001', 'ISO 14064', 'ISO 45001'] },
  { key: 'cority', name: 'Cority', desc: 'EHS software suite', standards: ['ISO 14001', 'ISO 45001', 'ISO 9001'] },
  { key: 'enablon', name: 'Enablon', desc: 'Wolters Kluwer sustainability', standards: ['ISO 14001', 'ISO 50001', 'ISO 14064', 'ISO 27001'] },
  { key: 'generic', name: 'Generic', desc: 'Any ISO management system API', standards: ['ISO 14001', 'ISO 45001', 'ISO 50001', 'ISO 14064', 'ISO 9001', 'ISO 27001'] },
];

// ── Topic family keys used for grouping and colour coding ──────────────────
const TOPIC_FAMILIES = [
  { key: 'general', range: 'GRI 2' },
  { key: 'materialTopics', range: 'GRI 3' },
  { key: 'economic', range: 'GRI 201-207' },
  { key: 'environmental', range: 'GRI 301-306' },
  { key: 'social', range: 'GRI 401-414' },
  { key: 'product', range: 'GRI 416-418' },
];

function pctColor(pct) {
  if (pct > 70) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 30) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function barBg(pct) {
  if (pct > 70) return 'bg-emerald-500';
  if (pct >= 30) return 'bg-amber-500';
  return 'bg-red-500';
}

function statusBadge(status, t) {
  switch (status) {
    case 'COVERED':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3.5 h-3.5" /> {t('isoGri.covered')}
        </span>
      );
    case 'PARTIAL':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full">
          <AlertTriangle className="w-3.5 h-3.5" /> {t('isoGri.partial')}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded-full">
          <XCircle className="w-3.5 h-3.5" /> {t('isoGri.gap')}
        </span>
      );
  }
}

// ── Readiness donut (SVG) ──────────────────────────────────────────────────
function ReadinessDonut({ pct }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (c * (pct || 0)) / 100;
  const stroke = pct > 70 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444';

  return (
    <svg viewBox="0 0 128 128" className="w-36 h-36">
      <circle cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-gray-200 dark:text-gray-700" />
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 64 64)"
        className="transition-all duration-700"
      />
      <text x="64" y="58" textAnchor="middle" className="fill-gray-900 dark:fill-gray-100 text-2xl font-bold" fontSize="28" fontWeight="700">
        {pct != null ? `${Math.round(pct)}%` : '--'}
      </text>
      <text x="64" y="78" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" fontSize="10">
        readiness
      </text>
    </svg>
  );
}

// ── Connect Platform Modal ────────────────────────────────────────────────
function ConnectPlatformModal({ platform, onClose, onSuccess, t }) {
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }
  const [year] = useState(new Date().getFullYear());

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await api.testIsoConnection(platform.key, { apiUrl, apiKey });
      setMessage({ type: 'success', text: t('isoGri.connectionSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('isoGri.connectionFailed') });
    } finally {
      setTesting(false);
    }
  };

  const handleFetch = async () => {
    setFetching(true);
    setMessage(null);
    try {
      const res = await api.fetchIsoData(platform.key, { apiUrl, apiKey }, year);
      const count = res?.count ?? res?.records ?? 0;
      setMessage({ type: 'success', text: t('isoGri.fetchSuccess').replace('{count}', count) });
      if (onSuccess) onSuccess();
    } catch {
      setMessage({ type: 'error', text: t('isoGri.connectionFailed') });
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{platform.name}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('isoGri.apiUrl')}</label>
          <input
            type="text"
            className="input w-full"
            placeholder="https://api.example.com/v1"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('isoGri.apiKey')}</label>
          <input
            type="password"
            className="input w-full"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        {message && (
          <div
            className={`text-sm rounded-lg px-3 py-2 ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="flex gap-3">
          <button
            className="btn-primary inline-flex items-center gap-2 text-sm"
            disabled={testing || !apiUrl || !apiKey}
            onClick={handleTest}
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            {testing ? t('isoGri.testing') : t('isoGri.testConnection')}
          </button>
          <button
            className="btn-primary inline-flex items-center gap-2 text-sm"
            disabled={fetching || !apiUrl || !apiKey}
            onClick={handleFetch}
          >
            {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {fetching ? t('isoGri.fetching') : t('isoGri.fetchIngest')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Gap Drilldown Modal ───────────────────────────────────────────────────
function GapDrilldownModal({ row, onClose, t }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.getGriDrilldown(row.griCode);
        if (!cancelled) setDetail(data);
      } catch {
        // leave detail null
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [row.griCode]);

  const sources = detail?.isoDataSources || [];
  const rules = detail?.mappingRules || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6 space-y-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {t('isoGri.disclosureDetail')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              <span className="font-mono">{row.griCode}</span> &mdash; {row.griName}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Status badge */}
        <div>{statusBadge(row.status, t)}</div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : (
          <>
            {/* ISO Data Sources */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('isoGri.isoDataSources')}</h4>
              {sources.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('isoGri.noSourcesYet')}</p>
              ) : (
                <div className="space-y-2">
                  {sources.map((src, idx) => (
                    <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{src.isoStandard}</span>
                        {src.isoClause && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                            {src.isoClause}
                          </span>
                        )}
                        {src.coverageLevel && (
                          <span className="text-xs text-brand-600 dark:text-brand-400">
                            {t('isoGri.coverageLevel')}: {src.coverageLevel}
                          </span>
                        )}
                      </div>
                      {src.dataDescription && (
                        <p className="text-gray-600 dark:text-gray-400">{src.dataDescription}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mapping Rules */}
            {rules.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('isoGri.mappingRules')}</h4>
                <div className="space-y-2">
                  {rules.map((rule, idx) => (
                    <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm space-y-1">
                      <p className="text-gray-900 dark:text-gray-100">{rule.description || rule.rule || rule.name || '—'}</p>
                      {rule.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-medium">{t('isoGri.ruleNotes')}:</span> {rule.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Action (for gaps/partials) */}
            {(row.status === 'GAP' || row.status === 'PARTIAL') && row.recommendedAction && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('isoGri.recommendedAction')}</h4>
                <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{row.recommendedAction}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Close button */}
        <div className="flex justify-end pt-2">
          <button className="btn-primary text-sm" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rule Modal (Add / Edit) ───────────────────────────────────────────────
function RuleModal({ rule, onClose, onSaved, t }) {
  const isEdit = !!rule;
  const [form, setForm] = useState({
    isoStandard: rule?.isoStandard || '',
    isoClause: rule?.isoClause || '',
    griCode: rule?.griCode || '',
    coverageLevel: rule?.coverageLevel || 'FULL',
    notes: rule?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.updateIsoGriRule(rule.id, form);
      } else {
        await api.createIsoGriRule(form);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {isEdit ? t('isoGri.editRule') : t('isoGri.addRule')}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('isoGri.isoStandard')}</label>
            <input type="text" className="input w-full" placeholder="ISO 14001" value={form.isoStandard} onChange={set('isoStandard')} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('isoGri.isoClause')}</label>
            <input type="text" className="input w-full" placeholder="4.1" value={form.isoClause} onChange={set('isoClause')} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('isoGri.griCode')}</label>
            <input type="text" className="input w-full" placeholder="GRI 302-1" value={form.griCode} onChange={set('griCode')} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('isoGri.coverageLevel')}</label>
            <select className="input w-full" value={form.coverageLevel} onChange={set('coverageLevel')}>
              <option value="FULL">{t('isoGri.covered')}</option>
              <option value="PARTIAL">{t('isoGri.partial')}</option>
              <option value="NONE">{t('isoGri.gap')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('isoGri.notes')}</label>
            <textarea className="input w-full" rows={3} placeholder="Optional notes..." value={form.notes} onChange={set('notes')} />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary inline-flex items-center gap-2 text-sm" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isEdit ? t('common.save') : t('common.create')}
            </button>
            <button type="button" className="btn-primary inline-flex items-center gap-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" onClick={onClose}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Admin Rule Management Section ─────────────────────────────────────────
function AdminRuleManagement({ t, onRulesChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editRule, setEditRule] = useState(null); // null = closed, {} = add, {id, ...} = edit
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getIsoGriRules();
      setRules(Array.isArray(data) ? data : data.rules || []);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expanded && rules.length === 0) loadRules();
  }, [expanded, loadRules, rules.length]);

  const handleDelete = async (id) => {
    if (!window.confirm(t('isoGri.confirmDeleteRule'))) return;
    try {
      await api.deleteIsoGriRule(id);
      setMessage({ type: 'success', text: t('isoGri.ruleDeleted') });
      loadRules();
      if (onRulesChanged) onRulesChanged();
    } catch {
      setMessage({ type: 'error', text: 'Delete failed' });
    }
  };

  const handlePublish = async () => {
    if (!window.confirm(t('isoGri.confirmPublish'))) return;
    setPublishing(true);
    try {
      await api.publishRuleVersion();
      setMessage({ type: 'success', text: t('isoGri.versionPublished') });
      if (onRulesChanged) onRulesChanged();
    } catch {
      setMessage({ type: 'error', text: 'Publish failed' });
    } finally {
      setPublishing(false);
    }
  };

  const handleSaved = () => {
    setMessage({ type: 'success', text: editRule?.id ? t('isoGri.ruleUpdated') : t('isoGri.ruleAdded') });
    loadRules();
    if (onRulesChanged) onRulesChanged();
  };

  return (
    <div className="card space-y-4">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('isoGri.manageRules')}</h2>
      </button>

      {expanded && (
        <>
          {message && (
            <div
              className={`text-sm rounded-lg px-3 py-2 ${
                message.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <button
              className="btn-primary inline-flex items-center gap-2 text-sm"
              onClick={() => setEditRule({})}
            >
              <Plus className="w-4 h-4" />
              {t('isoGri.addRule')}
            </button>
            <button
              className="btn-primary inline-flex items-center gap-2 text-sm"
              disabled={publishing}
              onClick={handlePublish}
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {t('isoGri.publishVersion')}
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 pr-3">{t('isoGri.isoStandard')}</th>
                    <th className="pb-2 pr-3">{t('isoGri.isoClause')}</th>
                    <th className="pb-2 pr-3">{t('isoGri.griCode')}</th>
                    <th className="pb-2 pr-3">{t('isoGri.coverageLevel')}</th>
                    <th className="pb-2 pr-3">{t('isoGri.notes')}</th>
                    <th className="pb-2">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400 dark:text-gray-500">
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : (
                    rules.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2.5 pr-3 text-gray-900 dark:text-gray-100 text-xs font-medium">{r.isoStandard}</td>
                        <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300 text-xs font-mono">{r.isoClause}</td>
                        <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300 text-xs font-mono">{r.griCode}</td>
                        <td className="py-2.5 pr-3 text-xs">
                          {r.coverageLevel === 'FULL' && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t('isoGri.covered')}</span>}
                          {r.coverageLevel === 'PARTIAL' && <span className="text-amber-600 dark:text-amber-400 font-semibold">{t('isoGri.partial')}</span>}
                          {r.coverageLevel === 'NONE' && <span className="text-red-600 dark:text-red-400 font-semibold">{t('isoGri.gap')}</span>}
                          {!['FULL', 'PARTIAL', 'NONE'].includes(r.coverageLevel) && <span className="text-gray-500">{r.coverageLevel || '—'}</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 text-xs max-w-[200px] truncate" title={r.notes}>
                          {r.notes || '—'}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              onClick={() => setEditRule(r)}
                              title={t('isoGri.editRule')}
                            >
                              <Pencil className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                            </button>
                            <button
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                              onClick={() => handleDelete(r.id)}
                              title={t('isoGri.deleteRule')}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {editRule !== null && (
            <RuleModal
              rule={editRule.id ? editRule : null}
              onClose={() => setEditRule(null)}
              onSaved={handleSaved}
              t={t}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function IsoGriBridge() {
  const { t } = useT();
  const { user } = useAuth();
  const isoFeature = useFeature('iso_gri_bridge');
  const fileRef = useRef();

  if (!isoFeature.allowed) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <GitMerge className="w-6 h-6 text-brand-600" /> {t('isoGri.title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('isoGri.subtitle')}</p>
        </div>
        <FeatureLock feature="iso_gri_bridge" />
      </div>
    );
  }

  // Data state
  const [readiness, setReadiness] = useState(null);
  const [gaps, setGaps] = useState([]);
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState('');

  // Filter state
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [familyFilter, setFamilyFilter] = useState('ALL');

  // Platform connector modal
  const [connectPlatform, setConnectPlatform] = useState(null);

  // Gap drilldown modal
  const [drilldownRow, setDrilldownRow] = useState(null);

  // ── Load readiness + gaps ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, g] = await Promise.all([
        api.getGriReadiness(),
        api.getGriGaps(),
      ]);
      setReadiness(r);
      setGaps(Array.isArray(g) ? g : g.gaps || []);
      setHasData(Array.isArray(g) ? g.length > 0 : (g.gaps || []).length > 0);
    } catch {
      // API may 404 if no data yet — that's fine
      setHasData(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── File upload ────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.uploadIsoData(fd);
      setFile(null);
    } catch (err) {
      setError(err.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── Classify ───────────────────────────────────────────────────────────
  const handleClassify = async () => {
    setError('');
    setClassifying(true);
    try {
      await api.classifyIsoData();
      await loadData();
    } catch (err) {
      setError(err.error || 'Classification failed');
    } finally {
      setClassifying(false);
    }
  };

  // ── Filtered gaps ──────────────────────────────────────────────────────
  const filtered = gaps.filter((g) => {
    if (statusFilter !== 'ALL' && g.status !== statusFilter) return false;
    if (familyFilter !== 'ALL' && g.family !== familyFilter) return false;
    return true;
  });

  // ── Readiness breakdown (from API or derived) ─────────────────────────
  const breakdown = readiness?.breakdown || {};
  const overallPct = readiness?.overall ?? null;

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <GitMerge className="w-6 h-6 text-brand-600 dark:text-brand-400" />
          {t('isoGri.title')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('isoGri.subtitle')}</p>
      </div>

      {!hasData ? (
        /* ── Empty State ────────────────────────────────────────────────── */
        <div className="card text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-950 flex items-center justify-center mx-auto">
            <GitMerge className="w-8 h-8 text-brand-600 dark:text-brand-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('isoGri.noDataYet')}</h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-lg mx-auto text-sm">
            {t('isoGri.noDataDesc')}
          </p>

          {/* Inline upload CTA */}
          <div className="pt-4">
            <div
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 max-w-md mx-auto hover:border-brand-400 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); }}
            >
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setFile(e.target.files[0])}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-green-500" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                    <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">{t('isoGri.dropFile')}</p>
                </>
              )}
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
            {file && (
              <button
                className="btn-primary mt-4 inline-flex items-center gap-2"
                disabled={uploading}
                onClick={handleUpload}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {t('isoGri.startUpload')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ── Readiness Score Card ───────────────────────────────────── */}
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">{t('isoGri.readinessScore')}</h2>
            <div className="flex flex-col md:flex-row gap-8 items-center">
              {/* Big donut */}
              <div className="text-center shrink-0">
                <ReadinessDonut pct={overallPct} />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mt-2">{t('isoGri.overallReadiness')}</p>
              </div>

              {/* Horizontal bars */}
              <div className="flex-1 w-full space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('isoGri.topicBreakdown')}</h3>
                {TOPIC_FAMILIES.map((fam) => {
                  const val = breakdown[fam.key] ?? 0;
                  return (
                    <div key={fam.key} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-44 shrink-0 truncate">{t(`isoGri.${fam.key}`)} ({fam.range})</span>
                      <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${barBg(val)}`} style={{ width: `${val}%` }} />
                      </div>
                      <span className={`text-xs font-bold w-10 text-right ${pctColor(val)}`}>{Math.round(val)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Upload + Classify ─────────────────────────────────────── */}
          <div className="card space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('isoGri.uploadIsoData')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('isoGri.uploadDesc')}</p>

            <div
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-brand-400 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); }}
            >
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setFile(e.target.files[0])}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-green-500" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                    <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">{t('isoGri.dropFile')}</p>
                </>
              )}
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex gap-3 flex-wrap">
              {file && (
                <button
                  className="btn-primary inline-flex items-center gap-2"
                  disabled={uploading}
                  onClick={handleUpload}
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {t('isoGri.startUpload')}
                </button>
              )}
              <button
                className="btn-primary inline-flex items-center gap-2"
                disabled={classifying}
                onClick={handleClassify}
              >
                {classifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {classifying ? t('isoGri.classifying') : t('isoGri.classifyAnalyze')}
              </button>
            </div>
          </div>

          {/* ── Platform Connectors ───────────────────────────────────── */}
          <div className="card space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('isoGri.connectPlatform')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('isoGri.connectPlatformDesc')}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PLATFORMS.map((plat) => (
                <div
                  key={plat.key}
                  className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3 hover:border-brand-400 dark:hover:border-brand-500 transition-colors"
                >
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{plat.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{plat.desc}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('isoGri.supportedStandards')}</p>
                    <div className="flex flex-wrap gap-1">
                      {plat.standards.map((std) => (
                        <span
                          key={std}
                          className="text-[10px] font-medium bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 px-1.5 py-0.5 rounded"
                        >
                          {std}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    className="btn-primary w-full inline-flex items-center justify-center gap-2 text-sm"
                    onClick={() => setConnectPlatform(plat)}
                  >
                    <Plug className="w-4 h-4" />
                    {t('isoGri.connect')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Gap Analysis Table ────────────────────────────────────── */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('isoGri.gapAnalysis')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('isoGri.gapAnalysisDesc')}</p>
              </div>

              <a
                href={api.exportGriGapReport()}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                {t('isoGri.exportGapReport')}
              </a>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap items-center">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                className="input w-auto text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">{t('isoGri.allStatuses')}</option>
                <option value="COVERED">{t('isoGri.covered')}</option>
                <option value="PARTIAL">{t('isoGri.partial')}</option>
                <option value="GAP">{t('isoGri.gap')}</option>
              </select>
              <select
                className="input w-auto text-sm"
                value={familyFilter}
                onChange={(e) => setFamilyFilter(e.target.value)}
              >
                <option value="ALL">{t('isoGri.griTopicFamilies')}</option>
                {TOPIC_FAMILIES.map((f) => (
                  <option key={f.key} value={f.key}>{t(`isoGri.${f.key}`)}</option>
                ))}
              </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 pr-3">{t('common.status')}</th>
                    <th className="pb-2 pr-3">{t('isoGri.griCode')}</th>
                    <th className="pb-2 pr-3">{t('isoGri.griName')}</th>
                    <th className="pb-2 pr-3">{t('isoGri.isoSources')}</th>
                    <th className="pb-2">{t('isoGri.recommendedAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-gray-400 dark:text-gray-500">
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row, idx) => (
                      <tr
                        key={row.griCode || idx}
                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                        onClick={() => setDrilldownRow(row)}
                      >
                        <td className="py-2.5 pr-3">{statusBadge(row.status, t)}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.griCode}</td>
                        <td className="py-2.5 pr-3 text-gray-900 dark:text-gray-100">{row.griName}</td>
                        <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 text-xs">
                          {Array.isArray(row.isoSources) ? row.isoSources.join(', ') : row.isoSources || '—'}
                        </td>
                        <td className="py-2.5 text-gray-500 dark:text-gray-400 text-xs">{row.recommendedAction || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Admin: Manage Rules ──────────────────────────────────── */}
          {user?.role === 'ADMIN' && (
            <AdminRuleManagement t={t} onRulesChanged={loadData} />
          )}
        </>
      )}

      {/* ── Connect Platform Modal ──────────────────────────────────────── */}
      {connectPlatform && (
        <ConnectPlatformModal
          platform={connectPlatform}
          onClose={() => setConnectPlatform(null)}
          onSuccess={() => loadData()}
          t={t}
        />
      )}

      {/* ── Gap Drilldown Modal ─────────────────────────────────────────── */}
      {drilldownRow && (
        <GapDrilldownModal
          row={drilldownRow}
          onClose={() => setDrilldownRow(null)}
          t={t}
        />
      )}
    </div>
  );
}
