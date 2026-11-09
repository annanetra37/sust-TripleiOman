import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Factory, TrendingUp, Users, Target, Upload, Download, Copy, FileSpreadsheet, FileImage } from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';
import CopyableChart from '../components/CopyableChart';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import OrgYearFilter from '../components/OrgYearFilter';
import SectorKpiTiles from '../components/SectorKpiTiles';
import { useT } from '../i18n';

const SCOPE_COLORS = { 'Scope 1': '#ef4444', 'Scope 2': '#f59e0b', 'Scope 3': '#3b82f6' };
const TREE_COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

export default function E1Dashboard() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), orgUnits: '' });
  const filterKey = `${filters.year}|${filters.orgUnits}`;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Fetch available years and use the best one, then load dashboard
    api.getDataYears().then((years) => {
      if (years.length > 0 && !years.includes(filters.year)) {
        setFilters((f) => ({ ...f, year: years[0] }));
      }
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    api.getE1Dashboard(filters).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [filterKey, ready]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
  if (!data) return <div className="text-center text-gray-500 py-12">{t('dashboard.noDataE1')}</div>;

  const { stats, charts } = data;
  const sbti = stats.sbtiProgress;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('dashboard.e1Title')}</h1>
          <p className="text-gray-500">{t('dashboard.e1Subtitle')}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link to="/platform/E/environmental-1" className="btn-primary flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" /> {t('dashboard.connectData')}
          </Link>
          <div className="flex gap-1.5">
            <button onClick={() => { window.print(); }} className="btn-secondary flex items-center justify-center gap-1.5 text-xs flex-1" title={t('dashboard.visualsButtonTitle')}>
              <FileImage className="w-3.5 h-3.5" /> {t('dashboard.visuals')}
            </button>
            <button onClick={() => api.exportE1Dashboard(filters)} className="btn-secondary flex items-center justify-center gap-1.5 text-xs flex-1" title={t('dashboard.dataButtonTitle')}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> {t('dashboard.data')}
            </button>
          </div>
          <p className="text-[9px] text-gray-400 text-center">{t('dashboard.visualsHint')}</p>
        </div>
      </div>

      <OrgYearFilter filters={filters} onChange={setFilters} />

      {/* Sector-specific KPIs (from active sector pack) */}
      <SectorKpiTiles year={filters.year} />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <Factory className="w-5 h-5 text-emerald-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('dashboard.totalGhg')}</span>
            <InfoTip>{t('dashboard.totalGhgTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.totalEmissions < 0.1 ? stats.totalEmissions.toFixed(4) : stats.totalEmissions.toFixed(2)} <span className="text-sm font-normal text-gray-400">tCO2e</span></span>
        </div>
        <div className="stat-card">
          <TrendingUp className="w-5 h-5 text-amber-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('dashboard.ghgIntensity')}</span>
            <InfoTip>{t('dashboard.ghgIntensityTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.intensity} <span className="text-sm font-normal text-gray-400">tCO2e/emp</span></span>
        </div>
        <div className="stat-card">
          <Factory className="w-5 h-5 text-orange-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('dashboard.totalEnergy')}</span>
            <InfoTip>{t('dashboard.totalEnergyTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.totalEnergyMwh > 0 ? stats.totalEnergyMwh.toFixed(2) : '0'} <span className="text-sm font-normal text-gray-400">MWh</span></span>
        </div>
        <div className="stat-card">
          <Target className="w-5 h-5 text-purple-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('dashboard.sbtiProgress')}</span>
            <InfoTip>{t('dashboard.sbtiProgressTooltip')}</InfoTip>
          </div>
          {sbti ? (
            <div>
              <span className="text-2xl font-bold">{sbti.progress}%</span>
              <span className={`ml-2 badge ${sbti.onTrack ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {sbti.onTrack ? t('dashboard.onTrack') : t('dashboard.offTrack')}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400">{t('dashboard.noTargetSet')}</span>
          )}
        </div>
      </div>

      {/* Scope breakdown + secondary KPIs */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">{t('dashboard.scope1')}</span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.scope1} <span className="text-[10px] font-normal text-gray-400">tCO2e</span></span>
          <span className="text-[10px] text-gray-400">{t('dashboard.directEmissions')}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">{t('dashboard.scope2')}</span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.scope2} <span className="text-[10px] font-normal text-gray-400">tCO2e</span></span>
          <span className="text-[10px] text-gray-400">{t('dashboard.purchasedEnergy')}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">{t('dashboard.scope3')}</span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.scope3} <span className="text-[10px] font-normal text-gray-400">tCO2e</span></span>
          <span className="text-[10px] text-gray-400">{t('dashboard.valueChain')}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{t('dashboard.yoyChange')}</span>
          <span className={`text-lg font-bold ${stats.yoyChange === null ? 'text-gray-400' : stats.yoyChange <= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {stats.yoyChange === null ? '—' : `${stats.yoyChange > 0 ? '+' : ''}${stats.yoyChange}%`}
          </span>
          <span className="text-[10px] text-gray-400">{t('dashboard.vsPreviousYear')}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{t('dashboard.activities')}</span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.activityCount}</span>
          <span className="text-[10px] text-gray-400">{t('dashboard.dataRecords')}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">{t('dashboard.employees')}</span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.totalEmployees?.toLocaleString() || 0}</span>
          <span className="text-[10px] text-gray-400">{t('dashboard.fromS1Data')}</span>
        </div>
      </div>

      {/* Top Emission Sources */}
      {charts.topSources?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">{t('dashboard.topEmissionSources')}</h3>
          <div className="space-y-2">
            {charts.topSources.map((s, i) => {
              const maxVal = charts.topSources[0]?.value || 1;
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-40 truncate">{s.source}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2.5">
                    <div className="bg-brand-500 h-2.5 rounded-full transition-all" style={{ width: `${(s.value / maxVal) * 100}%` }} />
                  </div>
                  <span className="text-xs font-mono text-gray-600 dark:text-gray-400 w-20 text-right">{s.value} tCO2e</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Emissions by Scope - Doughnut */}
        <CopyableChart title={t('dashboard.emissionsByScope')}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={charts.byScope} dataKey="value" nameKey="scope" cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                label={({ value }) => `${value.toFixed(2)}`}>
                {charts.byScope.map((entry) => (
                  <Cell key={entry.scope} fill={SCOPE_COLORS[entry.scope] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${v.toFixed(1)} tCO2e`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CopyableChart>

        {/* Emissions by Activity - Treemap */}
        <CopyableChart title={t('dashboard.emissionsByActivity')}>
          <ResponsiveContainer width="100%" height={280}>
            <Treemap
              data={charts.byActivity.map((a, i) => ({ name: a.activity, size: a.value, fill: TREE_COLORS[i % TREE_COLORS.length] }))}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="#fff"
              content={({ x, y, width, height, name, fill }) => (
                width > 40 && height > 30 ? (
                  <g>
                    <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} />
                    <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#fff" fontSize={11}>{name}</text>
                  </g>
                ) : <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} />
              )}
            />
          </ResponsiveContainer>
        </CopyableChart>

        {/* Emissions Trend */}
        <CopyableChart title={t('dashboard.emissionsTrend')}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={charts.emissionsTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis />
              <Tooltip formatter={(v) => `${v.toFixed(1)} tCO2e`} />
              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CopyableChart>

        {/* Energy Consumption by Source */}
        <CopyableChart title={t('dashboard.energyBySource')}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.energyBySource || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="source" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip formatter={(v) => `${v.toFixed(2)} MWh`} />
              <Bar dataKey="mwh" name="MWh" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CopyableChart>

        {/* SBTi Gauge */}
        {sbti && (
          <CopyableChart title={t('dashboard.sbtiTargetProgress')}>
            <div className="flex flex-col items-center justify-center h-[250px]">
              <div className="relative w-48 h-48">
                <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                  <circle cx="100" cy="100" r="80" fill="none" stroke="#e5e7eb" strokeWidth="16" />
                  <circle cx="100" cy="100" r="80" fill="none" stroke={sbti.onTrack ? '#10b981' : '#ef4444'} strokeWidth="16"
                    strokeDasharray={`${sbti.progress * 5.03} 503`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold">{sbti.progress}%</span>
                  <span className="text-xs text-gray-500">{t('dashboard.ofTarget')}</span>
                </div>
              </div>
              <div className="mt-4 text-center text-sm text-gray-500">
                <p>{t('dashboard.sbtiGaugeMethod', { method: sbti.method, pct: sbti.reductionPct, year: sbti.targetYear })}</p>
                <p>{t('dashboard.sbtiGaugeBaseline', { baseYear: sbti.baseYear, current: sbti.currentEmissions.toFixed(1) })}</p>
              </div>
            </div>
          </CopyableChart>
        )}
      </div>
    </div>
  );
}
