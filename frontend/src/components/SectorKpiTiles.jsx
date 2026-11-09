import { useEffect, useState } from 'react';
import api from '../services/api';
import { useT } from '../i18n';
import {
  Loader2, CheckCircle, Clock, Sparkles, ChevronDown, ChevronUp,
  Info, X, FileText, BarChart3, Hash, Filter, Layers,
} from 'lucide-react';

const CATEGORY_LABELS = {
  environmental: 'Environmental',
  social: 'Social',
  governance: 'Governance',
  product: 'Product',
};

const CATEGORY_ACCENT = {
  environmental: { border: 'border-l-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400' },
  social: { border: 'border-l-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-400' },
  governance: { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400' },
  product: { border: 'border-l-brand-500', bg: 'bg-brand-50 dark:bg-brand-950/30', text: 'text-brand-700 dark:text-brand-400' },
};

const KPI_EXPLANATIONS = {
  'TC-HW': { source: 'SASB Technology & Communications — Hardware', guidance: 'Report from your product compliance database. Covers IEC 62474 substance declarations, ENERGY STAR and EPEAT certifications, and e-waste take-back programs.' },
  'TC-SC': { source: 'SASB Technology & Communications — Semiconductors', guidance: 'Report from your fab/assembly site data (energy, water, waste meters), HR systems (workforce visa status), and supply chain audit records.' },
  'TR-AU': { source: 'SASB Transportation — Automobiles', guidance: 'Report from fleet sales records, safety testing (NCAP), recall data, and HR systems (collective bargaining, work stoppages).' },
  'SCOPE3': { source: 'GHG Protocol Scope 3 Standard', guidance: 'Auto-computed from your uploaded emissions data. Upload more invoices/data to improve this number.' },
  'E1-': { source: 'ESRS E1 — Climate Change', guidance: 'Auto-computed from your E1 emissions data uploaded through the Climate & Emissions module.' },
  'E5-': { source: 'ESRS E5 — Resource Use & Circular Economy', guidance: 'Report from your waste management and materials tracking systems.' },
  'PCF-': { source: 'Product Carbon Footprint Module', guidance: 'Auto-computed from your PCF calculations. Create products, upload BOMs, and run calculations to populate this.' },
  'RBA': { source: 'Responsible Business Alliance Code of Conduct', guidance: 'Report from your supplier audit management system.' },
  'CMRT': { source: 'Conflict Minerals Reporting Template (OECD)', guidance: 'Report from your smelter due-diligence program.' },
  'ROHS': { source: 'EU RoHS Directive / REACH Regulation', guidance: 'Report from your product compliance system.' },
  'REACH': { source: 'EU REACH Regulation', guidance: 'Report from your product compliance system.' },
  'GRESB': { source: 'GRESB Real Estate Assessment', guidance: 'Report from property management systems (energy, water, waste, certifications).' },
  'CRREM': { source: 'Carbon Risk Real Estate Monitor', guidance: 'Auto-computed from your asset energy records.' },
  'RE-': { source: 'Real Estate Module', guidance: 'Report from your asset and property management data.' },
  'PCAF': { source: 'Partnership for Carbon Accounting Financials', guidance: 'Auto-computed from your financial exposures + PCAF calculations.' },
  'SFDR': { source: 'EU Sustainable Finance Disclosure Regulation', guidance: 'Derived from PCAF financed emissions and counterparty ESG data.' },
  'PAI': { source: 'SFDR Principal Adverse Impact Indicators', guidance: 'The 14 mandatory PAI indicators — most derive from counterparty emissions data.' },
  'BATTERY': { source: 'EU Battery Regulation (2023/1542)', guidance: 'Report from your battery production data.' },
  'CATENA': { source: 'Catena-X Automotive Data Space', guidance: 'Auto-computed: counts products with PACT-exportable PCFs.' },
  'ZEV': { source: 'EU Fleet CO2 Regulation', guidance: 'Report from your vehicle sales database.' },
  'FLEET': { source: 'EU Fleet CO2 Regulation (2019/631)', guidance: 'Report from fleet sales and homologation records.' },
  'NZBA': { source: 'Net-Zero Banking Alliance', guidance: 'Report from portfolio decarbonization targets.' },
  'EU_TAX': { source: 'EU Taxonomy Regulation', guidance: 'Report from taxonomy alignment assessment.' },
};

function getExplanation(code) {
  for (const [prefix, info] of Object.entries(KPI_EXPLANATIONS)) {
    if (code.startsWith(prefix) || code.includes(prefix)) return info;
  }
  return { source: 'Industry standard', guidance: 'Check the framework documentation for reporting guidance.' };
}

function isNarrativeKpi(kpi) {
  return kpi.unit === 'narrative' || kpi.unit?.includes('narrative');
}

function KpiPopup({ kpi, onClose }) {
  const explanation = getExplanation(kpi.code);
  const isNarrative = isNarrativeKpi(kpi);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-[11px] font-mono text-gray-400">{kpi.code}</p>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5">{kpi.name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px]">{kpi.framework}</span>
          <span className={`badge text-[10px] ${CATEGORY_ACCENT[kpi.category]?.bg} ${CATEGORY_ACCENT[kpi.category]?.text}`}>
            {CATEGORY_LABELS[kpi.category] || kpi.category}
          </span>
          {isNarrative ? (
            <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-[10px] flex items-center gap-1"><FileText className="w-3 h-3" /> Narrative</span>
          ) : (
            <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px] flex items-center gap-1"><Hash className="w-3 h-3" /> Quantitative · {kpi.unit}</span>
          )}
        </div>
        {kpi.computed && kpi.value !== null && (
          <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
            <p className="text-xs text-green-600 font-semibold">Current value</p>
            <p className="text-xl font-bold text-green-800 dark:text-green-200 mt-0.5">
              {typeof kpi.value === 'number' ? kpi.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : kpi.value}
              {kpi.unit && !isNarrative && <span className="text-sm font-normal ml-1">{kpi.unit.split(';')[0]}</span>}
            </p>
            {kpi.detail && <p className="text-xs text-green-600 mt-0.5">{kpi.detail}</p>}
          </div>
        )}
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300">Source framework</p>
            <p className="text-gray-500 mt-0.5">{explanation.source}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300">{isNarrative ? 'What to write' : 'Where the data comes from'}</p>
            <p className="text-gray-500 mt-0.5">{explanation.guidance}</p>
          </div>
          {isNarrative && (
            <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg text-xs text-purple-700 dark:text-purple-400">
              <strong>Narrative disclosure</strong> — requires a written description, not a number. Draft this in the Reports module.
            </div>
          )}
          {!kpi.computed && !isNarrative && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-xs text-amber-700 dark:text-amber-400">
              <strong>Not yet reported</strong> — upload the relevant data through the appropriate module.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SectorKpiTiles({ year, className = '' }) {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState(null);
  const [activeFramework, setActiveFramework] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getSectorKpis(year).then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  if (loading) return null;
  if (!data || !data.selected || data.kpis.length === 0) return null;

  // Apply framework filter
  const filteredKpis = activeFramework
    ? data.kpis.filter((k) => k.framework === activeFramework)
    : data.kpis;

  const computedKpis = filteredKpis.filter((k) => k.computed);
  const pendingKpis = filteredKpis.filter((k) => !k.computed);
  const visiblePending = pendingExpanded ? pendingKpis : pendingKpis.slice(0, 4);

  return (
    <div className={`${className}`}>
      {/* ─── Collapsible header — VERY obvious accordion design ─── */}
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${
          sectionOpen
            ? 'bg-brand-50 dark:bg-brand-950/40 border-2 border-brand-300 dark:border-brand-800'
            : 'bg-gradient-to-r from-brand-50 to-emerald-50 dark:from-brand-950/30 dark:to-emerald-950/20 border-2 border-brand-200 dark:border-brand-900 hover:border-brand-400 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {data.packName} KPIs
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              {sectionOpen ? t('sectorKpis.clickToCollapse') : `${data.kpis.length} ${t('sectorKpis.industryMetrics')} · ${t('sectorKpis.clickToExpand')}`}
            </p>
          </div>
          <span className="text-[10px] text-gray-400 hidden sm:inline">v{data.packVersion}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" /> {data.summary.computedKpis}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-500" /> {data.summary.pendingKpis}
            </span>
          </div>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
            sectionOpen
              ? 'bg-brand-500 text-white rotate-180'
              : 'bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-400 group-hover:bg-brand-200'
          }`}>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </button>

      {/* ─── Collapsible body ─── */}
      {sectionOpen && (
        <div className="mt-3 space-y-4 pl-1">
          {/* Framework filter chips — clickable to filter KPIs */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <button
              onClick={() => setActiveFramework(null)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                activeFramework === null
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              All ({data.kpis.length})
            </button>
            {data.frameworks.map((f) => {
              const count = data.kpis.filter((k) => k.framework === f).length;
              return (
                <button
                  key={f}
                  onClick={() => setActiveFramework(activeFramework === f ? null : f)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                    activeFramework === f
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {f} ({count})
                </button>
              );
            })}
          </div>

          {/* Computed KPIs */}
          {computedKpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {computedKpis.map((kpi) => {
                const accent = CATEGORY_ACCENT[kpi.category] || CATEGORY_ACCENT.product;
                return (
                  <button
                    key={kpi.id} type="button" onClick={() => setSelectedKpi(kpi)}
                    className={`rounded-lg border-l-4 ${accent.border} bg-white dark:bg-gray-900 shadow-sm p-3 text-left hover:shadow-md transition-shadow cursor-pointer`}
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-[10px] font-mono text-gray-400">{kpi.code}</p>
                      <Info className="w-3 h-3 text-gray-300 hover:text-brand-500 shrink-0" />
                    </div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-2 mt-0.5">{kpi.name}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {typeof kpi.value === 'number' ? kpi.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : kpi.value}
                      {kpi.unit && !isNarrativeKpi(kpi) && <span className="text-xs font-normal text-gray-400 ml-1">{kpi.unit.split(';')[0]}</span>}
                    </p>
                    {kpi.detail && <p className="text-[10px] text-gray-400 mt-0.5">{kpi.detail}</p>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Pending KPIs */}
          {pendingKpis.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-500" />
                {t('sectorKpis.notYetReported')} ({pendingKpis.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {visiblePending.map((kpi) => (
                  <button
                    key={kpi.id} type="button" onClick={() => setSelectedKpi(kpi)}
                    className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="w-1 h-8 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono text-gray-400">{kpi.code}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{kpi.name}</p>
                    </div>
                    {isNarrativeKpi(kpi) && <FileText className="w-3 h-3 text-purple-400 shrink-0" title="Narrative" />}
                    <span className="text-[9px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded shrink-0">{kpi.framework}</span>
                    <Info className="w-3 h-3 text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>
              {pendingKpis.length > 4 && (
                <button onClick={() => setPendingExpanded((v) => !v)} className="text-xs text-brand-600 hover:underline flex items-center gap-1 mt-1">
                  {pendingExpanded ? <><ChevronUp className="w-3 h-3" /> Show fewer</> : <><ChevronDown className="w-3 h-3" /> Show all {pendingKpis.length}</>}
                </button>
              )}
            </div>
          )}

          {filteredKpis.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No KPIs match this framework filter.</p>
          )}

          {/* Summary bar */}
          <div className="flex items-center gap-4 text-[10px] text-gray-400 pt-1 border-t dark:border-gray-800">
            {data.summary.totalEmissions > 0 && <span>Emissions: {data.summary.totalEmissions.toFixed(1)} tCO2e</span>}
            {data.summary.totalEmployees > 0 && <span>Employees: {data.summary.totalEmployees}</span>}
            {data.summary.productCount > 0 && <span>Products: {data.summary.productCount}</span>}
            {data.summary.pcfCoveragePct > 0 && <span>PCF: {data.summary.pcfCoveragePct.toFixed(0)}%</span>}
            {data.summary.hasSbti && <span>SBTi: active</span>}
          </div>
        </div>
      )}

      {selectedKpi && <KpiPopup kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />}
    </div>
  );
}
