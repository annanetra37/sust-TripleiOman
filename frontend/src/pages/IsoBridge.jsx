import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import useFeature from '../hooks/useFeature';
import FeatureLock from '../components/FeatureLock';
import CreditPreview from '../components/CreditPreview';
import { InfoTip } from '../components/HelpSystem';
import { useT } from '../i18n';
import {
  Award, FileText, Gauge, ClipboardCheck, ArrowLeftRight, Upload, Loader2,
  CalendarClock, AlertTriangle, ShieldAlert, CheckCircle2, XCircle, Sparkles,
  ChevronDown, ChevronRight, FileSearch, BadgeCheck,
} from 'lucide-react';

const RECORD_TYPE_LABELS = {
  policy: 'Policy document (environmental / OH&S / energy / anti-bribery)',
  aspectsRegister: 'Aspects & impacts register (14001 · 6.1.2)',
  complianceRegister: 'Compliance obligations register (14001 · 6.1.3)',
  objectives: 'Objectives & targets (6.2)',
  monitoring: 'Monitoring & measurement data (9.1)',
  mgmtReview: 'Management review minutes (9.3)',
  nonconformity: 'Nonconformity & corrective action log (10.2)',
  contextAnalysis: 'Context analysis (4.1 / 4.2)',
  ohsSystem: 'OH&S management-system description (45001)',
  hazardRisk: 'Hazard ID & risk assessment (45001 · 6.1.2)',
  healthServices: 'Occupational health services (45001)',
  workerParticipation: 'Worker participation & consultation (45001 · 5.4)',
  trainingRecords: 'OH&S training records (45001 · 7.2)',
  contractorControl: 'Contractor / value-chain control (45001 · 8.1.4)',
  incidentRegister: 'Incident register (45001)',
  energyReview: 'Energy review, baseline & EnPIs (50001 · 6.3–6.5)',
  ghgInventory: 'Verified GHG inventory (14064-1)',
  waterFootprint: 'Water footprint study (14046)',
  antiBribery: 'Anti-bribery records (37001)',
  supplierEvaluation: 'Supplier evaluation & control (9001 · 8.4)',
};

