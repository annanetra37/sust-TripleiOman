import { useState } from 'react';
import { Lock, Send, CheckCircle, Loader2 } from 'lucide-react';
import TierBadge from './TierBadge';
import useFeature from '../hooks/useFeature';
import api from '../services/api';

/**
 * Renders a locked-feature upsell panel.  Two variants:
 *
 *   <FeatureLock feature="ai_doc_extract" />
 *     → full-card panel with a big lock icon, the feature label, an upgrade
 *       request form (plan selector + optional message + send), and a
 *       post-submit success state.  Use this to replace the body of a page
 *       or tab when the user isn't entitled.
 *
 *   <FeatureLock feature="ai_doc_extract" variant="inline" />
 *     → small inline badge (lock icon + tier pill) — use this next to a
 *       menu item or button.
 *
 * Wraps useFeature() so callers only need to pass the feature key.
 */
export default function FeatureLock({
  feature,
  variant = 'card',
  title,
  description,
  className = '',
}) {
  const { allowed, requiredTier, requiredTierName, featureLabel, tierLabel } = useFeature(feature);
  const [desiredTier, setDesiredTier] = useState(requiredTier || 'PROFESSIONAL');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (allowed) return null;

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <Lock className="w-3 h-3 text-gray-400" />
        <TierBadge tier={requiredTier} size="sm" />
      </span>
    );
  }

  const handleSend = async () => {
    setSending(true);
    setError('');
    try {
      await api.requestUpgrade({ desiredTier, feature, message: message.trim() || undefined });
      setSent(true);
    } catch (err) {
      setError(err.error || 'Could not send upgrade request. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className={`card text-center py-10 px-6 ${className}`}>
        <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          Request sent!
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
          Our team has been notified and will reach out to you shortly to discuss upgrading
          to the <strong>{desiredTier === 'ENTERPRISE' ? 'Enterprise' : 'Professional'}</strong> plan.
        </p>
      </div>
    );
  }

  return (
    <div className={`card text-center py-10 px-6 ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-100 to-amber-100 dark:from-brand-950 dark:to-amber-950 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-8 h-8 text-brand-600 dark:text-brand-400" />
      </div>
      <TierBadge tier={requiredTier} size="md" className="mb-3" />
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
        {title || `${featureLabel} is a ${requiredTierName} feature`}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
        {description ||
          `You're currently on the ${tierLabel} plan. Upgrade to ${requiredTierName} to unlock ${featureLabel.toLowerCase()} and the rest of the ${requiredTierName} feature set.`}
      </p>

      {/* Upgrade request form */}
      <div className="mt-6 max-w-sm mx-auto space-y-3 text-left">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Preferred plan
          </label>
          <select
            className="input"
            value={desiredTier}
            onChange={(e) => setDesiredTier(e.target.value)}
          >
            <option value="PROFESSIONAL">Professional</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Message <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            className="input min-h-[60px]"
            rows={2}
            placeholder="e.g., We need this for our Q3 reporting deadline..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {sending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
            : <><Send className="w-4 h-4" /> Send upgrade request</>
          }
        </button>
        <p className="text-[11px] text-gray-400 text-center">
          Our team will contact you within 1 business day.
        </p>
      </div>
    </div>
  );
}
