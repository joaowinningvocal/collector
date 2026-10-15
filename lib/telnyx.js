// Telnyx integration
//  - collectDay(date): pulls the day's call detail records (+ SMS) and stores per-number usage
//  - syncMonthlyExpense(month): writes the month's Telnyx cost as an automatic expense
const store = require('./store');
const T = require('./time');

const BASE = () => (process.env.TELNYX_API_BASE || 'https://api.telnyx.com/v2').replace(/\/$/, '');
const KEY = () => process.env.TELNYX_API_KEY || '';
// LiveKit calls ride on SIP trunking. Add "call-control" here if any line uses Call Control/TeXML.
const CALL_RECORD_TYPES = () => (process.env.TELNYX_CALL_RECORD_TYPES || 'sip-trunking')
  .split(',').map(s => s.trim()).filter(Boolean);

function configured() { return !!KEY(); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tget(path, params, attempt) {
  if (!KEY()) throw new Error('TELNYX_API_KEY is not set in Railway variables');
  const url = new URL(BASE() + path);
  Object.entries(params || {}).forEach(([k, v]) => { if (v != null && v !== '') url.searchParams.append(k, String(v)); });
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + KEY(), Accept: 'application/json' } });
  if (res.status === 429 && (attempt || 0) < 4) { await sleep(1500 * ((attempt || 0) + 1)); return tget(path, params, (attempt || 0) + 1); }
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) {
    const err = body && body.errors && body.errors[0];
    const e = new Error('Telnyx ' + res.status + ': ' + (err ? (err.detail || err.title) : text.slice(0, 200)));
    e.status = res.status; throw e;
  }
  return body;
}

// Page through /detail_records for one record type and a timestamp window (dates, end exclusive).
async function searchRecords(recordType, field, fromDate, toDateExclusive) {
  const out = [];
  for (let page = 1; page <= 400; page++) {
    const body = await tget('/detail_records', {
      'filter[record_type]': recordType,
      ['filter[' + field + '][gte]']: fromDate,
      ['filter[' + field + '][lt]']: toDateExclusive,
      'page[number]': page, 'page[size]': 50, sort: field,
    });
    out.push(...((body && body.data) || []));
    const totalPages = (body && body.meta && body.meta.total_pages) || 1;
    if (page >= totalPages) break;
    await sleep(120);
  }
  return out;
}

