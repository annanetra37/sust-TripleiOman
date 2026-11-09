import { Languages } from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';

export default function LangToggle({ persist = false, className = 'btn-ghost btn-sm' }) {
  const { lang, setLang } = useI18n();
  const next = lang === 'ar' ? 'en' : 'ar';
  return (
    <button type="button" className={className} onClick={() => { setLang(next); if (persist) api.patch('/auth/me', { locale: next }, { org: false }).catch(() => {}); }} aria-label="Switch language">
      <Languages className="h-4 w-4" />{next === 'ar' ? 'عربي' : 'English'}
    </button>
  );
}
