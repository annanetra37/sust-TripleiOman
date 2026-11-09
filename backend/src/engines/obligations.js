/**
 * Obligation engine (plan E1-03, E1-05, E2-01, E2-05).
 * From the onboarding questionnaire answers, works out which taxes apply ("why" included)
 * and generates calendar deadlines with weekend/holiday shifting.
 */
const { d, iso, addDays, addMonths, endOfMonth, shiftToWorkingDay, daysBetween } = require('../lib/dates');

/** E-invoicing go-live date for the organisation (plan E1-05). */
function einvoicingWave({ annualSuppliesBaisa = 0n, vatRegistered }, rules, asOf = new Date()) {
  const w = rules['einvoicing.waves'];
  if (!vatRegistered) {
    return { applies: false, wave: null, date: null, explanationEn: 'Fawtara e-invoicing is mandatory for VAT-registered taxpayers. You are not VAT-registered, so it does not apply yet.', explanationAr: 'الفوترة الإلكترونية إلزامية للمسجلين في ضريبة القيمة المضافة. أنت غير مسجل حالياً.' };
  }
  const large = BigInt(annualSuppliesBaisa || 0) > BigInt(w.largeThresholdBaisa);
  const wave = w.waves.find((x) => x.id === (large ? 'WAVE1' : 'WAVE2'));
  return {
    applies: true, wave: wave.id, date: wave.date, daysLeft: daysBetween(asOf, wave.date),
    labelEn: wave.labelEn, labelAr: wave.labelAr,
    explanationEn: large
      ? 'Your annual supplies exceed OMR 5 million, so you are in the first mandatory wave (1 April 2027).'
      : 'Your annual supplies are OMR 5 million or less, so you are in the second mandatory wave (1 October 2027).',
    explanationAr: large
      ? 'توريداتك السنوية تتجاوز 5 ملايين ريال، لذا أنت ضمن المرحلة الإلزامية الأولى (1 أبريل 2027).'
      : 'توريداتك السنوية 5 ملايين ريال أو أقل، لذا أنت ضمن المرحلة الإلزامية الثانية (1 أكتوبر 2027).',
  };
}

/**
 * Determine obligations from questionnaire answers.
 * answers: { vatRegistered, annualSalesOmr, importsGoods, paysForeignParties, exciseGoods,
 *            employees, isSmallEnterprise, ownerIncomeAbovePitThreshold, fiscalYearEndMonth }
 */