const last10 = n => { const d = String(n || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : null; };
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

// Which of the record's phone fields point at one of our client numbers.
const CALLED_FIELDS = ['cld', 'to', 'destination_number', 'dest_number', 'called_number'];
const CALLER_FIELDS = ['cli', 'from', 'originating_number', 'calling_number', 'telnyx_number'];
function matchNumber(rec, numberMap) {
  for (const f of [...CALLED_FIELDS, ...CALLER_FIELDS]) {
    const k = last10(rec[f]);
    if (k && numberMap[k]) return numberMap[k];
  }
  return null;
}
function recordDate(rec) {
  const ts = rec.started_at || rec.created_at || rec.answered_at || rec.finished_at || rec.completed_at;
  return ts ? T.pacificDateStr(new Date(ts)) : null;
}
function callSeconds(rec) {
  if (rec.call_sec != null) return num(rec.call_sec);
  if (rec.billed_sec != null) return num(rec.billed_sec);
  if (rec.duration_sec != null) return num(rec.duration_sec);
  return num(rec.duration);
}
function recordCost(rec) {
  const c = num(rec.cost);
  if (c) return c;
  if (rec.rate && rec.billed_sec) return num(rec.rate) * num(rec.billed_sec) / 60;
  return 0;
}

function buildNumberMap() {
  const map = {};
  store.read('clients', []).forEach(c => (c.numbers || []).forEach(n => {
    const k = last10(n); if (k) map[k] = { clientId: c.id, clientName: c.name, number: n };
  }));
  return map;
}

// Pull one Pacific day of calls + texts and store it. Safe to re-run (replaces that day).
async function collectDay(dateStr) {
  const numberMap = buildNumberMap();
  // A Pacific day spans two UTC dates, so ask for D..D+2 and keep only records on Pacific day D.
  const from = dateStr, to = T.addDays(dateStr, 2);

  let calls = [];
  for (const type of CALL_RECORD_TYPES()) {
    const recs = await searchRecords(type, 'started_at', from, to);
    calls.push(...recs.filter(r => recordDate(r) === dateStr));
  }
  let texts = [], smsError = null;
  try {
    texts = (await searchRecords('messaging', 'created_at', from, to)).filter(r => recordDate(r) === dateStr);
  } catch (e) { smsError = e.message; }

  const agg = {};
  const day = { date: dateStr, calls: 0, inbound: 0, outbound: 0, seconds: 0, voiceCost: 0, sms: 0, smsCost: 0, unassignedCalls: 0, unassignedSeconds: 0 };
  const slot = m => {
    const key = m.clientId + '|' + m.number;
    if (!agg[key]) agg[key] = { clientId: m.clientId, clientName: m.clientName, number: m.number, date: dateStr, calls: 0, inbound: 0, outbound: 0, seconds: 0, sms: 0, voiceCost: 0, smsCost: 0 };
    return agg[key];
  };

  calls.forEach(r => {
    const sec = callSeconds(r), cost = recordCost(r);
    const dir = String(r.direction || '').toLowerCase();
    day.calls++; day.seconds += sec; day.voiceCost += cost;
    if (dir.startsWith('in')) day.inbound++; else if (dir.startsWith('out')) day.outbound++;
    const m = matchNumber(r, numberMap);
    if (!m) { day.unassignedCalls++; day.unassignedSeconds += sec; return; }
    const s = slot(m);
    s.calls++; s.seconds += sec; s.voiceCost += cost;
    if (dir.startsWith('in')) s.inbound++; else if (dir.startsWith('out')) s.outbound++;
  });
  texts.forEach(r => {
    const cost = recordCost(r);
    day.sms++; day.smsCost += cost;
    const m = matchNumber(r, numberMap);
    if (m) { const s = slot(m); s.sms++; s.smsCost += cost; }
  });

  const now = new Date().toISOString();
  const rows = Object.values(agg).map(a => Object.assign(a, {
    minutes: Math.ceil(a.seconds / 60),
    voiceCost: Math.round(a.voiceCost * 10000) / 10000,
    smsCost: Math.round(a.smsCost * 10000) / 10000,
    source: 'telnyx', collectedAt: now,
  }));

  const usage = store.read('usage', []).filter(u => !(u.date === dateStr && u.source === 'telnyx'));
  usage.push(...rows);
  store.write('usage', usage);

  day.minutes = Math.ceil(day.seconds / 60);
  day.voiceCost = Math.round(day.voiceCost * 100) / 100;
  day.smsCost = Math.round(day.smsCost * 100) / 100;
  day.collectedAt = now;
  if (smsError) day.smsError = smsError;
  const daily = store.read('daily', []).filter(d => d.date !== dateStr);
  daily.push(day);
  daily.sort((a, b) => a.date.localeCompare(b.date));
  store.write('daily', daily);
  return day;
}

function summaryLines(summary) {
  const lines = [];
  ((summary && summary.lines) || []).forEach(l => {
    let amount = 0;
    if (l.type === 'simple') amount = num(l.amount);
    else ['new_this_month', 'existing_this_month'].forEach(k => { if (l[k]) amount += num(l[k].mrc) + num(l[k].otc); });
    if (amount) lines.push({ name: l.name || l.alias || 'Charge', amount: Math.round(amount * 100) / 100 });
  });
  ((summary && summary.adjustments) || []).forEach(a => lines.push({ name: 'Adjustment: ' + (a.description || ''), amount: num(a.amount) }));
  return lines;
}

// Month-end: account charges (numbers, fees) from /charges_summary + voice/SMS usage from the
// daily records we already collected. Stored as one automatic expense per month (upserted).
async function syncMonthlyExpense(month) {
  const today = T.pacificDateStr();
  const have = new Set(store.read('daily', []).map(d => d.date));
  const missing = T.datesInRange(T.firstDay(month), T.lastDay(month)).filter(d => d <= today && !have.has(d));
  for (const d of missing) { try { await collectDay(d); } catch (e) { store.logJob('telnyx-backfill ' + d, false, e.message); } }

  const days = store.read('daily', []).filter(d => T.monthKey(d.date) === month);
  const voice = Math.round(days.reduce((a, d) => a + (d.voiceCost || 0), 0) * 100) / 100;
  const sms = Math.round(days.reduce((a, d) => a + (d.smsCost || 0), 0) * 100) / 100;

  let accountTotal = 0, lines = [], summaryError = null;
  try {
    const body = await tget('/charges_summary', { start_date: T.firstDay(month), end_date: T.firstDay(T.addMonths(month, 1)) });
    const data = body && body.data;
    accountTotal = num(data && data.total && data.total.grand_total);
    lines = summaryLines(data && data.summary);
  } catch (e) { summaryError = e.message; }

  const breakdown = [
    { name: 'Account charges (numbers, fees) — Telnyx charges summary', amount: Math.round(accountTotal * 100) / 100, detail: lines },
    { name: 'Voice usage — ' + days.reduce((a, d) => a + (d.minutes || 0), 0).toLocaleString('en-US') + ' min from daily call records', amount: voice },
    { name: 'SMS usage — ' + days.reduce((a, d) => a + (d.sms || 0), 0).toLocaleString('en-US') + ' texts', amount: sms },
  ];
  const total = Math.round((accountTotal + voice + sms) * 100) / 100;

  const expenses = store.read('expenses', []);
  const id = 'telnyx_' + month;
  const existing = expenses.find(e => e.id === id);
  const exp = Object.assign(existing || { id, createdAt: new Date().toISOString() }, {
    label: 'Telnyx — ' + T.monthLabel(month), amount: total, category: 'Telecom',
    frequency: 'once', startDate: T.lastDay(month), endDate: null, source: 'telnyx',
    breakdown, summaryError, syncedAt: new Date().toISOString(),
    notes: month === T.monthKey(today) && today !== T.lastDay(month) ? 'Month in progress — refreshes automatically at month end.' : '',
  });
  if (!existing) expenses.push(exp);
  store.write('expenses', expenses);
  return exp;
}

async function testConnection() {
  const body = await tget('/balance');
  const d = (body && body.data) || {};
  return { balance: d.balance, currency: d.currency, availableCredit: d.available_credit };
}

// Raw sample records, so field names can be checked against what the code expects.
async function probe(recordType, dateStr) {
  const d = dateStr || T.addDays(T.pacificDateStr(), -1);
  const body = await tget('/detail_records', {
    'filter[record_type]': recordType || CALL_RECORD_TYPES()[0],
    ['filter[' + (recordType === 'messaging' ? 'created_at' : 'started_at') + '][gte]']: d,
    'page[size]': 3,
  });
  const data = (body && body.data) || [];
  return { recordType: recordType || CALL_RECORD_TYPES()[0], from: d, totalResults: body && body.meta && body.meta.total_results, fields: data[0] ? Object.keys(data[0]) : [], sample: data };
}

module.exports = { configured, collectDay, syncMonthlyExpense, testConnection, probe };