const STATE_STYLES = {
  populated: { label: 'Populated from ISO', cls: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', dot: 'bg-green-500' },
  partial: { label: 'Partially from ISO', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300', dot: 'bg-amber-500' },
  not_available: { label: 'Not available from ISO', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', dot: 'bg-gray-400' },
};

const REVERSE_THEME_ICONS = { climate: '🌡️', biodiversity: '🌿', resource: '⛏️', lifecycle: '🔄' };

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function IsoBridge() {
  const { t } = useT();
  const { allowed } = useFeature('iso_bridge');
  const [tab, setTab] = useState('certificates');

  const TABS = [
    { key: 'certificates', label: t('isoBridge.tabCertificates'), icon: Award },
    { key: 'evidence', label: t('isoBridge.tabEvidence'), icon: FileText },
    { key: 'coverage', label: t('isoBridge.tabCoverage'), icon: Gauge },
    { key: 'drafts', label: t('isoBridge.tabDrafts'), icon: ClipboardCheck },
    { key: 'reverse', label: t('isoBridge.tabReverse'), icon: ArrowLeftRight },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('isoBridge.title')}</h1>
          <span className="badge bg-brand-50 text-brand-600 dark:bg-brand-900 dark:text-brand-400">EcoHub™ Engine</span>
        </div>
        <p className="text-gray-500">{t('isoBridge.subtitle')}</p>
      </div>

      {/* Honesty guardrail banner — required by spec on all Bridge surfaces */}
      <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/40 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{t('isoBridge.guardrail')}</span>
      </div>

      {!allowed ? (
        <NotEntitledView t={t} />
      ) : (
        <>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit flex-wrap">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === key ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                onClick={() => setTab(key)}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          {tab === 'certificates' && <CertificatesTab t={t} />}
          {tab === 'evidence' && <EvidenceTab t={t} />}
          {tab === 'coverage' && <CoverageTab t={t} entitled />}
          {tab === 'drafts' && <DraftsTab t={t} />}
          {tab === 'reverse' && <ReverseTab t={t} />}
        </>
      )}
    </div>
  );
}

// ─── Teaser for non-entitled users (spec §11: sales surface only) ────────
function NotEntitledView({ t }) {
  return (
    <div className="space-y-6">
      <FeatureLock feature="iso_bridge" />
      <CoverageTab t={t} entitled={false} />
    </div>
  );
}

// ─── Tab 1: Certificate registry (C1) ────────────────────────────────────
function CertificatesTab({ t }) {
  const [data, setData] = useState({ certificates: [], calendar: [] });
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [estimate, setEstimate] = useState(null);
  const fileRef = useRef();

  const load = useCallback(() => {
    api.getIsoCertificates().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    if (!file) return;
    setError(''); setWarnings([]); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.uploadIsoCertificate(fd);
      setWarnings(res.warnings || []);
      setFile(null);
      load();
    } catch (err) {
      setError(err.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const fixEdition = async (id, isoEdition) => {
    await api.updateIsoCertificate(id, { isoEdition });
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload */}
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('isoBridge.uploadCertificate')}</h3>
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-brand-400 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); }}
          >
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files[0])} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <Award className="w-8 h-8 text-green-500" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-9 h-9 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">{t('isoBridge.dropCertificate')}</p>
              </>
            )}
          </div>
          {file && <CreditPreview action="cert-extract" params={{ fileCount: 1 }} label={t('isoBridge.extractionCost')} onEstimate={setEstimate} />}
          {error && <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}
          {warnings.map((w, i) => (
            <div key={i} className="p-3 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded-lg text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {w}
            </div>
          ))}
          <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={!file || uploading || (estimate && !estimate.sufficient)} onClick={handleUpload}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {uploading ? t('isoBridge.extracting') : t('isoBridge.extractMetadata')}
          </button>
        </div>

        {/* Renewal calendar */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('isoBridge.renewalCalendar')}</h3>
          </div>
          {data.calendar.length === 0 ? (
            <p className="text-sm text-gray-400">{t('isoBridge.noCalendarEntries')}</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.calendar.map((e, i) => (
                <div key={i} className={`flex items-center justify-between p-2 rounded-lg text-sm ${e.overdue ? 'bg-red-50 dark:bg-red-950/50' : 'bg-gray-50 dark:bg-gray-800'}`}>
                  <span className="font-medium">ISO {e.isoStandard} — {e.type === 'expiry' ? t('isoBridge.expiry') : t('isoBridge.surveillance')}</span>
                  <span className={e.overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}>{fmtDate(e.date)}{e.overdue ? ` · ${t('isoBridge.overdue')}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Certificate list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.certificates.map((c) => (
          <div key={c.id} className="card space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-300 font-semibold">ISO {c.isoStandard}:{c.isoEdition}</span>
                {c.accredited === false && (
                  <span className="badge bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> {t('isoBridge.unaccredited')}</span>
                )}
                {c.accredited === true && (
                  <span className="badge bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> {c.accreditationBody || t('isoBridge.accredited')}</span>
                )}
              </div>
              {c.extractionConfidence != null && <span className="text-[10px] text-gray-400">{Math.round(c.extractionConfidence * 100)}% {t('isoBridge.confidence')}</span>}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{c.certBody || '—'} · {c.certNumber || t('isoBridge.noCertNumber')}</p>
            {c.scopeStatement && <p className="text-xs text-gray-400 line-clamp-2">{c.scopeStatement}</p>}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>{t('isoBridge.issued')}: {fmtDate(c.issueDate)}</span>
              <span>{t('isoBridge.expires')}: {fmtDate(c.expiryDate)}</span>
            </div>
            {c.isoEdition === 'unknown' && (
              <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2 flex-wrap">
                <AlertTriangle className="w-3.5 h-3.5" /> {t('isoBridge.editionUnknown')}
                {['2015', '2026'].map((ed) => (
                  <button key={ed} className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900 font-medium hover:bg-amber-200" onClick={() => fixEdition(c.id, ed)}>{ed}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {data.certificates.length === 0 && (
          <div className="card text-center py-10 lg:col-span-2">
            <Award className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">{t('isoBridge.noCertificates')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 2: Evidence ingestion (C3) ──────────────────────────────────────
function EvidenceTab({ t }) {
  const [records, setRecords] = useState([]);
  const [certs, setCerts] = useState([]);
  const [recordType, setRecordType] = useState('aspectsRegister');
  const [certificateId, setCertificateId] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const load = useCallback(() => {
    api.getIsoEvidence().then((r) => setRecords(r.records)).catch(console.error);
    api.getIsoCertificates().then((r) => setCerts(r.certificates)).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  const isSpreadsheet = file && ['xlsx', 'xls', 'csv'].includes(file.name.split('.').pop().toLowerCase());

  const handleUpload = async () => {
    if (!file) return;
    setError(''); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('recordType', recordType);
      if (certificateId) fd.append('certificateId', certificateId);
      await api.uploadIsoEvidence(fd);
      setFile(null);
      load();
    } catch (err) {
      setError(err.error || 'Ingestion failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          {t('isoBridge.ingestEvidence')}
          <InfoTip>{t('isoBridge.ingestEvidenceTip')}</InfoTip>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">{t('isoBridge.documentType')}</label>
            <select className="input" value={recordType} onChange={(e) => setRecordType(e.target.value)}>
              {Object.entries(RECORD_TYPE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">{t('isoBridge.linkedCertificate')}</label>
            <select className="input" value={certificateId} onChange={(e) => setCertificateId(e.target.value)}>
              <option value="">{t('isoBridge.noLink')}</option>
              {certs.map((c) => <option key={c.id} value={c.id}>ISO {c.isoStandard}:{c.isoEdition} — {c.certNumber || c.certBody || c.id.slice(0, 8)}</option>)}
            </select>
          </div>
        </div>
        <div
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-brand-400 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); }}
        >
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files[0])} />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileSearch className="w-8 h-8 text-green-500" />
              <div className="text-left">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-9 h-9 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">{t('isoBridge.dropEvidence')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('isoBridge.anyLanguage')}</p>
            </>
          )}
        </div>
        {file && <CreditPreview action={isSpreadsheet ? 'excel-e1' : 'doc-extract'} params={isSpreadsheet ? { fileSizeBytes: file.size } : { fileCount: 1 }} label={t('isoBridge.ingestionCost')} />}
        {error && <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}
        <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={!file || uploading} onClick={handleUpload}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {uploading ? t('isoBridge.ingesting') : t('isoBridge.ingestWithAi')}
        </button>
      </div>

      <div className="card">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('isoBridge.evidenceLibrary')}</h3>
        {records.length === 0 ? (
          <p className="text-sm text-gray-400">{t('isoBridge.noEvidence')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2 pr-4">{t('isoBridge.type')}</th>
                  <th className="py-2 pr-4">{t('isoBridge.sourceFile')}</th>
                  <th className="py-2 pr-4">{t('isoBridge.location')}</th>
                  <th className="py-2 pr-4">{t('isoBridge.language')}</th>
                  <th className="py-2">{t('isoBridge.ingested')}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 pr-4 font-medium">{RECORD_TYPE_LABELS[r.recordType]?.split('(')[0].trim() || r.recordType}</td>
                    <td className="py-2 pr-4 text-gray-500">{r.sourceFileName || '—'}</td>
                    <td className="py-2 pr-4 text-gray-400 text-xs">{r.sourceLocation || '—'}</td>
                    <td className="py-2 pr-4 text-gray-500 uppercase text-xs">{r.language || '—'}</td>
                    <td className="py-2 text-gray-400 text-xs">{fmtDate(r.ingestedAt)}</td>
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

// ─── Tab 3: Coverage dashboard (C5) + gap list (C6) ─────────────────────
function CoverageTab({ t, entitled }) {
  const [standard, setStandard] = useState('GRI');
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [drafting, setDrafting] = useState({});
  const [draftMsg, setDraftMsg] = useState(null);
  const year = new Date().getFullYear();

  const load = useCallback(() => {
    setLoading(true);
    api.getIsoCoverage({ standard }).then(setCoverage).catch(console.error).finally(() => setLoading(false));
  }, [standard]);
  useEffect(() => { load(); }, [load]);

  const draftNow = async (code) => {
    setDrafting((d) => ({ ...d, [code]: true }));
    setDraftMsg(null);
    try {
      await api.generateIsoDraft({ disclosureCode: code, year, standard });
      setDraftMsg({ ok: true, text: t('isoBridge.draftCreated', { code }) });
    } catch (err) {
      setDraftMsg({ ok: false, text: err.error || 'Drafting failed' });
    } finally {
      setDrafting((d) => ({ ...d, [code]: false }));
    }
  };

  if (loading || !coverage) return <Spinner />;

  const donut = [
    { key: 'populated', count: coverage.populated, color: '#22c55e' },
    { key: 'partial', count: coverage.partial, color: '#f59e0b' },
    { key: 'not_available', count: coverage.notAvailable, color: '#cbd5e1' },
  ];

  return (
    <div className="space-y-6">
      {coverage.registrySignedOff === false && entitled && (
        <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t('isoBridge.crosswalkNotSignedOff')}</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {['GRI', 'ESRS', 'TCFD', 'ISSB'].map((s) => (
            <button key={s} className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${standard === s ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`} onClick={() => setStandard(s)}>{s}</button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{t('isoBridge.basedOnCertificates', { count: coverage.certificateCount ?? 0 })}</span>
      </div>

      {/* Coverage summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <Gauge className="w-5 h-5 text-brand-600" />
          <span className="text-sm text-gray-500">{t('isoBridge.coverageScore')}</span>
          <span className="text-2xl font-bold">{coverage.coveragePct}%</span>
        </div>
        {donut.map((d) => (
          <div key={d.key} className="stat-card">
            <span className={`w-3 h-3 rounded-full ${STATE_STYLES[d.key].dot}`} />
            <span className="text-sm text-gray-500">{STATE_STYLES[d.key].label}</span>
            <span className="text-2xl font-bold">{d.count}<span className="text-sm font-normal text-gray-400"> / {coverage.required}</span></span>
          </div>
        ))}
      </div>

      {/* Defensible framing — replaces the vague marketing claim */}
      <div className="card py-3 text-sm text-gray-600 dark:text-gray-300 italic">{coverage.framing}</div>

      {coverage.teaser ? (
        <div className="card text-center py-8 text-sm text-gray-500">{t('isoBridge.teaserNote')}</div>
      ) : (
        <>
          {draftMsg && (
            <div className={`p-3 rounded-lg text-sm ${draftMsg.ok ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'}`}>{draftMsg.text}</div>
          )}

          {/* Per-disclosure coverage */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('isoBridge.perDisclosure')}</h3>
            <div className="space-y-1.5">
              {coverage.disclosures.map((d) => (
                <div key={d.code} className="rounded-lg border border-gray-100 dark:border-gray-800">
                  <button className="w-full flex items-center justify-between p-2.5 text-left" onClick={() => setExpanded((e) => ({ ...e, [d.code]: !e[d.code] }))}>
                    <div className="flex items-center gap-2 min-w-0">
                      {expanded[d.code] ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                      <span className="font-medium text-sm">{d.code}</span>
                      <span className="text-xs text-gray-400 truncate">{d.name}</span>
                    </div>
                    <span className={`badge shrink-0 ${STATE_STYLES[d.state].cls}`}>{STATE_STYLES[d.state].label}</span>
                  </button>
                  {expanded[d.code] && (
                    <div className="px-8 pb-3 space-y-2">
                      {d.sources.length > 0 ? d.sources.map((s, i) => (
                        <p key={i} className="text-xs text-gray-500">
                          ISO {s.isoStandard} · {t('isoBridge.clause')} {s.clause} — {s.clauseTitle}
                          {s.partial && <span className="text-amber-600 ml-1">({t('isoBridge.partialSource')})</span>}
                        </p>
                      )) : <p className="text-xs text-gray-400">{t('isoBridge.noIsoSource')}</p>}
                      {d.state !== 'not_available' && d.type === 'narrative' && (
                        <button className="btn-secondary text-xs flex items-center gap-1.5" disabled={drafting[d.code]} onClick={() => draftNow(d.code)}>
                          {drafting[d.code] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          {t('isoBridge.draftFromIso')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Gap-to-action list */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{t('isoBridge.gapList')}</h3>
            <p className="text-xs text-gray-400 mb-3">{t('isoBridge.gapListSubtitle')}</p>
            {coverage.gaps.length === 0 ? (
              <p className="text-sm text-gray-400">{t('isoBridge.noGaps')}</p>
            ) : (
              <div className="space-y-2">
                {coverage.gaps.map((g) => (
                  <div key={g.code} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium">{g.code} <span className="text-gray-400 font-normal">{g.name}</span></p>
                      <p className="text-xs text-gray-500 mt-0.5">{g.recommendedAction.action}</p>
                    </div>
                    <span className="badge bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 shrink-0">{g.recommendedAction.module}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab 4: Draft review queue (C4) ──────────────────────────────────────
function DraftsTab({ t }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState({});

  const load = useCallback(() => {
    api.getIsoDrafts().then((r) => setDrafts(r.drafts)).catch(console.error).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (id, decision) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await api.reviewIsoDraft(id, { decision, editedText: editing[id] || undefined });
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  if (loading) return <Spinner />;

  const STATUS_BADGE = {
    DRAFT: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">{t('isoBridge.draftsIntro')}</p>
      {drafts.length === 0 && (
        <div className="card text-center py-10">
          <ClipboardCheck className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">{t('isoBridge.noDrafts')}</p>
        </div>
      )}
      {drafts.map((d) => (
        <div key={d.id} className="card space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{d.disclosureCode}</span>
              <span className="text-xs text-gray-400">{d.standard} · {d.year}</span>
              <span className={`badge ${STATUS_BADGE[d.status]}`}>{d.status}</span>
              {d.confidence != null && <span className="text-[10px] text-gray-400">{Math.round(d.confidence * 100)}% {t('isoBridge.confidence')}</span>}
            </div>
            <span className="text-[10px] text-gray-400">{d.modelVersion} · {d.promptVersion}</span>
          </div>

          {d.status === 'DRAFT' ? (
            <textarea
              className="input w-full text-sm min-h-32"
              defaultValue={d.draftText}
              onChange={(e) => setEditing((ed) => ({ ...ed, [d.id]: e.target.value }))}
            />
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{d.editedText || d.draftText}</p>
          )}

          {/* Provenance — every draft cites its source */}
          <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 space-y-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{t('isoBridge.provenance')}</p>
            {(Array.isArray(d.citations) ? d.citations : []).map((c, i) => (
              <p key={i} className="text-xs text-gray-500">
                ISO {c.isoStandard} · {t('isoBridge.clause')} {c.clause} ({c.clauseTitle}) — {c.sourceFileName || t('isoBridge.uploadedDocument')}{c.sourceLocation ? `, ${c.sourceLocation}` : ''}
              </p>
            ))}
          </div>

          {d.status === 'DRAFT' && (
            <div className="flex gap-2">
              <button className="btn-primary flex items-center gap-1.5 text-sm" disabled={busy[d.id]} onClick={() => review(d.id, 'approve')}>
                <CheckCircle2 className="w-4 h-4" /> {t('isoBridge.approve')}
              </button>
              <button className="btn-secondary flex items-center gap-1.5 text-sm" disabled={busy[d.id]} onClick={() => review(d.id, 'reject')}>
                <XCircle className="w-4 h-4" /> {t('isoBridge.reject')}
              </button>
              <span className="text-[10px] text-gray-400 self-center">{t('isoBridge.approveHint')}</span>
            </div>
          )}
          {d.status !== 'DRAFT' && d.reviewedAt && (
            <p className="text-[10px] text-gray-400">{t('isoBridge.reviewedAt', { date: fmtDate(d.reviewedAt) })}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab 5: Reverse bridge (C7) ──────────────────────────────────────────
function ReverseTab({ t }) {
  const [data, setData] = useState({ packs: [], themes: {}, disclaimer: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState('');
  const [openPack, setOpenPack] = useState(null);
  const year = new Date().getFullYear();

  const load = useCallback(() => {
    api.getIsoReverseExports().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const generate = async (theme) => {
    setBusy((b) => ({ ...b, [theme]: true }));
    setError('');
    try {
      await api.generateIsoReverseExport({ theme, year });
      load();
    } catch (err) {
      setError(err.error || 'Generation failed');
    } finally {
      setBusy((b) => ({ ...b, [theme]: false }));
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-300">
        {data.disclaimer}
      </div>
      <p className="text-sm text-gray-500">{t('isoBridge.reverseIntro')}</p>
      {error && <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(data.themes).map(([key, theme]) => (
          <div key={key} className="card space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{REVERSE_THEME_ICONS[key]}</span>
              <h3 className="font-semibold">{theme.label}</h3>
              <span className="badge bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{t('isoBridge.clauses')} {theme.targetClauses.join(' / ')}</span>
            </div>
            <p className="text-xs text-gray-500">{theme.description}</p>
            <p className="text-[10px] text-gray-400">{t('isoBridge.requires')}: {theme.requiredData}</p>
            <button className="btn-primary text-sm flex items-center gap-1.5 w-fit" disabled={busy[key]} onClick={() => generate(key)}>
              {busy[key] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
              {t('isoBridge.generatePack', { year })}
            </button>
          </div>
        ))}
      </div>

      {data.packs.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('isoBridge.generatedPacks')}</h3>
          <div className="space-y-2">
            {data.packs.map((p) => (
              <div key={p.id} className="rounded-lg border border-gray-100 dark:border-gray-800">
                <button className="w-full flex items-center justify-between p-3 text-left" onClick={() => setOpenPack(openPack === p.id ? null : p.id)}>
                  <span className="text-sm font-medium">{REVERSE_THEME_ICONS[p.theme]} {data.themes[p.theme]?.label || p.theme} — {p.year}</span>
                  <span className="text-xs text-gray-400">{fmtDate(p.generatedAt)}</span>
                </button>
                {openPack === p.id && (
                  <div className="px-4 pb-4 space-y-3">
                    {(p.contentBlocks?.blocks || []).map((b, i) => (
                      <div key={i} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="badge bg-brand-50 text-brand-600 dark:bg-brand-900 dark:text-brand-300">14001:2026 · {b.clause}</span>
                          <span className="text-xs font-medium">{b.title}</span>
                          <span className="text-[10px] text-gray-400 uppercase">{b.type}</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{b.body}</p>
                        {b.dataRefs?.length > 0 && <p className="text-[10px] text-gray-400 mt-1">{t('isoBridge.basedOn')}: {b.dataRefs.join(', ')}</p>}
                      </div>
                    ))}
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">{p.contentBlocks?.disclaimer || data.disclaimer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <div className="flex items-center justify-center h-48"><div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
}
