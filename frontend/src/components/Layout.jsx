import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard, CalendarClock, ArrowLeftRight, FileCheck2, Receipt, Users, Globe2, Building2, Wine, UserRound,
  FolderLock, Mail, Bot, ShieldCheck, UsersRound, Settings, Briefcase, Wrench, Bell, LogOut, Menu, X, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import Logo from './Logo';
import LangToggle from './LangToggle';
import { Badge } from './ui';

function useNav() {
  const { user, org, can } = useAuth();
  const groups = [
    { items: [{ to: '/app', icon: LayoutDashboard, key: 'dashboard', end: true }, { to: '/app/calendar', icon: CalendarClock, key: 'calendar' }] },
    { label: { en: 'Comply', ar: 'الامتثال' }, items: [
      { to: '/app/transactions', icon: ArrowLeftRight, key: 'transactions' },
      { to: '/app/returns', icon: FileCheck2, key: 'returns' },
      { to: '/app/einvoices', icon: Receipt, key: 'einvoicing' },
      { to: '/app/wht', icon: Globe2, key: 'wht' },
      { to: '/app/cit', icon: Building2, key: 'cit' },
      { to: '/app/excise', icon: Wine, key: 'excise' },
      { to: '/app/parties', icon: Users, key: 'parties' },
    ] },
    { label: { en: 'Records', ar: 'السجلات' }, items: [
      { to: '/app/documents', icon: FolderLock, key: 'documents' },
      { to: '/app/letters', icon: Mail, key: 'letters' },
      ...(can('audit.read') ? [{ to: '/app/audit', icon: ShieldCheck, key: 'audit' }] : []),
    ] },
    { label: { en: 'Help & people', ar: 'المساعدة والأشخاص' }, items: [
      { to: '/app/assistant', icon: Bot, key: 'assistant' },
      { to: '/app/team', icon: UsersRound, key: 'team' },
      ...((user?.memberships?.length || 0) > 1 || org?.isPractitionerFirm ? [{ to: '/app/clients', icon: Briefcase, key: 'clients' }] : []),
      { to: '/app/settings', icon: Settings, key: 'settings' },
    ] },
    { label: { en: 'Personal', ar: 'شخصي' }, items: [{ to: '/app/pit', icon: UserRound, key: 'pit' }] },
    ...(user?.platformRole ? [{ label: { en: 'Triple i Oman', ar: 'تريبل آي عُمان' }, items: [{ to: '/app/admin', icon: Wrench, key: 'admin' }] }] : []),
  ];
  return groups;
}

function OrgSwitcher() {
  const { user, org, switchOrg } = useAuth();
  const { L, t } = useI18n();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ms = user?.memberships || [];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-brand-700 bg-brand-900/40 px-3 py-2 text-start text-sm text-white hover:bg-brand-900/70">
        <span className="min-w-0">
          <span className="block truncate font-medium">{org ? (L(org.legalNameEn, org.legalNameAr || org.legalNameEn)) : L('No organisation', 'لا توجد منشأة')}</span>
          {org && <span className="block truncate text-[11px] text-brand-100">{t(org.myRole)}{org.actingAs ? ` · ${org.actingAs}` : ''}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div className="absolute inset-x-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-800 shadow-lg">
          {ms.map((m) => (
            <button key={m.organisation.id} type="button" className={clsx('block w-full px-3 py-2 text-start hover:bg-slate-50', m.organisation.id === org?.id && 'bg-brand-50 font-medium')}
              onClick={async () => { setOpen(false); await switchOrg(m.organisation.id); navigate('/app'); }}>
              <span className="block truncate">{L(m.organisation.legalNameEn, m.organisation.legalNameAr || m.organisation.legalNameEn)}</span>
              <span className="text-xs text-slate-500">{t(m.role)}</span>
            </button>
          ))}
          <button type="button" className="block w-full border-t border-slate-100 px-3 py-2 text-start text-brand-700 hover:bg-slate-50" onClick={() => { setOpen(false); navigate('/app/onboarding?new=1'); }}>
            + {L('Add organisation', 'إضافة منشأة')}
          </button>
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { L } = useI18n();
  const [data, setData] = useState({ rows: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const load = () => api.get('/notifications', { org: false }).then(setData).catch(() => {});
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, []);
  return (
    <div className="relative">
      <button type="button" className="btn-ghost btn-sm relative" onClick={() => setOpen((o) => !o)} aria-label={L('Notifications', 'الإشعارات')}>
        <Bell className="h-4 w-4" />
        {data.unread > 0 && <span className="absolute -top-0.5 end-0 rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">{data.unread}</span>}
      </button>
      {open && (
        <div className="absolute end-0 z-40 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm font-semibold">
            {L('Notifications', 'الإشعارات')}
            <button type="button" className="text-xs font-normal text-brand-700" onClick={async () => { await api.post('/notifications/read-all', {}, { org: false }); load(); }}>{L('Mark all read', 'تحديد الكل كمقروء')}</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {data.rows.length === 0 && <div className="p-4 text-sm text-slate-500">{L('You are all caught up.', 'لا توجد إشعارات جديدة.')}</div>}
            {data.rows.map((n) => (
              <button key={n.id} type="button" className={clsx('block w-full border-b border-slate-50 px-3 py-2 text-start text-sm hover:bg-slate-50', !n.readAt && 'bg-brand-50/50')}
                onClick={async () => { setOpen(false); await api.post(`/notifications/${n.id}/read`, {}, { org: false }); load(); if (n.link) navigate(n.link.startsWith('/app') ? n.link : `/app${n.link}`); }}>
                <div className="font-medium">{n.title}</div>
                <div className="line-clamp-2 text-xs text-slate-500">{n.body}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, org, logout } = useAuth();
  const { L, t } = useI18n();
  const groups = useNav();
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  useEffect(() => setMobile(false), [loc.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col gap-4 bg-brand-800 p-4 text-brand-50">
      <Logo light />
      <OrgSwitcher />
      <nav className="flex-1 space-y-4 overflow-y-auto pe-1" aria-label="main">
        {groups.map((g, i) => (
          <div key={i}>
            {g.label && <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-brand-200">{L(g.label.en, g.label.ar)}</div>}
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end}
                className={({ isActive }) => clsx('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm', isActive ? 'bg-white/15 font-medium text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white')}>
                <it.icon className="h-4 w-4 shrink-0" />{t(it.key)}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="rounded-lg bg-brand-900/50 p-3 text-xs text-brand-100">
        {L('We never ask for your TaxOman password. Nothing is submitted without a named approval.', 'لا نطلب كلمة مرور جهاز الضرائب أبداً. لا يُقدَّم شيء دون اعتماد شخص مسمّى.')}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{sidebar}</aside>
      {mobile && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="w-72 max-w-[85%]">{sidebar}</div>
          <button type="button" className="flex-1 bg-slate-900/40" onClick={() => setMobile(false)} aria-label="close menu" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost btn-sm lg:hidden" onClick={() => setMobile(true)} aria-label="menu">{mobile ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
            {org?.actingAs && <Badge tone="amber">{L('Acting as', 'بصفة')}: {org.actingAs}</Badge>}
            {user?.platformRole && <Badge tone="violet">{L('Staff', 'موظف')}</Badge>}
          </div>
          <div className="flex items-center gap-1">
            <LangToggle persist />
            <Notifications />
            <span className="hidden px-2 text-sm text-slate-600 sm:inline">{user?.fullName}</span>
            <button type="button" className="btn-ghost btn-sm" onClick={logout} aria-label={t('signOut')}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">{t('signOut')}</span></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
