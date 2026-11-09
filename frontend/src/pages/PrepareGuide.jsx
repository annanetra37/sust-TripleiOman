import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { PREP_TOPICS, itemsFor } from '../config/preparationGuide';
import { useT } from '../i18n';
import {
  Compass, ArrowRight, ArrowLeft, CheckCircle2, Circle, RotateCcw,
  User, FileType, ExternalLink, Sparkles, ListChecks,
} from 'lucide-react';

const COLOR = {
  green: 'border-green-200 dark:border-green-800 hover:border-green-400',
  indigo: 'border-indigo-200 dark:border-indigo-800 hover:border-indigo-400',
  amber: 'border-amber-200 dark:border-amber-800 hover:border-amber-400',
  purple: 'border-purple-200 dark:border-purple-800 hover:border-purple-400',
  teal: 'border-teal-200 dark:border-teal-800 hover:border-teal-400',
  brand: 'border-brand-200 dark:border-brand-800 hover:border-brand-400',
};

export default function PrepareGuide() {
  const { t } = useT();
  const [plans, setPlans] = useState({});
  const [loading, setLoading] = useState(true);
  const [topicKey, setTopicKey] = useState(null);
  const [mode, setMode] = useState('list'); // list | questions | checklist
  const [draftAnswers, setDraftAnswers] = useState({});

  const topic = PREP_TOPICS.find((tp) => tp.key === topicKey);
  const plan = topicKey ? plans[topicKey] : null;

  useEffect(() => {
    api.getPreparationPlans().then(({ plans: rows }) => {
      const byTopic = {};
      rows.forEach((p) => { byTopic[p.topic] = p; });
      setPlans(byTopic);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const openTopic = (key) => {
    setTopicKey(key);
    const existing = plans[key];
    if (existing && existing.answers && Object.keys(existing.answers).length > 0) {
      setMode('checklist');
    } else {
      setDraftAnswers(existing?.answers || {});
      setMode('questions');
    }
  };

  const savePlan = useCallback(async (key, payload) => {
    const { plan: saved } = await api.savePreparationPlan(key, payload);
    setPlans((p) => ({ ...p, [key]: saved }));
    return saved;
  }, []);

  const buildChecklist = async () => {
    await savePlan(topicKey, { answers: draftAnswers, checkedItems: plan?.checkedItems || [] });
    setMode('checklist');
  };

  const toggleItem = async (itemId) => {
    const current = new Set(plan?.checkedItems || []);
    if (current.has(itemId)) current.delete(itemId); else current.add(itemId);
    await savePlan(topicKey, { checkedItems: [...current] });
  };

  const editAnswers = () => {
    setDraftAnswers(plan?.answers || {});
    setMode('questions');
  };

  const resetTopic = async () => {
    await api.resetPreparationPlan(topicKey);
    setPlans((p) => { const n = { ...p }; delete n[topicKey]; return n; });
    setDraftAnswers({});
    setMode('questions');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
  }

  // ─── Topic list ───────────────────────────────────────────────
  if (mode === 'list' || !topic) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-brand-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('prepare.title')}</h1>
          </div>
          <p className="text-gray-500">{t('prepare.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PREP_TOPICS.map((tp) => {
            const p = plans[tp.key];
            const answered = p && p.answers && Object.keys(p.answers).length > 0;
            const applicable = answered ? itemsFor(tp, p.answers) : null;
            const done = answered ? applicable.filter((i) => (p.checkedItems || []).includes(i.id)).length : 0;
            return (
              <button
                key={tp.key}
                className={`card text-left transition-colors border ${COLOR[tp.color] || COLOR.brand}`}
                onClick={() => openTopic(tp.key)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{tp.emoji}</span>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{tp.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tp.tagline}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                </div>
                <div className="mt-3">
                  {answered ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{t('prepare.progress')}</span>
                        <span className="font-medium">{done}/{applicable.length}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${applicable.length ? (done / applicable.length) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-brand-600 font-medium flex items-center gap-1"><Sparkles className="w-3 h-3" /> {t('prepare.startQuestions', { count: tp.questions.length })}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Questions step ───────────────────────────────────────────
  if (mode === 'questions') {
    const allAnswered = topic.questions.every((q) => {
      const v = draftAnswers[q.key];
      return q.type === 'multi' ? Array.isArray(v) && v.length > 0 : Boolean(v);
    });

    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <button className="text-sm text-gray-500 flex items-center gap-1 hover:text-gray-700" onClick={() => { setTopicKey(null); setMode('list'); }}>
          <ArrowLeft className="w-4 h-4" /> {t('prepare.allTopics')}
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{topic.emoji} {topic.label}</h1>
          <p className="text-gray-500">{t('prepare.questionsIntro')}</p>
        </div>

        {topic.questions.map((q, qi) => (
          <div key={q.key} className="card space-y-3">
            <p className="font-medium text-gray-900 dark:text-gray-100"><span className="text-gray-400 mr-1">{qi + 1}.</span> {q.label}</p>
            <div className="space-y-2">
              {q.options.map((o) => {
                const selected = q.type === 'multi'
                  ? (draftAnswers[q.key] || []).includes(o.value)
                  : draftAnswers[q.key] === o.value;
                return (
                  <button
                    key={o.value}
                    className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-800 dark:text-brand-200' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                    onClick={() => {
                      setDraftAnswers((a) => {
                        if (q.type === 'multi') {
                          const cur = new Set(a[q.key] || []);
                          if (cur.has(o.value)) cur.delete(o.value); else cur.add(o.value);
                          return { ...a, [q.key]: [...cur] };
                        }
                        return { ...a, [q.key]: o.value };
                      });
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {selected ? <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" /> : <Circle className="w-4 h-4 text-gray-300 shrink-0" />}
                      {o.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {q.type === 'multi' && <p className="text-[10px] text-gray-400">{t('prepare.selectAllThatApply')}</p>}
          </div>
        ))}

        <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={!allAnswered} onClick={buildChecklist}>
          <ListChecks className="w-4 h-4" /> {t('prepare.buildChecklist')}
        </button>
      </div>
    );
  }

  // ─── Checklist step ───────────────────────────────────────────
  const applicable = itemsFor(topic, plan?.answers);
  const checked = new Set(plan?.checkedItems || []);
  const done = applicable.filter((i) => checked.has(i.id)).length;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <button className="text-sm text-gray-500 flex items-center gap-1 hover:text-gray-700" onClick={() => { setTopicKey(null); setMode('list'); }}>
        <ArrowLeft className="w-4 h-4" /> {t('prepare.allTopics')}
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{topic.emoji} {topic.label}</h1>
          <p className="text-gray-500">{t('prepare.checklistIntro')}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs flex items-center gap-1" onClick={editAnswers}>{t('prepare.editAnswers')}</button>
          <button className="btn-secondary text-xs flex items-center gap-1 text-red-600" onClick={resetTopic}><RotateCcw className="w-3 h-3" /> {t('prepare.reset')}</button>
        </div>
      </div>

      {/* Progress */}
      <div className="card py-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium">{t('prepare.itemsReady', { done, total: applicable.length })}</span>
          <span className="text-gray-400">{applicable.length ? Math.round((done / applicable.length) * 100) : 0}%</span>
        </div>
        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${applicable.length ? (done / applicable.length) * 100 : 0}%` }} />
        </div>
        {done === applicable.length && applicable.length > 0 && (
          <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {t('prepare.allReady')}</p>
        )}
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        {applicable.map((item) => {
          const isChecked = checked.has(item.id);
          return (
            <div key={item.id} className={`card transition-opacity ${isChecked ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <button className="mt-0.5 shrink-0" onClick={() => toggleItem(item.id)} title={isChecked ? t('prepare.markNotReady') : t('prepare.markReady')}>
                  {isChecked
                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                    : <Circle className="w-5 h-5 text-gray-300 hover:text-brand-400" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`font-medium text-gray-900 dark:text-gray-100 ${isChecked ? 'line-through' : ''}`}>{item.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{item.detail}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="badge bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 flex items-center gap-1"><User className="w-3 h-3" /> {item.owner}</span>
                    <span className="badge bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 flex items-center gap-1"><FileType className="w-3 h-3" /> {item.format}</span>
                    <Link to={item.uploadPath} className="badge bg-brand-50 text-brand-600 dark:bg-brand-900 dark:text-brand-300 flex items-center gap-1 hover:underline">
                      <ExternalLink className="w-3 h-3" /> {item.uploadLabel}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
