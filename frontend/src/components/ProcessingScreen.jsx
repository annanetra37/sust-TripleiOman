import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Brain, Search, CheckCircle, Database, BarChart3, Lightbulb, ArrowRight, Zap, Shield, FileText, Globe } from 'lucide-react';
import { useT } from '../i18n';

export default function ProcessingScreen({ progress, status, type }) {
  const { t } = useT();

  const STEPS = [
    { icon: Search, label: t('processing.readingData'), color: 'text-blue-500', bg: 'from-blue-500/20 to-blue-600/5' },
    { icon: Brain, label: t('processing.analyzingStructure'), color: 'text-purple-500', bg: 'from-purple-500/20 to-purple-600/5' },
    { icon: Sparkles, label: t('processing.mappingModel'), color: 'text-amber-500', bg: 'from-amber-500/20 to-amber-600/5' },
    { icon: Database, label: t('processing.cleaningData'), color: 'text-emerald-500', bg: 'from-emerald-500/20 to-emerald-600/5' },
    { icon: Shield, label: t('processing.validatingRecords'), color: 'text-cyan-500', bg: 'from-cyan-500/20 to-cyan-600/5' },
    { icon: BarChart3, label: t('processing.updatingDashboards'), color: 'text-brand-500', bg: 'from-brand-500/20 to-brand-600/5' },
  ];

  const ESG_FACTS = [
    { icon: '🌍', category: t('processing.catClimate'), fact: t('processing.factClimate') },
    { icon: '📊', category: t('processing.catReporting'), fact: t('processing.factReporting') },
    { icon: '🔗', category: t('processing.catScope3'), fact: t('processing.factScope3') },
    { icon: '👥', category: t('processing.catWorkforce'), fact: t('processing.factWorkforce') },
    { icon: '🎯', category: t('processing.catSbti'), fact: t('processing.factSbti') },
    { icon: '💧', category: t('processing.catWater'), fact: t('processing.factWater') },
    { icon: '📚', category: t('processing.catTraining'), fact: t('processing.factTraining') },
    { icon: '💡', category: t('processing.catEnergy'), fact: t('processing.factEnergy') },
    { icon: '🌿', category: t('processing.catBiodiversity'), fact: t('processing.factBiodiversity') },
    { icon: '♻️', category: t('processing.catCircular'), fact: t('processing.factCircular') },
    { icon: '🏛️', category: t('processing.catGovernance'), fact: t('processing.factGovernance') },
    { icon: '✈️', category: t('processing.catTravel'), fact: t('processing.factTravel') },
    { icon: '☀️', category: t('processing.catRenewables'), fact: t('processing.factRenewables') },
    { icon: '📈', category: t('processing.catData'), fact: t('processing.factData') },
    { icon: '🎯', category: t('processing.catNetZero'), fact: t('processing.factNetZero') },
  ];

  const TIPS = [
    { icon: Globe, text: t('processing.tipLanguage') },
    { icon: Shield, text: t('processing.tipHistory') },
    { icon: Zap, text: t('processing.tipSbti') },
    { icon: FileText, text: t('processing.tipDocExtract') },
    { icon: Database, text: t('processing.tipConnections') },
    { icon: BarChart3, text: t('processing.tipReports') },
  ];

  const [currentStep, setCurrentStep] = useState(0);
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * 15));
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * 6));
  const [showFact, setShowFact] = useState(true);
  const [fadeIn, setFadeIn] = useState(true);
  const [particles, setParticles] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [simulatedPct, setSimulatedPct] = useState(0);

  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const timer = setInterval(() => {
      setSimulatedPct((prev) => {
        if (prev >= 90) return 90;
        const remaining = 90 - prev;
        const increment = Math.max(0.3, remaining * 0.04);
        return Math.min(90, prev + increment);
      });
    }, 500);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const timer = setInterval(() => setCurrentStep((s) => (s + 1) % STEPS.length), 3000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const timer = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setShowFact((f) => !f);
        setFactIndex((i) => (i + 1) % ESG_FACTS.length);
        setTipIndex((i) => (i + 1) % TIPS.length);
        setFadeIn(true);
      }, 400);
    }, 6000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const timer = setInterval(() => {
      setParticles((p) => {
        const next = p.filter((pp) => Date.now() - pp.born < 3000);
        next.push({ id: Date.now(), born: Date.now(), x: 20 + Math.random() * 60, size: 2 + Math.random() * 4, speed: 1 + Math.random() * 2 });
        return next.slice(-12);
      });
    }, 400);
    return () => clearInterval(timer);
  }, [status]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const dashboardPath = type === 'E1' ? '/dashboard/E/environmental-1' : type === 'G1' ? '/dashboard/G/governance-1' : '/dashboard/S/social-1';
  const dashboardLabel = type === 'E1' ? t('processing.e1Dashboard') : type === 'G1' ? t('processing.g1Dashboard') : t('processing.s1Dashboard');

  if (status === 'COMPLETED') {
    return (
      <div className="card border-green-200 dark:border-green-800 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-emerald-50/30 dark:from-green-950/30 dark:to-emerald-950/20" />
        <div className="flex flex-col items-center text-center py-8 relative z-10">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-5">
            <CheckCircle className="w-10 h-10 text-green-500 animate-scale-in" />
          </div>
          <h3 className="text-xl font-bold text-green-700 dark:text-green-400">{t('processing.complete')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {t('processing.recordsProcessed', { count: progress?.processedRows || 0 })}
          </p>
          {progress?.error && status === 'COMPLETED' && (
            <div className="mt-4 mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-left max-w-lg">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 text-lg shrink-0">!</span>
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t('processing.yearMismatch')}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{progress.error}</p>
                  <p className="text-[10px] text-amber-500 mt-1">{t('processing.yearMismatchNote')}</p>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <Link to={dashboardPath} className="btn-primary flex items-center gap-2 px-6 py-2.5">
              <BarChart3 className="w-4 h-4" /> {t('processing.goToDashboard', { name: dashboardLabel })} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/history" className="btn-secondary flex items-center gap-2">{t('processing.viewInHistory')}</Link>
          </div>
        </div>
        <style>{`.animate-scale-in { animation: scaleIn 0.5s ease-out; }
          @keyframes scaleIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className="card border-red-200 dark:border-red-800">
        <div className="flex flex-col items-center text-center py-6">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mb-4">
            <span className="text-3xl">!</span>
          </div>
          <h3 className="text-lg font-bold text-red-700 dark:text-red-400">{t('processing.failed')}</h3>
          <p className="text-sm text-red-600 dark:text-red-400 mt-2 max-w-md">{progress?.error || t('processing.failedGeneric')}</p>
        </div>
      </div>
    );
  }

  const step = STEPS[currentStep];
  const fact = ESG_FACTS[factIndex % ESG_FACTS.length];
  const tip = TIPS[tipIndex % TIPS.length];
  const TipIcon = tip.icon;
  const realPct = progress?.progress || 0;
  const pct = status === 'COMPLETED' ? 100 : Math.max(realPct, Math.round(simulatedPct));

  return (
    <div className="card overflow-hidden relative">
      <div className={`absolute inset-0 bg-gradient-to-br ${step.bg} transition-all duration-1000`} />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p) => {
          const age = (Date.now() - p.born) / 3000;
          return (
            <div key={p.id} className="absolute rounded-full bg-brand-400/30 dark:bg-brand-500/20"
              style={{ left: `${p.x}%`, bottom: `${age * 100}%`, width: p.size, height: p.size, opacity: 1 - age, transition: 'all 0.4s linear' }} />
          );
        })}
      </div>

      <div className="relative z-10 space-y-6 py-2">
        <div className="flex flex-col items-center text-center">
          <div className="relative w-28 h-28 mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-brand-300/40 dark:border-brand-600/30 animate-ping-slow" />
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-200 dark:text-gray-700" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="3" className="text-brand-500"
                strokeDasharray="276.5" strokeDashoffset={276.5 - (276.5 * pct / 100)} strokeLinecap="round" transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
              <circle cx="50" cy="6" r="3" fill="currentColor" className="text-brand-500 animate-orbit" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-float">
                <step.icon className={`w-9 h-9 ${step.color} transition-all duration-700`} />
              </div>
            </div>
          </div>

          <p className="font-semibold text-gray-900 dark:text-gray-100 text-lg transition-all duration-500">{step.label}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('processing.elapsed')}: {formatTime(elapsed)}</p>

          {progress?.totalRows > 0 && (
            <div className="w-full max-w-sm mt-4">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 relative transition-all duration-1000 ease-out"
                  style={{ width: `${Math.max(pct, 3)}%` }}>
                  <div className="absolute inset-0 bg-white/30 animate-shimmer" />
                </div>
              </div>
              <div className="flex justify-between mt-1.5">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {progress.processedRows} / {progress.totalRows} {t('processing.records')}
                </p>
                <p className="text-xs font-medium text-brand-600 dark:text-brand-400">{pct}%</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1 px-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${
                i < currentStep ? 'bg-green-100 dark:bg-green-900 text-green-500 scale-100' :
                i === currentStep ? 'bg-brand-100 dark:bg-brand-900 text-brand-600 scale-125 shadow-lg shadow-brand-200/50 dark:shadow-brand-800/30' :
                'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 scale-90'
              }`}>
                {i < currentStep ? <CheckCircle className="w-4 h-4" /> : <s.icon className="w-3.5 h-3.5" />}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-0.5 mx-0.5 transition-all duration-500 rounded ${
                  i < currentStep ? 'bg-green-400 dark:bg-green-600' : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
            </div>
          ))}
        </div>

        <div className={`rounded-xl p-4 transition-all duration-400 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} ${
          showFact ? 'bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/50 dark:to-indigo-950/50'
            : 'bg-gradient-to-r from-brand-50 to-emerald-50 dark:from-brand-950/50 dark:to-emerald-950/50'
        }`}>
          {showFact ? (
            <div className="flex items-start gap-3">
              <span className="text-2xl">{fact.icon}</span>
              <div>
                <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">
                  {t('processing.didYouKnow')} — {fact.category}
                </p>
                <p className="text-sm text-purple-900 dark:text-purple-100 mt-1 leading-relaxed">{fact.fact}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900 flex items-center justify-center shrink-0">
                <TipIcon className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-brand-700 dark:text-brand-400 uppercase tracking-widest">{t('processing.proTip')}</p>
                <p className="text-sm text-brand-900 dark:text-brand-100 mt-1 leading-relaxed">{tip.text}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ping-slow { 0% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.15); opacity: 0; } 100% { transform: scale(1); opacity: 0.3; } }
        .animate-ping-slow { animation: ping-slow 2s ease-in-out infinite; }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .animate-float { animation: float 2s ease-in-out infinite; }
        @keyframes orbit { from { transform: rotate(0deg) translateX(44px) rotate(0deg); } to { transform: rotate(360deg) translateX(44px) rotate(-360deg); } }
        .animate-orbit { animation: orbit 4s linear infinite; transform-origin: 50px 50px; }
        @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(200%); } }
        .animate-shimmer { animation: shimmer 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
