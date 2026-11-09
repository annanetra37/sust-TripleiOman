import { useEffect, useState, useCallback } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, Copy, Check } from 'lucide-react';
import { useI18n } from '../i18n';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true }) {
  return (
    <section className={clsx('card', !padded && 'p-0', className)}>
      {(title || actions) && (
        <div className={clsx('mb-4 flex items-center justify-between gap-3', !padded && 'px-5 pt-5')}>
          {title && <h2 className="text-base font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  gray: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  violet: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
};
export function Badge({ tone = 'gray', children, className }) {
  return <span className={clsx('badge', TONES[tone], className)}>{children}</span>;
}

const STATUS_TONE = {
  NOT_STARTED: 'gray', DATA_MISSING: 'amber', READY_FOR_REVIEW: 'blue', APPROVED: 'violet', SUBMITTED: 'green', PAID: 'green', ACKNOWLEDGED: 'green',
  DRAFT: 'gray', IN_REVIEW: 'blue', REJECTED: 'red', VALID: 'blue', INVALID: 'amber', SENT: 'green', ACCEPTED: 'green', DELIVERED: 'green', RECEIVED: 'blue',
  OPEN: 'amber', RESPONDED: 'green', OBJECTED: 'violet', CLOSED: 'gray', REQUESTED: 'amber', DENIED: 'red', REVOKED: 'gray',
};
export function StatusBadge({ status }) {
  const { t } = useI18n();
  return <Badge tone={STATUS_TONE[status] || 'gray'}>{t(status)}</Badge>;
}

export function Alert({ tone = 'info', title, children, className }) {
  const map = { info: ['bg-sky-50 border-sky-200 text-sky-900', Info], warn: ['bg-amber-50 border-amber-200 text-amber-900', AlertTriangle], error: ['bg-red-50 border-red-200 text-red-900', XCircle], success: ['bg-emerald-50 border-emerald-200 text-emerald-900', CheckCircle2] };
  const [cls, Icon] = map[tone];
  return (
    <div className={clsx('flex gap-3 rounded-lg border p-3 text-sm', cls, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{title && <div className="font-semibold">{title}</div>}{children}</div>
    </div>
  );
}

export function Spinner({ className }) { return <Loader2 className={clsx('h-5 w-5 animate-spin text-brand-700', className)} aria-label="loading" />; }
export function Loading() { const { t } = useI18n(); return <div className="flex items-center gap-2 p-8 text-slate-500"><Spinner />{t('loading')}</div>; }
export function Empty({ children, icon: Icon }) {
  const { t } = useI18n();
  return <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{Icon && <Icon className="h-8 w-8 text-slate-300" />}{children || t('none')}</div>;
}

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-10" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={clsx('w-full rounded-xl bg-white shadow-xl', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label="close"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      {tabs.map((tb) => (
        <button key={tb.id} type="button" role="tab" aria-selected={value === tb.id} onClick={() => onChange(tb.id)}
          className={clsx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', value === tb.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800')}>
          {tb.label}{tb.count !== undefined && <span className="ms-1.5 rounded-full bg-slate-100 px-1.5 text-xs">{tb.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ value, label }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-secondary btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(String(value)); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* ignore */ } }} aria-label={`copy ${label || value}`}>
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function Stat({ label, value, sub, tone, icon: Icon }) {
  return (
    <div className="card flex items-start gap-3">
      {Icon && <div className={clsx('rounded-lg p-2', tone === 'red' ? 'bg-red-50 text-red-600' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700')}><Icon className="h-5 w-5" /></div>}
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-0.5 truncate text-xl font-semibold num">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = 'brand' }) {
  const v = Math.max(0, Math.min(100, value));
  const c = tone === 'red' ? 'bg-accent-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-brand-600';
  return <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className={clsx('h-full rounded-full', c)} style={{ width: `${v}%` }} /></div>;
}

/** Small hook for async data with reload. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try { const data = await fn(); setState({ data, error: null, loading: false }); return data; } catch (error) { setState({ data: null, error, loading: false }); return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function ErrorText({ error }) {
  if (!error) return null;
  return (
    <Alert tone="error">
      {error.message || String(error)}
      {Array.isArray(error.details) && error.details.length > 0 && (
        <ul className="mt-1 list-disc ps-5">{error.details.slice(0, 8).map((d, i) => <li key={i}>{d.messageEn || d.message || JSON.stringify(d)}</li>)}</ul>
      )}
    </Alert>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
