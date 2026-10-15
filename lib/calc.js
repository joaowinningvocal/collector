// All money math lives here so the UI and the invoices always agree.
const store = require('./store');
const T = require('./time');
const aloware = require('./aloware');

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
// Split a dollar total by weights so the cents always add back up to the total.
function allocate(total, weights) {
  const sumW = weights.reduce((a, b) => a + (Number(b) || 0), 0);
  if (!sumW) return weights.map(() => 0);
  const cents = Math.round(total * 100);
  const raw = weights.map(w => cents * (Number(w) || 0) / sumW);
  const out = raw.map(Math.floor);
  let rem = cents - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rem > 0) { out[i]++; rem--; } });
  return out.map(c => c / 100);
}
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Pay / invoice periods ──────────────────────────────────────────────────────
// Ids: "2026-10-1" (1st–14th), "2026-10-2" (15th–end), "2026-10-M" (whole month)
function periodRange(id) {
  const [y, m, half] = id.split('-');
  const month = y + '-' + m;
  let from, to;
  if (half === '1') { from = month + '-01'; to = month + '-14'; }
  else if (half === '2') { from = month + '-15'; to = T.lastDay(month); }
  else { from = month + '-01'; to = T.lastDay(month); }
  const mi = Number(m) - 1;
  const label = half === 'M' ? T.monthLabel(month)
    : MONTH_SHORT[mi] + ' ' + Number(from.slice(8)) + '–' + Number(to.slice(8)) + ', ' + y;
  const us = d => d.slice(5, 7) + '/' + d.slice(8) + '/' + d.slice(0, 4);
  return { id, month, from, to, label, invoiceRange: us(from) + '-' + us(to) };
}
function periodsForMonth(month, cycle) { return cycle === 'monthly' ? [month + '-M'] : [month + '-1', month + '-2']; }
function periodForDate(dateStr, cycle) {
  const month = T.monthKey(dateStr);
  if (cycle === 'monthly') return month + '-M';
  return month + (Number(dateStr.slice(8)) <= 14 ? '-1' : '-2');
}
function recentPeriods(cycle, count) {
  const out = [];
  let month = T.monthKey(T.pacificDateStr());
  const today = T.pacificDateStr();
  while (out.length < count) {
    periodsForMonth(month, cycle).reverse().forEach(p => { if (periodRange(p).from <= today) out.push(p); });
    month = T.addMonths(month, -1);
  }
  return out.slice(0, count).map(periodRange);
}

function getPeriodDoc(id) {
  return store.read('periods', []).find(p => p.id === id) ||
    { id, hours: {}, extraBonus: {}, rebillOverrides: {}, status: 'draft' };
}
function savePeriodDoc(doc) {
  const periods = store.read('periods', []);
  const i = periods.findIndex(p => p.id === doc.id);
  doc.updatedAt = new Date().toISOString();
  if (i >= 0) periods[i] = doc; else periods.push(doc);
  store.write('periods', periods);
  return doc;
}

// Split a sale's total across its credited agents. Blank amounts share the remainder evenly.
function creditAmounts(sale) {
  const credits = sale.credits || [];
  if (!credits.length) return [];
  const fixed = credits.filter(c => c.amount != null && c.amount !== '');
  const fixedSum = fixed.reduce((a, c) => a + Number(c.amount), 0);
  const open = credits.length - fixed.length;
  const each = open ? (sale.total - fixedSum) / open : 0;
  return credits.map(c => ({ agentId: c.agentId, amount: c.amount != null && c.amount !== '' ? Number(c.amount) : each }));
}

// Invoices finalized by an older version stored the rebill per client (Telnyx minutes). Reshape them.
function normalizeSnapshot(P) {
  if (P.rebill && !P.rebill.basis) {
    const rows = (P.rebill.rows || []).map(r => ({
      lineId: r.clientId, name: r.name, clientIds: r.clientId ? [r.clientId] : [], clientNames: [r.name],
      autoMinutes: r.autoMinutes || 0, autoActivities: 0, minutes: r.minutes || 0, activities: 0,
      shareTime: r.share || 0, shareActivities: 0, amountTime: r.amount || 0, amountActivities: 0, share: r.share || 0, amount: r.amount || 0,
    }));
    P.rebill = { basis: 'time', rows, totalMinutes: P.rebill.totalMinutes || 0, totalActivities: 0, hasData: !!P.rebill.totalMinutes };
  }
  if (!P.coverage) P.coverage = { minMultiple: 0, below: [], team: null };
  (P.locations || []).forEach(l => { if (l.avg == null) { l.avg = l.orders ? r2(l.sales / l.orders) : 0; l.share = P.totals && P.totals.sales ? l.sales / P.totals.sales : 0; } });
  return P;
}

