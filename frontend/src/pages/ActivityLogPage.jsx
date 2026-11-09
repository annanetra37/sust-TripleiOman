import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Activity, User, LogIn, Upload, FileText, Trash2, Settings, UserPlus, Target,
  Shield, Database, Filter, ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { HelpBanner } from '../components/HelpSystem';
import { useT } from '../i18n';

const ACTION_LABEL_KEYS = {
  LOGIN: 'activityLog.signIn',
  UPLOAD_S1: 'activityLog.s1Upload',
  UPLOAD_E1: 'activityLog.e1Upload',
  DOC_EXTRACT: 'activityLog.docExtract',
  INVITE_USER: 'activityLog.inviteUser',
  DELETE_USER: 'activityLog.deleteUser',
  RESET_DATA: 'activityLog.dataReset',
  GENERATE_REPORT: 'activityLog.report',
  UPDATE_SETTINGS: 'activityLog.settingsAction',
  CREATE_CONNECTION: 'activityLog.connection',
  SET_SBTI_TARGET: 'activityLog.sbtiTarget',
  AUDIT_UPDATE: 'activityLog.auditAction',
};

const ACTION_META = {
  LOGIN: { icon: LogIn, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950' },
  UPLOAD_S1: { icon: Upload, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950' },
  UPLOAD_E1: { icon: Upload, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950' },
  DOC_EXTRACT: { icon: FileText, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-950' },
  INVITE_USER: { icon: UserPlus, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950' },
  DELETE_USER: { icon: Trash2, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950' },
  RESET_DATA: { icon: Trash2, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950' },
  GENERATE_REPORT: { icon: FileText, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950' },
  UPDATE_SETTINGS: { icon: Settings, color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800' },
  CREATE_CONNECTION: { icon: Database, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
  SET_SBTI_TARGET: { icon: Target, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950' },
  AUDIT_UPDATE: { icon: Shield, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
};

const DEFAULT_META = { icon: Activity, color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800' };

export default function ActivityLogPage() {
  const { t } = useT();
  const [data, setData] = useState({ logs: [], total: 0, actions: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ userId: '', action: '', from: '', to: '', page: 1 });

  useEffect(() => {
    setLoading(true);
    api.getActivityLog(filters)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  const formatTime = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t('activityLog.justNow');
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    return d.toLocaleDateString();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Activity className="w-6 h-6 text-brand-600" /> {t('activityLog.title')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('activityLog.subtitle')}</p>
      </div>

      <HelpBanner id="activity-log-guide" title={t('activityLog.helpTitle')} variant="info">
        {t('activityLog.helpBody')}
      </HelpBanner>

      {/* Filters */}
      <div className="card py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400" />
          <select className="input w-auto" value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value, page: 1 })}>
            <option value="">{t('activityLog.allUsers')}</option>
            {data.users?.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
          <select className="input w-auto" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}>
            <option value="">{t('activityLog.allActions')}</option>
            {data.actions?.map((a) => <option key={a} value={a}>{ACTION_LABEL_KEYS[a] ? t(ACTION_LABEL_KEYS[a]) : a}</option>)}
          </select>
          <input type="date" className="input w-auto" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })} placeholder="From" />
          <input type="date" className="input w-auto" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })} placeholder="To" />
          {(filters.userId || filters.action || filters.from || filters.to) && (
            <button className="text-sm text-brand-600 hover:underline" onClick={() => setFilters({ userId: '', action: '', from: '', to: '', page: 1 })}>{t('activityLog.clear')}</button>
          )}
        </div>
      </div>

      {/* Log entries */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">{t('activityLog.loadingLog')}</div>
        ) : data.logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">{t('activityLog.noActivity')}</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.logs.map((log) => {
              const meta = ACTION_META[log.action] || DEFAULT_META;
              const LogIcon = meta.icon;
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <LogIcon className={`w-4 h-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {log.user?.firstName} {log.user?.lastName}
                      </span>
                      <span className={`badge ${meta.bg} ${meta.color}`}>{ACTION_LABEL_KEYS[log.action] ? t(ACTION_LABEL_KEYS[log.action]) : t('activityLog.action')}</span>
                      <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{log.user?.role}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{log.detail || log.action}</p>
                    {log.ipAddress && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">IP: {log.ipAddress}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{formatTime(log.createdAt)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button className="btn-secondary" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">{t('history.pageOf', { page: filters.page, total: data.totalPages })}</span>
          <button className="btn-secondary" disabled={filters.page >= data.totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
