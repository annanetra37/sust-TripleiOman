import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FileSpreadsheet, Search, CheckCircle, XCircle, Loader2, ArrowLeft, ChevronRight,
  User, Download, Eye, Shield, FileText, AlertTriangle, CheckCircle2, Trash2
} from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';
import { useT } from '../i18n';

const AUDIT_STATUS_KEYS = {
  pending: 'history.pendingReview',
  verified: 'history.verified',
  flagged: 'history.flagged',
  rejected: 'history.rejected',
};

const AUDIT_STATUSES = [
  { value: 'pending', color: 'bg-gray-100 text-gray-600', icon: '...' },
  { value: 'verified', color: 'bg-green-100 text-green-700', icon: null },
  { value: 'flagged', color: 'bg-amber-100 text-amber-700', icon: null },
  { value: 'rejected', color: 'bg-red-100 text-red-700', icon: null },
];

// Helper to build authenticated file URLs via the shared api helper.
function authUrl(path) {
  return api.authFileUrl(path);
}

export default function HistoryPage() {
  const { t } = useT();
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fileType, setFileType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [auditNote, setAuditNote] = useState('');

  useEffect(() => {
    setLoading(true);
    api.getHistory({ fileType, status, search, page, limit: 20 })
      .then((data) => { setRecords(data.records); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fileType, status, search, page]);

  const statusIcon = (s, r) => {
    if (r?.deletedAt) return <Trash2 className="w-4 h-4 text-orange-500" />;
    if (s === 'COMPLETED') return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (s === 'FAILED') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />;
  };

  const statusLabel = (r) => {
    if (r?.deletedAt) return t('history.dataDeletedLabel');
    return r?.status || t('history.processingLabel');
  };

  const statusBadgeClass = (r) => {
    if (r?.deletedAt) return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
    if (r?.status === 'COMPLETED') return 'bg-green-100 text-green-700';
    if (r?.status === 'FAILED') return 'bg-red-100 text-red-700';
    return 'bg-blue-100 text-blue-700';
  };

  const auditBadge = (s) => {
    const st = AUDIT_STATUSES.find((a) => a.value === s) || AUDIT_STATUSES[0];
    return <span className={`badge ${st.color}`}>{t(AUDIT_STATUS_KEYS[st.value] || 'history.pendingReview')}</span>;
  };

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const data = await api.getHistoryDetail(id);
      setDetail(data);
      setAuditNote(data.upload.auditNote || '');
    } catch (err) {
      alert(err.error || t('history.failedToLoad'));
    } finally {
      setDetailLoading(false);
    }
  };

  const updateAudit = async (newStatus) => {
    try {
      await api.updateAuditStatus(detail.upload.id, { auditStatus: newStatus, auditNote });
      const data = await api.getHistoryDetail(detail.upload.id);
      setDetail(data);
    } catch (err) {
      alert(err.error || t('history.failedToUpdateAudit'));
    }
  };

  // Parse stored file paths — supports both "path" and "name::path" formats
  const getFileMap = (upload) => {
    if (!upload.storedFilePath) return { files: [], byName: {} };
    const entries = upload.storedFilePath.split('||');
    const files = [];
    const byName = {};
    entries.forEach((entry, i) => {
      let name, path;
      if (entry.includes('::')) {
        [name, path] = entry.split('::');
      } else {
        name = `File ${i + 1}`;
        path = entry;
      }
      const f = {
        name,
        downloadUrl: authUrl(`/history/${upload.id}/download/${i}`),
        viewUrl: authUrl(`/history/${upload.id}/view/${i}`),
        index: i,
      };
      files.push(f);
      byName[name] = f;
    });
    return { files, byName };
  };

  // ─── Detail View ────────────────────────────────
  if (detail) {
    const { upload, transformedData, creditTransaction, recordCount } = detail;
    const { files, byName: filesByName } = getFileMap(upload);

    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <button onClick={() => setDetail(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t('history.backToHistory')}
        </button>

        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{upload.fileName}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('history.uploadedOn')} {new Date(upload.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              {statusIcon(upload.status, upload)}
              <span className={`badge ${statusBadgeClass(upload)}`}>
                {statusLabel(upload)}
              </span>
            </div>
          </div>

          {/* Deletion banner */}
          {upload.deletedAt && (
            <div className="p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg mb-4">
              <div className="flex items-start gap-2">
                <Trash2 className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">{t('history.dataDeletedBanner')}</p>
                  <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">
                    {t('history.deletedBy')} <strong>{upload.deletedBy}</strong> — {new Date(upload.deletedAt).toLocaleString()}
                  </p>
                  {upload.deletedNote && <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">{upload.deletedNote}</p>}
                  <p className="text-[10px] text-orange-500 mt-1">{t('history.auditFileAvailable')}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">{t('history.type')}</p>
              <p className="font-semibold">{upload.fileType === 'E1' ? t('history.environmental') : t('history.social')}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">{t('history.orgUnit')}</p>
              <p className="font-semibold">{upload.orgUnit || '—'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">{t('history.uploadedBy')}</p>
              <p className="font-semibold">{upload.user?.firstName} {upload.user?.lastName}</p>
              <p className="text-xs text-gray-400">{upload.user?.email}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">{t('history.processing')}</p>
              <p className="font-semibold">{upload.processedRows || 0} / {upload.totalRows || 0} rows</p>
            </div>
          </div>

          {upload.errorMessage && (() => {
            // Parse per-file status from the <!--FILESTATUS:json--> tag if present.
            const raw = upload.errorMessage;
            const tagMatch = raw.match(/<!--FILESTATUS:([\s\S]+?)-->/);
            const humanMessage = raw.replace(/\n?<!--FILESTATUS:[\s\S]+?-->/, '').trim();
            let perFile = [];
            try { if (tagMatch) perFile = JSON.parse(tagMatch[1]); } catch {}

            return (
              <div className="mt-4 space-y-3">
                {humanMessage && (
                  <div className={`p-3 rounded-lg text-sm ${upload.status === 'DATA_DELETED' ? 'bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border border-orange-200' : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'}`}>
                    <AlertTriangle className="w-4 h-4 inline-block mr-1 -mt-0.5" />
                    {humanMessage}
                  </div>
                )}
                {perFile.length > 0 && (
                  <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {t('history.perFileStatus')}
                    </div>
                    <div className="divide-y dark:divide-gray-800">
                      {perFile.map((pf, idx) => (
                        <div key={idx} className="flex items-center gap-3 px-3 py-2 text-sm">
                          {pf.status === 'success' ? (
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                          <span className="font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">{pf.file}</span>
                          <span className={`text-xs ${pf.status === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                            {pf.status === 'success' ? `${pf.records} ${t('history.recordCount')}` : t('history.noDataExtracted')}
                          </span>
                          {pf.confidence > 0 && (
                            <span className="text-[10px] text-gray-400">{Math.round(pf.confidence * 100)}%</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {perFile.some(pf => pf.status !== 'success' && pf.reason) && (
                      <div className="px-3 py-2 bg-red-50 dark:bg-red-950 text-xs text-red-600 dark:text-red-400 space-y-1">
                        {perFile.filter(pf => pf.status !== 'success' && pf.reason).map((pf, idx) => (
                          <p key={idx}><strong>{pf.file}:</strong> {pf.reason}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {creditTransaction && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
              <strong>{t('history.creditsUsed')}</strong> {creditTransaction.creditsUsed} — {creditTransaction.description}
            </div>
          )}

          {/* Source file — download/view directly */}
          {files.length > 0 && (
            <div className="mt-4 border-t dark:border-gray-700 pt-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{files.length > 1 ? t('history.sourceFiles') : t('history.sourceFile')}</p>
              <div className="space-y-2">
                {files.map((f, i) => {
                  const ext = (f.name || '').split('.').pop()?.toLowerCase();
                  const isViewable = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext);
                  // For Excel/CSV, use Google Docs Viewer for inline preview.
                  // f.downloadUrl is already an absolute authenticated URL
                  // (via api.authFileUrl), so pass it directly to Google.
                  const viewHref = isViewable
                    ? f.viewUrl
                    : `https://docs.google.com/gview?url=${encodeURIComponent(f.downloadUrl)}&embedded=true`;

                  return (
                  <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <FileSpreadsheet className="w-5 h-5 text-brand-500 shrink-0" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">{f.name}</span>
                    <a href={isViewable ? f.viewUrl : viewHref} target="_blank" rel="noopener noreferrer"
                      className="text-xs px-3 py-1.5 rounded-md bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800 font-medium transition-colors">
                      {isViewable ? t('history.view') : t('history.preview')}
                    </a>
                    <a href={f.downloadUrl}
                      className="text-xs px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors flex items-center gap-1">
                      <Download className="w-3 h-3" /> {t('common.download')}
                    </a>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Audit Trail */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" /> {t('history.auditTrail')}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">{t('history.auditStatus')}</p>
              <div className="mt-1">{auditBadge(upload.auditStatus)}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">{t('history.reviewedBy')}</p>
              <p className="font-semibold text-sm">{upload.auditedBy || t('history.notYetReviewed')}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">{t('history.reviewDate')}</p>
              <p className="font-semibold text-sm">{upload.auditedAt ? new Date(upload.auditedAt).toLocaleString() : '—'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">{t('history.recordsCreated')}</p>
              <p className="font-semibold text-sm">{recordCount}</p>
            </div>
          </div>

          {user?.role === 'ADMIN' && (
            <div className="border-t dark:border-gray-700 pt-4 space-y-3">
              <textarea className="input" rows={2} placeholder={t('history.addReviewNotes')}
                value={auditNote} onChange={(e) => setAuditNote(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => updateAudit('verified')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200">
                  <CheckCircle2 className="w-4 h-4" /> {t('history.verify')}
                </button>
                <button onClick={() => updateAudit('flagged')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200">
                  <AlertTriangle className="w-4 h-4" /> {t('history.flag')}
                </button>
                <button onClick={() => updateAudit('rejected')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200">
                  <XCircle className="w-4 h-4" /> {t('history.reject')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ETL Transformation Summary */}
        {recordCount > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('history.etlPipeline')}</h3>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {[
                { label: t('history.stepSource'), desc: files.length > 0 ? `${files.length} ${t('history.stepSourceDesc')}` : t('history.stepSourceDescSingle'), color: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300', rows: upload.totalRows || '?' },
                { label: t('history.stepAiMapping'), desc: t('history.stepAiMappingDesc'), color: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' },
                { label: t('history.stepCleaning'), desc: t('history.stepCleaningDesc'), color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
                { label: t('history.stepValidation'), desc: t('history.stepValidationDesc'), color: 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300' },
                { label: t('history.stepLoaded'), desc: `${recordCount} ${t('history.stepLoadedDesc')}`, color: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300', rows: recordCount },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center gap-2 shrink-0">
                  <div className={`px-3 py-2 rounded-lg ${step.color} text-center min-w-[100px]`}>
                    <p className="text-xs font-bold">{step.label}</p>
                    <p className="text-[10px] mt-0.5 opacity-75">{step.desc}</p>
                    {step.rows && <p className="text-[10px] font-mono mt-0.5">{step.rows} rows</p>}
                  </div>
                  {i < arr.length - 1 && <span className="text-gray-300 dark:text-gray-600 text-lg">→</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transformed data */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
            <h3 className="font-semibold">{t('history.transformedData')} ({recordCount} {t('history.records')})</h3>
            {files.length > 0 && (
              <a href={files[0].downloadUrl} className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" /> {t('history.downloadSource')}
              </a>
            )}
          </div>
          {transformedData.length === 0 ? (
            <div className="p-8 text-center text-gray-400">{t('history.noTransformed')}</div>
          ) : upload.fileType === 'E1' ? (
            <div className="overflow-x-auto" style={{ overflow: 'visible' }}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                  <tr>
                    {[t('history.colYear'), t('history.colCategory'), t('history.colSubcategory'), t('history.colScope'), t('history.colQty'), t('history.colUnit'), t('history.colEF'), t('history.colTco2e'), t('history.colMethod'), t('history.colAmount'), t('history.colSource')].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {transformedData.map((r, i) => (
                    <tr key={r.id || i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-3 py-2">{r.year}{r.month ? `-${String(r.month).padStart(2, '0')}` : ''}</td>
                      <td className="px-3 py-2">{r.activityCategory}</td>
                      <td className="px-3 py-2">{r.activitySubcat}</td>
                      <td className="px-3 py-2"><span className={`badge ${r.scope === 'Scope 1' ? 'bg-red-100 text-red-700' : r.scope === 'Scope 2' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{r.scope}</span></td>
                      <td className="px-3 py-2 text-right font-mono">{r.quantity?.toLocaleString()}</td>
                      <td className="px-3 py-2">{r.unit}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500">{r.emissionFactor || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{r.totalEmissions?.toFixed(4)}</td>
                      <td className="px-3 py-2 text-gray-500">{r.calcMethod}</td>
                      <td className="px-3 py-2 text-right">{r.amount ? `${r.currency || ''} ${r.amount.toLocaleString()}` : '—'}</td>
                      <td className="px-3 py-2">
                        {(() => {
                          const file = r.sourceDoc ? (filesByName[r.sourceDoc] || files[0]) : null;
                          if (!file || !r.sourceDoc) return <span className="text-gray-400 text-xs">{r.sourceDoc || '—'}</span>;
                          return (
                            <div className="relative group">
                              <a href={file.viewUrl} target="_blank" rel="noopener noreferrer"
                                className="text-brand-600 hover:text-brand-700 dark:text-brand-400 text-xs font-medium underline decoration-dotted underline-offset-2 flex items-center gap-1">
                                <FileText className="w-3 h-3" />{r.sourceDoc}
                              </a>
                              {/* Tooltip — positioned to the left to avoid overflow clipping */}
                              <div className="fixed-tooltip hidden group-hover:block">
                                <div className="absolute bottom-full right-0 mb-2 z-[100] w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4">
                                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">{r.sourceDoc}</p>
                                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
                                    <div className="flex justify-between"><span className="text-gray-400">Category</span><span className="font-medium">{r.activityCategory}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">Subcategory</span><span className="font-medium">{r.activitySubcat}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">Scope</span><span className={`badge text-[10px] ${r.scope === 'Scope 1' ? 'bg-red-100 text-red-700' : r.scope === 'Scope 2' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{r.scope}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">Quantity</span><span className="font-medium">{r.quantity} {r.unit}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">Emissions</span><span className="font-bold text-gray-900 dark:text-white">{r.totalEmissions?.toFixed(4)} tCO2e</span></div>
                                    {r.amount > 0 && <div className="flex justify-between"><span className="text-gray-400">Amount</span><span className="font-medium">{r.currency} {r.amount?.toLocaleString()}</span></div>}
                                    <div className="flex justify-between"><span className="text-gray-400">EF</span><span className="font-medium">{r.emissionFactor} kg CO2e/{r.unit}</span></div>
                                  </div>
                                  <div className="flex gap-2 mt-3">
                                    <a href={file.viewUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                      className="flex-1 text-center text-xs px-3 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300 hover:bg-brand-100 font-medium transition-colors">
                                      {t('history.viewDocument')}
                                    </a>
                                    <a href={file.downloadUrl} onClick={(e) => e.stopPropagation()}
                                      className="flex-1 text-center text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 font-medium transition-colors">
                                      {t('common.download')}
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                  <tr>
                    {[t('history.colTable'), t('history.colYear'), t('history.colGender'), t('history.colDetails'), t('history.colCount')].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {transformedData.map((r, i) => (
                    <tr key={r.id || i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-3 py-2"><span className="badge bg-indigo-100 text-indigo-700">{r._table}</span></td>
                      <td className="px-3 py-2">{r.year}{r.quarter ? ` Q${r.quarter}` : ''}</td>
                      <td className="px-3 py-2">{r.gender || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{r.contractType || r.disabilityStatus || r.turnoverType || r.injuryType || (r.trainingHours ? `${r.trainingHours} hrs` : '') || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{r.employeeCount || r.count || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── List View ──────────────────────────────────
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('history.title')}</h1>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder={t('history.searchPlaceholder')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input w-auto" value={fileType} onChange={(e) => { setFileType(e.target.value); setPage(1); }}>
          <option value="">{t('history.allTypes')}</option>
          <option value="E1">{t('history.environmental')}</option>
          <option value="S1">{t('history.social')}</option>
        </select>
        <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('history.allStatus')}</option>
          <option value="COMPLETED">{t('history.completed')}</option>
          <option value="PROCESSING">{t('history.processing')}</option>
          <option value="FAILED">{t('history.failed')}</option>
          <option value="DELETED">{t('history.dataDeleted')}</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
            <tr>
              {[t('history.file'), t('history.type'), t('history.orgUnit'), t('history.uploadedBy'), t('history.rows'), t('common.status'), t('history.audit'), t('common.date'), ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-sm font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">{t('history.noUploads')}</td></tr>
            ) : records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => openDetail(r.id)}>
                <td className="px-4 py-3 text-sm"><div className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-gray-400" /><span className="font-medium">{r.fileName}</span></div></td>
                <td className="px-4 py-3"><span className={`badge ${r.fileType === 'E1' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>{r.fileType}</span></td>
                <td className="px-4 py-3 text-sm text-gray-500">{r.orgUnit || '—'}</td>
                <td className="px-4 py-3 text-sm"><div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-gray-400" />{r.user?.firstName} {r.user?.lastName}</div></td>
                <td className="px-4 py-3 text-sm">{r.processedRows ?? '—'} / {r.totalRows ?? '—'}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-1.5">{statusIcon(r.status, r)}<span className="text-sm">{statusLabel(r)}</span></div></td>
                <td className="px-4 py-3">{auditBadge(r.auditStatus)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-gray-300" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="flex justify-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('history.previous')}</button>
          <span className="px-4 py-2 text-sm text-gray-500">{t('history.pageOf', { page, total: Math.ceil(total / 20) })}</span>
          <button className="btn-secondary" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>{t('common.next')}</button>
        </div>
      )}

      {detailLoading && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
            <span>{t('history.loadingDetails')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