// Everything for one period: sales, agent pay + commission, the client invoice, and rebill split.
function computePeriod(id) {
  const doc = getPeriodDoc(id);
  if (doc.status === 'final' && doc.snapshot) return normalizeSnapshot(Object.assign({}, doc.snapshot, { status: 'final', invoiceNo: doc.invoiceNo, finalizedAt: doc.finalizedAt, finalizedBy: doc.finalizedBy }));

  const range = periodRange(id);
  const settings = store.read('settings', {});
  const rates = settings.rates || {};
  const agents = store.read('agents', []);
  const clients = store.read('clients', []);
  const clientName = cid => (clients.find(c => c.id === cid) || {}).name;

  const sales = store.read('sales', [])
    .filter(s => s.soldOn >= range.from && s.soldOn <= range.to)
    .sort((a, b) => (a.soldOn + a.confirmation).localeCompare(b.soldOn + b.confirmation));
  const counted = sales.filter(s => !s.excluded);
  const totalSales = r2(counted.reduce((a, s) => a + (s.total || 0), 0));

  const creditByAgent = {};
  let unassigned = 0, unassignedCount = 0;
  counted.forEach(s => {
    const cr = creditAmounts(s);
    if (!cr.length) { unassigned += s.total || 0; unassignedCount++; return; }
    cr.forEach(c => { creditByAgent[c.agentId] = (creditByAgent[c.agentId] || 0) + c.amount; });
  });

  const hours = doc.hours || {}, extra = doc.extraBonus || {};
  const inPeriod = a => a.active !== false || Number(hours[a.id]) > 0 || creditByAgent[a.id];
  const roster = agents.filter(inPeriod);
  const managers = roster.filter(a => a.role === 'manager' && Number(hours[a.id]) > 0);
  const managerShare = managers.length ? totalSales / managers.length : 0;
  const minMultiple = Number(rates.minSalesMultiple) || 0;

  const rows = roster.map(a => {
    const h = Number(hours[a.id]) || 0;
    const rate = a.payRate != null && a.payRate !== '' ? Number(a.payRate)
      : (a.role === 'manager' ? Number(rates.managerHourly) : Number(rates.agentHourly));
    const isMgr = a.role === 'manager';
    const salesBase = isMgr ? (h > 0 ? managerShare : 0) : (creditByAgent[a.id] || 0);
    const pct = isMgr ? Number(rates.managerBonusPct) : Number(rates.agentBonusPct);
    const hoursPay = h * rate;
    const bonus = salesBase * pct / 100;
    const ex = Number(extra[a.id]) || 0;
    // Sales vs what this agent's hours are billed at (pay + WSS override). Managers are judged on the team.
    const billedHours = h * (rate + Number(rates.overrideHourly || 0));
    const coverage = !isMgr && billedHours > 0 ? salesBase / billedHours : null;
    return {
      agentId: a.id, name: a.name, role: a.role, hours: h, rate,
      billedHours: r2(billedHours), coverage, belowTarget: coverage != null && coverage < minMultiple,
      hoursPay: r2(hoursPay), sales: r2(salesBase), bonusPct: pct, bonus: r2(bonus), extra: r2(ex),
      total: r2(hoursPay + bonus + ex),
      raw: { hoursPay, bonus, extra: ex, total: hoursPay + bonus + ex }, // sums use unrounded values, like the spreadsheet
    };
  }).sort((a, b) => (a.role === b.role ? 0 : a.role === 'manager' ? -1 : 1));

  const totalHours = rows.reduce((a, r) => a + r.hours, 0);
  const sum = k => r2(rows.reduce((a, r) => a + r.raw[k], 0));
  const lines = [
    { key: 'callcenter', description: 'CALL CENTER ' + range.invoiceRange, quantity: totalHours, quantityKind: 'hours', amount: sum('hoursPay') },
    { key: 'bonus', description: 'AGENT SALES BONUS', quantity: totalSales, quantityKind: 'money', amount: sum('bonus') },
  ];
  if (sum('extra')) lines.push({ key: 'extra', description: 'AGENT EXTRA BONUSES', quantity: null, amount: sum('extra') });
  lines.push({ key: 'ovr', description: 'WSS OVR', quantity: totalHours, quantityKind: 'hours', amount: r2(totalHours * Number(rates.overrideHourly)), note: totalHours + ' h × $' + Number(rates.overrideHourly).toFixed(2) });
  lines.push({ key: 'salesovr', description: 'WSS SALES BONUS OVR', quantity: totalSales, quantityKind: 'money', amount: r2(totalSales * Number(rates.salesOverridePct) / 100), note: Number(rates.salesOverridePct) + '% of sales' });
  const subtotal = r2(lines.reduce((a, l) => a + l.amount, 0));

  // Sales by location (CartVIP destination matched to a client)
  const byLoc = {};
  counted.forEach(s => {
    const key = s.clientId || ('raw:' + (s.destination || 'Unknown'));
    if (!byLoc[key]) byLoc[key] = { key, name: s.clientId ? clientName(s.clientId) : (s.destination || 'Unknown'), matched: !!s.clientId, orders: 0, sales: 0 };
    byLoc[key].orders++; byLoc[key].sales += s.total || 0;
  });
  const locations = Object.values(byLoc).map(l => Object.assign(l, { sales: r2(l.sales), avg: r2(l.sales / l.orders), share: totalSales ? l.sales / totalSales : 0 }))
    .sort((a, b) => b.sales - a.sales);

  // Rebill: split the invoice across Aloware lines by call time or activities (like the GoBest VIP
  // sheet). Numbers come from the Aloware webhook; any line can be typed in by hand.
  const basis = settings.rebillBasis === 'activities' ? 'activities' : 'time';
  const auto = aloware.totalsByLine(range.from, range.to);
  const ov = doc.rebillOverrides || {};
  const rebillRows = store.read('alowareLines', []).filter(l => l.rebill !== false).map(l => {
    const a = auto[l.id] || { seconds: 0, activities: 0 };
    const o = ov[l.id] && typeof ov[l.id] === 'object' ? ov[l.id] : {};
    const autoMinutes = r2(a.seconds / 60);
    return {
      lineId: l.id, name: l.name, clientIds: l.clientIds || [], clientNames: (l.clientIds || []).map(clientName).filter(Boolean),
      autoMinutes, autoActivities: a.activities,
      minutes: o.minutes != null ? Number(o.minutes) : autoMinutes, activities: o.activities != null ? Number(o.activities) : a.activities,
      minutesOverridden: o.minutes != null, activitiesOverridden: o.activities != null,
    };
  });
  const totalMin = r2(rebillRows.reduce((a, r) => a + r.minutes, 0));
  const totalAct = rebillRows.reduce((a, r) => a + r.activities, 0);
  const byTime = allocate(subtotal, rebillRows.map(r => r.minutes));
  const byAct = allocate(subtotal, rebillRows.map(r => r.activities));
  rebillRows.forEach((r, i) => {
    r.shareTime = totalMin ? r.minutes / totalMin : 0; r.shareActivities = totalAct ? r.activities / totalAct : 0;
    r.amountTime = byTime[i]; r.amountActivities = byAct[i];
    r.share = basis === 'activities' ? r.shareActivities : r.shareTime;
    r.amount = basis === 'activities' ? r.amountActivities : r.amountTime;
  });

  const salesOut = sales.map(s => ({
    id: s.id, confirmation: s.confirmation, soldOn: s.soldOn, reservationDate: s.reservationDate,
    customer: s.customer, destination: s.destination, clientId: s.clientId, clientName: clientName(s.clientId) || '',
    package: s.package, guests: s.guests, total: s.total, excluded: !!s.excluded, source: s.source,
    agentSource: s.agentSource, rawCredits: s.credits || [], soldOnManual: !!s.soldOnManual, credits: creditAmounts(s).map(c => ({ agentId: c.agentId, amount: r2(c.amount), name: (agents.find(a => a.id === c.agentId) || {}).name || '?' })),
  }));

  return {
    period: range, status: doc.status || 'draft', invoiceNo: doc.invoiceNo || null,
    settings: { company: settings.company, billTo: settings.billTo, paymentTerms: settings.paymentTerms, rates, brands: settings.brands },
    totals: { sales: totalSales, orders: counted.length, hours: totalHours, payroll: sum('total'), invoice: subtotal, unassignedSales: r2(unassigned), unassignedCount, excludedCount: sales.length - counted.length },
    agents: rows, lines, subtotal, locations, sales: salesOut,
    rebill: { basis, rows: rebillRows, totalMinutes: totalMin, totalActivities: totalAct, hasData: !!(totalMin || totalAct) },
    coverage: { minMultiple, below: rows.filter(r => r.belowTarget).map(r => ({ name: r.name, sales: r.sales, billedHours: r.billedHours, coverage: r.coverage })), team: totalHours ? totalSales / rows.reduce((a, r) => a + r.hours * (r.rate + Number(rates.overrideHourly || 0)), 0) : null },
  };
}

