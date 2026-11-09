import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  GitBranch, Leaf, Users2, Shield, Building2, FileText, ChevronDown, ChevronRight,
  Download, Loader2, CheckCircle, XCircle, AlertTriangle, Eye, Filter, FileSpreadsheet,
  ZoomIn, ZoomOut, Maximize2, Minus, Plus
} from 'lucide-react';
import { HelpBanner } from '../components/HelpSystem';
import FeatureLock from '../components/FeatureLock';
import useFeature from '../hooks/useFeature';
import { useT } from '../i18n';
import clsx from 'clsx';

const TOPIC_META = {
  E1: { label: 'Environmental', icon: Leaf, color: 'text-esg-e', bg: 'bg-emerald-100 dark:bg-emerald-900', border: 'border-emerald-400', line: 'bg-emerald-400' },
  S1: { label: 'Social', icon: Users2, color: 'text-esg-s', bg: 'bg-indigo-100 dark:bg-indigo-900', border: 'border-indigo-400', line: 'bg-indigo-400' },
  G1: { label: 'Governance', icon: Shield, color: 'text-esg-g', bg: 'bg-amber-100 dark:bg-amber-900', border: 'border-amber-400', line: 'bg-amber-400' },
};

const AUDIT_COLORS = {
  pending: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  verified: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400',
  flagged: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400',
};

