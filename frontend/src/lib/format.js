import { useI18n } from '../i18n';

export function useFormat() {
  const { locale, hijri, lang } = useI18n();
  const num = (v, min = 3, max = 3) => new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max }).format(Number(v || 0));
  /** baisa (integer) → "OMR 1,234.500" */
  const omr = (baisa, { sign = false } = {}) => {
    const n = Number(baisa || 0) / 1000;
    const s = num(Math.abs(n));
    const prefix = lang === 'ar' ? '' : 'OMR ';
    const suffix = lang === 'ar' ? ' ر.ع' : '';
    return `${n < 0 ? '−' : sign && n > 0 ? '+' : ''}${prefix}${s}${suffix}`;
  };
  const date = (v, opts = {}) => {
    if (!v) return '—';
    const d = new Date(v);
    const g = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC', ...opts }).format(d);
    if (!hijri) return g;
    try {
      const h = new Intl.DateTimeFormat(`${lang === 'ar' ? 'ar' : 'en'}-u-ca-islamic-umalqura`, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
      return `${g} · ${h}`;
    } catch { return g; }
  };
  const dateTime = (v) => (v ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)) : '—');
  const int = (v) => new Intl.NumberFormat(locale).format(Number(v || 0));
  const daysUntil = (v) => Math.round((new Date(v).setUTCHours(0, 0, 0, 0) - new Date().setUTCHours(0, 0, 0, 0)) / 86400000);
  return { omr, num, date, dateTime, int, daysUntil };
}

export const toOmrInput = (baisa) => (Number(baisa || 0) / 1000).toFixed(3);
export const isoDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
