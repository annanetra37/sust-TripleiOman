import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CalendarClock, Receipt, FileWarning, Mail, ArrowRight, Scale } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Alert, Badge, Card, ErrorText, Loading, PageHeader, ProgressBar, Stat, StatusBadge, useAsync } from '../components/ui';

export default function Dashboard() {
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { org } = useAuth();
  const { data, error, loading } = useAsync(() => api.get('/orgs/current/overview'), [org?.id]);
  if (loading) return <Loading />;
  if (error) return <ErrorText error={error} />;
  const { compliance, threshold, einvoicing, invoices, letters, expiringDocuments, openReturns, onboardingComplete, obligationsSummary } = data;
  const thrTone = threshold.status === 'MUST_REGISTER' ? 'red' : threshold.status === 'APPROACHING' ? 'amber' : 'brand';

  return (
    <div className="space-y-6">
      <PageHeader title={L(`Welcome, ${org.legalNameEn}`, `مرحباً، ${org.legalNameAr || org.legalNameEn}`)} subtitle={L('Everything you need to do with TaxOman, in one place.', 'كل ما تحتاجه مع جهاز الضرائب في مكان واحد.')} />

      {!onboardingComplete && (
        <Alert tone="warn" title={L('Finish setting up', 'أكمل الإعداد')}>
          {L('Answer a few plain-language questions so we can work out every tax obligation you have.', 'أجب عن بعض الأسئلة البسيطة لنحدد جميع التزاماتك الضريبية.')}{' '}
          <Link className="font-medium underline" to="/app/onboarding">{L('Start the questionnaire', 'ابدأ الاستبيان')}</Link>
        </Alert>
      )}

      <div className={`card flex items-center gap-4 ${compliance.compliant ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
        {compliance.compliant ? <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-10 w-10 shrink-0 text-red-600" />}
        <div>
          <div className="text-lg font-semibold">{compliance.compliant ? L('You are compliant', 'أنت ملتزم') : L(`${compliance.overdue.length} overdue obligation(s)`, `${compliance.overdue.length} التزام متأخر`)}</div>
          <div className="text-sm text-slate-600">{compliance.compliant ? L('No overdue filings or payments. Next deadlines are below.', 'لا توجد إقرارات أو مدفوعات متأخرة.') : compliance.overdue.map((o) => (lang === 'ar' ? o.titleAr || o.title : o.title)).join(' · ')}</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CalendarClock} label={L('Next deadline', 'الموعد القادم')} value={compliance.upcoming[0] ? f.date(compliance.upcoming[0].dueDate) : '—'} sub={compliance.upcoming[0] ? `${lang === 'ar' ? compliance.upcoming[0].titleAr || compliance.upcoming[0].title : compliance.upcoming[0].title} · ${L(`${f.daysUntil(compliance.upcoming[0].dueDate)} days`, `${f.daysUntil(compliance.upcoming[0].dueDate)} يوم`)}` : ''} />
        <Stat icon={Receipt} label={L('E-invoicing go-live', 'بدء الفوترة الإلكترونية')} value={einvoicing.applies ? f.date(einvoicing.date) : L('Not required yet', 'غير مطلوب بعد')} sub={einvoicing.applies ? L(`${einvoicing.daysLeft} days left`, `متبقٍ ${einvoicing.daysLeft} يوم`) : ''} tone={einvoicing.applies && einvoicing.daysLeft < 120 ? 'amber' : undefined} />
        <Stat icon={FileWarning} label={L('Transactions to check', 'معاملات تحتاج مراجعة')} value={f.int(compliance.flaggedTransactions)} tone={compliance.flaggedTransactions ? 'amber' : undefined} sub={<Link to="/app/transactions?flagged=1" className="text-brand-700">{L('Review', 'مراجعة')}</Link>} />
        <Stat icon={Mail} label={L('Open TaxOman letters', 'خطابات مفتوحة')} value={f.int(letters.length)} tone={letters.length ? 'red' : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={L('Upcoming deadlines', 'المواعيد القادمة')} actions={<Link to="/app/calendar" className="btn-ghost btn-sm">{L('Full calendar', 'التقويم الكامل')}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>}>
          {compliance.upcoming.length === 0 ? <p className="text-sm text-slate-500">{L('No upcoming obligations. Complete onboarding to generate your calendar.', 'لا توجد التزامات قادمة. أكمل الإعداد لإنشاء التقويم.')}</p> : (
            <ul className="divide-y divide-slate-100">
              {compliance.upcoming.map((o) => {
                const days = f.daysUntil(o.dueDate);
                return (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{lang === 'ar' ? o.titleAr || o.title : o.title}</div>
                      <div className="text-xs text-slate-500">{t(o.taxType)} · {f.date(o.dueDate)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={days <= 7 ? 'red' : days <= 30 ? 'amber' : 'gray'}>{L(`${days} d`, `${days} يوم`)}</Badge>
                      <StatusBadge status={o.status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={L('VAT registration threshold', 'حد التسجيل في ضريبة القيمة المضافة')}>
          <div className="mb-2 flex items-baseline justify-between text-sm"><span className="text-slate-500">{L('Basis', 'الأساس')}</span><span className="font-semibold num">{f.omr(threshold.basisBaisa)}</span></div>
          <ProgressBar value={threshold.percentOfMandatory} tone={thrTone} />
          <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{f.num(threshold.percentOfMandatory, 0, 1)}%</span><span>{L('Mandatory', 'إلزامي')}: {f.omr(threshold.mandatoryThresholdBaisa)}</span></div>
          <p className="mt-3 text-sm">
            {org.vatRegistered ? L('You are VAT-registered.', 'أنت مسجل في ضريبة القيمة المضافة.')
              : threshold.status === 'MUST_REGISTER' ? <span className="text-red-700">{L(`You must register for VAT within ${threshold.registerWithinDays} days.`, `يجب التسجيل خلال ${threshold.registerWithinDays} يوماً.`)}</span>
                : threshold.status === 'APPROACHING' ? L('You are approaching the mandatory threshold (80%+).', 'أنت تقترب من حد التسجيل الإلزامي.')
                  : threshold.status === 'VOLUNTARY_ELIGIBLE' ? L('You may register voluntarily.', 'يمكنك التسجيل طوعاً.') : L('You are below the registration thresholds.', 'أنت دون حدود التسجيل.')}
          </p>
          <p className="mt-1 text-xs text-slate-500">{L('Rolling 12 months of sales vs your forecast — whichever is higher.', 'آخر 12 شهراً من المبيعات مقابل توقعاتك — أيهما أعلى.')}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={L('Your tax obligations', 'التزاماتك الضريبية')} className="lg:col-span-2">
          {(obligationsSummary || []).length === 0 ? <p className="text-sm text-slate-500">{L('Complete onboarding to see which taxes apply.', 'أكمل الإعداد لمعرفة الضرائب المطبقة.')}</p> : (
            <ul className="space-y-3">
              {obligationsSummary.map((o) => (
                <li key={o.taxType} className="flex gap-3">
                  <Scale className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  <div><div className="text-sm font-medium">{t(o.taxType)} {o.urgent && <Badge tone="red">{L('Urgent', 'عاجل')}</Badge>}</div><div className="text-sm text-slate-600">{lang === 'ar' ? o.whyAr : o.whyEn}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card title={L('Returns in progress', 'إقرارات قيد العمل')}>
            {openReturns.length === 0 ? <p className="text-sm text-slate-500">{L('None.', 'لا يوجد.')}</p> : openReturns.map((r) => (
              <Link key={r.id} to={`/app/returns/${r.id}`} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm hover:text-brand-700">
                <span>{t(r.taxType)} · {f.date(r.periodEnd, { day: undefined })}</span><StatusBadge status={r.status} />
              </Link>
            ))}
          </Card>
          <Card title={L('E-invoices', 'الفواتير الإلكترونية')}>
            <div className="flex flex-wrap gap-2">{Object.entries(invoices).length === 0 ? <span className="text-sm text-slate-500">{L('No e-invoices yet.', 'لا توجد فواتير بعد.')}</span> : Object.entries(invoices).map(([s, n]) => <span key={s} className="inline-flex items-center gap-1"><StatusBadge status={s} /><span className="text-sm num">{f.int(n)}</span></span>)}</div>
            {expiringDocuments.length > 0 && <div className="mt-4 border-t border-slate-100 pt-3 text-sm"><div className="mb-1 font-medium text-amber-700">{L('Documents expiring soon', 'مستندات تنتهي قريباً')}</div>{expiringDocuments.map((d) => <div key={d.id} className="text-slate-600">{d.title} — {f.date(d.expiresAt)}</div>)}</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