function determineObligations(org, answers, rules, asOf = new Date()) {
  const out = [];
  const reg = rules['vat.registration'];
  const annual = BigInt(Math.round(Number(answers.annualSalesOmr || 0) * 1000));
  const vatRegistered = !!(answers.vatRegistered ?? org.vatRegistered);

  if (vatRegistered) {
    out.push({ taxType: 'VAT', frequency: 'QUARTERLY', whyEn: 'You are VAT-registered: file a VAT return and pay within 30 days after each quarter.', whyAr: 'أنت مسجل في ضريبة القيمة المضافة: قدّم الإقرار وادفع خلال 30 يوماً بعد نهاية كل ربع.' });
  } else if (annual >= BigInt(reg.mandatoryThresholdBaisa)) {
    out.push({ taxType: 'REGISTRATION', frequency: 'ONCE', urgent: true, whyEn: `Your annual taxable supplies (OMR ${(Number(annual) / 1000).toLocaleString()}) exceed the OMR 38,500 mandatory threshold: you must register for VAT within 30 days.`, whyAr: 'توريداتك الخاضعة للضريبة تتجاوز حد التسجيل الإلزامي 38,500 ريال: يجب التسجيل خلال 30 يوماً.' });
  } else if (annual >= BigInt(reg.voluntaryThresholdBaisa)) {
    out.push({ taxType: 'REGISTRATION', frequency: 'OPTIONAL', whyEn: 'Your supplies exceed OMR 19,250: you may register for VAT voluntarily (lets you recover input VAT).', whyAr: 'توريداتك تتجاوز 19,250 ريال: يمكنك التسجيل طوعاً.' });
  }

  const wave = einvoicingWave({ annualSuppliesBaisa: annual, vatRegistered }, rules, asOf);
  if (wave.applies) out.push({ taxType: 'EINVOICING', frequency: 'ONCE', date: wave.date, whyEn: wave.explanationEn, whyAr: wave.explanationAr });

  if (org.legalForm !== 'INDIVIDUAL') {
    const small = !!answers.isSmallEnterprise;
    out.push({ taxType: 'CIT', frequency: 'ANNUAL', smallEnterprise: small, whyEn: `Companies and permanent establishments file one annual income tax return within ${small ? 3 : 4} months after year-end (${small ? '3% small-enterprise rate if eligible' : '15% standard rate'}).`, whyAr: `تقدم الشركات إقراراً سنوياً واحداً خلال ${small ? 3 : 4} أشهر من نهاية السنة.` });
  }
  if (answers.paysForeignParties) {
    out.push({ taxType: 'WHT', frequency: 'MONTHLY', whyEn: 'You pay royalties, service fees, interest or dividends to parties outside Oman: deduct 10% withholding tax (or the treaty rate) and remit monthly.', whyAr: 'تدفع لجهات خارج عُمان: اقتطع ضريبة الاستقطاع 10% (أو نسبة الاتفاقية) وادفعها شهرياً.' });
  }
  if (answers.exciseGoods) {
    out.push({ taxType: 'EXCISE', frequency: 'QUARTERLY', whyEn: 'You import or produce excise goods (tobacco, energy/sweetened/carbonated drinks, pork, alcohol): register, file quarterly and manage digital tax stamps.', whyAr: 'تستورد أو تنتج سلعاً انتقائية: سجّل وقدّم إقراراً ربع سنوي وأدر الطوابع الضريبية الرقمية.' });
  }
  if (Number(answers.employees || 0) > 0) {
    out.push({ taxType: 'PAYROLL', frequency: 'MONTHLY', fromDate: '2028-01-01', whyEn: 'From 1 January 2028, employers may need to withhold personal income tax on high salaries [VERIFY executive regulations].', whyAr: 'اعتباراً من 1 يناير 2028 قد يلزم أصحاب العمل باستقطاع ضريبة الدخل الشخصي.' });
  }
  if (answers.ownerIncomeAbovePitThreshold) {
    out.push({ taxType: 'PIT', frequency: 'ANNUAL', fromDate: '2028-01-01', whyEn: 'Personal income tax (5% above OMR 42,000) starts 1 January 2028; first returns due by 30 June 2029.', whyAr: 'تبدأ ضريبة الدخل الشخصي (5% فوق 42,000 ريال) في 1 يناير 2028.' });
  }
  return out;
}

/**
 * Generate concrete deadline instances for the next `months` months (plus the current open period).
 * Returns rows ready for upsert into Obligation.
 */
