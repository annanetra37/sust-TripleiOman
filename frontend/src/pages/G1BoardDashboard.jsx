import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Landmark, Scale, Clock, Upload, FileSpreadsheet, FileImage, UserCheck } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { InfoTip } from '../components/HelpSystem';
import CopyableChart from '../components/CopyableChart';
import OrgYearFilter from '../components/OrgYearFilter';
import { useT } from '../i18n';

const COLORS = ['#d97706', '#6366f1', '#ec4899', '#64748b', '#22c55e'];

export default function G1BoardDashboard() {
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
    api.getG1Dashboard(filters).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [filterKey, ready]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
  if (!data) return <div className="text-center text-gray-500 py-12">{t('g1Dashboard.noDataAvailable')}</div>;

  const { stats, charts } = data;
  const hasBoardData = stats.boardSize > 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('g1Dashboard.boardTitle')}</h1>
          <p className="text-gray-500">{t('g1Dashboard.boardSubtitle')}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link to="/platform/G/governance-1" className="btn-primary flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" /> {t('g1Dashboard.connectData')}
          </Link>
          <div className="flex gap-1.5">
            <button onClick={() => { window.print(); }} className="btn-secondary flex items-center justify-center gap-1.5 text-xs flex-1" title="Save dashboard with all visuals as PDF (browser print dialog)">
              <FileImage className="w-3.5 h-3.5" /> {t('g1Dashboard.visuals')}
            </button>
            <button onClick={() => api.exportG1Dashboard(filters)} className="btn-secondary flex items-center justify-center gap-1.5 text-xs flex-1" title="Download raw governance data as Excel spreadsheet">
              <FileSpreadsheet className="w-3.5 h-3.5" /> {t('g1Dashboard.data')}
            </button>
          </div>
        </div>
      </div>

      <OrgYearFilter filters={filters} onChange={setFilters} />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <Landmark className="w-5 h-5 text-amber-600" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('g1Dashboard.boardSize')}</span>
            <InfoTip>{t('g1Dashboard.boardSizeTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.boardSize.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="text-lg">{'♀'}</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('g1Dashboard.womenOnBoard')}</span>
            <InfoTip>{t('g1Dashboard.womenOnBoardTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.femaleBoardPct}%</span>
        </div>
        <div className="stat-card">
          <Scale className="w-5 h-5 text-indigo-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('g1Dashboard.independence')}</span>
            <InfoTip>{t('g1Dashboard.independenceTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.independencePct}%</span>
        </div>
        <div className="stat-card">
          <Clock className="w-5 h-5 text-purple-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('g1Dashboard.avgTenure')}</span>
            <InfoTip>{t('g1Dashboard.avgTenureTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.avgTenure ?? '—'} {stats.avgTenure != null && <span className="text-sm font-normal text-gray-400">{t('g1Dashboard.years')}</span>}</span>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">{t('g1Dashboard.nonExecutive')}</span>
          <span className="text-lg font-bold">{stats.nonExecCount || 0}</span>
          <span className="text-[10px] text-gray-400">{t('g1Dashboard.ofBoard', { pct: stats.nonExecPct || 0 })}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-pink-500 uppercase tracking-wide">{t('g1Dashboard.womenMembers')}</span>
          <span className="text-lg font-bold">{stats.femaleBoard || 0}</span>
          <span className="text-[10px] text-gray-400">{t('g1Dashboard.ofBoard', { pct: stats.femaleBoardPct || 0 })}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide">{t('g1Dashboard.independentMembers')}</span>
          <span className="text-lg font-bold">{stats.independentCount || 0}</span>
          <span className="text-[10px] text-gray-400">{t('g1Dashboard.ofBoard', { pct: stats.independencePct || 0 })}</span>
        </div>
      </div>

      {!hasBoardData && (
        <div className="card text-center py-10">
          <UserCheck className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500">{t('g1Dashboard.noBoardData')}</p>
          <Link to="/platform/G/governance-1" className="text-brand-600 text-sm font-medium hover:underline">{t('g1Dashboard.uploadNow')}</Link>
        </div>
      )}

      {/* Charts */}
      {hasBoardData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CopyableChart title={t('g1Dashboard.boardByGender')}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={charts.boardByGender} dataKey="count" nameKey="gender" cx="50%" cy="50%" outerRadius={100} label>
                  {charts.boardByGender.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CopyableChart>

          <CopyableChart title={t('g1Dashboard.boardByRole')}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts.boardByRole}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="role" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CopyableChart>

          <CopyableChart title={t('g1Dashboard.boardByIndependence')}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={charts.boardByIndependence} dataKey="count" nameKey="independence" cx="50%" cy="50%" outerRadius={100} label>
                  {charts.boardByIndependence.map((_, i) => (
                    <Cell key={i} fill={['#6366f1', '#94a3b8', '#e2e8f0'][i % 3]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CopyableChart>

          {charts.boardByAge?.length > 0 && (
            <CopyableChart title={t('g1Dashboard.boardByAge')}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={charts.boardByAge}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="band" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CopyableChart>
          )}
        </div>
      )}
    </div>
  );
}
