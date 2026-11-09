import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { GraduationCap, AlertTriangle, Banknote, ShieldCheck, Upload, FileSpreadsheet, FileImage } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { InfoTip } from '../components/HelpSystem';
import CopyableChart from '../components/CopyableChart';
import OrgYearFilter from '../components/OrgYearFilter';
import { useT } from '../i18n';

const STATUS_COLORS = {
  'Open': '#f59e0b',
  'Under investigation': '#6366f1',
  'Substantiated': '#ef4444',
  'Dismissed': '#94a3b8',
  'Resolved': '#22c55e',
};

const POLICY_BADGE = {
  'In place': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  'Draft': 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  'Under review': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  'Not in place': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export default function G1EthicsDashboard() {
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

  const { stats, charts, raw } = data;
  const hasData = stats.totalTrained > 0 || stats.totalIncidents > 0 || stats.policiesTotal > 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('g1Dashboard.ethicsTitle')}</h1>
          <p className="text-gray-500">{t('g1Dashboard.ethicsSubtitle')}</p>
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
          <GraduationCap className="w-5 h-5 text-indigo-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('g1Dashboard.peopleTrained')}</span>
            <InfoTip>{t('g1Dashboard.peopleTrainedTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.totalTrained.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <ShieldCheck className="w-5 h-5 text-green-600" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('g1Dashboard.completionRate')}</span>
            <InfoTip>{t('g1Dashboard.completionRateTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.avgCompletionRate != null ? `${stats.avgCompletionRate}%` : '—'}</span>
        </div>
        <div className="stat-card">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('g1Dashboard.incidents')}</span>
            <InfoTip>{t('g1Dashboard.incidentsTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.totalIncidents}</span>
        </div>
        <div className="stat-card">
          <Banknote className="w-5 h-5 text-red-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('g1Dashboard.finesPenalties')}</span>
            <InfoTip>{t('g1Dashboard.finesPenaltiesTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold">${(stats.totalFines || 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">{t('g1Dashboard.confirmed')}</span>
          <span className="text-lg font-bold">{stats.confirmedIncidents || 0}</span>
          <span className="text-[10px] text-gray-400">{t('g1Dashboard.substantiatedCases')}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">{t('g1Dashboard.open')}</span>
          <span className="text-lg font-bold">{stats.openIncidents || 0}</span>
          <span className="text-[10px] text-gray-400">{t('g1Dashboard.underInvestigation')}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide">{t('g1Dashboard.corruption')}</span>
          <span className="text-lg font-bold">{stats.corruptionIncidents || 0}</span>
          <span className="text-[10px] text-gray-400">{t('g1Dashboard.corruptionBribery')}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">{t('g1Dashboard.policies')}</span>
          <span className="text-lg font-bold">{stats.policiesInPlace || 0}/{stats.policiesTotal || 0}</span>
          <span className="text-[10px] text-gray-400">{t('g1Dashboard.inPlace')}</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide">{t('g1Dashboard.boardApproved')}</span>
          <span className="text-lg font-bold">{stats.boardApprovedPolicies || 0}</span>
          <span className="text-[10px] text-gray-400">{t('g1Dashboard.ofPolicies')}</span>
        </div>
      </div>

      {!hasData && (
        <div className="card text-center py-10">
          <ShieldCheck className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500">{t('g1Dashboard.noEthicsData')}</p>
          <Link to="/platform/G/governance-1" className="text-brand-600 text-sm font-medium hover:underline">{t('g1Dashboard.uploadNow')}</Link>
        </div>
      )}

      {/* Charts */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {charts.trainingByTopic?.length > 0 && (
            <CopyableChart title={t('g1Dashboard.trainingByTopic')}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={charts.trainingByTopic}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="topic" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="trained" name={t('g1Dashboard.peopleTrained')} fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CopyableChart>
          )}

          {charts.incidentsByType?.length > 0 && (
            <CopyableChart title={t('g1Dashboard.incidentsByType')}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={charts.incidentsByType}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="type" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CopyableChart>
          )}

          {charts.incidentsByStatus?.length > 0 && (
            <CopyableChart title={t('g1Dashboard.incidentsByStatus')}>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={charts.incidentsByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={100} label>
                    {charts.incidentsByStatus.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CopyableChart>
          )}
        </div>
      )}

      {/* Policy Register */}
      {raw.policies?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('g1Dashboard.policyRegister')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2 pr-4">{t('g1Dashboard.policy')}</th>
                  <th className="py-2 pr-4">{t('g1Dashboard.area')}</th>
                  <th className="py-2 pr-4">{t('g1Dashboard.status')}</th>
                  <th className="py-2 pr-4">{t('g1Dashboard.boardApprovedCol')}</th>
                  <th className="py-2 pr-4">{t('g1Dashboard.lastReviewed')}</th>
                  <th className="py-2">{t('g1Dashboard.coverage')}</th>
                </tr>
              </thead>
              <tbody>
                {raw.policies.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100">{p.policyName}</td>
                    <td className="py-2 pr-4 text-gray-500">{p.policyArea}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${POLICY_BADGE[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{p.boardApproved || '—'}</td>
                    <td className="py-2 pr-4 text-gray-500">{p.lastReviewed || '—'}</td>
                    <td className="py-2 text-gray-500">{p.coverage || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
