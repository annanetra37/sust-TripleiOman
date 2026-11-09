import { useEffect, useState, useRef } from 'react';
import { Coins, Loader2, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { useT } from '../i18n';

// Customer-facing breakdown label keys.  Any breakdown key not in this map is
// hidden from the UI — we never show USD amounts, model names, or internal
// flags like rowsUsedHeuristic to the user.
const BREAKDOWN_LABEL_KEYS = {
  fileCount: 'credits.documents',
  rowCount: 'credits.rows',
  sheetCount: 'credits.sheets',
  batches: 'credits.aiBatches',
  topicCount: 'credits.topicsSelected',
  topicsWithData: 'credits.topicsWithData',
  disclosuresWithData: 'credits.disclosuresWithData',
  disclosuresMissing: 'credits.disclosuresMissing',
  narrativeCount: 'credits.narrativeSections',
  year: 'credits.reportingYear',
  standard: 'credits.standard',
};

/**
 * Inline live preview of the credit cost for a pending action.
 *
 * Automatically fetches an estimate whenever `params` changes (debounced)
 * and renders it above the action button.  No clicks required — the user
 * sees the cost as soon as they pick files / topics.
 *
 * Props:
 *   action    — 'doc-extract' | 'excel-e1' | 'excel-s1' | 'report-gen'
 *   params    — object of params for the estimator; null/falsy ⇒ hidden
 *   label     — optional short label shown on the left
 *
 * The component exposes its current estimate back to the parent via the
 * onEstimate callback so the parent can disable the action button when
 * credits are insufficient.
 */
export default function CreditPreview({ action, params, label, onEstimate }) {
  const { t } = useT();
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!action || !params) {
      setEstimate(null);
      setError('');
      if (onEstimate) onEstimate(null);
      return;
    }

    // Debounce rapid updates (e.g. drag-and-drop multiple files)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const est = await api.estimateCredits({ action, params });
        setEstimate(est);
        if (onEstimate) onEstimate(est);
      } catch (err) {
        setError(err.error || err.message || 'Could not calculate estimated cost');
        setEstimate(null);
        if (onEstimate) onEstimate(null);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, JSON.stringify(params)]);

  if (!action || !params) return null;

  if (loading && !estimate) {
    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('credits.calculatingCost')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400">
        {t('credits.couldNotCalculate')}: {error}
      </div>
    );
  }

  if (!estimate) return null;

  const { credits, balance, sufficient, remainingAfter, breakdown = {} } = estimate;

  // Filter breakdown down to customer-safe fields only.
  const safeBreakdown = Object.entries(breakdown)
    .filter(([k]) => Object.prototype.hasOwnProperty.call(BREAKDOWN_LABEL_KEYS, k))
    .map(([k, v]) => [t(BREAKDOWN_LABEL_KEYS[k]), v]);

  return (
    <div className={`rounded-xl border p-4 ${
      sufficient
        ? 'bg-gradient-to-r from-brand-50 to-emerald-50 dark:from-brand-950 dark:to-emerald-950 border-brand-200/60 dark:border-brand-800/60'
        : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          sufficient ? 'bg-brand-100 dark:bg-brand-900' : 'bg-red-100 dark:bg-red-900'
        }`}>
          <Coins className={`w-5 h-5 ${sufficient ? 'text-brand-600 dark:text-brand-400' : 'text-red-600 dark:text-red-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${sufficient ? 'text-brand-700 dark:text-brand-400' : 'text-red-700 dark:text-red-400'}`}>
            {label || t('credits.estimatedCredits')}:{' '}
            <span className="text-lg font-bold">{credits.toLocaleString()}</span> {t('common.credits')}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <span>{t('credits.currentBalance')}: <strong className="text-gray-700 dark:text-gray-200">{balance.toLocaleString()}</strong></span>
            {sufficient ? (
              <span>{t('credits.afterThisAction')}: <strong className="text-emerald-700 dark:text-emerald-400">{remainingAfter.toLocaleString()}</strong></span>
            ) : (
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                <AlertTriangle className="w-3 h-3" />
                {t('credits.shortBy', { amount: (credits - balance).toLocaleString() })}
              </span>
            )}
          </div>
          {safeBreakdown.length > 0 && (
            <details className="mt-1.5">
              <summary className="text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                {t('credits.whatGoesIntoEstimate')}
              </summary>
              <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-300 bg-white/60 dark:bg-gray-900/60 rounded-lg p-2 space-y-0.5">
                {safeBreakdown.map(([label, v]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-gray-500">{label}</span>
                    <span className="truncate text-right">{typeof v === 'number' ? v.toLocaleString() : String(v)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
