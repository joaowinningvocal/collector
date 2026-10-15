const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const cron = require('node-cron');

const store = require('./lib/store');
const T = require('./lib/time');
const calc = require('./lib/calc');
const telnyx = require('./lib/telnyx');
const cartvip = require('./lib/cartvip');
<<<<<<< HEAD
const aloware = require('./lib/aloware');
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
const { runSeedsAndMigrations } = require('./lib/seed');

runSeedsAndMigrations();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: '2mb' }));
<<<<<<< HEAD
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Aloware webhook (Aloware → Integrations → Webhook Integration, auth "Bearer") ──
app.post('/hooks/aloware', (req, res) => {
  const token = aloware.TOKEN();
  if (!token) return res.status(503).json({ error: 'ALOWARE_WEBHOOK_TOKEN is not set' });
  const auth = req.get('authorization') || '';
  const bearer = auth.replace(/^Bearer\s+/i, '');
  const basicPass = /^Basic /i.test(auth) ? Buffer.from(auth.slice(6), 'base64').toString().split(':').slice(1).join(':') : '';
  if (bearer !== token && basicPass !== token && req.query.token !== token) return res.status(401).json({ error: 'bad token' });
  try { res.json(aloware.receive(req.body)); }
  catch (e) { store.logJob('aloware-webhook', false, e.message); res.status(500).json({ error: e.message }); }
});

const api = express.Router();
const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => {
  console.warn('[api]', req.method, req.path, e.message);
  res.status(e.status && e.status < 500 ? e.status : 500).json({ error: e.message });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
api.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = store.read('users', []).find(u => u.username === String(username || '').trim().toLowerCase() && u.password === password);
  if (!user) return res.status(401).json({ error: 'Wrong username or password.' });
  const token = crypto.randomBytes(24).toString('hex');
  const sessions = store.read('sessions', {});
  sessions[token] = { username: user.username, name: user.name, role: user.role, createdAt: new Date().toISOString() };
  store.write('sessions', sessions);
  res.json({ token, user: sessions[token] });
});
api.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

api.use((req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const session = token && store.read('sessions', {})[token];
  if (!session) return res.status(401).json({ error: 'Session expired — sign in again.' });
  req.user = session; req.token = token; next();
});

api.post('/logout', (req, res) => {
  const sessions = store.read('sessions', {}); delete sessions[req.token]; store.write('sessions', sessions);
  res.json({ ok: true });
});
api.get('/me', (req, res) => res.json(req.user));

=======
app.use(express.static(path.join(__dirname, 'public')));

const api = express.Router();
const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => {
  console.warn('[api]', req.method, req.path, e.message);
  res.status(e.status && e.status < 500 ? e.status : 500).json({ error: e.message });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
api.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = store.read('users', []).find(u => u.username === String(username || '').trim().toLowerCase() && u.password === password);
  if (!user) return res.status(401).json({ error: 'Wrong username or password.' });
  const token = crypto.randomBytes(24).toString('hex');
  const sessions = store.read('sessions', {});
  sessions[token] = { username: user.username, name: user.name, role: user.role, createdAt: new Date().toISOString() };
  store.write('sessions', sessions);
  res.json({ token, user: sessions[token] });
});
api.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

api.use((req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const session = token && store.read('sessions', {})[token];
  if (!session) return res.status(401).json({ error: 'Session expired — sign in again.' });
  req.user = session; req.token = token; next();
});

api.post('/logout', (req, res) => {
  const sessions = store.read('sessions', {}); delete sessions[req.token]; store.write('sessions', sessions);
  res.json({ ok: true });
});
api.get('/me', (req, res) => res.json(req.user));

