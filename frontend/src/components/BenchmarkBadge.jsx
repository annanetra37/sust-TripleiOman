import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Lock } from 'lucide-react';
import api from '../services/api';

/**
 * BenchmarkBadge — shows "vs peers" context on a dashboard KPI tile.
 *
 *   <BenchmarkBadge kpiCode="E1_INTENSITY" value={2.34} region="GLO" />
 *
 * Behaviour:
 *   - If the company has NOT opted in → renders a dim "Unlock peer
 *     benchmarks" affordance linking to Settings → Sector Pack.
 *   - If opted in but the cohort is below K_MIN (10) → renders a
 *     quiet "Not enough peers yet" message.
 *   - Otherwise renders "You're in the Xth percentile" with the
 *     cohort size.
 *
 * The component is self-contained — it fetches /api/benchmarks/peer
 * for the requested KPI and caches nothing (callers typically render
 * one per dashboard tile, so a re-fetch on remount is fine).
 */
export default function BenchmarkBadge({ kpiCode, value, region = 'GLO', className = '' }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const res = await api.getBenchmarkPeer({ kpiCode, value, region });
        if (!cancelled) setState({ loading: false, ...res });
      } catch (err) {
        if (!cancelled) setState({ loading: false, available: false, error: err.error || 'error' });
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [kpiCode, value, region]);

  if (state.loading) {
    return <span className={`text-[10px] text-gray-400 ${className}`}>Loading peer data...</span>;
  }

  if (!state.available && state.reason === 'not_opted_in') {
    return (
      <Link
        to="/settings?tab=sector"
        className={`inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-brand-600 transition-colors ${className}`}
      >
        <Lock className="w-3 h-3" /> Unlock peer benchmarks
      </Link>
    );
  }

  if (!state.available) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-gray-400 ${className}`}>
        <Users className="w-3 h-3" /> Not enough peers yet
      </span>
    );
  }

  // percentile framing — "better" direction depends on the KPI; here we
  // assume higher = better for positive KPIs (e.g. primary-data %) and
  // lower = better for emission KPIs.  Use color heuristics.
  const lowerIsBetter = /TCO2E|KGCO2E|EMISSION|INTENSITY/i.test(kpiCode);
  const goodness = lowerIsBetter ? 100 - state.percentile : state.percentile;
  const color = goodness >= 75 ? 'text-green-600 dark:text-green-400'
    : goodness >= 25 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${color} ${className}`}>
      <Users className="w-3 h-3" />
      {state.percentile}th percentile · {state.cohortSize} peers
    </span>
  );
}