// ── Expenses ───────────────────────────────────────────────────────────────────
// How many times an expense is charged inside a month.
function occurrencesInMonth(e, month) {
  const start = e.startDate || '1970-01-01';
  const end = e.endDate || '9999-12-31';
  const mFirst = T.firstDay(month), mLast = T.lastDay(month);
  if (start > mLast || end < mFirst) return 0;
  const startMonth = T.monthKey(start);
  switch (e.frequency) {
    case 'once': return T.monthKey(start) === month ? 1 : 0;
    case 'monthly': return 1;
    case 'quarterly': return T.monthsBetween(startMonth, month) % 3 === 0 ? 1 : 0;
    case 'yearly': return T.monthsBetween(startMonth, month) % 12 === 0 ? 1 : 0;
    case 'custom': { const n = Math.max(1, Number(e.everyMonths) || 1); return T.monthsBetween(startMonth, month) % n === 0 ? 1 : 0; }
    case 'weekly': case 'biweekly': {
      const step = e.frequency === 'weekly' ? 7 : 14;
      let count = 0;
      T.datesInRange(mFirst, mLast).forEach(d => { if (d >= start && d <= end && T.daysBetween(start, d) % step === 0) count++; });
      return count;
    }
    default: return 0;
  }
}
function expensesForMonth(month) {
  return store.read('expenses', [])
    .map(e => { const n = occurrencesInMonth(e, month); return Object.assign({}, e, { occurrences: n, monthAmount: r2(n * (Number(e.amount) || 0)) }); })
    .filter(e => e.occurrences > 0);
}

