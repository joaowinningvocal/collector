// CartVIP Affiliate Sales API — dispatch sales used for agent commissions.
// Docs: GET /api/v1/affiliate/sales?from_date&to_date&limit  (header X-API-KEY)
const store = require('./store');
const T = require('./time');
const { norm } = require('./seed');

const BASE = () => (process.env.CARTVIP_API_BASE || 'https://app.cartvip.com/api/v1').replace(/\/$/, '');
const KEY = () => process.env.CARTVIP_API_KEY || '';
function configured() { return !!KEY(); }

async function cget(path, params) {
  if (!KEY()) throw new Error('CARTVIP_API_KEY is not set in Railway variables');
  const url = new URL(BASE() + path);
  Object.entries(params || {}).forEach(([k, v]) => { if (v != null && v !== '') url.searchParams.append(k, String(v)); });
  const res = await fetch(url, { headers: { 'X-API-KEY': KEY(), Accept: 'application/json' } });
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { /* not json */ }
  if (res.status === 401) throw new Error('CartVIP rejected the API key (401) — check CARTVIP_API_KEY');
  if (!res.ok) throw new Error('CartVIP ' + res.status + ': ' + text.slice(0, 200));
  if (!body || body.status === false) throw new Error('CartVIP returned an unexpected response: ' + text.slice(0, 200));
  return body;
}

async function fetchSales(from, to) {
  const body = await cget('/affiliate/sales', { from_date: from, to_date: to, limit: 500 });
  return body.sales || body.data || [];
}

// ---- matching helpers ------------------------------------------------------
function textOf(v) { if (!v) return ''; if (typeof v === 'string') return v; return v.name || v.full_name || v.username || ''; }
const AGENT_FIELDS = ['agent', 'agent_name', 'sub_affiliate', 'sub_affiliate_name', 'affiliate', 'affiliate_name', 'seller', 'sold_by', 'salesperson', 'created_by', 'user_name'];

function matchAgent(raw, agents) {
  for (const f of AGENT_FIELDS) {
    const val = norm(textOf(raw[f]));
    if (!val) continue;
    const first = val.split(' ')[0];
    const hit = agents.find(a => {
      const names = [norm(a.name), ...(a.aliases || []).map(norm)].filter(Boolean);
      return names.some(n => n === val || n.split(' ')[0] === first);
    });
    if (hit) return hit.id;
  }
  return null;
}

function matchClient(destination, clients) {
  const d = norm(destination);
  if (!d) return null;
  const pairs = [];
  clients.forEach(c => {
    (c.aliases || []).forEach(a => pairs.push([norm(a), c.id]));
    pairs.push([norm(c.name), c.id]);
  });
  pairs.sort((a, b) => b[0].length - a[0].length); // longest alias first ("kings of hustler" before "hustler")
  const hit = pairs.find(([a]) => a && d.includes(a));
  return hit ? hit[1] : null;
}

function rematchAll() {
  const clients = store.read('clients', []);
  const sales = store.read('sales', []);
  sales.forEach(s => { if (s.clientSource !== 'manual') s.clientId = matchClient(s.destination, clients); });
  store.write('sales', sales);
}

// Pull sales day by day so each sale is tied to the day it was created (the API's date filter),
// which is what decides the pay period. Manual edits (agent split, location, exclude) are kept.
async function syncRange(from, to) {
  const agents = store.read('agents', []);
  const clients = store.read('clients', []);
  const sales = store.read('sales', []);
  const byId = Object.fromEntries(sales.map(s => [s.id, s]));
  const now = new Date().toISOString();
  let added = 0, updated = 0, fetched = 0, capped = [];

  for (const day of T.datesInRange(from, to)) {
    const rows = await fetchSales(day, day);
    fetched += rows.length;
    if (rows.length >= 500) capped.push(day);
    rows.forEach((r, i) => {
      const id = String(r.confirmation_number || ('cv_' + day + '_' + norm(r.customer_name) + '_' + i));
      const prev = byId[id];
      const base = {
        id, source: 'cartvip',
        confirmation: r.confirmation_number || '',
        customer: r.customer_name || '',
        phone: r.customer_phone || '',
        reservationDate: r.date || '',
        soldOn: prev && prev.soldOnManual ? prev.soldOn : day,
        destination: r.destination || '',
        package: r.package || '',
        guests: r.guests != null ? Number(r.guests) : null,
        total: Number(r.price_total) || 0,
        dispatchNotes: r.notes || '',
        raw: r, syncedAt: now,
      };
      if (prev) {
        Object.assign(prev, base);
        if (prev.clientSource !== 'manual') prev.clientId = matchClient(base.destination, clients);
        if (prev.agentSource !== 'manual') {
          const a = matchAgent(r, agents);
          prev.credits = a ? [{ agentId: a, amount: null }] : (prev.credits || []);
          prev.agentSource = a ? 'api' : prev.agentSource || null;
        }
        updated++;
      } else {
        const a = matchAgent(r, agents);
        const s = Object.assign(base, {
          clientId: matchClient(base.destination, clients), clientSource: 'auto',
          credits: a ? [{ agentId: a, amount: null }] : [], agentSource: a ? 'api' : null,
          excluded: false, createdAt: now,
        });
        sales.push(s); byId[id] = s; added++;
      }
    });
  }
  store.write('sales', sales);
  return { from, to, fetched, added, updated, capped };
}

async function testConnection() {
  const today = T.pacificDateStr();
  const rows = await fetchSales(T.addDays(today, -7), today);
  return { salesLast7Days: rows.length, fields: rows[0] ? Object.keys(rows[0]) : [] };
}

module.exports = { configured, syncRange, testConnection, matchClient, rematchAll };