export default function LineagePage() {
  const { t } = useT();
  const navigate = useNavigate();
  const lineageFeature = useFeature('audit_lineage');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({ topic: '', orgUnitId: '', userId: '' });

  // Short-circuit for tiers without audit-lineage entitlement.
  if (!lineageFeature.allowed) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('lineage.featureTitle')}</h1>
          <p className="text-gray-500 dark:text-gray-400">{t('lineage.featureSubtitle')}</p>
        </div>
        <FeatureLock
          feature="audit_lineage"
          description={t('lineage.featureDescription')}
        />
      </div>
    );
  }
  const [expanded, setExpanded] = useState({});
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef(null);

  const filtersKey = `${filters.topic}|${filters.orgUnitId}|${filters.userId}`;

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filters.topic) params.topic = filters.topic;
    if (filters.orgUnitId) params.orgUnitId = filters.orgUnitId;
    if (filters.userId) params.userId = filters.userId;
    api.getLineage(params).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [filtersKey]);

  const toggle = (key) => setExpanded((p) => ({ ...p, [key]: !p[key] }));
  const isOpen = (key) => expanded[key] !== false;

  const expandAll = () => {
    const keys = {};
    data?.tree?.forEach((t) => {
      keys[`t-${t.key}`] = true;
      t.orgUnits.forEach((ou) => {
        keys[`ou-${t.key}-${ou.id}`] = true;
        ou.users.forEach((u) => { keys[`u-${t.key}-${ou.id}-${u.id}`] = true; });
      });
    });
    setExpanded(keys);
  };

  const collapseAll = () => setExpanded({});

  const handleExport = async (format) => {
    setExporting(true);
    try { await api.exportAuditTrail({ format, ...filters }); }
    catch (err) { alert(err.error || 'Export failed'); }
    finally { setExporting(false); }
  };

  const { tree = [], filters: filterOptions = {} } = data || {};

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-brand-600" /> {t('lineage.title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{t('lineage.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('pdf')} disabled={exporting} className="btn-secondary text-xs py-1.5">
            {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} PDF
          </button>
          <button onClick={() => handleExport('docx')} disabled={exporting} className="btn-secondary text-xs py-1.5">
            <FileText className="w-3 h-3" /> Word
          </button>
        </div>
      </div>

      {/* Toolbar: filters + zoom */}
      <div className="card py-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400" />
          <select className="input w-auto text-sm py-1.5" value={filters.topic} onChange={(e) => setFilters({ ...filters, topic: e.target.value })}>
            <option value="">{t('lineage.allTopics')}</option>
            <option value="E1">{t('lineage.environmental')}</option>
            <option value="S1">{t('lineage.social')}</option>
          </select>
          <select className="input w-auto text-sm py-1.5" value={filters.orgUnitId} onChange={(e) => setFilters({ ...filters, orgUnitId: e.target.value })}>
            <option value="">{t('lineage.allOrgUnits')}</option>
            {filterOptions.orgUnits?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="input w-auto text-sm py-1.5" value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })}>
            <option value="">{t('lineage.allUsers')}</option>
            {filterOptions.users?.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
          {(filters.topic || filters.orgUnitId || filters.userId) && (
            <button className="text-xs text-brand-600 hover:underline" onClick={() => setFilters({ topic: '', orgUnitId: '', userId: '' })}>{t('lineage.clear')}</button>
          )}

          <div className="ml-auto flex items-center gap-1 border rounded-lg dark:border-gray-700 overflow-hidden">
            <button onClick={expandAll} className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title={t('lineage.expandAll')}>
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={collapseAll} className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title={t('lineage.collapseAll')}>
              <Minus className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title={t('lineage.zoomOut')}>
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title={t('lineage.zoomIn')}>
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setZoom(1)} className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title={t('lineage.resetZoom')}>
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 min-h-[400px]" ref={canvasRef}>
        {loading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <GitBranch className="w-12 h-12 mb-3 opacity-30" />
            <p>{t('lineage.noData')}</p>
          </div>
        ) : (
          <div className="p-6 transition-transform origin-top-left" style={{ transform: `scale(${zoom})` }}>
            {tree.map((topic) => {
              const meta = TOPIC_META[topic.key] || TOPIC_META.E1;
              const TopicIcon = meta.icon;
              const tKey = `t-${topic.key}`;
              const tOpen = isOpen(tKey);
              const totalUploads = topic.orgUnits.reduce((s, ou) => s + ou.users.reduce((s2, u) => s2 + u.uploads.length, 0), 0);

              return (
                <div key={topic.key} className="mb-6">
                  {/* Topic node */}
                  <button onClick={() => toggle(tKey)} className={clsx('flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all w-full', meta.border, meta.bg, 'hover:shadow-md')}>
                    <TopicIcon className={clsx('w-6 h-6', meta.color)} />
                    <div className="text-left flex-1">
                      <p className="font-bold text-gray-900 dark:text-white">{topic.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{topic.orgUnits.length} {topic.orgUnits.length !== 1 ? t('lineage.unitsPlural') : t('lineage.units')} · {totalUploads} {totalUploads !== 1 ? t('lineage.uploadsPlural') : t('lineage.uploads')}</p>
                    </div>
                    {tOpen ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                  </button>

                  {tOpen && (
                    <div className="ml-8 mt-2 space-y-2 relative">
                      {/* Vertical connector line */}
                      <div className={clsx('absolute left-0 top-0 bottom-0 w-0.5 rounded', meta.line, 'opacity-30')} />

                      {topic.orgUnits.map((ou) => {
                        const ouKey = `ou-${topic.key}-${ou.id}`;
                        const ouOpen = isOpen(ouKey);
                        return (
                          <div key={ou.id} className="pl-6 relative">
                            {/* Horizontal connector */}
                            <div className={clsx('absolute left-0 top-5 w-6 h-0.5 rounded', meta.line, 'opacity-30')} />

                            <button onClick={() => toggle(ouKey)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all w-full">
                              <Building2 className="w-4 h-4 text-gray-400" />
                              <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">{ou.name}</span>
                              <span className="text-xs text-gray-400">{ou.country}</span>
                              <span className="badge bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] ml-auto">{ou.users.length} {ou.users.length !== 1 ? t('lineage.usersPlural') : t('lineage.users')}</span>
                              {ouOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                            </button>

                            {ouOpen && (
                              <div className="ml-6 mt-1.5 space-y-1.5 relative">
                                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700 rounded" />

                                {ou.users.map((user) => {
                                  const uKey = `u-${topic.key}-${ou.id}-${user.id}`;
                                  const uOpen = isOpen(uKey);
                                  return (
                                    <div key={user.id} className="pl-5 relative">
                                      <div className="absolute left-0 top-4 w-5 h-0.5 bg-gray-200 dark:bg-gray-700 rounded" />

                                      <button onClick={() => toggle(uKey)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-all w-full">
                                        <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                                          {user.name.charAt(0)}
                                        </div>
                                        <span className="font-medium text-sm text-gray-700 dark:text-gray-300">{user.name}</span>
                                        <span className="text-[10px] text-gray-400 truncate">{user.email}</span>
                                        <span className="badge bg-gray-100 dark:bg-gray-700 text-gray-500 text-[10px] ml-auto">{user.uploads.length}</span>
                                        {uOpen ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                                      </button>

                                      {uOpen && (
                                        <div className="ml-8 mt-1 space-y-1">
                                          {user.uploads.map((upload) => (
                                            <div
                                              key={upload.id}
                                              onClick={() => navigate('/history')}
                                              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-600 hover:shadow-sm cursor-pointer transition-all group"
                                            >
                                              <FileSpreadsheet className="w-4 h-4 text-gray-300 group-hover:text-brand-500 shrink-0" />
                                              <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{upload.fileName}</p>
                                                <p className="text-[10px] text-gray-400">{new Date(upload.createdAt).toLocaleDateString()} · {upload.processedRows || 0} {t('lineage.rows')}</p>
                                              </div>
                                              <span className={clsx('badge text-[10px]', upload.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400' : 'bg-red-100 text-red-700')}>
                                                {upload.status}
                                              </span>
                                              <span className={clsx('badge text-[10px]', AUDIT_COLORS[upload.auditStatus])}>
                                                {upload.auditStatus}
                                              </span>
                                              {upload.hasSourceFile && (
                                                <a href={api.authFileUrl(`/history/${upload.id}/view/0`)}
                                                  target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                                  className="text-brand-500 hover:text-brand-700"><Eye className="w-3.5 h-3.5" /></a>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data?.buildingBills?.length > 0 && <BuildingBills bills={data.buildingBills} t={t} navigate={navigate} />}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-gray-400 dark:text-gray-500 shrink-0 px-1">
        <span>{t('lineage.auditLegend')}</span>
        {Object.entries(AUDIT_COLORS).map(([k, c]) => <span key={k} className={clsx('badge', c)}>{k}</span>)}
        <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" /> {t('lineage.sourceFile')}</span>
        <span className="ml-auto">{t('lineage.expandCollapseHint')} · {t('lineage.zoomHint')}</span>
      </div>
    </div>
  );
}

// Building energy bills with a source document (Building Energy page), so a
// kWh/m² figure can be traced back to the bill it came from.
function BuildingBills({ bills, t, navigate }) {
  const [open, setOpen] = useState(false);
  const byAsset = {};
  for (const b of bills) (byAsset[b.assetId] ||= { name: b.assetName, city: b.city, bills: [] }).bills.push(b);
  const period = (b) => (b.periodStart
    ? `${String(b.periodStart).slice(0, 10)} → ${String(b.periodEnd).slice(0, 10)}`
    : b.month ? `${b.year}-${String(b.month).padStart(2, '0')}` : `${b.year}`);
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 px-4 py-3 w-full text-left">
        <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        <span className="font-semibold text-sm text-gray-900 dark:text-white flex-1">{t('buildings.lineageTitle')}</span>
        <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px]">{bills.length}</span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 max-h-80 overflow-y-auto">
          {Object.entries(byAsset).map(([id, a]) => (
            <div key={id}>
              <button onClick={() => navigate(`/buildings/${id}`)} className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                {a.name} · {a.city}
              </button>
              <div className="mt-1 space-y-1">
                {a.bills.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/60">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[16rem]">{b.sourceDoc}</span>
                    <span className="text-gray-500">{period(b)}</span>
                    <span className="text-gray-500">{t(`buildings.fuels.${b.fuel}`)} · {Number(b.quantity).toLocaleString()} {b.unit}</span>
                    {b.cost != null && <span className="text-gray-500">{Number(b.cost).toLocaleString()} {b.currency}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
