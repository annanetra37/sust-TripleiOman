import { createContext, useContext, useState, useCallback } from 'react';
import en from './en.json';
import de from './de.json';
import fr from './fr.json';
import es from './es.json';
import sv from './sv.json';
import ar from './ar.json';

const TRANSLATIONS = { en, de, fr, es, sv, ar };
const SUPPORTED_LANGS = ['en', 'de', 'fr', 'es', 'sv', 'ar'];
const LANG_LABELS = { en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', sv: 'Svenska', ar: 'العربية' };
const STORAGE_KEY = 'triplei_lang';

function getInitialLang() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  const browser = navigator.language?.split('-')[0];
  if (browser && SUPPORTED_LANGS.includes(browser)) return browser;
  return 'en';
}

const LanguageContext = createContext({ lang: 'en', setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLang);

  const setLang = useCallback((newLang) => {
    if (SUPPORTED_LANGS.includes(newLang)) {
      setLangState(newLang);
      localStorage.setItem(STORAGE_KEY, newLang);
    }
  }, []);

  const t = useCallback((key, params) => {
    const keys = key.split('.');
    let value = TRANSLATIONS[lang];
    for (const k of keys) {
      if (value && typeof value === 'object') value = value[k];
      else { value = undefined; break; }
    }
    if (value === undefined) {
      let fallback = TRANSLATIONS.en;
      for (const k of keys) {
        if (fallback && typeof fallback === 'object') fallback = fallback[k];
        else { fallback = undefined; break; }
      }
      value = fallback ?? key;
    }
    if (typeof value === 'string' && params) {
      for (const [pk, pv] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${pk}\\}`, 'g'), pv);
      }
    }
    return value;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, supportedLangs: SUPPORTED_LANGS, langLabels: LANG_LABELS }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}

export { SUPPORTED_LANGS, LANG_LABELS };
