/** Date helpers. All tax dates are handled as UTC calendar dates (YYYY-MM-DD). */

function d(v) {
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === 'number') {
    // Excel serial date
    if (v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return new Date(v);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // DD/MM/YYYY (Oman convention)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${v}`);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

const iso = (date) => d(date).toISOString().slice(0, 10);
const addDays = (date, n) => new Date(d(date).getTime() + n * 86400000);
function addMonths(date, n) {
  const x = d(date);
  const day = x.getUTCDate();
  const r = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}
const endOfMonth = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0));
const daysBetween = (a, b) => Math.round((d(b) - d(a)) / 86400000);

/** Shift a due date that falls on a weekend/holiday to the next working day (plan E2-05). */
function shiftToWorkingDay(date, calendar) {
  let x = d(date);
  const weekend = calendar?.weekendDays || [5, 6];
  const holidays = new Set(calendar?.holidays || []);
  let guard = 0;
  while ((weekend.includes(x.getUTCDay()) || holidays.has(iso(x))) && guard++ < 30) x = addDays(x, 1);
  return x;
}

/** Approximate Hijri display using Intl (Umm al-Qura). Display only — never used for deadlines. */
function hijri(date, locale = 'en') {
  try {
    return new Intl.DateTimeFormat(`${locale === 'ar' ? 'ar' : 'en'}-u-ca-islamic-umalqura`, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d(date));
  } catch { return null; }
}

module.exports = { d, iso, addDays, addMonths, endOfMonth, daysBetween, shiftToWorkingDay, hijri };