>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
// ── Status / integrations ─────────────────────────────────────────────────────
api.get('/status', (req, res) => {
  const daily = store.read('daily', []);
  const jobs = store.read('jobs', []);
  res.json({
<<<<<<< HEAD
    telnyx: telnyx.configured(), cartvip: cartvip.configured(), aloware: aloware.configured(),
=======
    telnyx: telnyx.configured(), cartvip: cartvip.configured(),
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
    today: T.pacificDateStr(), lastCollected: daily.length ? daily[daily.length - 1].date : null,
    lastJob: jobs[0] || null, recentFailures: jobs.slice(0, 20).filter(j => !j.ok).length,
    annotationsEnabled: store.read('settings', {}).annotationsEnabled !== false,
  });
});
api.get('/jobs', (req, res) => res.json(store.read('jobs', []).slice(0, 100)));
api.post('/integrations/telnyx/test', wrap(async (req, res) => res.json(await telnyx.testConnection())));
api.get('/integrations/telnyx/probe', wrap(async (req, res) => res.json(await telnyx.probe(req.query.type, req.query.date))));
api.post('/integrations/cartvip/test', wrap(async (req, res) => res.json(await cartvip.testConnection())));

// ── Overview ──────────────────────────────────────────────────────────────────
api.get('/overview', (req, res) => res.json(calc.monthOverview(req.query.month || T.monthKey(T.pacificDateStr()))));

// ── Settings ──────────────────────────────────────────────────────────────────
api.get('/settings', (req, res) => res.json(store.read('settings', {})));
api.patch('/settings', (req, res) => {
  const s = store.read('settings', {});
  const b = req.body || {};
<<<<<<< HEAD
  ['company', 'billTo', 'rates', 'brands'].forEach(k => { if (b[k]) s[k] = Object.assign({}, s[k], b[k]); });
  ['paymentTerms', 'rebillBasis', 'cycle', 'nextInvoiceNumber', 'annotationsEnabled', 'defaultRateMin', 'defaultRateSms'].forEach(k => { if (b[k] !== undefined) s[k] = b[k]; });
  if (s.rates) Object.keys(s.rates).forEach(k => { s.rates[k] = Number(s.rates[k]) || 0; });
  s.cycle = s.cycle === 'monthly' ? 'monthly' : 'semimonthly';
  s.rebillBasis = s.rebillBasis === 'activities' ? 'activities' : 'time';
=======
  ['company', 'billTo', 'rates'].forEach(k => { if (b[k]) s[k] = Object.assign({}, s[k], b[k]); });
  ['paymentTerms', 'cycle', 'nextInvoiceNumber', 'annotationsEnabled', 'defaultRateMin', 'defaultRateSms'].forEach(k => { if (b[k] !== undefined) s[k] = b[k]; });
  if (s.rates) Object.keys(s.rates).forEach(k => { s.rates[k] = Number(s.rates[k]) || 0; });
  s.cycle = s.cycle === 'monthly' ? 'monthly' : 'semimonthly';
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  s.nextInvoiceNumber = Number(s.nextInvoiceNumber) || 1;
  s.defaultRateMin = Number(s.defaultRateMin) || 0;
  s.defaultRateSms = Number(s.defaultRateSms) || 0;
  store.write('settings', s);
  res.json(s);
});

// ── Clients ───────────────────────────────────────────────────────────────────
const cleanList = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => String(x).trim()).filter(Boolean);
api.get('/clients', (req, res) => res.json(store.read('clients', [])));
api.post('/clients', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Client name is required.' });
  const s = store.read('settings', {});
  const client = {
    id: store.uid('c'), name: b.name, business: b.business || '', numbers: cleanList(b.numbers), aliases: cleanList(b.aliases),
    rateMin: b.rateMin != null ? Number(b.rateMin) : s.defaultRateMin, rateSms: b.rateSms != null ? Number(b.rateSms) : s.defaultRateSms,
<<<<<<< HEAD
    notes: b.notes || '', billingContact: b.billingContact || '', createdAt: new Date().toISOString(),
=======
    notes: b.notes || '', createdAt: new Date().toISOString(),
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  };
  const clients = store.read('clients', []); clients.push(client); store.write('clients', clients);
  cartvip.rematchAll();
  res.json(client);
});
api.patch('/clients/:id', (req, res) => {
  const clients = store.read('clients', []);
  const c = clients.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Client not found.' });
  const b = req.body || {};
  if (b.name != null) c.name = b.name;
  if (b.business != null) c.business = b.business;
  if (b.numbers != null) c.numbers = cleanList(b.numbers);
  if (b.aliases != null) c.aliases = cleanList(b.aliases);
  if (b.rateMin != null) c.rateMin = Number(b.rateMin);
  if (b.rateSms != null) c.rateSms = Number(b.rateSms);
  if (b.notes != null) c.notes = b.notes;
<<<<<<< HEAD
  if (b.billingContact != null) c.billingContact = b.billingContact;
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  store.write('clients', clients);
  cartvip.rematchAll();
  res.json(c);
});
api.delete('/clients/:id', (req, res) => {
  store.write('clients', store.read('clients', []).filter(c => c.id !== req.params.id));
  res.json({ ok: true });
});

