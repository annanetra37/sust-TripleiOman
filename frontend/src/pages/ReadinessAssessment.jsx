import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useT } from '../i18n';
import {
  Loader2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Download,
  Share2,
  Copy,
  Check,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

// ── Topic family labels (same as IsoGriBridge) ──────────────────────────────
const TOPIC_FAMILIES = [
  { key: 'general', range: 'GRI 2' },
  { key: 'materialTopics', range: 'GRI 3' },
  { key: 'economic', range: 'GRI 201-207' },
  { key: 'environmental', range: 'GRI 301-306' },
  { key: 'social', range: 'GRI 401-414' },
  { key: 'product', range: 'GRI 416-418' },
];

// ── Colour helpers ───────────────────────────────────────────────────────────
function pctColor(pct) {
  if (pct > 70) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 30) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function barBg(pct) {
  if (pct > 70) return 'bg-emerald-500';
  if (pct >= 30) return 'bg-amber-500';
  return 'bg-red-500';
}

function ringStroke(pct) {
  if (pct > 70) return '#10b981';
  if (pct >= 30) return '#f59e0b';
  return '#ef4444';
}

// ── Score Donut ──────────────────────────────────────────────────────────────
function ScoreDonut({ pct }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const offset = c - (c * (pct || 0)) / 100;
  const stroke = ringStroke(pct);

  return (
    <svg viewBox="0 0 180 180" className="w-48 h-48">
      <circle cx="90" cy="90" r={r} fill="none" stroke="currentColor" strokeWidth="12" className="text-gray-200 dark:text-gray-700" />
      <circle
        cx="90"
        cy="90"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 90 90)"
        className="transition-all duration-1000"
      />
      <text x="90" y="82" textAnchor="middle" className="fill-gray-900 dark:fill-gray-100" fontSize="40" fontWeight="700">
        {pct != null ? `${Math.round(pct)}%` : '--'}
      </text>
      <text x="90" y="108" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" fontSize="13">
        readiness
      </text>
    </svg>
  );
}

