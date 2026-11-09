import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Users, TrendingDown, Clock, Heart, Upload, Download, FileSpreadsheet, FileImage } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { InfoTip } from '../components/HelpSystem';
import CopyableChart from '../components/CopyableChart';
import OrgYearFilter from '../components/OrgYearFilter';
import { useT } from '../i18n';

const COLORS = ['#6366f1', '#ec4899', '#8b5cf6', '#64748b'];

export default function S1Dashboard() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), orgUnits: '' });
  const filterKey = `${filters.year}|${filters.orgUnits}`;
  const [ready, setReady] = useState(false);

  useEffect(() => {
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
    api.getS1Dashboard(filters).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [filterKey, ready]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
  if (!data) return <div className="text-center text-gray-500 py-12">{t('s1Dashboard.noDataAvailable')}</div>;

  const { stats, charts } = data;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('s1Dashboard.title')}</h1>
          <p className="text-gray-500">{t('s1Dashboard.subtitle')}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link to="/platform/S/social-1" className="btn-primary flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" /> {t('s1Dashboard.connectData')}
          </Link>
          <div className="flex gap-1.5">
            <button onClick={() => { window.print(); }} className="btn-secondary flex items-center justify-center gap-1.5 text-xs flex-1" title="Save dashboard with all visuals as PDF (browser print dialog)">
              <FileImage className="w-3.5 h-3.5" /> {t('s1Dashboard.visuals')}
            </button>
            <button onClick={() => api.exportS1Dashboard(filters)} className="btn-secondary flex items-center justify-center gap-1.5 text-xs flex-1" title="Download raw KPI data as Excel spreadsheet">
              <FileSpreadsheet className="w-3.5 h-3.5" /> {t('s1Dashboard.data')}
            </button>
          </div>
          <p className="text-[9px] text-gray-400 text-center">{t('s1Dashboard.visualsHint')}</p>
        </div>
      </div>

      <OrgYearFilter filters={filters} onChange={setFilters} />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <Users className="w-5 h-5 text-indigo-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('s1Dashboard.totalEmployees')}</span>
            <InfoTip>{t('s1Dashboard.totalEmployeesTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.totalEmployees.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="text-lg">{'♀'}</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('s1Dashboard.femalePct')}</span>
            <InfoTip>{t('s1Dashboard.femalePctTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.femalePct}%</span>
        </div>
        <div className="stat-card">
          <Clock className="w-5 h-5 text-purple-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('s1Dashboard.avgTrainingHours')}</span>
            <InfoTip>{t('s1Dashboard.avgTrainingHoursTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.avgTrainingHours} <span className="text-sm font-normal text-gray-400">{t('s1Dashboard.hrsPerEmp')}</span></span>
        </div>
        <div className="stat-card">
          <TrendingDown className="w-5 h-5 text-red-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('s1Dashboard.turnoverRate')}</span>
            <InfoTip>{t('s1Dashboard.turnoverRateTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.turnoverRate}%</span>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide">{t('s1Dashboard.permanent')}</span>
          <span className="text-lg font-bold">{stats.permanentCount?.toLocaleString() || 0}</span>
          <span className="text-[10px] text-gray-400">{t('s1Dashboard.ofTotal', { pct: stats.permanentPct || 0 })}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-orange-500 uppercase tracking-wide">{t('s1Dashboard.temporary')}</span>
          <span className="text-lg font-bold">{stats.temporaryCount?.toLocaleString() || 0}</span>
          <span className="text-[10px] text-gray-400">{t('s1Dashboard.ofTotal', { pct: 100 - (stats.permanentPct || 0) })}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-green-500 uppercase tracking-wide">{t('s1Dashboard.voluntary')}</span>
          <span className="text-lg font-bold">{stats.voluntaryTurnover || 0}</span>
          <span className="text-[10px] text-gray-400">{t('s1Dashboard.rate', { pct: stats.voluntaryRate || 0 })}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">{t('s1Dashboard.involuntary')}</span>
          <span className="text-lg font-bold">{stats.involuntaryTurnover || 0}</span>
          <span className="text-[10px] text-gray-400">{t('s1Dashboard.rate', { pct: stats.involuntaryRate || 0 })}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-pink-500 uppercase tracking-wide">{t('s1Dashboard.disability')}</span>
          <span className="text-lg font-bold">{stats.disabilityCount || 0}</span>
          <span className="text-[10px] text-gray-400">{t('s1Dashboard.rate', { pct: stats.disabilityRate || 0 })}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">{t('s1Dashboard.ltir')}</span>
          <span className="text-lg font-bold">{stats.ltir || 0}</span>
          <span className="text-[10px] text-gray-400">{t('s1Dashboard.perHours')}</span>
        </div>
      </div>

      {/* Injury summary */}
      {(stats.totalInjuries > 0 || stats.fatalInjuries > 0) && (
        <div className={`card py-4 ${stats.fatalInjuries > 0 ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/30' : ''}`}>
          <div className="flex items-center gap-6">
            <div>
              <span className="text-xs text-gray-500">{t('s1Dashboard.totalIncidents')}</span>
              <p className="text-xl font-bold">{stats.totalInjuries}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">{t('s1Dashboard.fatalities')}</span>
              <p className={`text-xl font-bold ${stats.fatalInjuries > 0 ? 'text-red-600' : 'text-green-600'}`}>{stats.fatalInjuries}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">{t('s1Dashboard.lostTimeInjuries')}</span>
              <p className="text-xl font-bold">{stats.lostTimeInjuries || 0}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">{t('s1Dashboard.trainingHours')}</span>
              <p className="text-xl font-bold">{stats.totalTrainingHours?.toLocaleString() || 0}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">{t('s1Dashboard.trainedEmployees')}</span>
              <p className="text-xl font-bold">{stats.trainedEmployees?.toLocaleString() || 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employees by Gender */}
        <CopyableChart title={t('s1Dashboard.employeesByGender')}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.employeesByGender}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="gender" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CopyableChart>

        {/* Gender Distribution Pie */}
        <CopyableChart title={t('s1Dashboard.genderDistribution')}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={charts.employeesByGender} dataKey="count" nameKey="gender" cx="50%" cy="50%" outerRadius={100} label>
                {charts.employeesByGender.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CopyableChart>

        {/* Training by Gender */}
        <CopyableChart title={t('s1Dashboard.trainingByGender')}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.trainingByGender}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="gender" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="hours" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CopyableChart>

        {/* Diversity by Gender */}
        <CopyableChart title={t('s1Dashboard.disabilityByGender')}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.diversityByGender}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="gender" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="withDisability" name={t('s1Dashboard.withDisability')} fill="#ec4899" radius={[4, 4, 0, 0]} />
              <Bar dataKey="without" name={t('s1Dashboard.without')} fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CopyableChart>

        {/* Contract Type Breakdown */}
        {charts.byContractType?.length > 0 && (
          <CopyableChart title={t('s1Dashboard.byContractType')}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={charts.byContractType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={100}
                  label={({ type, count }) => `${type}: ${count}`}>
                  {charts.byContractType.map((_, i) => (
                    <Cell key={i} fill={['#6366f1', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'][i % 5]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CopyableChart>
        )}

        {/* Turnover by Gender */}
        {charts.turnoverByGender?.length > 0 && (
          <CopyableChart title={t('s1Dashboard.turnoverByGender')}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts.turnoverByGender}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="gender" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="voluntary" name={t('s1Dashboard.voluntary')} fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="involuntary" name={t('s1Dashboard.involuntary')} fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CopyableChart>
        )}
      </div>
    </div>
  );
}