// ── Calls / usage (Telnyx) ────────────────────────────────────────────────────
api.get('/usage', (req, res) => {
  let usage = store.read('usage', []);
  const { clientId, month } = req.query;
  if (clientId) usage = usage.filter(u => u.clientId === clientId);
  if (month) usage = usage.filter(u => T.monthKey(u.date) === month);
  res.json(usage);
});
api.get('/daily', (req, res) => {
  let daily = store.read('daily', []);
  if (req.query.month) daily = daily.filter(d => T.monthKey(d.date) === req.query.month);
  res.json(daily);
});
api.post('/usage/manual', (req, res) => {
  const { clientId, number, date, minutes, sms, calls } = req.body || {};
  const client = store.read('clients', []).find(c => c.id === clientId);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const d = date || T.pacificDateStr();
  const usage = store.read('usage', []).filter(u => !(u.clientId === clientId && u.number === (number || 'manual') && u.date === d && u.source === 'manual'));
  const entry = { clientId, clientName: client.name, number: number || 'manual', date: d, calls: Number(calls) || 0, minutes: Number(minutes) || 0, sms: Number(sms) || 0, source: 'manual', manual: true, collectedAt: new Date().toISOString(), by: req.user.name };
  usage.push(entry); store.write('usage', usage);
  res.json(entry);
});
api.post('/collect', wrap(async (req, res) => {
  const date = (req.body && req.body.date) || T.pacificDateStr();
  const day = await telnyx.collectDay(date);
  store.logJob('telnyx-calls ' + date + ' (manual)', true, day.calls + ' calls, ' + day.minutes + ' min');
  res.json(day);
}));

// ── Receptionist invoices (per-minute billing) ────────────────────────────────
api.get('/invoices', (req, res) => {
  let inv = store.read('invoices', []);
  if (req.query.clientId) inv = inv.filter(i => i.clientId === req.query.clientId);
  if (req.query.month) inv = inv.filter(i => i.month === req.query.month);
  res.json(inv);
});
api.get('/invoices/preview', (req, res) => {
  const { clientId, month } = req.query;
  if (!clientId || !month) return res.status(400).json({ error: 'Choose a client and a month.' });
  const inv = calc.buildUsageInvoice(clientId, month);
  if (!inv) return res.status(404).json({ error: 'Client not found.' });
  res.json(inv);
});
function saveUsageInvoice(clientId, month) {
  const inv = calc.buildUsageInvoice(clientId, month);
  if (!inv) return null;
<<<<<<< HEAD
  inv.id = 'INV-' + month + '-' + clientId; inv.kind = 'ai'; inv.generatedAt = new Date().toISOString(); inv.status = 'generated';
=======
  inv.id = 'INV-' + month + '-' + clientId; inv.generatedAt = new Date().toISOString(); inv.status = 'generated';
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  const all = store.read('invoices', []).filter(i => i.id !== inv.id); all.push(inv); store.write('invoices', all);
  return inv;
}
api.post('/invoices/generate', (req, res) => {
  const { clientId, month } = req.body || {};
  const inv = clientId && month && saveUsageInvoice(clientId, month);
  if (!inv) return res.status(400).json({ error: 'Choose a client and a month.' });
  res.json(inv);
});
api.post('/invoices/generate-all', (req, res) => {
  const month = (req.body && req.body.month) || T.monthKey(T.pacificDateStr());
  res.json(store.read('clients', []).map(c => saveUsageInvoice(c.id, month)).filter(Boolean));
});

