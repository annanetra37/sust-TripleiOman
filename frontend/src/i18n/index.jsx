import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dict } from './dict';

const Ctx = createContext(null);
const KEY = 'tio_lang';

function initial() {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'ar' || s === 'en') return s;
  } catch { /* ignore */ }
  return (navigator.language || '').startsWith('ar') ? 'ar' : 'en';
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initial);
  const [digits, setDigits] = useState('western');
  const [hijri, setHijri] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = lang === 'ar' ? 'تريبل آي عُمان — الامتثال الضريبي' : 'Triple i Oman — Tax Compliance';
  }, [lang]);

  const setLang = useCallback((l) => { setLangState(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } }, []);
  /** Inline bilingual string: L('English', 'العربية'). */
  const L = useCallback((en, ar) => (lang === 'ar' && ar ? ar : en), [lang]);
  /** Dictionary lookup for shared UI terms. */
  const t = useCallback((key) => dict[key]?.[lang] || dict[key]?.en || key, [lang]);
  const locale = lang === 'ar' ? (digits === 'arabic' ? 'ar-OM-u-nu-arab' : 'ar-OM-u-nu-latn') : 'en-GB';

  const value = useMemo(() => ({ lang, setLang, L, t, locale, digits, setDigits, hijri, setHijri, rtl: lang === 'ar' }), [lang, setLang, L, t, locale, digits, hijri]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
