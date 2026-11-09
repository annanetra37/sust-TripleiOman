import { normaliseTier, tierName } from '../config/tierFeatures';
import { Sparkles, Crown, Gem } from 'lucide-react';

/**
 * Compact visual badge for a subscription tier.
 * Props: tier (string), size ('sm'|'md'), className
 */
export default function TierBadge({ tier, size = 'sm', className = '' }) {
  const key = normaliseTier(tier);
  const name = tierName(key);

  const styles = {
    STARTER:      { bg: 'bg-gray-100 dark:bg-gray-800',       text: 'text-gray-700 dark:text-gray-300', Icon: Sparkles },
    PROFESSIONAL: { bg: 'bg-brand-100 dark:bg-brand-900',     text: 'text-brand-700 dark:text-brand-300', Icon: Crown },
    ENTERPRISE:   { bg: 'bg-amber-100 dark:bg-amber-900',     text: 'text-amber-700 dark:text-amber-300', Icon: Gem },
  };
  const s = styles[key];
  const pad = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';
  const iconSize = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${pad} ${s.bg} ${s.text} ${className}`}>
      <s.Icon className={iconSize} />
      {name}
    </span>
  );
}
