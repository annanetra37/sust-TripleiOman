import { useI18n } from '../i18n';

export function LogoMark({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#0f5132" />
      <rect x="14" y="20" width="7" height="30" rx="3.5" fill="#fff" />
      <rect x="28.5" y="20" width="7" height="30" rx="3.5" fill="#fff" />
      <rect x="43" y="20" width="7" height="30" rx="3.5" fill="#fff" />
      <circle cx="17.5" cy="12.5" r="3.5" fill="#db2c2c" />
      <circle cx="32" cy="12.5" r="3.5" fill="#db2c2c" />
      <circle cx="46.5" cy="12.5" r="3.5" fill="#db2c2c" />
    </svg>
  );
}

export default function Logo({ light = false, sub = true }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className={`font-semibold ${light ? 'text-white' : 'text-brand-900'}`}>{t('appName')}</div>
        {sub && <div className={`text-[11px] ${light ? 'text-brand-100' : 'text-slate-500'}`}>{t('tagline')}</div>}
      </div>
    </div>
  );
}
