// Tiny JSON-file store. Data lives in DATA_DIR (a Railway volume in production).
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR ||
  (fs.existsSync('/app/data') ? '/app/data' : path.join(__dirname, '..', 'data'));
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  users: 'users.json',
  sessions: 'sessions.json',
  clients: 'clients.json',
  usage: 'usage.json',          // per client-number-day call/SMS usage (Telnyx)
  daily: 'daily.json',          // per-day Telnyx totals (all numbers, incl. unassigned)
  invoices: 'invoices.json',    // receptionist (per-minute) client invoices
  expenses: 'expenses.json',
  settings: 'settings.json',
  agents: 'agents.json',
  sales: 'sales.json',          // CartVIP dispatch sales
  periods: 'periods.json',      // call-center pay/invoice periods (hours, finalized invoices)
  annotations: 'annotations.json',
  jobs: 'jobs.json',
  migrations: 'migrations.json',
<<<<<<< HEAD
  alowareLines: 'aloware-lines.json', // Aloware lines → venues, for the call-center rebill
  alowareComms: 'aloware-comms.json', // one slim record per Aloware call/SMS (from the webhook)
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
};

function file(name) { return path.join(DATA_DIR, FILES[name] || name); }
function exists(name) { return fs.existsSync(file(name)); }
function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
}
function write(name, data) {
  const target = file(name);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, target);
}
function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// Rolling log of automated jobs so the dashboard can show what ran and what failed.
function logJob(job, ok, detail) {
  const jobs = read('jobs', []);
  jobs.unshift({ job, ok: !!ok, detail: String(detail || '').slice(0, 500), at: new Date().toISOString() });
  write('jobs', jobs.slice(0, 300));
  console.log('[job] ' + job + ' ' + (ok ? 'ok' : 'FAILED') + ' ' + (detail || ''));
}

module.exports = { DATA_DIR, read, write, exists, uid, logJob };
