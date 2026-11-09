import { useAuth } from '../context/AuthContext';
import {
  hasFeature, requiredTierFor, normaliseTier, tierName, FEATURE_LABELS,
} from '../config/tierFeatures';

/**
 * Returns `{ allowed, tier, requiredTier, requiredTierName, featureLabel }`
 * for the given feature key.  Safe to call anywhere under <AuthProvider>.
 *
 *   const ai = useFeature('ai_doc_extract');
 *   if (!ai.allowed) return <FeatureLock feature="ai_doc_extract" />;
 */
export default function useFeature(featureKey) {
  const { user } = useAuth();
  const tier = normaliseTier(user?.company?.tier);
  const allowed = hasFeature(tier, featureKey);
  const requiredTier = allowed ? null : requiredTierFor(featureKey);
  return {
    allowed,
    tier,
    tierLabel: tierName(tier),
    requiredTier,
    requiredTierName: requiredTier ? tierName(requiredTier) : null,
    featureLabel: FEATURE_LABELS[featureKey] || featureKey,
  };
}

/** Read-only helper: returns the current tier string. */
export function useTier() {
  const { user } = useAuth();
  return normaliseTier(user?.company?.tier);
}
