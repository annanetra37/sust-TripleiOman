import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Upload, FileSpreadsheet, FileImage, Loader2, ScanSearch, Sparkles, Database, Lock } from 'lucide-react';
import { HelpBanner, FieldLabel } from '../components/HelpSystem';
import ProcessingScreen from '../components/ProcessingScreen';
import DatabaseImport from '../components/DatabaseImport';
import CreditPreview from '../components/CreditPreview';
import FeatureLock from '../components/FeatureLock';
import useFeature from '../hooks/useFeature';
import { useT } from '../i18n';

export default function E1Upload() {
  const { t } = useT();
  const [orgUnits, setOrgUnits] = useState([]);
  const [tab, setTab] = useState('excel');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [reportingYear, setReportingYear] = useState(new Date().getFullYear());
  const [file, setFile] = useState(null);
  const [docFiles, setDocFiles] = useState([]);
  const [extractMode, setExtractMode] = useState('Travel');
  const [uploading, setUploading] = useState(false);
  const [uploadId, setUploadId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();
  const docFileRef = useRef();
  const pollRef = useRef();

  // Live credit estimate for the current tab's inputs.  Populated by
  // <CreditPreview/> via the onEstimate callback so we can disable the
  // action button when the balance is insufficient.
  const [excelEstimate, setExcelEstimate] = useState(null);
  const [docEstimate, setDocEstimate] = useState(null);

  // Tier entitlements — Invoices & Receipts (AI doc extract) and the
  // Database tab are Professional+ features.
  const docExtractFeature = useFeature('ai_doc_extract');
  const dbConnectionsFeature = useFeature('db_connections');

  useEffect(() => {
    api.getOrgUnits().then((units) => {
      setOrgUnits(units);
      if (units.length) setOrgUnitId(units[0].id);
    });
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (!uploadId) return;
    const poll = async () => {
      try {
        const p = await api.getE1Progress(uploadId);
        setProgress(p);
        if (p.status !== 'PROCESSING') clearInterval(pollRef.current);
      } catch {}
    };
    pollRef.current = setInterval(poll, 5000);
    poll();
    return () => clearInterval(pollRef.current);
  }, [uploadId]);

  // Cost is shown inline via <CreditPreview/> as soon as inputs are set.
  // Clicking Process/Extract runs the action directly — the user has
  // already seen the cost above the button.
  const handleExcelUpload = async () => {
    if (!file || !orgUnitId) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orgUnitId', orgUnitId);
      fd.append('reportingYear', reportingYear);
      const res = await api.uploadE1(fd);
      setUploadId(res.uploadId);
    } catch (err) {
      setError(err.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDocExtract = async () => {
    if (!docFiles.length) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      docFiles.forEach((f) => fd.append('files', f));
      fd.append('mode', extractMode);
      fd.append('orgUnitId', orgUnitId);
      fd.append('reportingYear', reportingYear);
      const res = await api.uploadDocExtract(fd);
      setUploadId(res.uploadId);
    } catch (err) {
      setError(err.error || err.message || 'Extraction failed');
    } finally {
      setUploading(false);
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  // Show processing screen when upload is active
  if (uploadId) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('upload.e1Title')}</h1>
          <p className="text-gray-500 dark:text-gray-400">{t('upload.e1ProcessingSubtitle', { year: reportingYear })}</p>
        </div>
        <ProcessingScreen progress={progress} status={progress?.status || 'PROCESSING'} type="E1" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('upload.e1Title')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('upload.e1Subtitle')}</p>
      </div>

      {/* Three ways to connect — visual cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-brand-200 dark:border-brand-800 bg-gradient-to-b from-brand-50 to-white dark:from-brand-950 dark:to-gray-900 p-4 text-center">
          <FileSpreadsheet className="w-7 h-7 text-brand-600 dark:text-brand-400 mx-auto mb-2" />
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{t('upload.spreadsheetsCard')}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t('upload.spreadsheetsE1Desc')}</p>
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-b from-amber-50 to-white dark:from-amber-950 dark:to-gray-900 p-4 text-center">
          <ScanSearch className="w-7 h-7 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{t('upload.invoicesCard')}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t('upload.invoicesDesc')}</p>
        </div>
        <a href="/connections" className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-gradient-to-b from-indigo-50 to-white dark:from-indigo-950 dark:to-gray-900 p-4 text-center hover:shadow-md transition-shadow group">
          <Database className="w-7 h-7 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 group-hover:text-indigo-700">{t('upload.sourceSystemsCard')}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t('upload.sourceSystemsE1Desc')}</p>
        </a>
      </div>

      {/* Smart processing badge */}
      <div className="p-4 bg-gradient-to-r from-brand-50/80 to-emerald-50/80 dark:from-brand-950/50 dark:to-emerald-950/50 rounded-xl border border-brand-200/60 dark:border-brand-800/60">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('upload.smartDataProcessing')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {t('upload.smartDataE1Desc')}
            </p>
          </div>
        </div>
      </div>

      {/* Reporting year + org unit */}
      <div className="card">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel label={t('upload.reportingYear')} required info={t('upload.reportingYearInfo')} />
            <select className="input" value={reportingYear} onChange={(e) => setReportingYear(parseInt(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel label={t('upload.orgUnit')} required info={t('upload.orgUnitInfo')} />
            <select className="input" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
              {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.country})</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        <button className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'excel' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`} onClick={() => setTab('excel')}>
          <FileSpreadsheet className="w-4 h-4 inline mr-1" /> {t('upload.spreadsheetTab')}
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === 'doc-extract' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'} ${!docExtractFeature.allowed ? 'opacity-70' : ''}`}
          onClick={() => setTab('doc-extract')}
          title={!docExtractFeature.allowed ? `Upgrade to ${docExtractFeature.requiredTierName} to unlock AI invoice extraction` : undefined}
        >
          <ScanSearch className="w-4 h-4 inline" /> {t('upload.invoicesTab')}
          {!docExtractFeature.allowed && <Lock className="w-3 h-3 text-gray-400" />}
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === 'database' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'} ${!dbConnectionsFeature.allowed ? 'opacity-70' : ''}`}
          onClick={() => setTab('database')}
          title={!dbConnectionsFeature.allowed ? `Upgrade to ${dbConnectionsFeature.requiredTierName} to unlock database connections` : undefined}
        >
          <Database className="w-4 h-4 inline" /> {t('upload.databaseTab')}
          {!dbConnectionsFeature.allowed && <Lock className="w-3 h-3 text-gray-400" />}
        </button>
      </div>

      {tab === 'excel' ? (
        <div className="card space-y-4">
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-emerald-400 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); }}
          >
            <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files[0])} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-green-500" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">{t('upload.dropEmissions')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('upload.dropEmissionsHint')}</p>
              </>
            )}
          </div>

          {file && (
            <CreditPreview
              action="excel-e1"
              params={{ fileSizeBytes: file.size }}
              label={t('upload.processingCost')}
              onEstimate={setExcelEstimate}
            />
          )}

          {error && <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}
          <button
            className="btn-primary w-full flex items-center justify-center gap-2"
            disabled={!file || uploading || (excelEstimate && !excelEstimate.sufficient)}
            onClick={handleExcelUpload}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {uploading
              ? t('upload.startingAi')
              : excelEstimate && !excelEstimate.sufficient
                ? t('upload.insufficientCredits', { amount: excelEstimate.credits.toLocaleString() })
                : excelEstimate
                  ? t('upload.processWithAiCredits', { year: reportingYear, credits: excelEstimate.credits.toLocaleString() })
                  : t('upload.processWithAi', { year: reportingYear })}
          </button>
        </div>
      ) : tab === 'doc-extract' ? (
        !docExtractFeature.allowed ? (
          <FeatureLock
            feature="ai_doc_extract"
            description={t('upload.docExtractLockDesc')}
          />
        ) : (
        <div className="card space-y-4">
          <div>
            <FieldLabel label={t('upload.documentType')} info={t('upload.documentTypeInfo')} />
            <select className="input" value={extractMode} onChange={(e) => setExtractMode(e.target.value)}>
              <option value="Travel">{t('upload.travelDocs')}</option>
              <option value="Stay">{t('upload.stayDocs')}</option>
              <option value="Energy">{t('upload.energyDocs')}</option>
              <option value="Company Vehicle">{t('upload.vehicleDocs')}</option>
            </select>
          </div>

          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-emerald-400 transition-colors cursor-pointer"
            onClick={() => docFileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setDocFiles([...docFiles, ...Array.from(e.dataTransfer.files)].slice(0, 20)); }}
          >
            <input ref={docFileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={(e) => setDocFiles([...docFiles, ...Array.from(e.target.files)].slice(0, 20))} />
            {docFiles.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {docFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-800 rounded px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <FileImage className="w-4 h-4 text-gray-400" />
                      <span className="truncate max-w-[300px]">{f.name}</span>
                      <span className="text-gray-400 text-xs">{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                    <button className="text-red-500 hover:text-red-700 text-xs font-medium" onClick={(e) => { e.stopPropagation(); setDocFiles(docFiles.filter((_, j) => j !== i)); }}>{t('upload.remove')}</button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <ScanSearch className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">{t('upload.dropInvoices')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('upload.dropInvoicesHint')}</p>
              </>
            )}
          </div>

          {docFiles.length > 0 && (
            <CreditPreview
              action="doc-extract"
              params={{ fileCount: docFiles.length, assumeVision: true }}
              label={t('upload.extractingDocs', { count: docFiles.length })}
              onEstimate={setDocEstimate}
            />
          )}

          {error && <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}
          <button
            className="btn-primary w-full flex items-center justify-center gap-2"
            disabled={!docFiles.length || uploading || (docEstimate && !docEstimate.sufficient)}
            onClick={handleDocExtract}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {uploading
              ? t('upload.aiReadingDocs')
              : docEstimate && !docEstimate.sufficient
                ? t('upload.insufficientCredits', { amount: docEstimate.credits.toLocaleString() })
                : docEstimate
                  ? t('upload.extractDocsCredits', { count: docFiles.length, year: reportingYear, credits: docEstimate.credits.toLocaleString() })
                  : t('upload.extractDocs', { count: docFiles.length, year: reportingYear })}
          </button>
        </div>
        )
      ) : tab === 'database' ? (
        !dbConnectionsFeature.allowed ? (
          <FeatureLock
            feature="db_connections"
            description={t('upload.dbConnectionLockDesc')}
          />
        ) : (
          <DatabaseImport
            orgUnitId={orgUnitId}
            reportingYear={reportingYear}
            type="E1"
            onProcessingStarted={(id) => setUploadId(id)}
          />
        )
      ) : null}
    </div>
  );
}