// ── Receptionist (per-minute) billing ─────────────────────────────────────────
function buildUsageInvoice(clientId, month) {
  const settings = store.read('settings', {});
  const client = store.read('clients', []).find(c => c.id === clientId);
  if (!client) return null;
  const rows = store.read('usage', []).filter(u => u.clientId === clientId && T.monthKey(u.date) === month);
  const totalMin = rows.reduce((a, r) => a + (r.minutes || 0), 0);
  const totalSms = rows.reduce((a, r) => a + (r.sms || 0), 0);
  const totalCalls = rows.reduce((a, r) => a + (r.calls || 0), 0);
  const rateMin = client.rateMin != null ? client.rateMin : settings.defaultRateMin;
  const rateSms = client.rateSms != null ? client.rateSms : settings.defaultRateSms;
  return {
    clientId, clientName: client.name, month, totalCalls, totalMinutes: totalMin, totalSms, rateMin, rateSms,
    costMinutes: r2(totalMin * rateMin), costSms: r2(totalSms * rateSms), total: r2(totalMin * rateMin + totalSms * rateSms),
    company: settings.company, paymentTerms: settings.paymentTerms,
    dailyBreakdown: rows.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ── Venue invoices: one AI receptionist + one call-center (ClubLifter) invoice per venue ──
function venueInvoices(month) {
  const settings = store.read('settings', {});
  const clients = store.read('clients', []);
  const periods = periodsForMonth(month, settings.cycle).map(computePeriod);
  const minMultiple = Number((settings.rates || {}).minSalesMultiple) || 0;
  const cl = {}, sales = {}, unlinked = [];
  clients.forEach(c => { cl[c.id] = []; sales[c.id] = { orders: 0, total: 0 }; });

  periods.forEach(P => {
    P.rebill.rows.forEach(r => {
      if (!r.amount) return;
      const base = { periodId: P.period.id, periodLabel: P.period.label, status: P.status, invoiceNo: P.invoiceNo, lineName: r.name, minutes: r.minutes, activities: r.activities, share: r.share, basis: P.rebill.basis };
      const linked = r.clientIds.filter(id => cl[id]);
      if (!linked.length) { unlinked.push(Object.assign(base, { amount: r.amount })); return; }
      const parts = allocate(r.amount, linked.map(() => 1));
      linked.forEach((id, i) => cl[id].push(Object.assign({}, base, { amount: parts[i], splitWith: linked.length })));
    });
    P.sales.forEach(s => { if (!s.excluded && s.clientId && sales[s.clientId]) { sales[s.clientId].orders++; sales[s.clientId].total += s.total || 0; } });
  });

  const rows = clients.map(c => {
    const ai = buildUsageInvoice(c.id, month);
    const clTotal = r2(cl[c.id].reduce((a, l) => a + l.amount, 0));
    const st = { orders: sales[c.id].orders, total: r2(sales[c.id].total) };
    const coverage = clTotal ? st.total / clTotal : null;
    return {
      clientId: c.id, name: c.name, billingContact: c.billingContact || '',
      ai: { calls: ai.totalCalls, minutes: ai.totalMinutes, sms: ai.totalSms, rateMin: ai.rateMin, rateSms: ai.rateSms, costMinutes: ai.costMinutes, costSms: ai.costSms, total: ai.total },
      callCenter: { lines: cl[c.id], total: clTotal },
      sales: st, coverage, belowTarget: coverage != null && coverage < minMultiple,
    };
  });
  return {
    month, label: T.monthLabel(month), brands: settings.brands || {}, minMultiple,
    periods: periods.map(P => ({ id: P.period.id, label: P.period.label, status: P.status, invoiceNo: P.invoiceNo, subtotal: P.subtotal, hasRebillData: P.rebill.hasData })),
    rows, unlinked: { lines: unlinked, total: r2(unlinked.reduce((a, l) => a + l.amount, 0)) },
    totals: { ai: r2(rows.reduce((a, r) => a + r.ai.total, 0)), callCenter: r2(rows.reduce((a, r) => a + r.callCenter.total, 0)) },
    company: settings.company, paymentTerms: settings.paymentTerms,
  };
}

// ── Month overview (P&L) ──────────────────────────────────────────────────────
function monthOverview(month) {
  const settings = store.read('settings', {});
  const clients = store.read('clients', []);
  const usage = store.read('usage', []).filter(u => T.monthKey(u.date) === month);

  const byClient = clients.map(c => {
    const rows = usage.filter(u => u.clientId === c.id);
    const min = rows.reduce((a, r) => a + (r.minutes || 0), 0);
    const sms = rows.reduce((a, r) => a + (r.sms || 0), 0);
    const calls = rows.reduce((a, r) => a + (r.calls || 0), 0);
    const rateMin = c.rateMin != null ? c.rateMin : settings.defaultRateMin;
    const rateSms = c.rateSms != null ? c.rateSms : settings.defaultRateSms;
    return { clientId: c.id, name: c.name, calls, minutes: min, sms, billed: r2(min * rateMin + sms * rateSms) };
  });
  const receptionist = r2(byClient.reduce((a, c) => a + c.billed, 0));

  const venueSales = {};
  const periods = periodsForMonth(month, settings.cycle).map(id => {
    const p = computePeriod(id);
    p.locations.forEach(l => {
      const v = venueSales[l.key] || (venueSales[l.key] = { name: l.name, matched: l.matched, orders: 0, sales: 0 });
      v.orders += l.orders; v.sales += l.sales;
    });
    return { id, label: p.period.label, status: p.status, invoiceNo: p.invoiceNo, invoice: p.subtotal, payroll: p.totals.payroll, sales: p.totals.sales, unassignedCount: p.totals.unassignedCount };
  });
  const callCenter = r2(periods.reduce((a, p) => a + p.invoice, 0));
  const payroll = r2(periods.reduce((a, p) => a + p.payroll, 0));

  const expenses = expensesForMonth(month);
  const expenseTotal = r2(expenses.reduce((a, e) => a + e.monthAmount, 0));
  const daily = store.read('daily', []).filter(d => T.monthKey(d.date) === month);

  return {
    month, label: T.monthLabel(month),
    revenue: { receptionist, callCenter, total: r2(receptionist + callCenter) },
    costs: { expenses: expenseTotal, payroll, total: r2(expenseTotal + payroll) },
    net: r2(receptionist + callCenter - expenseTotal - payroll),
    calls: { total: daily.reduce((a, d) => a + (d.calls || 0), 0), minutes: daily.reduce((a, d) => a + (d.minutes || 0), 0), days: daily.length },
    byClient: byClient.sort((a, b) => b.billed - a.billed), periods,
    salesByVenue: Object.values(venueSales).map(v => Object.assign(v, { sales: r2(v.sales) })).sort((a, b) => b.sales - a.sales),
    expenses: expenses.map(e => ({ id: e.id, label: e.label, source: e.source, monthAmount: e.monthAmount })),
  };
}

module.exports = {
  r2, periodRange, periodsForMonth, periodForDate, recentPeriods, getPeriodDoc, savePeriodDoc,
  computePeriod, occurrencesInMonth, expensesForMonth, buildUsageInvoice, monthOverview, venueInvoices, allocate,
};