// ── Default ISO certifications for the multi-select question ─────────────────
const DEFAULT_CERTIFICATIONS = [
  'ISO 14001',
  'ISO 45001',
  'ISO 50001',
  'ISO 14064',
  'ISO 9001',
  'ISO 27001',
];

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ReadinessAssessment() {
  const { t } = useT();
  const { token: urlToken } = useParams();

  // Which phase: 'intro' | 'questionnaire' | 'submitting' | 'results'
  const [phase, setPhase] = useState(urlToken ? 'results' : 'intro');

  // Questions from API
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Answers
  const [answers, setAnswers] = useState({});
  const [currentStep, setCurrentStep] = useState(0);

  // Contact
  const [contact, setContact] = useState({ name: '', email: '', company: '', phone: '' });

  // Results
  const [result, setResult] = useState(null);
  const [resultToken, setResultToken] = useState(urlToken || null);
  const [loadingResult, setLoadingResult] = useState(false);

  // Share state
  const [copied, setCopied] = useState(false);

  // ── Load questions ─────────────────────────────────────────────────────
  const loadQuestions = useCallback(async () => {
    setLoadingQuestions(true);
    try {
      const data = await api.getReadinessQuestions();
      const q = Array.isArray(data) ? data : data.questions || [];
      setQuestions(q);
    } catch {
      // Fallback: generate basic questions if API is unavailable
      setQuestions([
        {
          id: 'certifications',
          type: 'multi-select',
          text: t('readiness.yourCertifications'),
          options: DEFAULT_CERTIFICATIONS,
        },
        {
          id: 'years_certified',
          type: 'select',
          text: 'How long have you held your primary ISO certification?',
          options: ['Less than 1 year', '1-3 years', '3-5 years', '5+ years'],
        },
        {
          id: 'integrated_management',
          type: 'boolean',
          text: 'Do you have an integrated management system (IMS)?',
        },
        {
          id: 'sustainability_reporting',
          type: 'boolean',
          text: 'Have you published a sustainability report before?',
        },
        {
          id: 'gri_familiarity',
          type: 'select',
          text: 'How familiar are you with GRI Standards?',
          options: ['Not at all', 'Somewhat familiar', 'Very familiar', 'Already reporting'],
        },
        {
          id: 'data_maturity',
          type: 'select',
          text: 'How would you describe your ESG data collection maturity?',
          options: ['Manual / spreadsheets', 'Partially automated', 'Fully automated', 'Real-time dashboards'],
        },
        {
          id: 'stakeholder_engagement',
          type: 'boolean',
          text: 'Do you conduct regular stakeholder engagement?',
        },
        {
          id: 'materiality_assessment',
          type: 'boolean',
          text: 'Have you completed a materiality assessment?',
        },
      ]);
    } finally {
      setLoadingQuestions(false);
    }
  }, [t]);

  // ── Load result by token ───────────────────────────────────────────────
  const loadResult = useCallback(async (tkn) => {
    setLoadingResult(true);
    try {
      const data = await api.getReadinessResult(tkn);
      setResult(data);
      setResultToken(tkn);
    } catch {
      // result load failed, show intro instead
      setPhase('intro');
    } finally {
      setLoadingResult(false);
    }
  }, []);

  useEffect(() => {
    if (urlToken) loadResult(urlToken);
  }, [urlToken, loadResult]);

  // ── Start assessment ───────────────────────────────────────────────────
  const handleStart = () => {
    setPhase('questionnaire');
    setCurrentStep(0);
    loadQuestions();
  };

  // ── Visible questions (branching: showIf) ──────────────────────────────
  const visibleQuestions = questions.filter((q) => {
    if (!q.showIf) return true;
    return answers[q.showIf.questionId] === q.showIf.value ||
      (Array.isArray(answers[q.showIf.questionId]) && answers[q.showIf.questionId].includes(q.showIf.value));
  });

  const totalSteps = visibleQuestions.length + 1; // +1 for contact form
  const isContactStep = currentStep >= visibleQuestions.length;
  const currentQuestion = !isContactStep ? visibleQuestions[currentStep] : null;

  // ── Answer handlers ────────────────────────────────────────────────────
  const setAnswer = (qId, value) => {
    setAnswers((a) => ({ ...a, [qId]: value }));
  };

  const toggleMultiSelect = (qId, option) => {
    setAnswers((a) => {
      const current = Array.isArray(a[qId]) ? [...a[qId]] : [];
      const idx = current.indexOf(option);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(option);
      return { ...a, [qId]: current };
    });
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setPhase('submitting');
    try {
      const data = await api.submitReadinessAssessment({ answers, contact });
      setResult(data);
      setResultToken(data.token || null);
      setPhase('results');
    } catch {
      // Fallback: generate mock result client-side
      const certCount = (Array.isArray(answers.certifications) ? answers.certifications : []).length;
      const boolYes = Object.values(answers).filter((v) => v === true || v === 'Yes').length;
      const score = Math.min(95, Math.max(15, certCount * 12 + boolYes * 6 + 20));
      setResult({
        score,
        breakdown: {
          general: Math.min(100, score + 10),
          materialTopics: Math.min(100, score - 5),
          economic: Math.min(100, score + 5),
          environmental: Math.min(100, score + 15),
          social: Math.min(100, score - 10),
          product: Math.min(100, score - 15),
        },
        recommendations: [
          'Start mapping your ISO 14001 environmental data to GRI 300-series disclosures.',
          'Conduct a double materiality assessment to identify your most relevant GRI topics.',
          'Use Triple I to automate the gap analysis and generate your first GRI-aligned report.',
        ],
        token: 'demo-' + Date.now(),
      });
      setResultToken('demo-' + Date.now());
      setPhase('results');
    }
  };

  // ── Share ──────────────────────────────────────────────────────────────
  const handleShare = () => {
    const url = resultToken
      ? `${window.location.origin}/readiness/${resultToken}`
      : window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Retake ─────────────────────────────────────────────────────────────
  const handleRetake = () => {
    setPhase('intro');
    setAnswers({});
    setContact({ name: '', email: '', company: '', phone: '' });
    setResult(null);
    setResultToken(null);
    setCurrentStep(0);
  };

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header bar */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">III</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Triple I</span>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500">{t('readiness.poweredBy')}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* ── INTRO ──────────────────────────────────────────────────── */}
        {phase === 'intro' && (
          <div className="text-center space-y-8 py-16">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100">
                {t('readiness.title')}
              </h1>
              <p className="mt-3 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
                {t('readiness.subtitle')}
              </p>
            </div>

            <button
              onClick={handleStart}
              className="btn-primary inline-flex items-center gap-2 text-lg px-8 py-3"
            >
              {t('readiness.startAssessment')}
              <ArrowRight className="w-5 h-5" />
            </button>

            <div className="flex justify-center gap-6 text-sm text-gray-400 dark:text-gray-500 pt-4">
              <span>8 questions</span>
              <span>~3 minutes</span>
              <span>Free</span>
            </div>
          </div>
        )}

        {/* ── QUESTIONNAIRE ──────────────────────────────────────────── */}
        {phase === 'questionnaire' && (
          <div className="space-y-6">
            {loadingQuestions ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
              </div>
            ) : (
              <>
                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>{t('readiness.question')} {Math.min(currentStep + 1, totalSteps)} {t('readiness.of')} {totalSteps}</span>
                    <span>{Math.round(((currentStep + 1) / totalSteps) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-600 rounded-full transition-all duration-300"
                      style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Question or Contact */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8 min-h-[350px] flex flex-col justify-between">
                  {!isContactStep && currentQuestion && (
                    <div className="space-y-6 flex-1">
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                        {currentQuestion.text}
                      </h2>

                      {/* Multi-select (checkboxes) */}
                      {currentQuestion.type === 'multi-select' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(currentQuestion.options || DEFAULT_CERTIFICATIONS).map((opt) => {
                            const checked = Array.isArray(answers[currentQuestion.id]) && answers[currentQuestion.id].includes(opt);
                            return (
                              <label
                                key={opt}
                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                  checked
                                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 dark:border-brand-600'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 text-brand-600 rounded border-gray-300 dark:border-gray-600 focus:ring-brand-500"
                                  checked={checked}
                                  onChange={() => toggleMultiSelect(currentQuestion.id, opt)}
                                />
                                <span className="text-sm text-gray-900 dark:text-gray-100">{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* Boolean (Yes/No toggle) */}
                      {currentQuestion.type === 'boolean' && (
                        <div className="flex gap-4">
                          {[true, false].map((val) => (
                            <button
                              key={String(val)}
                              onClick={() => setAnswer(currentQuestion.id, val)}
                              className={`flex-1 py-4 rounded-xl border text-center font-medium transition-colors ${
                                answers[currentQuestion.id] === val
                                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 dark:border-brand-600'
                                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                              }`}
                            >
                              {val ? t('common.yes') : t('common.no')}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Single select (dropdown) */}
                      {currentQuestion.type === 'select' && (
                        <div className="space-y-2">
                          {(currentQuestion.options || []).map((opt) => (
                            <button
                              key={opt}
                              onClick={() => setAnswer(currentQuestion.id, opt)}
                              className={`w-full text-left p-3 rounded-xl border transition-colors ${
                                answers[currentQuestion.id] === opt
                                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 dark:border-brand-600'
                                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                              }`}
                            >
                              <span className="text-sm text-gray-900 dark:text-gray-100">{opt}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Contact form */}
                  {isContactStep && (
                    <div className="space-y-5 flex-1">
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                          {t('readiness.contactInfo')}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {t('readiness.contactInfoDesc')}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('readiness.fullName')} *
                          </label>
                          <input
                            type="text"
                            className="input w-full"
                            value={contact.name}
                            onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('readiness.email')} *
                          </label>
                          <input
                            type="email"
                            className="input w-full"
                            value={contact.email}
                            onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('readiness.companyName')} *
                          </label>
                          <input
                            type="text"
                            className="input w-full"
                            value={contact.company}
                            onChange={(e) => setContact((c) => ({ ...c, company: e.target.value }))}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('readiness.phone')} <span className="text-gray-400">({t('common.optional')})</span>
                          </label>
                          <input
                            type="tel"
                            className="input w-full"
                            value={contact.phone}
                            onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation buttons */}
                  <div className="flex items-center justify-between pt-6 border-t border-gray-100 dark:border-gray-800 mt-6">
                    <button
                      onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                      disabled={currentStep === 0}
                      className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      {t('readiness.previous')}
                    </button>

                    {!isContactStep ? (
                      <button
                        onClick={() => setCurrentStep((s) => s + 1)}
                        className="btn-primary inline-flex items-center gap-2 text-sm"
                      >
                        {t('readiness.next')}
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSubmit}
                        disabled={!contact.name || !contact.email || !contact.company}
                        className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('readiness.getYourScore')}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SUBMITTING ─────────────────────────────────────────────── */}
        {phase === 'submitting' && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-brand-600" />
            <p className="text-lg text-gray-600 dark:text-gray-300">{t('readiness.calculating')}</p>
          </div>
        )}

        {/* ── RESULTS ────────────────────────────────────────────────── */}
        {phase === 'results' && (
          <>
            {loadingResult ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
              </div>
            ) : result ? (
              <div className="space-y-8">
                {/* Score section */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8 text-center">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                    {t('readiness.yourScore')}
                  </h2>
                  <div className="flex justify-center">
                    <ScoreDonut pct={result.score} />
                  </div>
                </div>

                {/* Topic breakdown */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5">
                    {t('readiness.topicBreakdown')}
                  </h3>
                  <div className="space-y-4">
                    {TOPIC_FAMILIES.map((fam) => {
                      const val = result.breakdown?.[fam.key] ?? 0;
                      return (
                        <div key={fam.key} className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 dark:text-gray-400 w-48 shrink-0 truncate">
                            {fam.range}
                          </span>
                          <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${barBg(val)}`}
                              style={{ width: `${val}%` }}
                            />
                          </div>
                          <span className={`text-sm font-bold w-12 text-right ${pctColor(val)}`}>
                            {Math.round(val)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recommendations */}
                {result.recommendations && result.recommendations.length > 0 && (
                  <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
                      {t('readiness.recommendations')}
                    </h3>
                    <ol className="space-y-3">
                      {result.recommendations.slice(0, 3).map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300 text-xs font-bold flex items-center justify-center mt-0.5">
                            {idx + 1}
                          </span>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{rec}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3 justify-center">
                  <button
                    className="btn-primary inline-flex items-center gap-2 text-sm opacity-60 cursor-not-allowed"
                    disabled
                  >
                    <Download className="w-4 h-4" />
                    {t('readiness.downloadReport')}
                  </button>

                  <Link
                    to="/signup"
                    className="btn-primary inline-flex items-center gap-2 text-sm"
                  >
                    {t('readiness.startUsingTripleI')}
                    <ArrowRight className="w-4 h-4" />
                  </Link>

                  <button
                    onClick={handleShare}
                    className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? t('readiness.linkCopied') : t('readiness.shareResults')}
                  </button>

                  <button
                    onClick={handleRetake}
                    className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {t('readiness.retakeAssessment')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                {t('common.noData')}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 mt-16">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
          {t('readiness.poweredBy')}
        </div>
      </footer>
    </div>
  );
}