function generateCalendar(org, obligations, rules, { from = new Date(), months = 15 } = {}) {
  const cal = rules['calendar.oman'];
  const rows = [];
  const start = d(from);
  const horizon = addMonths(start, months);
  const push = (r) => {
    const due = shiftToWorkingDay(r.dueDate, cal);
    if (due >= addMonths(start, -3) && due <= horizon) rows.push({ ...r, dueDate: due });
  };

  for (const ob of obligations) {
    if (ob.taxType === 'VAT') {
      const dl = rules['deadlines.vat'];
      const offset = ((org.profile?.vatQuarterStartMonth || 1) - 1) % 3; // OTA assigns tax periods; default calendar quarters
      for (let y = start.getUTCFullYear() - 1; y <= horizon.getUTCFullYear(); y++) {
        for (let q = 0; q < 4; q++) {
          const ps = new Date(Date.UTC(y, q * 3 + offset, 1));
          const pe = endOfMonth(ps.getUTCFullYear(), ps.getUTCMonth() + dl.periodMonths - 1);
          const qn = q + 1;
          push({ taxType: 'VAT', title: `VAT return Q${qn} ${y}`, titleAr: `إقرار ضريبة القيمة المضافة الربع ${qn} ${y}`, periodStart: ps, periodEnd: pe, dueDate: addDays(pe, dl.dueDaysAfterPeriodEnd), ruleRef: 'deadlines.vat' });
        }
      }
    } else if (ob.taxType === 'EXCISE') {
      const dl = rules['deadlines.excise'];
      for (let y = start.getUTCFullYear() - 1; y <= horizon.getUTCFullYear(); y++) {
        for (let q = 0; q < 4; q++) {
          const ps = new Date(Date.UTC(y, q * 3, 1));
          const pe = endOfMonth(y, q * 3 + 2);
          push({ taxType: 'EXCISE', title: `Excise return Q${q + 1} ${y}`, titleAr: `إقرار الضريبة الانتقائية الربع ${q + 1} ${y}`, periodStart: ps, periodEnd: pe, dueDate: addDays(pe, dl.dueDaysAfterPeriodEnd), ruleRef: 'deadlines.excise' });
        }
      }
    } else if (ob.taxType === 'WHT') {
      const dl = rules['deadlines.wht'];
      for (let i = -2; i <= months; i++) {
        const ps = addMonths(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)), i);
        const pe = endOfMonth(ps.getUTCFullYear(), ps.getUTCMonth());
        const label = ps.toISOString().slice(0, 7);
        push({ taxType: 'WHT', title: `Withholding tax statement ${label}`, titleAr: `كشف ضريبة الاستقطاع ${label}`, periodStart: ps, periodEnd: pe, dueDate: addDays(pe, dl.dueDaysAfterMonthEnd), ruleRef: 'deadlines.wht' });
      }
    } else if (ob.taxType === 'CIT') {
      const dl = rules['deadlines.cit'];
      const fyEnd = org.fiscalYearEndMonth || 12;
      const monthsAfter = ob.smallEnterprise ? dl.smallEnterpriseDueMonthsAfterYearEnd : dl.dueMonthsAfterYearEnd;
      for (let y = start.getUTCFullYear() - 1; y <= horizon.getUTCFullYear(); y++) {
        const pe = endOfMonth(y, fyEnd - 1);
        const ps = addDays(addMonths(pe, -12), 1);
        const due = endOfMonth(addMonths(pe, monthsAfter).getUTCFullYear(), addMonths(pe, monthsAfter).getUTCMonth());
        push({ taxType: 'CIT', title: `Corporate income tax return FY ending ${iso(pe)}`, titleAr: `إقرار ضريبة الدخل للسنة المنتهية ${iso(pe)}`, periodStart: ps, periodEnd: pe, dueDate: due, ruleRef: 'deadlines.cit' });
      }
    } else if (ob.taxType === 'EINVOICING') {
      push({ taxType: 'EINVOICING', title: 'Fawtara e-invoicing go-live', titleAr: 'بدء الفوترة الإلكترونية (فوترة)', periodStart: d(ob.date), periodEnd: d(ob.date), dueDate: d(ob.date), ruleRef: 'einvoicing.waves' });
    } else if (ob.taxType === 'REGISTRATION' && ob.frequency === 'ONCE') {
      push({ taxType: 'REGISTRATION', title: 'Register for VAT', titleAr: 'التسجيل في ضريبة القيمة المضافة', periodStart: start, periodEnd: start, dueDate: addDays(start, rules['vat.registration'].registerWithinDays), ruleRef: 'vat.registration' });
    } else if (ob.taxType === 'PIT') {
      const dl = rules['deadlines.pit'];
      for (let y = Math.max(2028, start.getUTCFullYear() - 1); y <= horizon.getUTCFullYear(); y++) {
        const pe = new Date(Date.UTC(y, 11, 31));
        push({ taxType: 'PIT', title: `Personal income tax return ${y}`, titleAr: `إقرار ضريبة الدخل الشخصي ${y}`, periodStart: new Date(Date.UTC(y, 0, 1)), periodEnd: pe, dueDate: endOfMonth(y + 1, dl.dueMonthsAfterYearEnd - 1), ruleRef: 'deadlines.pit' });
      }
    }
  }
  return rows.sort((a, b) => a.dueDate - b.dueDate);
}

/** iCalendar export (plan E2-01). */
function toICal(orgName, obligations, appUrl) {
  const esc = (s) => String(s).replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Triple i Oman//Tax Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(`${orgName} — tax deadlines`)}`];
  for (const o of obligations) {
    const day = iso(o.dueDate).replace(/-/g, '');
    const next = iso(addDays(o.dueDate, 1)).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${o.id}@triplei-oman`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc(o.title)}`, `DESCRIPTION:${esc(`Status: ${o.status}. ${appUrl}/calendar`)}`,
      'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(o.title)} due in 7 days`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

module.exports = { einvoicingWave, determineObligations, generateCalendar, toICal };