// ── Expenses ──────────────────────────────────────────────────────────────────
const FREQS = ['once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'custom'];
function expenseFromBody(b, base) {
  const e = Object.assign({}, base);
  if (b.label != null) e.label = String(b.label).trim();
  if (b.amount != null) e.amount = Number(b.amount) || 0;
  if (b.category != null) e.category = b.category;
  if (b.frequency != null) e.frequency = FREQS.includes(b.frequency) ? b.frequency : 'once';
  if (b.everyMonths != null) e.everyMonths = Math.max(1, Number(b.everyMonths) || 1);
  if (b.startDate != null) e.startDate = b.startDate;
  if (b.endDate !== undefined) e.endDate = b.endDate || null;
  if (b.notes != null) e.notes = b.notes;
  return e;
}
api.get('/expenses', (req, res) => {
  if (req.query.month) return res.json(calc.expensesForMonth(req.query.month));
  res.json(store.read('expenses', []));
});
api.post('/expenses', (req, res) => {
  const b = req.body || {};
  if (!b.label || b.amount == null) return res.status(400).json({ error: 'Add a name and an amount.' });
  const e = expenseFromBody(b, { id: store.uid('e'), source: 'manual', frequency: 'once', startDate: T.pacificDateStr(), endDate: null, category: '', notes: '', createdAt: new Date().toISOString(), by: req.user.name });
  const all = store.read('expenses', []); all.push(e); store.write('expenses', all);
  res.json(e);
});
api.patch('/expenses/:id', (req, res) => {
  const all = store.read('expenses', []);
  const i = all.findIndex(e => e.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Expense not found.' });
  all[i] = expenseFromBody(req.body || {}, all[i]);
  store.write('expenses', all);
  res.json(all[i]);
});
api.delete('/expenses/:id', (req, res) => {
  store.write('expenses', store.read('expenses', []).filter(e => e.id !== req.params.id));
  res.json({ ok: true });
});
api.post('/expenses/telnyx-sync', wrap(async (req, res) => {
  const month = (req.body && req.body.month) || T.monthKey(T.pacificDateStr());
  const exp = await telnyx.syncMonthlyExpense(month);
  store.logJob('telnyx-expense ' + month + ' (manual)', !exp.summaryError, '$' + exp.amount + (exp.summaryError ? ' — charges summary: ' + exp.summaryError : ''));
  res.json(exp);
}));

// ── Agents ────────────────────────────────────────────────────────────────────
api.get('/agents', (req, res) => res.json(store.read('agents', [])));
api.post('/agents', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Agent name is required.' });
  const a = { id: store.uid('a'), name: String(b.name).trim(), role: b.role === 'manager' ? 'manager' : 'agent', aliases: cleanList(b.aliases), payRate: b.payRate === '' || b.payRate == null ? null : Number(b.payRate), active: b.active !== false, createdAt: new Date().toISOString() };
  const all = store.read('agents', []); all.push(a); store.write('agents', all);
  res.json(a);
});
api.patch('/agents/:id', (req, res) => {
  const all = store.read('agents', []);
  const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Agent not found.' });
  const b = req.body || {};
  if (b.name != null) a.name = String(b.name).trim();
  if (b.role != null) a.role = b.role === 'manager' ? 'manager' : 'agent';
  if (b.aliases != null) a.aliases = cleanList(b.aliases);
  if (b.payRate !== undefined) a.payRate = b.payRate === '' || b.payRate == null ? null : Number(b.payRate);
  if (b.active != null) a.active = !!b.active;
  store.write('agents', all);
  res.json(a);
});
api.delete('/agents/:id', (req, res) => {
  store.write('agents', store.read('agents', []).filter(a => a.id !== req.params.id));
  res.json({ ok: true });
});

// ── Sales (CartVIP) ───────────────────────────────────────────────────────────
api.post('/sales/sync', wrap(async (req, res) => {
  const b = req.body || {};
  let from = b.from, to = b.to;
  if (b.periodId) { const r = calc.periodRange(b.periodId); from = r.from; to = r.to; }
  const today = T.pacificDateStr();
  if (!from) { from = T.addDays(today, -2); to = today; }
  if (to > today) to = today;
  const result = await cartvip.syncRange(from, to);
  store.logJob('cartvip-sales ' + from + '…' + to + ' (manual)', true, result.fetched + ' fetched, ' + result.added + ' new');
  res.json(result);
}));
api.post('/sales', (req, res) => {
  const b = req.body || {};
  if (!b.soldOn || b.total == null || b.total === '') return res.status(400).json({ error: 'Add the sale date and total.' });
  const clients = store.read('clients', []);
  const s = {
    id: store.uid('s'), source: 'manual', confirmation: b.confirmation || '', customer: b.customer || '', phone: '',
    reservationDate: b.reservationDate || '', soldOn: b.soldOn, destination: b.destination || '', package: b.package || '',
    guests: null, total: Number(b.total) || 0, clientId: b.clientId || cartvip.matchClient(b.destination, clients), clientSource: b.clientId ? 'manual' : 'auto',
    credits: (b.credits || []).filter(c => c.agentId).map(c => ({ agentId: c.agentId, amount: c.amount === '' || c.amount == null ? null : Number(c.amount) })),
    agentSource: 'manual', excluded: false, createdAt: new Date().toISOString(), by: req.user.name,
  };
  const all = store.read('sales', []); all.push(s); store.write('sales', all);
  res.json(s);
});
api.patch('/sales/:id', (req, res) => {
  const all = store.read('sales', []);
  const s = all.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Sale not found.' });
  const b = req.body || {};
  if (b.credits != null) { s.credits = b.credits.filter(c => c.agentId).map(c => ({ agentId: c.agentId, amount: c.amount === '' || c.amount == null ? null : Number(c.amount) })); s.agentSource = 'manual'; }
  if (b.clientId !== undefined) { s.clientId = b.clientId || null; s.clientSource = 'manual'; }
  if (b.excluded != null) s.excluded = !!b.excluded;
  if (b.soldOn) { s.soldOn = b.soldOn; s.soldOnManual = true; }
  if (s.source === 'manual') ['confirmation', 'customer', 'destination', 'package', 'reservationDate'].forEach(k => { if (b[k] != null) s[k] = b[k]; });
  if (s.source === 'manual' && b.total != null && b.total !== '') s.total = Number(b.total) || 0;
  store.write('sales', all);
  res.json(s);
});
api.delete('/sales/:id', (req, res) => {
  const all = store.read('sales', []);
  const s = all.find(x => x.id === req.params.id);
  if (s && s.source !== 'manual') return res.status(400).json({ error: 'CartVIP sales come back on the next sync — exclude it instead.' });
  store.write('sales', all.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ── Call-center periods (hours, commissions, invoice) ─────────────────────────
api.get('/periods', (req, res) => {
  const cycle = store.read('settings', {}).cycle;
  const docs = store.read('periods', []);
  res.json(calc.recentPeriods(cycle, 12).map(p => {
    const d = docs.find(x => x.id === p.id) || {};
    return Object.assign(p, { status: d.status || 'draft', invoiceNo: d.invoiceNo || null });
  }));
});
api.get('/periods/:id', (req, res) => res.json(calc.computePeriod(req.params.id)));
api.patch('/periods/:id', (req, res) => {
  const doc = calc.getPeriodDoc(req.params.id);
  if (doc.status === 'final') return res.status(400).json({ error: 'This invoice is finalized. Reopen it to make changes.' });
  const b = req.body || {};
<<<<<<< HEAD
  ['hours', 'extraBonus'].forEach(k => {
=======
  ['hours', 'extraBonus', 'rebillOverrides'].forEach(k => {
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
    if (!b[k]) return;
    doc[k] = Object.assign({}, doc[k] || {}, b[k]);
    Object.keys(doc[k]).forEach(id => { if (doc[k][id] === '' || doc[k][id] == null) delete doc[k][id]; else doc[k][id] = Number(doc[k][id]) || 0; });
  });
<<<<<<< HEAD
  // Rebill overrides per Aloware line: { lineId: { minutes, activities } } — '' clears a field.
  if (b.rebillOverrides) {
    const ov = {};
    Object.entries(doc.rebillOverrides || {}).forEach(([id, v]) => { if (v && typeof v === 'object') ov[id] = v; });
    Object.entries(b.rebillOverrides).forEach(([id, v]) => {
      const cur = Object.assign({}, ov[id]);
      Object.entries(v || {}).forEach(([f, val]) => { if (val === '' || val == null) delete cur[f]; else cur[f] = Number(val) || 0; });
      if (Object.keys(cur).length) ov[id] = cur; else delete ov[id];
    });
    doc.rebillOverrides = ov;
  }
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  calc.savePeriodDoc(doc);
  res.json(calc.computePeriod(req.params.id));
});
api.post('/periods/:id/copy-hours', (req, res) => {
  const doc = calc.getPeriodDoc(req.params.id);
  if (doc.status === 'final') return res.status(400).json({ error: 'This invoice is finalized. Reopen it to make changes.' });
  const from = calc.getPeriodDoc((req.body || {}).fromId);
  doc.hours = Object.assign({}, from.hours || {});
  calc.savePeriodDoc(doc);
  res.json(calc.computePeriod(req.params.id));
});
api.post('/periods/:id/finalize', (req, res) => {
  const doc = calc.getPeriodDoc(req.params.id);
  if (doc.status === 'final') return res.status(400).json({ error: 'Already finalized.' });
  const settings = store.read('settings', {});
  if (!doc.invoiceNo) { doc.invoiceNo = settings.nextInvoiceNumber || 1; settings.nextInvoiceNumber = doc.invoiceNo + 1; store.write('settings', settings); }
  calc.savePeriodDoc(doc);
  const snap = calc.computePeriod(req.params.id);
  snap.invoiceNo = doc.invoiceNo;
  snap.invoiceDate = T.pacificDateStr();
  Object.assign(doc, { status: 'final', snapshot: snap, finalizedAt: new Date().toISOString(), finalizedBy: req.user.name });
  calc.savePeriodDoc(doc);
  res.json(calc.computePeriod(req.params.id));
});
api.post('/periods/:id/reopen', (req, res) => {
  const doc = calc.getPeriodDoc(req.params.id);
  doc.status = 'draft'; delete doc.snapshot;
  calc.savePeriodDoc(doc);
  res.json(calc.computePeriod(req.params.id));
});

<<<<<<< HEAD
// ── Aloware lines (rebill rows) ───────────────────────────────────────────────
api.get('/aloware/status', (req, res) => res.json(aloware.status()));
api.get('/aloware/lines', (req, res) => res.json(store.read('alowareLines', [])));
function lineFromBody(b, base) {
  const l = Object.assign({}, base);
  if (b.name != null) l.name = String(b.name).trim();
  if (b.alowareLineId !== undefined) l.alowareLineId = b.alowareLineId === '' || b.alowareLineId == null ? null : String(b.alowareLineId).trim();
  if (b.number != null) l.number = String(b.number).trim();
  if (b.clientIds != null) l.clientIds = (Array.isArray(b.clientIds) ? b.clientIds : []).filter(Boolean);
  if (b.rebill != null) l.rebill = !!b.rebill;
  delete l.auto;
  return l;
}
api.post('/aloware/lines', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Give the line a name.' });
  const l = lineFromBody(b, { id: store.uid('al'), alowareLineId: null, number: '', clientIds: [], rebill: true, createdAt: new Date().toISOString() });
  const all = store.read('alowareLines', []); all.push(l); store.write('alowareLines', all);
  res.json(l);
});
api.patch('/aloware/lines/:id', (req, res) => {
  const all = store.read('alowareLines', []);
  const i = all.findIndex(l => l.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Line not found.' });
  all[i] = lineFromBody(req.body || {}, all[i]);
  store.write('alowareLines', all);
  res.json(all[i]);
});
api.delete('/aloware/lines/:id', (req, res) => {
  store.write('alowareLines', store.read('alowareLines', []).filter(l => l.id !== req.params.id));
  res.json({ ok: true });
});

// ── Venue invoices (AI receptionist + call center, one each per venue) ─────────
api.get('/venue-invoices', (req, res) => res.json(calc.venueInvoices(req.query.month || T.monthKey(T.pacificDateStr()))));
api.post('/venue-invoices/save', (req, res) => {
  const b = req.body || {};
  const month = b.month || T.monthKey(T.pacificDateStr());
  const v = calc.venueInvoices(month);
  const saved = [];
  v.rows.filter(r => !b.clientId || r.clientId === b.clientId).forEach(r => {
    if ((!b.kind || b.kind === 'ai') && r.ai.total > 0) saved.push(saveUsageInvoice(r.clientId, month));
    if ((!b.kind || b.kind === 'callcenter') && r.callCenter.total > 0) {
      const inv = {
        id: 'CL-' + month + '-' + r.clientId, kind: 'callcenter', clientId: r.clientId, clientName: r.name, billingContact: r.billingContact,
        month, lines: r.callCenter.lines, total: r.callCenter.total, sales: r.sales, brand: v.brands.callCenter,
        company: v.company, paymentTerms: v.paymentTerms, generatedAt: new Date().toISOString(), by: req.user.name,
      };
      const all = store.read('invoices', []).filter(i => i.id !== inv.id); all.push(inv); store.write('invoices', all);
      saved.push(inv);
    }
  });
  res.json(saved);
});

// ── Dev-phase annotations (drawings, arrows, comments) ────────────────────────
api.get('/annotations', (req, res) => {
  let all = store.read('annotations', []);
  if (req.query.page) all = all.filter(a => a.page === req.query.page);
  res.json(all);
});
api.post('/annotations', (req, res) => {
  const b = req.body || {};
  const a = { id: store.uid('n'), page: b.page || 'overview', kind: b.kind, color: b.color || '#EC2229', data: b.data || {}, text: b.text || '', replies: [], resolved: false, author: req.user.name, createdAt: new Date().toISOString() };
  const all = store.read('annotations', []); all.push(a); store.write('annotations', all);
  res.json(a);
});
api.patch('/annotations/:id', (req, res) => {
  const all = store.read('annotations', []);
  const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found.' });
  const b = req.body || {};
  if (b.text != null) a.text = b.text;
  if (b.resolved != null) a.resolved = !!b.resolved;
  if (b.data != null) a.data = b.data;
  if (b.reply) a.replies.push({ text: String(b.reply), author: req.user.name, at: new Date().toISOString() });
  store.write('annotations', all);
  res.json(a);
});
api.delete('/annotations/:id', (req, res) => {
  store.write('annotations', store.read('annotations', []).filter(a => a.id !== req.params.id));
  res.json({ ok: true });
});
// Clears drawings on a page (comments stay — they're resolved individually).
api.delete('/annotations', (req, res) => {
  if (!req.query.page) return res.status(400).json({ error: 'page is required' });
  store.write('annotations', store.read('annotations', []).filter(a => a.page !== req.query.page || a.kind === 'comment'));
  res.json({ ok: true });
});

// ── Month-end run on demand ───────────────────────────────────────────────────
api.post('/jobs/month-end', wrap(async (req, res) => {
  const month = (req.body && req.body.month) || T.monthKey(T.pacificDateStr());
  res.json(await monthEnd(month, 'manual'));
}));

api.use((req, res) => res.status(404).json({ error: 'Unknown API route: ' + req.method + ' ' + req.path }));
app.use('/api', api);
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Scheduled jobs (Pacific time) ─────────────────────────────────────────────
const running = {};
async function once(name, fn) {
  if (running[name]) return; running[name] = true;
  try { await fn(); } finally { running[name] = false; }
}
=======
// ── Dev-phase annotations (drawings, arrows, comments) ────────────────────────
api.get('/annotations', (req, res) => {
  let all = store.read('annotations', []);
  if (req.query.page) all = all.filter(a => a.page === req.query.page);
  res.json(all);
});
api.post('/annotations', (req, res) => {
  const b = req.body || {};
  const a = { id: store.uid('n'), page: b.page || 'overview', kind: b.kind, color: b.color || '#EC2229', data: b.data || {}, text: b.text || '', replies: [], resolved: false, author: req.user.name, createdAt: new Date().toISOString() };
  const all = store.read('annotations', []); all.push(a); store.write('annotations', all);
  res.json(a);
});
api.patch('/annotations/:id', (req, res) => {
  const all = store.read('annotations', []);
  const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found.' });
  const b = req.body || {};
  if (b.text != null) a.text = b.text;
  if (b.resolved != null) a.resolved = !!b.resolved;
  if (b.data != null) a.data = b.data;
  if (b.reply) a.replies.push({ text: String(b.reply), author: req.user.name, at: new Date().toISOString() });
  store.write('annotations', all);
  res.json(a);
});
api.delete('/annotations/:id', (req, res) => {
  store.write('annotations', store.read('annotations', []).filter(a => a.id !== req.params.id));
  res.json({ ok: true });
});
// Clears drawings on a page (comments stay — they're resolved individually).
api.delete('/annotations', (req, res) => {
  if (!req.query.page) return res.status(400).json({ error: 'page is required' });
  store.write('annotations', store.read('annotations', []).filter(a => a.page !== req.query.page || a.kind === 'comment'));
  res.json({ ok: true });
});

// ── Month-end run on demand ───────────────────────────────────────────────────
api.post('/jobs/month-end', wrap(async (req, res) => {
  const month = (req.body && req.body.month) || T.monthKey(T.pacificDateStr());
  res.json(await monthEnd(month, 'manual'));
}));

api.use((req, res) => res.status(404).json({ error: 'Unknown API route: ' + req.method + ' ' + req.path }));
app.use('/api', api);
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Scheduled jobs (Pacific time) ─────────────────────────────────────────────
const running = {};
async function once(name, fn) {
  if (running[name]) return; running[name] = true;
  try { await fn(); } finally { running[name] = false; }
}
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
async function safe(label, fn) {
  try { const detail = await fn(); store.logJob(label, true, detail); return true; }
  catch (e) { store.logJob(label, false, e.message); return false; }
}

async function collectAndSync(date) {
  if (telnyx.configured()) await safe('telnyx-calls ' + date, async () => { const d = await telnyx.collectDay(date); return d.calls + ' calls, ' + d.minutes + ' min, ' + d.unassignedCalls + ' unassigned'; });
  if (cartvip.configured()) await safe('cartvip-sales ' + T.addDays(date, -2) + '…' + date, async () => { const r = await cartvip.syncRange(T.addDays(date, -2), date); return r.fetched + ' fetched, ' + r.added + ' new'; });
}

async function monthEnd(month, how) {
  const out = { month };
  if (!telnyx.configured()) { out.skipped = 'TELNYX_API_KEY is not set'; return out; }
  await safe('telnyx-expense ' + month + (how ? ' (' + how + ')' : ''), async () => {
    const e = await telnyx.syncMonthlyExpense(month); out.telnyx = e;
    if (e.summaryError) throw new Error('$' + e.amount + ' saved from call records; charges summary failed: ' + e.summaryError);
    return '$' + e.amount;
  });
  return out;
}

const TZ = { timezone: T.TZ };
// 11:59 PM — pull today's calls from Telnyx + recent CartVIP sales. On the last day, book the Telnyx expense.
cron.schedule('59 23 * * *', () => once('nightly', async () => {
  const today = T.pacificDateStr();
  await collectAndSync(today);
  if (T.isLastDayOfMonth(today)) await monthEnd(T.monthKey(today), 'month end');
}), TZ);
// 12:20 AM — re-pull yesterday so calls after 11:59 PM and late records are included.
cron.schedule('20 0 * * *', () => once('catchup', async () => {
  await collectAndSync(T.addDays(T.pacificDateStr(), -1));
}), TZ);
// 1st of the month, 6:30 AM — final Telnyx numbers for last month + receptionist invoices.
cron.schedule('30 6 1 * *', () => once('monthclose', async () => {
  const prev = T.addMonths(T.monthKey(T.pacificDateStr()), -1);
  await monthEnd(prev, 'final');
  await safe('receptionist-invoices ' + prev, async () => store.read('clients', []).map(c => saveUsageInvoice(c.id, prev)).filter(Boolean).length + ' invoices');
}), TZ);

app.listen(PORT, () => console.log('Winning Vocal billing on :' + PORT + ' | Telnyx ' + (telnyx.configured() ? 'on' : 'off') + ' | CartVIP ' + (cartvip.configured() ? 'on' : 'off') + ' | data ' + store.DATA_DIR));
