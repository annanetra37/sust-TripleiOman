import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  Package, Upload, Loader2, AlertCircle, Trash2, ArrowLeft, CheckCircle,
  XCircle, AlertTriangle, Search, FileSpreadsheet, Play, Download, FileText,
  BarChart3, Sparkles, Wand2,
} from 'lucide-react';
import { HelpBanner } from '../../components/HelpSystem';
import BenchmarkBadge from '../../components/BenchmarkBadge';
import { useT } from '../../i18n';

const CONFIDENCE_COLORS = {
  high: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  low: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

function confidenceLevel(c) {
  if (c >= 0.85) return 'high';
  if (c >= 0.70) return 'medium';
  return 'low';
}

function ConfidencePill({ value }) {
  const level = confidenceLevel(value);
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${CONFIDENCE_COLORS[level]}`}>
      {Math.round(value * 100)}%
    </span>
  );
}

export default function ProductDetail() {
  const { t } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('bom');

  // BOM upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProduct(await api.getProduct(id));
    } catch (err) {
      setError(err.error || 'Failed to load product.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleBomUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await api.uploadBom(id, fd);
      setUploadResult(result);
      await load();
    } catch (err) {
      setError(err.error || 'BOM upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleBomUpload(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) handleBomUpload(file);
  };

  const handleDeleteProduct = async () => {
    if (!confirm(`Delete product "${product.name}" and all its BOM data?`)) return;
    try {
      await api.deleteProduct(id);
      navigate('/pcf');
    } catch (err) {
      setError(err.error || 'Could not delete product.');
    }
  };

  const handleDeleteBomItem = async (itemId) => {
    try {
      await api.deleteBomItem(itemId);
      await load();
    } catch (err) {
      setError(err.error || 'Could not delete BOM item.');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;
  }

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{error || 'Product not found.'}</p>
        <button onClick={() => navigate('/pcf')} className="btn-secondary mt-4">Back to products</button>
      </div>
    );
  }

  const boms = product.boms || [];
  const calculations = product.calculations || [];
  const latestCalc = calculations[0];

  // Split BOM items into "needs review" (low confidence) and "confirmed"
  const bomWithConfidence = uploadResult
    ? boms.map((b) => {
        const matched = uploadResult.items?.find((r) => r.bomItemId === b.id);
        return { ...b, confidence: matched?.confidence ?? 1, originalText: matched?.originalText ?? '' };
      })
    : boms.map((b) => ({ ...b, confidence: 1, originalText: '' }));

  const needsReview = bomWithConfidence.filter((b) => b.confidence < 0.70);
  const confirmed = bomWithConfidence.filter((b) => b.confidence >= 0.70);

  const tabs = [
    { key: 'bom', label: t('pcf.bom'), count: boms.length },
    { key: 'calculations', label: t('pcf.calculations'), count: calculations.length },
    { key: 'whatif', label: t('pcf.whatIf'), count: 0 },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/pcf')} className="mt-1 text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{product.name}</h1>
            <span className="font-mono text-sm text-gray-400">{product.sku}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span>{product.sector}</span>
            <span>{product.functionalUnit}</span>
            {product.massKg && <span>{product.massKg} kg</span>}
            <span>{product.methodology}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {latestCalc && (
            <div>
              <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                {latestCalc.totalKgCo2e.toFixed(2)} <span className="text-sm font-normal">kgCO2e</span>
              </p>
              <p className="text-xs text-gray-400">{Math.round(latestCalc.primaryDataPct * 100)}% {t('pcf.primaryData')}</p>
            </div>
          )}
        </div>
        <button onClick={handleDeleteProduct} className="text-gray-400 hover:text-red-500 mt-1" title={t('common.delete')}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count > 0 && <span className="ml-1.5 text-[10px] bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* BOM tab */}
      {tab === 'bom' && (
        <div className="space-y-4">
          {/* Two paths: upload a BOM spreadsheet OR generate one from a
              natural-language product description.  Either way ends in the
              same confidence-review table. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Drop zone — primary path when the user has a BOM file */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                dragOver
                  ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30'
                  : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
              }`}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">{t('pcf.classifyingBom')}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('pcf.uploadMapClassify')}</p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-7 h-7 text-gray-400 mx-auto mb-2" />
                  <p className="font-semibold text-gray-700 dark:text-gray-300">
                    {t('pcf.uploadBom')}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{t('pcf.dropBomFile')}</p>
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" id="bom-file" onChange={handleFileInput} />
                  <label htmlFor="bom-file" className="btn-secondary mt-3 inline-flex items-center gap-2 cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4" /> {t('pcf.browseFiles')}
                  </label>
                  <p className="text-[11px] text-gray-400 mt-2">
                    {t('pcf.anyColumnOrder')}
                  </p>
                </>
              )}
            </div>

            {/* Generator — fallback path for customers without a BOM file */}
            <div className="border-2 border-dashed rounded-xl p-6 text-center bg-gradient-to-br from-brand-50/30 to-white dark:from-brand-950/20 dark:to-gray-900 border-brand-200 dark:border-brand-900">
              <Wand2 className="w-7 h-7 text-brand-500 mx-auto mb-2" />
              <p className="font-semibold text-gray-700 dark:text-gray-300">
                {t('pcf.noBomFile')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('pcf.describeProduct')}</p>
              <button
                type="button"
                onClick={() => setShowGenerator(true)}
                disabled={uploading}
                className="btn-primary mt-3 inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> {t('pcf.generateFromDescription')}
              </button>
              <p className="text-[11px] text-gray-400 mt-2">
                {t('pcf.industryProportions')}
              </p>
            </div>
          </div>

          {/* Upload result summary */}
          {uploadResult && (
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg text-sm text-green-700 dark:text-green-400 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                BOM uploaded: {uploadResult.inputRows} rows → {uploadResult.classifiedRows} components classified.
                {needsReview.length > 0 && <strong> {needsReview.length} need review (low confidence).</strong>}
              </span>
            </div>
          )}

          {/* Needs review band */}
          {needsReview.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> {t('pcf.needsReview')} ({needsReview.length})
              </p>
              {needsReview.map((b) => (
                <BomRow key={b.id} item={b} onDelete={handleDeleteBomItem} showConfidence />
              ))}
            </div>
          )}

          {/* Confirmed BOM rows */}
          {confirmed.length > 0 && (
            <div className="space-y-1">
              {needsReview.length > 0 && (
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-4">
                  {t('pcf.confirmed')} ({confirmed.length})
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">{t('pcf.colComponent')}</th>
                      <th className="pb-2 font-medium">{t('pcf.colMaterialClass')}</th>
                      <th className="pb-2 font-medium">{t('pcf.colQty')}</th>
                      <th className="pb-2 font-medium">{t('pcf.colUnit')}</th>
                      <th className="pb-2 font-medium">{t('pcf.colStage')}</th>
                      <th className="pb-2 font-medium">{t('pcf.colFactor')}</th>
                      {uploadResult && <th className="pb-2 font-medium">{t('pcf.colConfidence')}</th>}
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmed.map((b, i) => (
                      <tr key={b.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900">
                        <td className="py-2 text-gray-400">{i + 1}</td>
                        <td className="py-2 font-medium text-gray-800 dark:text-gray-200">{b.component?.name || '—'}</td>
                        <td className="py-2"><span className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{b.component?.materialClass || '—'}</span></td>
                        <td className="py-2">{b.quantity}</td>
                        <td className="py-2 text-gray-500">{b.unit}</td>
                        <td className="py-2"><span className="badge bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px]">{b.lifecycleStage}</span></td>
                        <td className="py-2 text-xs text-gray-500">
                          {b.chosenFactorId ? (
                            <span title="Emission factor matched">{b.component?.materialClass}</span>
                          ) : (
                            <span className="text-amber-500">{t('pcf.noFactor')}</span>
                          )}
                        </td>
                        {uploadResult && (
                          <td className="py-2"><ConfidencePill value={b.confidence} /></td>
                        )}
                        <td className="py-2">
                          <button onClick={() => handleDeleteBomItem(b.id)} className="text-gray-400 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {boms.length === 0 && !uploadResult && (
            <div className="card text-center py-8 text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('pcf.noBomData')}</p>
            </div>
          )}
        </div>
      )}

      {/* Calculations tab */}
      {tab === 'calculations' && (
        <CalculationsTab
          product={product}
          boms={boms}
          calculations={calculations}
          onCalculated={load}
          setError={setError}
        />
      )}

      {/* What-If tab */}
      {tab === 'whatif' && (
        <WhatIfTab product={product} boms={boms} setError={setError} />
      )}

      {/* AI BOM generator modal */}
      {showGenerator && (
        <BomGeneratorModal
          product={product}
          onClose={() => setShowGenerator(false)}
          onGenerated={async (result) => {
            setUploadResult(result);
            setShowGenerator(false);
            await load();
          }}
          setError={setError}
        />
      )}
    </div>
  );
}

function CalculationsTab({ product, boms, calculations, onCalculated, setError }) {
  const { t } = useT();
  const [calculating, setCalculating] = useState(false);
  const latestCalc = calculations[0] || null;

  const runCalculation = async () => {
    setCalculating(true);
    setError('');
    try {
      await api.calculatePcf(product.id);
      await onCalculated();
    } catch (err) {
      setError(err.error || 'Calculation failed.');
    } finally {
      setCalculating(false);
    }
  };

  if (boms.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-400">
        <p className="text-sm">Upload a BOM first, then run a PCF calculation.</p>
      </div>
    );
  }

  const stages = latestCalc?.breakdownByStage || {};
  const comps = (latestCalc?.breakdownByComp || []).slice(0, 10);
  const stageTotal = Object.values(stages).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="space-y-4">
      {/* Run button */}
      <div className="flex items-center gap-4">
        <button
          onClick={runCalculation}
          disabled={calculating}
          className="btn-primary flex items-center gap-2"
        >
          {calculating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('pcf.calculating')}</>
            : <><Play className="w-4 h-4" /> {t('pcf.runCalculation')}</>}
        </button>
        <span className="text-xs text-gray-400">
          {boms.length} {t('pcf.components')} · {t('pcf.creditPerRun')}
        </span>
      </div>

      {/* Latest result */}
      {latestCalc && (
        <>
          {/* Hero metric */}
          <div className="card bg-gradient-to-br from-brand-50 to-white dark:from-brand-950 dark:to-gray-900 text-center py-8">
            <p className="text-4xl font-bold text-brand-600 dark:text-brand-400">
              {latestCalc.totalKgCo2e} <span className="text-lg font-normal">kgCO2e</span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('pcf.uncertainty')}: {latestCalc.uncertaintyLow} – {latestCalc.uncertaintyHigh} kgCO2e
              <span className="ml-2 text-gray-400">(p5 – p95, 1000 {t('pcf.monteCarloIterations')})</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t('pcf.primaryData')}: {Math.round(latestCalc.primaryDataPct * 100)}% · {t('pcf.engineVersion')} v{latestCalc.engineVersion} · {latestCalc.status}
            </p>
            <div className="mt-2 flex items-center justify-center">
              <BenchmarkBadge kpiCode="PCF_TOTAL" value={latestCalc.totalKgCo2e} region="GLO" />
            </div>

            {/* Export buttons */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <a
                href={api.exportPcfPdf(latestCalc.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4" /> {t('pcf.pdfStatement')}
              </a>
              <a
                href={api.exportPcfPact(latestCalc.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" /> {t('pcf.pactJson')}
              </a>
            </div>
          </div>

          {/* Stage breakdown */}
          {Object.keys(stages).length > 0 && (
            <div className="card space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-brand-600" /> {t('pcf.lifecycleBreakdown')}
              </h3>
              <div className="space-y-2">
                {Object.entries(stages).sort((a, b) => b[1] - a[1]).map(([stage, kg]) => {
                  const pct = (kg / stageTotal) * 100;
                  return (
                    <div key={stage}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{stage}</span>
                        <span className="text-gray-500">{kg.toFixed(4)} kgCO2e ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top 10 components */}
          {comps.length > 0 && (
            <div className="card space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('pcf.topComponents')}</h3>
              <div className="space-y-1">
                {comps.map((c, i) => (
                  <div key={c.componentId + i} className="flex items-center gap-3 text-sm py-1.5 border-b dark:border-gray-800 last:border-0">
                    <span className="w-6 text-right text-gray-400 text-xs">{i + 1}</span>
                    <span className="flex-1 font-medium text-gray-700 dark:text-gray-300 truncate">{c.name}</span>
                    <span className="font-mono text-[11px] text-gray-400">{c.materialClass}</span>
                    <span className="text-right w-24">{c.kgCo2e} kgCO2e</span>
                    <span className="text-right w-14 text-gray-500">{c.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calculation history */}
          {calculations.length > 1 && (
            <div className="card space-y-2">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('pcf.calcHistory')}</h3>
              {calculations.map((c) => (
                <div key={c.id} className="flex items-center gap-4 text-sm py-1.5 border-b dark:border-gray-800 last:border-0">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{c.totalKgCo2e} kgCO2e</span>
                  <span className="text-xs text-gray-400">{c.uncertaintyLow} – {c.uncertaintyHigh}</span>
                  <span className="text-xs text-gray-400 flex-1">{new Date(c.runAt).toLocaleString()}</span>
                  <span className={`badge text-[10px] ${c.status === 'final' ? 'bg-green-100 text-green-700' : c.status === 'verified' ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>
                  <a href={api.exportPcfPdf(c.id)} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700" title="Export PDF">
                    <FileText className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── What-If Simulator (PCF-04) ────────────────────────────────────────────
// Side-by-side layout: baseline on the left, scenario on the right, delta
// badge in the middle.  Three pre-built scenario templates (recycled
// materials, site energy switch, supplier relocation) that populate the
// overrides in one click.

const SCENARIO_TEMPLATE_KEYS = {
  recycled: { title: 'pcf.recycledMaterials', description: 'pcf.recycledDesc' },
  renewable_ppa: { title: 'pcf.renewablePpa', description: 'pcf.renewableDesc' },
  supplier_relocation: { title: 'pcf.supplierRelocation', description: 'pcf.relocationDesc' },
};

const SCENARIO_TEMPLATES = [
  {
    id: 'recycled',
    title: 'Recycled materials',
    description: 'Swap primary metals for their recycled equivalents.',
    // Each swap maps "if you see this materialClass, try this one instead"
    materialSwaps: [
      { from: 'aluminum_6061', to: 'aluminum_6061_rec' },
      { from: 'copper_primary', to: 'copper_recycled' },
      { from: 'aluminum_adc12', to: 'aluminum_6061_rec' },
    ],
  },
  {
    id: 'renewable_ppa',
    title: 'Renewable PPA at all sites',
    description: 'Swap every region\'s grid electricity to EU-mix as a proxy for PPA-backed supply.',
    regionSwap: { toRegion: 'EU' },
  },
  {
    id: 'supplier_relocation',
    title: 'Relocate assembly to Vietnam',
    description: 'Swap every grid electricity factor to VN.',
    regionSwap: { toRegion: 'VN' },
  },
];

function WhatIfTab({ product, boms, setError }) {
  const { t } = useT();
  const [scenarioId, setScenarioId] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [scrapOverrideBomId, setScrapOverrideBomId] = useState('');
  const [scrapRate, setScrapRate] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  // Saved scenarios
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listScenarios(product.id).then(setSavedScenarios).catch(() => {});
  }, [product.id]);

  const saveScenario = async () => {
    if (!saveName.trim() || !result) return;
    setSaving(true);
    try {
      const saved = await api.saveScenario(product.id, { name: saveName.trim(), overrides });
      setSavedScenarios((prev) => [saved, ...prev]);
      setSaveName('');
    } catch (err) {
      setError(err.error || 'Could not save scenario.');
    } finally {
      setSaving(false);
    }
  };

  const deleteScenario = async (id) => {
    try {
      await api.deleteScenario(id);
      setSavedScenarios((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err.error || 'Could not delete scenario.');
    }
  };

  const loadSavedScenario = (scenario) => {
    setScenarioId(scenario.id);
    setOverrides(scenario.overrides || {});
    setResult({
      baseline: scenario.baselineResult,
      scenario: scenario.scenarioResult,
      delta: { kgCo2e: scenario.deltaKgCo2e, pct: scenario.deltaPct, direction: scenario.deltaKgCo2e < 0 ? 'reduction' : scenario.deltaKgCo2e > 0 ? 'increase' : 'none' },
    });
  };

  const applyTemplate = (tpl) => {
    setScenarioId(tpl.id);
    const ov = {};

    if (tpl.materialSwaps) {
      // Translate "from material class" to a list of bomId overrides.
      const swaps = [];
      for (const { from, to } of tpl.materialSwaps) {
        const matches = boms.filter((b) => b.component?.materialClass === from);
        for (const b of matches) swaps.push({ bomId: b.id, newMaterialClass: to });
      }
      if (swaps.length > 0) ov.materialSwaps = swaps;
    }
    if (tpl.regionSwap) {
      ov.regionSwap = tpl.regionSwap;
    }

    setOverrides(ov);
    setResult(null);
  };

  const addScrapOverride = () => {
    if (!scrapOverrideBomId) return;
    setOverrides((prev) => ({
      ...prev,
      scrapRateChanges: [
        ...(prev.scrapRateChanges || []).filter((s) => s.bomId !== scrapOverrideBomId),
        { bomId: scrapOverrideBomId, newScrapRatePct: parseFloat(scrapRate) || 0 },
      ],
    }));
  };

  const clearOverrides = () => {
    setScenarioId(null);
    setOverrides({});
    setResult(null);
  };

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const r = await api.simulatePcf(product.id, overrides);
      setResult(r);
    } catch (err) {
      setError(err.error || 'Simulation failed.');
    } finally {
      setRunning(false);
    }
  };

  if (boms.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-400">
        <p className="text-sm">Upload a BOM first to explore what-if scenarios.</p>
      </div>
    );
  }

  const overrideCount =
    (overrides.materialSwaps?.length || 0) +
    (overrides.factorSwaps?.length || 0) +
    (overrides.scrapRateChanges?.length || 0) +
    (overrides.processOverrides?.length || 0) +
    (overrides.regionSwap ? 1 : 0);

  return (
    <div className="space-y-4">
      <HelpBanner id="pcf-whatif-guide" title="Pose a question, see the delta" variant="tip">
        What if you swap to recycled aluminum? What if assembly moves to Vietnam?
        Pick a template or build a custom scenario — the simulator re-runs the LCA
        engine in-memory and shows you the delta against your current baseline.
        Nothing is persisted until you accept the scenario.
      </HelpBanner>

      {/* Template picker */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SCENARIO_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => applyTemplate(tpl)}
            className={`p-3 rounded-xl border-2 text-left transition-colors ${
              scenarioId === tpl.id
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
            }`}
          >
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{SCENARIO_TEMPLATE_KEYS[tpl.id] ? t(SCENARIO_TEMPLATE_KEYS[tpl.id].title) : tpl.title}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{SCENARIO_TEMPLATE_KEYS[tpl.id] ? t(SCENARIO_TEMPLATE_KEYS[tpl.id].description) : tpl.description}</p>
          </button>
        ))}
      </div>

      {/* Manual scrap-rate override */}
      <div className="card space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('pcf.customScrapRate')}</p>
        <div className="flex items-center gap-2">
          <select
            className="input flex-1"
            value={scrapOverrideBomId}
            onChange={(e) => setScrapOverrideBomId(e.target.value)}
          >
            <option value="">{t('pcf.selectComponent')}</option>
            {boms.map((b) => (
              <option key={b.id} value={b.id}>{b.component?.name || b.id}</option>
            ))}
          </select>
          <input
            type="number"
            step="1"
            min="0"
            max="100"
            className="input w-24"
            placeholder="%"
            value={scrapRate}
            onChange={(e) => setScrapRate(e.target.value)}
          />
          <button type="button" onClick={addScrapOverride} className="btn-secondary text-sm">{t('common.add')}</button>
        </div>
        {overrides.scrapRateChanges?.length > 0 && (
          <div className="text-xs text-gray-500">
            {overrides.scrapRateChanges.map((s) => {
              const b = boms.find((x) => x.id === s.bomId);
              return (
                <span key={s.bomId} className="inline-block mr-2 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                  {b?.component?.name || s.bomId}: {s.newScrapRatePct}%
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Run + clear */}
      <div className="flex items-center gap-3">
        <button onClick={run} disabled={running || overrideCount === 0} className="btn-primary flex items-center gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {t('pcf.runScenario')}
        </button>
        {overrideCount > 0 && (
          <button onClick={clearOverrides} className="btn-secondary text-sm">{t('pcf.clearScenario')}</button>
        )}
        <span className="text-xs text-gray-400">
          {overrideCount} {t('pcf.overrides')} · {t('pcf.stateless')}
        </span>
      </div>

      {/* Result: side-by-side + delta */}
      {result && (
        <div className="card p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4 items-center">
            <div className="text-center">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('pcf.baseline')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {result.baseline.totalKgCo2e} <span className="text-sm font-normal text-gray-500">kgCO2e</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                p5–p95: {result.baseline.uncertaintyLow} – {result.baseline.uncertaintyHigh}
              </p>
            </div>

            <div className="text-center">
              <div className={`inline-flex items-center justify-center gap-1 px-4 py-2 rounded-full ${
                result.delta.direction === 'reduction'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : result.delta.direction === 'increase'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    : 'bg-gray-100 text-gray-500'
              }`}>
                <span className="text-lg font-bold">
                  {result.delta.kgCo2e > 0 ? '+' : ''}{result.delta.kgCo2e}
                </span>
                <span className="text-xs">kgCO2e</span>
              </div>
              <p className="text-[10px] font-semibold mt-1 text-gray-500">
                {result.delta.pct > 0 ? '+' : ''}{result.delta.pct}%
              </p>
            </div>

            <div className="text-center">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('pcf.scenario')}</p>
              <p className={`text-2xl font-bold ${
                result.delta.direction === 'reduction'
                  ? 'text-green-600 dark:text-green-400'
                  : result.delta.direction === 'increase'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-900 dark:text-gray-100'
              }`}>
                {result.scenario.totalKgCo2e} <span className="text-sm font-normal">kgCO2e</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                p5–p95: {result.scenario.uncertaintyLow} – {result.scenario.uncertaintyHigh}
              </p>
            </div>
          </div>

          {/* Stage-level delta */}
          <div className="pt-3 border-t dark:border-gray-800">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('pcf.stageByStage')}</p>
            <StageDelta baseline={result.baseline.breakdownByStage} scenario={result.scenario.breakdownByStage} />
          </div>

          {/* Save this scenario */}
          <div className="pt-3 border-t dark:border-gray-800 flex items-center gap-2">
            <input
              className="input flex-1"
              placeholder="Name this scenario (e.g. 'Recycled aluminum + EU PPA')..."
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <button
              onClick={saveScenario}
              disabled={saving || !saveName.trim()}
              className="btn-primary flex items-center gap-2 shrink-0"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {t('pcf.saveScenario')}
            </button>
          </div>
        </div>
      )}

      {/* Saved scenarios list */}
      {savedScenarios.length > 0 && (
        <div className="card space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{t('pcf.savedScenarios')}</h3>
          {savedScenarios.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadSavedScenario(s)}>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{s.name}</p>
                <p className="text-[11px] text-gray-400">
                  {new Date(s.createdAt).toLocaleDateString()} · delta: {s.deltaKgCo2e > 0 ? '+' : ''}{s.deltaKgCo2e} kgCO2e ({s.deltaPct > 0 ? '+' : ''}{s.deltaPct}%)
                </p>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                s.deltaKgCo2e < 0 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : s.deltaKgCo2e > 0 ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                : 'bg-gray-100 text-gray-500'
              }`}>
                {s.deltaKgCo2e < 0 ? t('pcf.reduction') : s.deltaKgCo2e > 0 ? t('pcf.increase') : 'neutral'}
              </span>
              <button onClick={() => deleteScenario(s.id)} className="text-gray-400 hover:text-red-500 shrink-0" title="Delete scenario">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StageDelta({ baseline, scenario }) {
  const allStages = [...new Set([...Object.keys(baseline), ...Object.keys(scenario)])].sort();
  return (
    <div className="space-y-1">
      {allStages.map((stage) => {
        const b = baseline[stage] || 0;
        const s = scenario[stage] || 0;
        const delta = s - b;
        return (
          <div key={stage} className="flex items-center gap-3 text-xs">
            <span className="w-8 font-mono text-gray-500">{stage}</span>
            <span className="w-24 text-right text-gray-500">{b.toFixed(3)}</span>
            <span className="text-gray-400">→</span>
            <span className="w-24 text-right font-semibold text-gray-800 dark:text-gray-200">{s.toFixed(3)}</span>
            <span className={`w-24 text-right font-semibold ${delta < 0 ? 'text-green-600' : delta > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {delta > 0 ? '+' : ''}{delta.toFixed(3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BomRow({ item, onDelete, showConfidence }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.component?.name || '—'}</p>
        <p className="text-[11px] text-gray-500">
          {item.component?.materialClass || '?'} · {item.quantity} {item.unit} · {item.lifecycleStage}
          {item.originalText && <span className="ml-2 italic text-gray-400">"{item.originalText.slice(0, 60)}"</span>}
        </p>
      </div>
      {showConfidence && <ConfidencePill value={item.confidence} />}
      <button onClick={() => onDelete(item.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ─── AI BOM Generator modal ─────────────────────────────────────────────────
// Collects a natural-language description from the user and any structural
// hints (assembly country, supplier), then POSTs to /bom-generate.  The
// backend writes the BOM rows directly — the modal closes and the main page
// re-fetches so the confidence table reflects the new AI-proposed BOM.
function BomGeneratorModal({ product, onClose, onGenerated, setError }) {
  const { t } = useT();
  const [description, setDescription] = useState('');
  const [massHint, setMassHint] = useState(product.massKg || '');
  const [originCountry, setOriginCountry] = useState('');
  const [supplierHint, setSupplierHint] = useState('');
  const [generating, setGenerating] = useState(false);
  const [localErr, setLocalErr] = useState('');

  const minChars = 15;
  const remaining = Math.max(0, minChars - description.trim().length);

  const submit = async () => {
    if (description.trim().length < minChars) {
      setLocalErr(`Please add at least ${remaining} more character(s) so the AI has enough context.`);
      return;
    }
    setLocalErr('');
    setGenerating(true);
    try {
      const result = await api.generateBom(product.id, {
        description: description.trim(),
        massHint: massHint ? parseFloat(massHint) : null,
        originCountry: originCountry.trim() || null,
        supplierHint: supplierHint.trim() || null,
      });
      onGenerated(result);
    } catch (err) {
      const msg = err.error || 'AI BOM generation failed.';
      setLocalErr(msg);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const suggestions = [
    `A consumer-grade 2TB NVMe SSD in an M.2 2280 form factor. Aluminum heatsink, single PCB with DRAM cache, NAND flash chips, a Phison controller, passives. Retail packaging in cardboard with anti-static bag.`,
    `An industrial temperature sensor with a stainless steel housing, PCB controller, connector, and shielded cable. Approximate mass 0.25 kg. Assembled in Malaysia.`,
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950 flex items-center justify-center shrink-0">
            <Wand2 className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('pcf.generateBomTitle')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {t('pcf.generateBomDesc')}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t('pcf.productDescription')} <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={6}
            className="input min-h-[120px]"
            placeholder="e.g., A consumer 2TB NVMe SSD in M.2 2280 form factor. Aluminum heatsink, single PCB with DRAM cache and NAND flash chips, a Phison controller IC, passives, packaged in cardboard with anti-static bag."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-[11px] text-gray-400">
              {description.length} characters · minimum {minChars}
            </p>
            {description.length === 0 && (
              <button
                type="button"
                onClick={() => setDescription(suggestions[0])}
                className="text-[11px] text-brand-600 hover:underline"
              >
                {t('common.tryExample')}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('pcf.massHint')}</span>
            <input
              type="number"
              step="0.001"
              min="0"
              className="input mt-1"
              placeholder="e.g. 0.12"
              value={massHint}
              onChange={(e) => setMassHint(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('pcf.assemblyCountry')}</span>
            <input
              className="input mt-1"
              placeholder="e.g. Vietnam, Malaysia"
              value={originCountry}
              onChange={(e) => setOriginCountry(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('pcf.supplier')}</span>
            <input
              className="input mt-1"
              placeholder="e.g. Foxconn"
              value={supplierHint}
              onChange={(e) => setSupplierHint(e.target.value)}
            />
          </label>
        </div>

        {localErr && (
          <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {localErr}
          </div>
        )}

        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            {t('pcf.aiGeneratedWarning')}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
          <button
            type="button"
            onClick={submit}
            disabled={generating || description.trim().length < minChars}
            className="btn-primary flex items-center gap-2"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('pcf.generatingBom')}</>
              : <><Sparkles className="w-4 h-4" /> {t('pcf.generateCredits')}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
