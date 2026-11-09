import { useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useT } from '../i18n';
import {
  LayoutDashboard, Leaf, Users2, Building2, BarChart3, FileText, Settings,
  History, Database, ChevronDown, ChevronRight, LogOut, Menu, X, Globe, Shield, Target,
  Sun, Moon, GitBranch, Activity, Lock, TrendingUp, Truck, Languages, GitMerge, Compass
} from 'lucide-react';
import clsx from 'clsx';
import AssistantChat from './AssistantChat';
import { LogoFull } from './Logo';
import TierBadge from './TierBadge';
import { hasFeature, normaliseTier } from '../config/tierFeatures';

function buildNav(t) {
  return [
    { key: 'home', label: t('nav.home'), path: '/', icon: LayoutDashboard },
    { key: 'prepare', label: t('nav.whereToStart'), path: '/prepare', icon: Compass },
    { key: 'analytics', label: t('nav.analytics'), path: '/analytics', icon: BarChart3 },
    {
      key: 'environmental', label: t('nav.environmental'), icon: Leaf, color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/50', activeBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900',
      children: [
        { label: t('nav.climateEmissions'), path: '/dashboard/E/environmental-1' },
        { label: t('nav.buildingsEnergy'), path: '/buildings', feature: 'building_energy' },
        { label: t('nav.productCarbonFootprint'), path: '/pcf' },
        { label: t('nav.pollutionWaste'), path: '/coming-soon', badge: t('nav.soon') },
        { label: t('nav.waterResources'), path: '/dashboard/E/environmental-3' },
        { label: t('nav.biodiversity'), path: '/dashboard/E/environmental-4' },
        { label: t('nav.circularEconomy'), path: '/coming-soon', badge: t('nav.soon') },
      ],
    },
    {
      key: 'social', label: t('nav.social'), icon: Users2, color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/50', activeBg: 'bg-indigo-100 dark:bg-indigo-900/50',
      iconBg: 'bg-indigo-100 dark:bg-indigo-900',
      children: [
        { label: t('nav.workforceEmployees'), path: '/dashboard/S/social-1' },
        { label: t('nav.supplyChainLabor'), path: '/coming-soon', badge: t('nav.soon') },
        { label: t('nav.communityImpact'), path: '/coming-soon', badge: t('nav.soon') },
        { label: t('nav.consumerProtection'), path: '/coming-soon', badge: t('nav.soon') },
      ],
    },
    {
      key: 'governance', label: t('nav.governance'), icon: Shield, color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/50', activeBg: 'bg-amber-100 dark:bg-amber-900/50',
      iconBg: 'bg-amber-100 dark:bg-amber-900',
      children: [
        { label: t('nav.boardLeadership'), path: '/dashboard/G/governance-1' },
        { label: t('nav.ethicsCompliance'), path: '/dashboard/G/governance-2' },
      ],
    },
    { label: t('nav.sbtiTargets'), path: '/sbti-targets', icon: Target },
    { label: t('nav.reports'), path: '/reports', icon: FileText },
    { key: 'iso-gri', label: t('nav.isoGriBridge'), path: '/iso-gri', icon: GitMerge, feature: 'iso_gri_bridge' },
    { key: 'iso-bridge', label: t('nav.isoBridge'), path: '/iso-bridge', icon: GitMerge, feature: 'iso_bridge' },
    { label: t('nav.sustainabilityRoi'), path: '/roi', icon: TrendingUp, feature: 'sustainability_roi' },
    { label: t('nav.suppliers'), path: '/suppliers', icon: Truck },
    { label: t('nav.dataConnections'), path: '/connections', icon: Database, feature: 'db_connections' },
    { label: t('nav.dataLineage'), path: '/lineage', icon: GitBranch, feature: 'audit_lineage' },
    { label: t('nav.history'), path: '/history', icon: History },
    { label: t('nav.activityLog'), path: '/activity-log', icon: Activity, adminOnly: true },
    { label: t('nav.users'), path: '/users', icon: Users2, adminOnly: true },
    { label: t('nav.settings'), path: '/settings', icon: Settings },
  ];
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const { t, lang, setLang, supportedLangs } = useT();
  const location = useLocation();
  const navigate = useNavigate();
  // Start collapsed on phone-width screens so the sidebar doesn't cover the page.
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const [expanded, setExpanded] = useState({});
  const currentTier = normaliseTier(user?.company?.tier);
  const NAV = buildNav(t);

  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={clsx(
        'bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-200',
        sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
      )}>
        <Link to="/" className="block p-4 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <LogoFull />
        </Link>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV.map((item) => {
            if (item.adminOnly && user?.role !== 'ADMIN') return null;

            if (item.children) {
              const navKey = item.key || item.label;
              const isExpanded = expanded[navKey];
              const isActive = item.children.some((c) => location.pathname === c.path || (c.path !== '/' && c.path !== '/coming-soon' && location.pathname.startsWith(`${c.path}/`)));

              return (
                <div key={navKey} className="mt-1">
                  <button
                    onClick={() => toggle(navKey)}
                    className={clsx(
                      'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                      isActive || isExpanded
                        ? item.activeBg || 'bg-gray-100 dark:bg-gray-800'
                        : `hover:${item.bg || 'bg-gray-50 dark:bg-gray-800'} text-gray-700 dark:text-gray-300`,
                    )}
                  >
                    <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', item.iconBg)}>
                      <item.icon className={clsx('w-4 h-4', item.color)} />
                    </div>
                    <span className={clsx('flex-1 text-left', isActive ? 'text-gray-900 dark:text-white' : '')}>{item.label}</span>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>
                  {isExpanded && (
                    <div className="ml-5 mt-1 space-y-0.5 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                      {item.children.map((child) => (
                        <Link
                          key={child.path + child.label}
                          to={child.path}
                          className={clsx(
                            'block px-3 py-1.5 rounded-lg text-sm transition-colors',
                            location.pathname === child.path || (child.path === '/buildings' && location.pathname.startsWith('/buildings/'))
                              ? `${item.activeBg || 'bg-brand-50'} ${item.color} font-medium`
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                          )}
                        >
                          {child.label}
                          {child.feature && !hasFeature(currentTier, child.feature) && (
                            <Lock className="inline w-3 h-3 ml-1.5 text-gray-400" />
                          )}
                          {child.badge && (
                            <span className="ml-2 badge bg-gray-100 dark:bg-gray-700 text-gray-400 text-[10px]">{child.badge}</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const locked = item.feature && !hasFeature(currentTier, item.feature);
            return (
              <Link
                key={item.path}
                to={item.path}
                title={locked ? `Upgrade required to unlock ${item.label}` : undefined}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === item.path
                    ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100',
                  locked && 'opacity-60'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
                {locked && <Lock className="w-3 h-3 text-gray-400 shrink-0" />}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gray-500 truncate">{user?.company?.name}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-600 transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-4 shrink-0">
          <button onClick={() => setSidebarOpen((v) => !v)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-sm">
            {/* Language switcher dropdown */}
            <div className="relative">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="appearance-none bg-transparent text-[11px] font-bold uppercase text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer pr-4 pl-1 py-1 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                title="Language"
              >
                {supportedLangs.map((l) => (
                  <option key={l} value={l}>{l.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <TierBadge tier={currentTier} size="md" />
            <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              {user?.company?.creditBalance ?? 0} {t('common.credits')}
            </span>
            <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{user?.role}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
          <Outlet />
        </main>
      </div>

      {/* AI Assistant — available on all pages */}
      <AssistantChat />
    </div>
  );
}
