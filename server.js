const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR ||
  (fs.existsSync('/app/data') ? '/app/data' : path.join(__dirname, 'data'));

// Twilio credentials — set these in Railway → Variables
const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN  || '';

// Default rates (dollars)
const DEFAULT_RATE_MIN = 0.08;
const DEFAULT_RATE_SMS = 0.01;

// ── Setup ─────────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── File helpers ──────────────────────────────────────────────────────────────
const CLIENTS_FILE  = path.join(DATA_DIR, 'clients.json');
const USAGE_FILE    = path.join(DATA_DIR, 'usage.json');     // daily usage log
const INVOICES_FILE = path.join(DATA_DIR, 'invoices.json');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');

function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function write(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

if (!fs.existsSync(USERS_FILE)) {
  write(USERS_FILE, [
    { username:'jenna', password:'winningvocal2026!', role:'master', name:'Jenna' },
    { username:'adminjoao', password:'vocal2026!', role:'master', name:'João' },
  ]);
}
if (!fs.existsSync(CLIENTS_FILE))  write(CLIENTS_FILE, []);
if (!fs.existsSync(USAGE_FILE))    write(USAGE_FILE, []);
if (!fs.existsSync(INVOICES_FILE)) write(INVOICES_FILE, []);

// ── Date helpers (Pacific time) ───────────────────────────────────────────────
function pacificDateStr(d) {
  d = d || new Date();
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    .toISOString().slice(0, 10); // YYYY-MM-DD
}
function monthKey(dateStr) { return dateStr.slice(0, 7); } // YYYY-MM

// ── Twilio API ────────────────────────────────────────────────────────────────
// Returns a promise resolving to parsed JSON from the Twilio REST API.
function twilioGet(urlPath) {
  return new Promise((resolve, reject) => {
    if (!TWILIO_SID || !TWILIO_TOKEN) return reject(new Error('Twilio credentials not set'));
    const auth = Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64');
    const options = {
      hostname: 'api.twilio.com',
      path: urlPath,
      method: 'GET',
      headers: { 'Authorization': 'Basic ' + auth }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('Twilio parse error: ' + body.slice(0,200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Fetch usage for a single number on a given date (Pacific day).
// Returns { minutes, sms }.
async function fetchNumberUsage(number, dateStr) {
  // Twilio filters by UTC date; we approximate the Pacific day.
  // Calls: sum duration (seconds) where From = number, on that date.
  let minutes = 0, sms = 0;

  try {
    // Messages sent FROM this number on this date
    let msgPath = '/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json'
      + '?From=' + encodeURIComponent(number)
      + '&DateSent=' + dateStr + '&PageSize=1000';
    const msgs = await twilioGet(msgPath);
    if (msgs && Array.isArray(msgs.messages)) sms = msgs.messages.length;
  } catch(e) { console.warn('[Twilio] SMS fetch failed for', number, e.message); }

  try {
    // Calls FROM this number on this date
    let callPath = '/2010-04-01/Accounts/' + TWILIO_SID + '/Calls.json'
      + '?From=' + encodeURIComponent(number)
      + '&StartTime=' + dateStr + '&PageSize=1000';
    const calls = await twilioGet(callPath);
    if (calls && Array.isArray(calls.calls)) {
      let totalSec = calls.calls.reduce((a, c) => a + (parseInt(c.duration) || 0), 0);
      minutes = Math.ceil(totalSec / 60);
    }
  } catch(e) { console.warn('[Twilio] Calls fetch failed for', number, e.message); }

  return { minutes, sms };
}

// Collect usage for all client numbers for a given date, store in usage log.
async function collectUsage(dateStr) {
  dateStr = dateStr || pacificDateStr();
  const clients = read(CLIENTS_FILE, []);
  const usage = read(USAGE_FILE, []);

  for (const client of clients) {
    for (const number of (client.numbers || [])) {
      let result;
      try { result = await fetchNumberUsage(number, dateStr); }
      catch(e) { console.warn('[Collect] failed', number, e.message); continue; }

      // Upsert: replace any existing entry for this client+number+date
      const idx = usage.findIndex(u => u.clientId === client.id && u.number === number && u.date === dateStr);
      const entry = {
        clientId: client.id, clientName: client.name, number,
        date: dateStr, minutes: result.minutes, sms: result.sms,
        collectedAt: new Date().toISOString()
      };
      if (idx >= 0) usage[idx] = entry; else usage.push(entry);
      console.log('[Collect] ' + dateStr + ' ' + client.name + ' ' + number + ': ' + result.minutes + ' min, ' + result.sms + ' sms');
    }
  }
  write(USAGE_FILE, usage);
  return usage;
}

// Build (or preview) an invoice for a client for a given month (YYYY-MM).
function buildInvoice(clientId, month) {
  const clients = read(CLIENTS_FILE, []);
  const client = clients.find(c => c.id === clientId);
  if (!client) return null;
  const usage = read(USAGE_FILE, []);
  const rows = usage.filter(u => u.clientId === clientId && monthKey(u.date) === month);

  const totalMin = rows.reduce((a, r) => a + (r.minutes || 0), 0);
  const totalSms = rows.reduce((a, r) => a + (r.sms || 0), 0);
  const rateMin = client.rateMin != null ? client.rateMin : DEFAULT_RATE_MIN;
  const rateSms = client.rateSms != null ? client.rateSms : DEFAULT_RATE_SMS;
  const costMin = totalMin * rateMin;
  const costSms = totalSms * rateSms;

  return {
    clientId, clientName: client.name, month,
    totalMinutes: totalMin, totalSms,
    rateMin, rateSms,
    costMinutes: Math.round(costMin * 100) / 100,
    costSms: Math.round(costSms * 100) / 100,
    total: Math.round((costMin + costSms) * 100) / 100,
    dailyBreakdown: rows.sort((a,b) => a.date.localeCompare(b.date))
  };
}

// Generate + persist invoices for all clients for a month.
function generateMonthlyInvoices(month) {
  const clients = read(CLIENTS_FILE, []);
  const invoices = read(INVOICES_FILE, []);
  let created = 0;
  for (const client of clients) {
    const inv = buildInvoice(client.id, month);
    if (!inv) continue;
    inv.id = 'INV-' + month + '-' + client.id;
    inv.generatedAt = new Date().toISOString();
    inv.status = 'generated';
    const idx = invoices.findIndex(i => i.id === inv.id);
    if (idx >= 0) invoices[idx] = inv; else invoices.push(inv);
    created++;
  }
  write(INVOICES_FILE, invoices);
  console.log('[Invoices] Generated ' + created + ' invoices for ' + month);
  return invoices.filter(i => i.month === month);
}

// ── Auth (very light) ─────────────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = read(USERS_FILE, []).find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ username: user.username, name: user.name, role: user.role });
});

// ── Clients CRUD ──────────────────────────────────────────────────────────────
app.get('/clients', (req, res) => res.json(read(CLIENTS_FILE, [])));

app.post('/clients', (req, res) => {
  const clients = read(CLIENTS_FILE, []);
  const { name, numbers, rateMin, rateSms, business, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = 'c_' + Date.now().toString(36);
  const client = {
    id, name,
    business: business || '',
    numbers: (numbers || []).filter(Boolean),
    rateMin: rateMin != null ? Number(rateMin) : DEFAULT_RATE_MIN,
    rateSms: rateSms != null ? Number(rateSms) : DEFAULT_RATE_SMS,
    notes: notes || '',
    createdAt: new Date().toISOString()
  };
  clients.push(client);
  write(CLIENTS_FILE, clients);
  res.json(client);
});

app.patch('/clients/:id', (req, res) => {
  const clients = read(CLIENTS_FILE, []);
  const idx = clients.findIndex(c => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  if (b.name != null) clients[idx].name = b.name;
  if (b.business != null) clients[idx].business = b.business;
  if (b.numbers != null) clients[idx].numbers = b.numbers.filter(Boolean);
  if (b.rateMin != null) clients[idx].rateMin = Number(b.rateMin);
  if (b.rateSms != null) clients[idx].rateSms = Number(b.rateSms);
  if (b.notes != null) clients[idx].notes = b.notes;
  write(CLIENTS_FILE, clients);
  res.json(clients[idx]);
});

app.delete('/clients/:id', (req, res) => {
  write(CLIENTS_FILE, read(CLIENTS_FILE, []).filter(c => c.id !== req.params.id));
  res.json({ success: true });
});

// ── Usage ─────────────────────────────────────────────────────────────────────
app.get('/usage', (req, res) => {
  let usage = read(USAGE_FILE, []);
  const { clientId, month } = req.query;
  if (clientId) usage = usage.filter(u => u.clientId === clientId);
  if (month) usage = usage.filter(u => monthKey(u.date) === month);
  res.json(usage);
});

// Manual usage entry (for when you paste Twilio's "From / Count" data by hand)
app.post('/usage/manual', (req, res) => {
  const { clientId, number, date, minutes, sms } = req.body;
  const clients = read(CLIENTS_FILE, []);
  const client = clients.find(c => c.id === clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const usage = read(USAGE_FILE, []);
  const d = date || pacificDateStr();
  const idx = usage.findIndex(u => u.clientId === clientId && u.number === (number||'manual') && u.date === d);
  const entry = {
    clientId, clientName: client.name, number: number || 'manual',
    date: d, minutes: Number(minutes)||0, sms: Number(sms)||0,
    collectedAt: new Date().toISOString(), manual: true
  };
  if (idx >= 0) usage[idx] = entry; else usage.push(entry);
  write(USAGE_FILE, usage);
  res.json(entry);
});

// Trigger a collection run manually (today or a given date)
app.post('/collect', async (req, res) => {
  const date = (req.body && req.body.date) || pacificDateStr();
  try {
    const usage = await collectUsage(date);
    res.json({ success: true, date, entries: usage.filter(u => u.date === date).length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Invoices ──────────────────────────────────────────────────────────────────
app.get('/invoices', (req, res) => {
  let invoices = read(INVOICES_FILE, []);
  const { clientId, month } = req.query;
  if (clientId) invoices = invoices.filter(i => i.clientId === clientId);
  if (month) invoices = invoices.filter(i => i.month === month);
  res.json(invoices);
});

// Preview an invoice without saving (live calc)
app.get('/invoices/preview', (req, res) => {
  const { clientId, month } = req.query;
  if (!clientId || !month) return res.status(400).json({ error: 'clientId and month required' });
  const inv = buildInvoice(clientId, month);
  if (!inv) return res.status(404).json({ error: 'Client not found' });
  res.json(inv);
});

// Generate + save an invoice for one client
app.post('/invoices/generate', (req, res) => {
  const { clientId, month } = req.body;
  if (!clientId || !month) return res.status(400).json({ error: 'clientId and month required' });
  const inv = buildInvoice(clientId, month);
  if (!inv) return res.status(404).json({ error: 'Client not found' });
  inv.id = 'INV-' + month + '-' + clientId;
  inv.generatedAt = new Date().toISOString();
  inv.status = 'generated';
  const invoices = read(INVOICES_FILE, []);
  const idx = invoices.findIndex(i => i.id === inv.id);
  if (idx >= 0) invoices[idx] = inv; else invoices.push(inv);
  write(INVOICES_FILE, invoices);
  res.json(inv);
});

// Generate for ALL clients for a month
app.post('/invoices/generate-all', (req, res) => {
  const month = (req.body && req.body.month) || monthKey(pacificDateStr());
  res.json(generateMonthlyInvoices(month));
});

// ── Health + Twilio status ────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({
    ok: true,
    twilioConfigured: !!(TWILIO_SID && TWILIO_TOKEN),
    time: new Date().toISOString(),
    pacificDate: pacificDateStr()
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Cron jobs ─────────────────────────────────────────────────────────────────
// Daily collection at 23:59 Pacific (07:59 UTC next day, roughly — we run at both
// 06:59 and 07:59 UTC to cover PST/PDT, guarded by date).
let lastCollectDate = null;
async function dailyCollect() {
  const today = pacificDateStr();
  if (lastCollectDate === today) return;
  console.log('[Cron] Daily collection for ' + today);
  try { await collectUsage(today); lastCollectDate = today; }
  catch(e) { console.warn('[Cron] Collection failed:', e.message); }
}
cron.schedule('59 6 * * *',  dailyCollect, { timezone: 'UTC' }); // 23:59 PDT
cron.schedule('59 7 * * *',  dailyCollect, { timezone: 'UTC' }); // 23:59 PST

// Monthly invoices on the 1st at 00:30 Pacific — generate for the PREVIOUS month.
let lastInvoiceMonth = null;
function monthlyInvoices() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  if (now.getDate() !== 1) return;
  // previous month
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = prev.toISOString().slice(0, 7);
  if (lastInvoiceMonth === month) return;
  console.log('[Cron] Monthly invoices for ' + month);
  generateMonthlyInvoices(month);
  lastInvoiceMonth = month;
}
cron.schedule('30 8 1 * *', monthlyInvoices, { timezone: 'UTC' });
cron.schedule('30 9 1 * *', monthlyInvoices, { timezone: 'UTC' });

app.listen(PORT, () => console.log('Winning Vocal Collector running on port ' + PORT + ' | Twilio: ' + (TWILIO_SID ? 'configured' : 'NOT configured')));
