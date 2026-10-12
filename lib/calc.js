// All money math lives here so the UI and the invoices always agree.
const store = require('./store');
const T = require('./time');

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
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

// Everything for one period: sales, agent pay + commission, the client invoice, and rebill split.
function computePeriod(id) {
  const doc = getPeriodDoc(id);
  if (doc.status === 'final' && doc.snapshot) return Object.assign({}, doc.snapshot, { status: 'final', invoiceNo: doc.invoiceNo, finalizedAt: doc.finalizedAt, finalizedBy: doc.finalizedBy });

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
    return {
      agentId: a.id, name: a.name, role: a.role, hours: h, rate,
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
  const locations = Object.values(byLoc).map(l => Object.assign(l, { sales: r2(l.sales) })).sort((a, b) => a.name.localeCompare(b.name));

  // Rebill: split the invoice across venues by their share of call minutes in the period.
  const usage = store.read('usage', []).filter(u => u.date >= range.from && u.date <= range.to);
  const minutesByClient = {};
  usage.forEach(u => { minutesByClient[u.clientId] = (minutesByClient[u.clientId] || 0) + (u.minutes || 0); });
  const overrides = doc.rebillOverrides || {};
  const rebillRows = clients.map(c => {
    const auto = minutesByClient[c.id] || 0;
    const ov = overrides[c.id];
    return { clientId: c.id, name: c.name, autoMinutes: auto, minutes: ov != null && ov !== '' ? Number(ov) : auto, overridden: ov != null && ov !== '' };
  });
  const totalMin = rebillRows.reduce((a, r) => a + r.minutes, 0);
  rebillRows.forEach(r => { r.share = totalMin ? r.minutes / totalMin : 0; r.amount = r2(r.share * subtotal); });

  const salesOut = sales.map(s => ({
    id: s.id, confirmation: s.confirmation, soldOn: s.soldOn, reservationDate: s.reservationDate,
    customer: s.customer, destination: s.destination, clientId: s.clientId, clientName: clientName(s.clientId) || '',
    package: s.package, guests: s.guests, total: s.total, excluded: !!s.excluded, source: s.source,
    agentSource: s.agentSource, rawCredits: s.credits || [], soldOnManual: !!s.soldOnManual, credits: creditAmounts(s).map(c => ({ agentId: c.agentId, amount: r2(c.amount), name: (agents.find(a => a.id === c.agentId) || {}).name || '?' })),
  }));

  return {
    period: range, status: doc.status || 'draft', invoiceNo: doc.invoiceNo || null,
    settings: { company: settings.company, billTo: settings.billTo, paymentTerms: settings.paymentTerms, rates },
    totals: { sales: totalSales, orders: counted.length, hours: totalHours, payroll: sum('total'), invoice: subtotal, unassignedSales: r2(unassigned), unassignedCount, excludedCount: sales.length - counted.length },
    agents: rows, lines, subtotal, locations, sales: salesOut,
    rebill: { rows: rebillRows.filter(r => r.minutes > 0 || r.overridden), totalMinutes: totalMin },
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

  const periods = periodsForMonth(month, settings.cycle).map(id => {
    const p = computePeriod(id);
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
    expenses: expenses.map(e => ({ id: e.id, label: e.label, source: e.source, monthAmount: e.monthAmount })),
  };
}

module.exports = {
  r2, periodRange, periodsForMonth, periodForDate, recentPeriods, getPeriodDoc, savePeriodDoc,
  computePeriod, occurrencesInMonth, expensesForMonth, buildUsageInvoice, monthOverview,
};
