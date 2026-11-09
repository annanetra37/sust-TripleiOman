import { useTheme } from '../context/ThemeContext';

export function LogoMark({ className = 'w-12 h-12' }) {
  let dark = false;
  try { const theme = useTheme(); dark = theme.dark; } catch {}
  return <img src={dark ? '/logo-white.svg' : '/logo.svg'} alt="Triple I" className={className} />;
}

export function LogoFull({ className = '', size = 'default' }) {
  let dark = false;
  try { const theme = useTheme(); dark = theme.dark; } catch {}
  const sizes = {
    default: { img: 'w-10 h-10', title: 'text-[17px]', sub: 'text-[11px]' },
    large: { img: 'w-14 h-14', title: 'text-[24px]', sub: 'text-[13px]' },
  };
  const s = sizes[size] || sizes.default;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img src={dark ? '/logo-white.svg' : '/logo.svg'} alt="Triple I" className={s.img} />
      <div className="flex flex-col">
        <span className={`font-bold ${s.title} tracking-[0.2em] leading-tight text-gray-900 dark:text-white`}>
          TRIPLE I
        </span>
        <span className={`${s.sub} font-medium tracking-widest text-brand-600 dark:text-brand-400`}>
          ESG PORTAL
        </span>
      </div>
    </div>
  );
}

export function LogoIcon({ className = 'w-8 h-8' }) {
  let dark = false;
  try { const theme = useTheme(); dark = theme.dark; } catch {}
  return <img src={dark ? '/logo-white.svg' : '/logo.svg'} alt="Triple I" className={className} />;
}
