import { useState, useRef, useEffect } from 'react';
import { Info, X } from 'lucide-react';
import clsx from 'clsx';

/**
 * InfoTip — contextual help icon with expandable tooltip.
 *
 * Usage:
 *   <InfoTip>This field controls...</InfoTip>
 *   <InfoTip title="What is this?">Detailed explanation here.</InfoTip>
 *   <InfoTip variant="warning">Be careful with this action.</InfoTip>
 */
export function InfoTip({ children, title, variant = 'info', className, size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const colors = {
    info: { icon: 'text-blue-400 hover:text-blue-600', bg: 'bg-blue-50 border-blue-200', title: 'text-blue-900', text: 'text-blue-700' },
    warning: { icon: 'text-amber-400 hover:text-amber-600', bg: 'bg-amber-50 border-amber-200', title: 'text-amber-900', text: 'text-amber-700' },
    success: { icon: 'text-emerald-400 hover:text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', title: 'text-emerald-900', text: 'text-emerald-700' },
  };

  const c = colors[variant];
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <span className={clsx('relative inline-flex items-center', className)} ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        className={clsx('rounded-full transition-colors focus:outline-none', c.icon)}
        aria-label="More info"
      >
        <Info className={iconSize} />
      </button>
      {open && (
        <div className={clsx(
          'absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 rounded-lg border p-3 shadow-lg',
          c.bg
        )}>
          {title && <p className={clsx('font-semibold text-xs mb-1', c.title)}>{title}</p>}
          <p className={clsx('text-xs leading-relaxed', c.text)}>{children}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className={clsx('w-2 h-2 rotate-45 border-b border-r', c.bg)} />
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * HelpBanner — dismissible contextual help banner for page-level guidance.
 *
 * Usage:
 *   <HelpBanner id="s1-upload" title="How to upload">
 *     Step-by-step instructions...
 *   </HelpBanner>
 */
export function HelpBanner({ id, title, children, variant = 'info', steps }) {
  const storageKey = `help-dismissed-${id}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === 'true');

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, 'true');
    setDismissed(true);
  };

  const colors = {
    info: 'bg-blue-50 border-blue-200',
    tip: 'bg-purple-50 border-purple-200',
    warning: 'bg-amber-50 border-amber-200',
  };
  const textColors = {
    info: { title: 'text-blue-900', text: 'text-blue-700', step: 'text-blue-600' },
    tip: { title: 'text-purple-900', text: 'text-purple-700', step: 'text-purple-600' },
    warning: { title: 'text-amber-900', text: 'text-amber-700', step: 'text-amber-600' },
  };

  const c = textColors[variant];

  return (
    <div className={clsx('rounded-xl border p-4 relative', colors[variant])}>
      <button onClick={dismiss} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <Info className={clsx('w-5 h-5 shrink-0 mt-0.5', c.step)} />
        <div className="pr-6">
          {title && <h4 className={clsx('font-semibold text-sm mb-1', c.title)}>{title}</h4>}
          {children && <p className={clsx('text-xs leading-relaxed', c.text)}>{children}</p>}
          {steps && (
            <ol className={clsx('text-xs mt-2 space-y-1 list-decimal list-inside', c.text)}>
              {steps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * FieldLabel — form label with optional info tooltip.
 *
 * Usage:
 *   <FieldLabel label="Email" info="We'll send a verification code to this address." required />
 */
export function FieldLabel({ label, info, required, htmlFor }) {
  return (
    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1" htmlFor={htmlFor}>
      {label}
      {required && <span className="text-red-400">*</span>}
      {info && <InfoTip>{info}</InfoTip>}
    </label>
  );
}
