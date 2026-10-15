// Aloware — call-center durations for the rebill.
// Aloware has no public API to pull calls or reports, but it pushes every communication to a
// webhook (Admin → Integrations → Webhook Integration). We receive those, keep a slim record per
// communication, and add them up per Aloware line for each pay period.
const store = require('./store');
const T = require('./time');

const TOKEN = () => process.env.ALOWARE_WEBHOOK_TOKEN || '';
// Aloware sends "2026-09-01 18:22:28" without a zone. Their API timestamps are UTC by default.
const SOURCE_TZ_OFFSET_MIN = () => Number(process.env.ALOWARE_UTC_OFFSET_MINUTES || 0);

function configured() { return !!TOKEN(); }
const last10 = n => { const d = String(n || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : null; };

function toPacificDate(stamp) {
  if (!stamp) return T.pacificDateStr();
  const iso = String(stamp).includes('T') ? String(stamp) : String(stamp).replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d)) return T.pacificDateStr();
  return T.pacificDateStr(new Date(d.getTime() - SOURCE_TZ_OFFSET_MIN() * 60000));
}

function findLine(lines, lineId, number) {
  const n = last10(number);
  return lines.find(l => (lineId && l.alowareLineId && String(l.alowareLineId) === String(lineId)) || (n && l.number && last10(l.number) === n));
}

// One webhook call → upsert one communication (Aloware re-sends when a disposition changes).
function receive(payload) {
  const c = (payload && (payload.body || payload.data)) || payload || {};
  if (!c.id) return { ignored: 'no communication id' };
  const lineId = c.campaign_id != null && c.campaign_id !== '' ? String(c.campaign_id) : null;
  const number = c.incoming_number || '';

  const lines = store.read('alowareLines', []);
  let line = findLine(lines, lineId, number);
  if (!line) {
    line = { id: store.uid('al'), name: 'Aloware line ' + (number || lineId), alowareLineId: lineId, number, clientIds: [], rebill: true, auto: true, createdAt: new Date().toISOString() };
    lines.push(line); store.write('alowareLines', lines);
  } else if ((!line.alowareLineId && lineId) || (!line.number && number)) {
    line.alowareLineId = line.alowareLineId || lineId; line.number = line.number || number;
    store.write('alowareLines', lines);
  }

  const rec = {
    id: String(c.id), lineId, number,
    date: toPacificDate(c.created_at),
    type: Number(c.type) || 0,                // 1 = call, 2 = SMS (others: email, fax…)
    dir: Number(c.direction) || 0,            // 1 = inbound, 2 = outbound
    sec: Number(c.duration) || 0, talk: Number(c.talk_time) || 0,
    user: c.user_id || null, status: c.disposition_status || c.current_status || '',
    event: (payload && payload.event) || '', at: new Date().toISOString(),
  };
  const comms = store.read('alowareComms', []);
  const i = comms.findIndex(x => x.id === rec.id);
  if (i >= 0) comms[i] = rec; else comms.push(rec);
  const cutoff = T.addDays(T.pacificDateStr(), -430);
  store.write('alowareComms', comms.filter(x => x.date >= cutoff));
  return { ok: true, id: rec.id, line: line.name };
}

// Minutes and activities per line for a date range.
function totalsByLine(from, to) {
  const lines = store.read('alowareLines', []);
  const out = {};
  store.read('alowareComms', []).forEach(c => {
    if (c.date < from || c.date > to) return;
    const line = findLine(lines, c.lineId, c.number);
    if (!line) return;
    const t = out[line.id] || (out[line.id] = { seconds: 0, activities: 0, calls: 0 });
    t.activities++;
    if (c.type === 1) { t.calls++; t.seconds += c.sec; }
  });
  return out;
}

function status() {
  const comms = store.read('alowareComms', []);
  const last = comms.reduce((a, c) => (c.at > a ? c.at : a), '');
  const since = T.addDays(T.pacificDateStr(), -7);
  return { configured: configured(), lastReceivedAt: last || null, last7Days: comms.filter(c => c.date >= since).length, total: comms.length };
}

module.exports = { configured, receive, totalsByLine, status, TOKEN };
