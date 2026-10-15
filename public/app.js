/* Winning Vocal — billing dashboard (client) */
var TOKEN = localStorage.getItem('wv-token');
var ME = null, STATUS = {}, SETTINGS = {}, CLIENTS = [], AGENTS = [], PERIODS = [];
var PERIOD_ID = null, PERIOD = null, PAGE = 'overview', REBILL_ALL = false;

/* ── helpers ─────────────────────────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n) { n = Number(n) || 0; return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function intf(n) { return (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
function pct(n) { return (Math.round((Number(n) || 0) * 1000) / 10).toFixed(1) + '%'; }
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d) { if (!d) return '—'; var p = d.split('-'); return MON[Number(p[1]) - 1] + ' ' + Number(p[2]); }
function fmtDateY(d) { if (!d) return '—'; var p = d.split('-'); return MON[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0]; }
function usDate(d) { if (!d) return ''; var p = d.split('-'); return Number(p[1]) + '/' + Number(p[2]) + '/' + p[0]; }
function monthName(m) { var p = m.split('-'); return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(p[1]) - 1] + ' ' + p[0]; }
function addMonths(m, n) { var p = m.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1)); return d.toISOString().slice(0, 7); }
function today() { return STATUS.today || new Date().toISOString().slice(0, 10); }
function act(name, id) { return 'data-act="' + name + '" data-id="' + esc(id) + '"'; }
function agentName(id) { var a = AGENTS.find(function (x) { return x.id === id; }); return a ? a.name : '?'; }

async function api(method, path, body) {
  var res = await fetch('/api' + path, {
    method: method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  var data = null; try { data = await res.json(); } catch (e) { /* empty */ }
  if (res.status === 401 && path !== '/login') { showLogin('Your session ended. Sign in again.'); throw new Error('signed out'); }
  if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
  return data;
}
window.wvApi = api;

var toastTimer;
function toast(msg, bad) {
  var t = $('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = ''; }, bad ? 6000 : 3200);
}
async function run(btn, fn) {
  var label = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }
  try { return await fn(); } catch (e) { if (e.message !== 'signed out') toast(e.message, true); }
  finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
}
function openModal(id) { $(id).classList.add('open'); var f = $(id).querySelector('input:not([type=hidden]),select,textarea'); if (f) setTimeout(function () { f.focus(); }, 30); }
function closeModal(id) { $(id).classList.remove('open'); }
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('.modal-bg.open').forEach(function (m) { m.classList.remove('open'); }); });
document.querySelectorAll('.modal-bg').forEach(function (m) { m.addEventListener('mousedown', function (e) { if (e.target === m) m.classList.remove('open'); }); });

function monthOptions(sel, count, selected) {
  var cur = today().slice(0, 7), html = '';
  for (var i = 0; i < (count || 13); i++) { var m = addMonths(cur, -i); html += '<option value="' + m + '">' + monthName(m) + '</option>'; }
  sel.innerHTML = html; sel.value = selected || cur;
}

// Delegated clicks/changes for rows rendered from data (avoids inline JS with user data).
var ACTIONS = {}, CHANGES = {};
document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-act]'); if (!el) return;
  var fn = ACTIONS[el.dataset.act]; if (fn) { e.preventDefault(); fn(el.dataset.id, el); }
});
document.addEventListener('change', function (e) {
  var el = e.target.closest('[data-chg]'); if (!el) return;
  var fn = CHANGES[el.dataset.chg]; if (fn) fn(el.dataset.id, el);
});

/* ── auth ────────────────────────────────────────────────────────────────── */
function showLogin(msg) {
  TOKEN = null; localStorage.removeItem('wv-token');
  $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  var err = $('lg-err'); if (msg) { err.textContent = msg; err.classList.remove('hidden'); } else err.classList.add('hidden');
  if (window.WVAnnotate) window.WVAnnotate.setEnabled(false);
}
async function doLogin() {
  try {
    var r = await api('POST', '/login', { username: $('lg-user').value, password: $('lg-pass').value });
    TOKEN = r.token; localStorage.setItem('wv-token', TOKEN); ME = r.user;
    $('lg-pass').value = '';
    enterApp();
  } catch (e) { var err = $('lg-err'); err.textContent = e.message; err.classList.remove('hidden'); }
}
async function doLogout() { try { await api('POST', '/logout'); } catch (e) { /* ignore */ } showLogin(); }
['lg-user', 'lg-pass'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); }); });

async function enterApp() {
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  $('who').textContent = ME.name || ME.username;
  await loadStatus();
  var r = await Promise.all([api('GET', '/settings'), api('GET', '/clients'), api('GET', '/agents'), api('GET', '/periods')]);
  SETTINGS = r[0]; CLIENTS = r[1]; AGENTS = r[2]; PERIODS = r[3];
  ['ov-month', 'ca-month', 'bi-month', 'ex-month'].forEach(function (id) { monthOptions($(id)); });
  $('ca-date').value = today();
  fillPeriodSelects();
  PERIOD_ID = PERIODS.length ? PERIODS[0].id : null;
  fillClientSelects();
  if (window.WVAnnotate) window.WVAnnotate.init({ user: ME, enabled: STATUS.annotationsEnabled !== false });
  showPage((location.hash || '#overview').slice(1));
}

async function loadStatus() {
  STATUS = await api('GET', '/status');
  var chip = function (id, on, label) {
    var el = $(id); el.className = 'sync-chip' + (on ? '' : ' off');
    el.innerHTML = '<i></i>' + label; el.title = on ? 'Connected' : 'API key not set';
  };
  chip('chip-telnyx', STATUS.telnyx, STATUS.telnyx ? 'Telnyx' + (STATUS.lastCollected ? ' · calls to ' + fmtDate(STATUS.lastCollected) : '') : 'Telnyx not set');
  chip('chip-cartvip', STATUS.cartvip, STATUS.cartvip ? 'CartVIP' : 'CartVIP not set');
<<<<<<< HEAD
  chip('chip-aloware', STATUS.aloware, STATUS.aloware ? 'Aloware' : 'Aloware not set');
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  if (STATUS.recentFailures) { $('chip-telnyx').classList.add('bad'); $('chip-telnyx').title = STATUS.recentFailures + ' recent automation failures — see Settings'; }
}

/* ── navigation ──────────────────────────────────────────────────────────── */
var LOADERS = {
  overview: function () { return loadOverview(); },
  callcenter: function () { return loadPeriod(); },
  sales: function () { return loadPeriod(); },
  calls: function () { return loadCalls(); },
<<<<<<< HEAD
  billing: function () { return loadVenueInvoices(); },
=======
  billing: function () { return loadUsageInvoices(); },
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  expenses: function () { return loadExpenses(); },
  clients: function () { return loadClients(); },
  settings: function () { return loadSettingsPage(); },
};
function showPage(name) {
  if (!LOADERS[name]) name = 'overview';
  PAGE = name;
  document.querySelectorAll('.page').forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + name); });
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.page === name); });
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  Promise.resolve(LOADERS[name]()).catch(function (e) { if (e.message !== 'signed out') toast(e.message, true); })
    .then(function () { window.dispatchEvent(new CustomEvent('wv:page', { detail: name })); });
}
$('tabs').addEventListener('click', function (e) { var t = e.target.closest('.tab'); if (t) showPage(t.dataset.page); });

function fillClientSelects() {
  var opts = CLIENTS.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
  $('ca-client').innerHTML = '<option value="">All clients</option>' + opts;
<<<<<<< HEAD
=======
  $('bi-client').innerHTML = '<option value="">Choose a client</option>' + opts;
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  $('mn-client').innerHTML = opts;
  $('ms-client').innerHTML = '<option value="">Not matched</option>' + opts;
}
function fillPeriodSelects() {
  var html = PERIODS.map(function (p) {
    return '<option value="' + p.id + '">' + esc(p.label) + (p.status === 'final' ? ' — #' + p.invoiceNo : '') + '</option>';
  }).join('');
  ['cc-period', 'sl-period'].forEach(function (id) { $(id).innerHTML = html; if (PERIOD_ID) $(id).value = PERIOD_ID; });
}

/* ── overview ────────────────────────────────────────────────────────────── */
async function loadOverview() {
  var o = await api('GET', '/overview?month=' + $('ov-month').value);
  $('ov-title').textContent = o.label;
  var part = function (k, v) { return '<span>' + k + ' <b>' + money(v) + '</b></span>'; };
  $('ov-equation').innerHTML = '<div class="equation">' +
    '<div class="eq-term"><div class="k">Money in</div><div class="v">' + money(o.revenue.total) + '</div><div class="parts">' + part('Call center invoices', o.revenue.callCenter) + part('Receptionist billing', o.revenue.receptionist) + '</div></div>' +
    '<div class="eq-op" aria-hidden="true">−</div>' +
    '<div class="eq-term"><div class="k">Money out</div><div class="v">' + money(o.costs.total) + '</div><div class="parts">' + part('Agent pay', o.costs.payroll) + part('Expenses', o.costs.expenses) + '</div></div>' +
    '<div class="eq-op" aria-hidden="true">=</div>' +
    '<div class="eq-term net"><div class="k">Net for ' + esc(o.label) + '</div><div class="v' + (o.net < 0 ? ' neg' : '') + '">' + money(o.net) + '</div><div class="parts"><span>' + intf(o.calls.total) + ' calls · ' + intf(o.calls.minutes) + ' min on Telnyx</span></div></div>' +
    '</div>';

  var alerts = [];
  var unassigned = o.periods.reduce(function (a, p) { return a + (p.unassignedCount || 0); }, 0);
  if (unassigned) alerts.push('<div class="notice warn"><span>' + unassigned + ' sale' + (unassigned > 1 ? 's' : '') + ' this month still need an agent, so their bonus isn\'t counted yet.</span><button class="btn btn-ghost btn-sm" data-act="go-unassigned">Assign agents</button></div>');
  if (!STATUS.telnyx) alerts.push('<div class="notice info"><span>Telnyx isn\'t connected yet, so calls and the Telnyx expense won\'t fill in automatically.</span><button class="btn btn-ghost btn-sm" data-act="go" data-id="settings">Open settings</button></div>');
  if (!STATUS.cartvip) alerts.push('<div class="notice info"><span>CartVIP isn\'t connected yet, so dispatch sales won\'t sync automatically.</span><button class="btn btn-ghost btn-sm" data-act="go" data-id="settings">Open settings</button></div>');
  $('ov-alerts').innerHTML = alerts.join('');
  $('ov-alerts').classList.toggle('hidden', !alerts.length);

  $('ov-periods').innerHTML = o.periods.map(function (p) {
    return '<tr style="cursor:pointer" ' + act('open-period', p.id) + '><td class="l strong">' + esc(p.label) + '</td><td>' + (p.status === 'final' ? '<span class="pill pill-good">#' + p.invoiceNo + '</span>' : '<span class="pill">Draft</span>') + '</td><td>' + money(p.sales) + '</td><td>' + money(p.payroll) + '</td><td class="strong">' + money(p.invoice) + '</td></tr>';
  }).join('') || '<tr class="empty-row"><td colspan="5">No periods.</td></tr>';

  $('ov-expenses').innerHTML = o.expenses.length ? o.expenses.map(function (e) {
    return '<tr><td class="l">' + esc(e.label) + (e.source === 'telnyx' ? ' <span class="pill pill-info">Auto</span>' : '') + '</td><td class="strong">' + money(e.monthAmount) + '</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="2">No expenses this month.</td></tr>';

<<<<<<< HEAD
  $('ov-venues').innerHTML = o.salesByVenue.length ? o.salesByVenue.map(function (v) {
    return '<tr><td class="l strong">' + esc(v.name) + (v.matched ? '' : ' <span class="pill pill-warn">Not matched</span>') + '</td><td>' + intf(v.orders) + '</td><td class="strong">' + money(v.sales) + '</td><td>' + money(v.orders ? v.sales / v.orders : 0) + '</td></tr>';
  }).join('') + '<tr><td class="l muted">Total</td><td class="muted">' + intf(o.salesByVenue.reduce(function (a, v) { return a + v.orders; }, 0)) + '</td><td class="strong">' + money(o.salesByVenue.reduce(function (a, v) { return a + v.sales; }, 0)) + '</td><td></td></tr>' : '<tr class="empty-row"><td colspan="4">No sales this month yet.</td></tr>';
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  $('ov-calls-note').textContent = o.calls.days ? 'Telnyx data for ' + o.calls.days + ' day' + (o.calls.days > 1 ? 's' : '') + ' of this month.' : '';
  var rows = o.byClient.filter(function (c) { return c.calls || c.minutes || c.sms; });
  $('ov-clients').innerHTML = rows.length ? rows.map(function (c) {
    return '<tr><td class="l strong">' + esc(c.name) + '</td><td>' + intf(c.calls) + '</td><td>' + intf(c.minutes) + '</td><td>' + intf(c.sms) + '</td><td class="strong">' + money(c.billed) + '</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="5">No calls recorded for this month yet.</td></tr>';
}
ACTIONS['go'] = function (page) { showPage(page); };
ACTIONS['open-period'] = function (id) { setPeriod(id, true); showPage('callcenter'); };
ACTIONS['go-unassigned'] = function () { $('sl-filter').value = 'unassigned'; showPage('sales'); };

/* ── call center ─────────────────────────────────────────────────────────── */
function setPeriod(id, silent) {
  PERIOD_ID = id; REBILL_ALL = false; ['cc-period', 'sl-period'].forEach(function (s) { $(s).value = id; });
  if (!silent) loadPeriod().catch(function (e) { toast(e.message, true); });
}
async function loadPeriod() {
  if (!PERIOD_ID) return;
  PERIOD = await api('GET', '/periods/' + PERIOD_ID);
  renderCallCenter(); renderSales();
}
function isFinal() { return PERIOD && PERIOD.status === 'final'; }

function renderCallCenter() {
  var P = PERIOD, t = P.totals, final = isFinal();
  var alerts = [];
  if (final) alerts.push('<div class="notice good"><span>Invoice #' + P.invoiceNo + ' was finalized ' + (P.finalizedBy ? 'by ' + esc(P.finalizedBy) + ' ' : '') + 'on ' + fmtDateY((P.finalizedAt || '').slice(0, 10)) + '. Numbers below are locked.</span><button class="btn btn-ghost btn-sm" onclick="reopenPeriod()">Reopen to edit</button></div>');
  if (!final && t.unassignedCount) alerts.push('<div class="notice warn"><span>' + t.unassignedCount + ' sale' + (t.unassignedCount > 1 ? 's' : '') + ' (' + money(t.unassignedSales) + ') have no agent yet. They count toward total sales but nobody gets the bonus.</span><button class="btn btn-ghost btn-sm" data-act="go-unassigned">Assign agents</button></div>');
<<<<<<< HEAD
  var cov = P.coverage || { below: [] };
  if (cov.below.length) alerts.push('<div class="notice warn"><span>' + cov.below.map(function (b) { return '<b>' + esc(b.name) + '</b> (' + money(b.sales) + ' vs ' + money(b.billedHours) + ')'; }).join(', ') + (cov.below.length > 1 ? ' have' : ' has') + ' sales below ' + cov.minMultiple + '× what their hours are billed at' + (today() <= P.period.to && !final ? ' so far this period' : '') + '.</span></div>');
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  var unmatched = P.locations.filter(function (l) { return !l.matched; });
  if (!final && unmatched.length) alerts.push('<div class="notice info"><span>' + unmatched.length + ' CartVIP location' + (unmatched.length > 1 ? 's' : '') + ' didn\'t match a client: ' + unmatched.map(function (l) { return esc(l.name); }).join(', ') + '. Add the name under Clients → Names in CartVIP.</span></div>');
  $('cc-alerts').innerHTML = alerts.join('');

  var margin = P.subtotal - t.payroll;
  $('cc-stats').innerHTML =
    stat('Sales', money(t.sales), t.orders + ' orders') + stat('Agent hours', intf(t.hours)) +
    stat('Agent pay', money(t.payroll)) + stat('Invoice total', money(P.subtotal)) + stat('WSS keeps', money(margin), P.subtotal ? pct(margin / P.subtotal) + ' of invoice' : '');
  $('cc-copy').classList.toggle('hidden', final);

  $('cc-agents').innerHTML = P.agents.map(function (a) {
    var hours = final ? intf(a.hours) : '<input class="cell-input" data-key="h-' + a.agentId + '" data-chg="hours" data-id="' + a.agentId + '" value="' + (a.hours || '') + '" inputmode="decimal" placeholder="0"/>';
    var extra = final ? money(a.extra) : '<input class="cell-input" data-key="x-' + a.agentId + '" data-chg="extra" data-id="' + a.agentId + '" value="' + (a.extra || '') + '" inputmode="decimal" placeholder="0"/>';
<<<<<<< HEAD
    return '<tr><td class="l strong">' + esc(a.name) + (a.role === 'manager' ? ' <span class="pill pill-ink">Manager</span>' : '') + '</td><td>' + hours + '</td><td>' + money(a.rate) + '</td><td>' + money(a.hoursPay) + '</td><td>' + money(a.sales) + '</td><td>' + coverageCell(a) + '</td><td>' + money(a.bonus) + ' <span class="muted small">' + a.bonusPct + '%</span></td><td>' + extra + '</td><td class="strong">' + money(a.total) + '</td></tr>';
  }).join('');
  var sum = function (k) { return P.agents.reduce(function (s, a) { return s + a[k]; }, 0); };
  $('cc-agents-foot').innerHTML = '<tr><td class="l">Total</td><td>' + intf(sum('hours')) + '</td><td></td><td>' + money(sum('hoursPay')) + '</td><td>' + money(t.sales) + '</td><td>' + (cov.team != null ? (Math.round(cov.team * 100) / 100).toFixed(2) + '×' : '') + '</td><td>' + money(sum('bonus')) + '</td><td>' + money(sum('extra')) + '</td><td>' + money(t.payroll) + '</td></tr>';

  $('cc-venues-note').textContent = t.orders + ' orders across ' + P.locations.length + ' venue' + (P.locations.length === 1 ? '' : 's');
  $('cc-venues').innerHTML = P.locations.length ? P.locations.map(function (l) {
    return '<tr><td class="l strong">' + esc(l.name) + (l.matched ? '' : ' <span class="pill pill-warn">Not matched</span>') + '</td><td>' + intf(l.orders) + '</td><td class="strong">' + money(l.sales) + '</td><td>' + money(l.avg) + '</td><td>' + pct(l.share) + '</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="5">No sales in this period yet.</td></tr>';
  $('cc-venues-foot').innerHTML = P.locations.length ? '<tr><td class="l">Total</td><td>' + intf(t.orders) + '</td><td>' + money(t.sales) + '</td><td>' + money(t.orders ? t.sales / t.orders : 0) + '</td><td>100%</td></tr>' : '';

  var rb = P.rebill, byAct = rb.basis === 'activities';
  $('cc-basis').value = rb.basis; $('cc-basis').disabled = final;
  $('cc-rebill-note').innerHTML = (STATUS.aloware ? 'Minutes and activities arrive from the Aloware webhook.' : 'Aloware isn\'t connected yet — type the minutes and activities from the Aloware report.') + (final ? '' : ' Typed numbers override the automatic ones; clear a box to go back.');
  var cell = function (r, field, autoVal, overridden) {
    if (final) return intf(r[field]);
    return '<input class="cell-input" style="width:84px" data-key="r' + field[0] + '-' + r.lineId + '" data-chg="rebill-' + field + '" data-id="' + r.lineId + '" value="' + (overridden ? r[field] : '') + '" placeholder="' + intf(autoVal) + '" inputmode="decimal"/>';
  };
  $('cc-rebill').innerHTML = rb.rows.length ? rb.rows.map(function (r) {
    var venue = r.clientNames.length ? esc(r.clientNames.join(' + ')) : '<span class="muted">Not billed to a venue</span>';
    return '<tr' + (r.minutes || r.activities ? '' : ' class="muted"') + '><td class="l strong">' + esc(r.name) + '</td><td class="l small">' + venue + '</td><td>' + cell(r, 'minutes', r.autoMinutes, r.minutesOverridden) + '</td><td' + (byAct ? ' class="muted"' : '') + '>' + pct(r.shareTime) + '</td><td>' + cell(r, 'activities', r.autoActivities, r.activitiesOverridden) + '</td><td' + (byAct ? '' : ' class="muted"') + '>' + pct(r.shareActivities) + '</td><td class="strong">' + money(r.amount) + '</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="7">No Aloware lines yet. Add them under Settings → Aloware lines.</td></tr>';
  $('cc-rebill-foot').innerHTML = '<tr><td class="l">Total</td><td></td><td>' + intf(rb.totalMinutes) + '</td><td>' + (rb.totalMinutes ? '100%' : '—') + '</td><td>' + intf(rb.totalActivities) + '</td><td>' + (rb.totalActivities ? '100%' : '—') + '</td><td>' + money(rb.hasData ? P.subtotal : 0) + '</td></tr>';
=======
    return '<tr><td class="l strong">' + esc(a.name) + (a.role === 'manager' ? ' <span class="pill pill-ink">Manager</span>' : '') + '</td><td>' + hours + '</td><td>' + money(a.rate) + '</td><td>' + money(a.hoursPay) + '</td><td>' + money(a.sales) + '</td><td>' + money(a.bonus) + ' <span class="muted small">' + a.bonusPct + '%</span></td><td>' + extra + '</td><td class="strong">' + money(a.total) + '</td></tr>';
  }).join('');
  var sum = function (k) { return P.agents.reduce(function (s, a) { return s + a[k]; }, 0); };
  $('cc-agents-foot').innerHTML = '<tr><td class="l">Total</td><td>' + intf(sum('hours')) + '</td><td></td><td>' + money(sum('hoursPay')) + '</td><td>' + money(t.sales) + '</td><td>' + money(sum('bonus')) + '</td><td>' + money(sum('extra')) + '</td><td>' + money(t.payroll) + '</td></tr>';

  var rb = P.rebill;
  var showAll = !final && (REBILL_ALL || rb.totalMinutes > 0);
  var rebillClients = !showAll ? rb.rows : CLIENTS.map(function (c) {
    return rb.rows.find(function (r) { return r.clientId === c.id; }) || { clientId: c.id, name: c.name, autoMinutes: 0, minutes: 0, share: 0, amount: 0 };
  });
  if (!final && !showAll) {
    $('cc-rebill').innerHTML = '<tr class="empty-row"><td colspan="5">No Telnyx call minutes for this period yet — they fill in every night. <button class="btn btn-ghost btn-sm" style="margin-left:.5rem" onclick="REBILL_ALL=true;renderCallCenter()">Enter minutes by hand</button></td></tr>';
  } else $('cc-rebill').innerHTML = rebillClients.length ? rebillClients.map(function (r) {
    var used = final ? intf(r.minutes) : '<input class="cell-input" data-key="r-' + r.clientId + '" data-chg="rebill" data-id="' + r.clientId + '" value="' + (r.overridden ? r.minutes : '') + '" placeholder="' + r.autoMinutes + '" inputmode="decimal"/>';
    return '<tr' + (r.minutes ? '' : ' class="muted"') + '><td class="l strong">' + esc(r.name) + '</td><td>' + intf(r.autoMinutes) + '</td><td>' + used + '</td><td>' + pct(r.share) + '</td><td class="strong">' + money(r.amount) + '</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="5">No call minutes in this period.</td></tr>';
  $('cc-rebill-foot').innerHTML = '<tr><td class="l">Total</td><td></td><td>' + intf(rb.totalMinutes) + '</td><td>' + (rb.totalMinutes ? '100%' : '—') + '</td><td>' + money(rb.totalMinutes ? P.subtotal : 0) + '</td></tr>';
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471

  var nextNo = P.invoiceNo || SETTINGS.nextInvoiceNumber;
  $('cc-doc-actions').innerHTML = final
    ? '<button class="btn btn-ghost btn-sm" onclick="downloadPeriodCsv()">Download CSV</button><button class="btn btn-ink btn-sm" onclick="printDoc(\'callcenter\')">Print or save PDF</button>'
    : '<button class="btn btn-ghost btn-sm" onclick="downloadPeriodCsv()">Download CSV</button><button class="btn btn-ghost btn-sm" onclick="printDoc(\'callcenter\')">Print draft</button><button class="btn btn-red btn-sm" onclick="finalizePeriod(this)">Finalize as invoice #' + nextNo + '</button>';
  $('cc-doc').innerHTML = periodDoc(P);
  refreshUnassignedBadge();
}
<<<<<<< HEAD
function coverageCell(a) {
  if (a.coverage == null) return '<span class="muted">—</span>';
  var v = (Math.round(a.coverage * 100) / 100).toFixed(2) + '×';
  return a.belowTarget ? '<span class="pill pill-warn" title="Sales ' + money(a.sales) + ' vs hours billed at ' + money(a.billedHours) + '">' + v + '</span>' : v;
}
async function setRebillBasis(v) {
  await run(null, async function () { SETTINGS = await api('PATCH', '/settings', { rebillBasis: v }); await loadPeriod(); });
}
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
function stat(k, v, sub) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (sub ? '<div class="muted small">' + sub + '</div>' : '') + '</div>'; }
function refreshUnassignedBadge() {
  var n = PERIOD && !isFinal() ? PERIOD.totals.unassignedCount : 0;
  var b = $('unassigned-count'); b.textContent = n; b.classList.toggle('hidden', !n);
}

async function patchPeriod(body) {
  var focusKey = null;
  PERIOD = await api('PATCH', '/periods/' + PERIOD_ID, body);
  if (document.activeElement && document.activeElement.dataset) focusKey = document.activeElement.dataset.key;
  renderCallCenter();
  if (focusKey) { var el = document.querySelector('[data-key="' + focusKey + '"]'); if (el) { el.focus(); if (el.select) el.select(); } }
}
CHANGES['hours'] = function (id, el) { var b = { hours: {} }; b.hours[id] = el.value === '' ? '' : num(el.value); patchPeriod(b).catch(function (e) { toast(e.message, true); }); };
CHANGES['extra'] = function (id, el) { var b = { extraBonus: {} }; b.extraBonus[id] = el.value === '' ? '' : num(el.value); patchPeriod(b).catch(function (e) { toast(e.message, true); }); };
<<<<<<< HEAD
['minutes', 'activities'].forEach(function (f) {
  CHANGES['rebill-' + f] = function (id, el) { var b = { rebillOverrides: {} }; b.rebillOverrides[id] = {}; b.rebillOverrides[id][f] = el.value === '' ? '' : num(el.value); patchPeriod(b).catch(function (e) { toast(e.message, true); }); };
});
=======
CHANGES['rebill'] = function (id, el) { var b = { rebillOverrides: {} }; b.rebillOverrides[id] = el.value === '' ? '' : num(el.value); patchPeriod(b).catch(function (e) { toast(e.message, true); }); };
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471

async function copyHours() {
  var i = PERIODS.findIndex(function (p) { return p.id === PERIOD_ID; });
  var prev = PERIODS[i + 1];
  if (!prev) return toast('There is no earlier period to copy from.', true);
  if (!confirm('Replace the hours for this period with the hours from ' + prev.label + '?')) return;
  await run(null, async function () { PERIOD = await api('POST', '/periods/' + PERIOD_ID + '/copy-hours', { fromId: prev.id }); renderCallCenter(); toast('Hours copied from ' + prev.label); });
}
async function syncSales() {
  var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
  await run(btn, async function () {
    var r = await api('POST', '/sales/sync', { periodId: PERIOD_ID });
    toast('CartVIP: ' + r.fetched + ' sales checked, ' + r.added + ' new' + (r.capped && r.capped.length ? ' — some days hit the 500 limit' : ''));
    await loadPeriod();
  });
}
async function finalizePeriod(btn) {
  var P = PERIOD;
  var warn = P.totals.unassignedCount ? '\n\n' + P.totals.unassignedCount + ' sales still have no agent.' : '';
  if (!confirm('Finalize ' + P.period.label + ' as invoice #' + (P.invoiceNo || SETTINGS.nextInvoiceNumber) + ' for ' + money(P.subtotal) + '?' + warn + '\n\nThe numbers are locked after this. You can reopen it later.')) return;
  await run(btn, async function () {
    PERIOD = await api('POST', '/periods/' + PERIOD_ID + '/finalize');
    SETTINGS = await api('GET', '/settings'); PERIODS = await api('GET', '/periods'); fillPeriodSelects();
    renderCallCenter(); toast('Invoice #' + PERIOD.invoiceNo + ' finalized');
  });
}
async function reopenPeriod() {
  if (!confirm('Reopen invoice #' + PERIOD.invoiceNo + '? It keeps its number, and the numbers update again until you finalize it.')) return;
  await run(null, async function () {
    PERIOD = await api('POST', '/periods/' + PERIOD_ID + '/reopen');
    PERIODS = await api('GET', '/periods'); fillPeriodSelects(); renderCallCenter(); toast('Invoice reopened');
  });
}
function printDoc(page) {
  var el = $('page-' + page); el.classList.add('printing');
  window.print();
  setTimeout(function () { el.classList.remove('printing'); }, 500);
}

// The invoice, laid out like the GoBest VIP spreadsheet.
function periodDoc(P) {
  var s = P.settings || {}, co = s.company || {}, bt = s.billTo || {};
  var lines = P.lines.map(function (l) {
    var q = l.quantity == null ? '' : (l.quantityKind === 'money' ? money(l.quantity) : intf(l.quantity));
    return '<tr><td class="l">' + esc(l.description) + '</td><td>' + q + '</td><td>' + money(l.amount) + '</td></tr>';
  }).join('');
  var locs = P.locations.map(function (l) { return '<tr><td class="l">' + esc(l.name) + '</td><td>' + l.orders + '</td><td>' + money(l.sales) + '</td></tr>'; }).join('');
  var saleRows = [];
  P.sales.filter(function (x) { return !x.excluded; }).forEach(function (x) {
    var credits = x.credits.length ? x.credits : [{ name: '—', amount: x.total }];
    credits.forEach(function (c) {
      saleRows.push('<tr><td class="l">' + esc(x.confirmation || '—') + '</td><td class="l">' + usDate(x.soldOn) + '</td><td class="l">' + esc(c.name) + '</td><td class="l">' + esc(x.customer) + '</td><td class="l">' + esc(x.clientName || x.destination) + '</td><td>' + money(c.amount) + '</td></tr>');
    });
  });
<<<<<<< HEAD
  var rbRows = P.rebill.rows.filter(function (r) { return r.minutes || r.activities; });
  var rb = P.rebill.hasData ? rbRows.map(function (r) { return '<tr><td class="l">' + esc(r.name) + '</td><td>' + intf(r.minutes) + '</td><td>' + pct(r.shareTime) + '</td><td>' + money(r.amountTime) + '</td><td>' + intf(r.activities) + '</td><td>' + pct(r.shareActivities) + '</td><td>' + money(r.amountActivities) + '</td></tr>'; }).join('') : '';
=======
  var rb = P.rebill.rows.map(function (r) { return '<tr><td class="l">' + esc(r.name) + '</td><td>' + intf(r.minutes) + '</td><td>' + pct(r.share) + '</td><td>' + money(r.amount) + '</td></tr>'; }).join('');
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  var mgr = P.agents.filter(function (a) { return a.role === 'manager'; }), ag = P.agents.filter(function (a) { return a.role !== 'manager'; });
  var agRow = function (a) { return '<tr><td class="l">' + esc(a.name.toUpperCase()) + '</td><td>' + intf(a.hours) + '</td><td>' + money(a.rate) + '</td><td>' + money(a.hoursPay) + '</td><td>' + money(a.sales) + '</td><td>' + money(a.bonus + a.extra) + '</td><td>' + money(a.total) + '</td></tr>'; };
  var ovr = P.lines.find(function (l) { return l.key === 'ovr'; }) || { amount: 0 }, sovr = P.lines.find(function (l) { return l.key === 'salesovr'; }) || { amount: 0 };
  var invDate = P.invoiceDate || today();

  return '<article class="paper">' +
    '<div class="p-head"><div class="p-from"><strong>' + esc(co.name) + '</strong>' + esc(co.address) + '<br>' + esc(co.email) + '<br>' + esc(co.phone) + '</div><div class="p-title">INVOICE</div></div>' +
    '<div class="p-meta"><div><div class="lbl">BILL TO</div><div class="strong">' + esc(bt.name) + '</div><div>' + esc(bt.contact) + '</div></div>' +
    '<dl><dt>Invoice no.</dt><dd>' + (P.invoiceNo ? P.invoiceNo : 'Draft') + '</dd><dt>Invoice date</dt><dd>' + usDate(invDate) + '</dd><dt>Period</dt><dd>' + esc(P.period.label) + '</dd></dl></div>' +
    '<table><thead><tr><th class="l">DESCRIPTION</th><th>QUANTITY</th><th>TOTAL</th></tr></thead><tbody>' + lines + '</tbody></table>' +
    '<div class="p-total"><dl><dt>Subtotal</dt><dd>' + money(P.subtotal) + '</dd><div class="due" style="display:contents"><dt>Balance due</dt><dd>' + money(P.subtotal) + '</dd></div></dl></div>' +
    '<div class="p-terms"><strong>Terms &amp; instructions</strong>' + esc(s.paymentTerms) + '</div>' +
    '<h4>LOCATION SALES</h4><table><thead><tr><th class="l">LOCATION</th><th>ORDERS</th><th>SALES</th></tr></thead><tbody>' + (locs || '<tr><td class="l muted" colspan="3">No sales in this period.</td></tr>') + '</tbody><tfoot><tr><td class="l"></td><td>' + P.totals.orders + '</td><td>' + money(P.totals.sales) + '</td></tr></tfoot></table>' +
    '<h4>SALES INCLUDED ON THIS INVOICE</h4><table><thead><tr><th class="l">ORDER NO</th><th class="l">DATE</th><th class="l">AGENT</th><th class="l">GUEST</th><th class="l">CLIENT</th><th>TOTAL</th></tr></thead><tbody>' + (saleRows.join('') || '<tr><td class="l muted" colspan="6">No sales in this period.</td></tr>') + '</tbody><tfoot><tr><td class="l">' + saleRows.length + '</td><td colspan="4"></td><td>' + money(P.totals.sales) + '</td></tr></tfoot></table>' +
<<<<<<< HEAD
    (rb ? '<h4>CLIENT (ALOWARE ' + esc(P.period.invoiceRange) + ')</h4><div class="tbl-scroll"><table><thead><tr><th class="l">CLIENT</th><th>CALL MIN</th><th>% OF TIME</th><th>REBILL BY TIME</th><th>ACTIVITIES</th><th>% OF ACT.</th><th>REBILL BY ACT.</th></tr></thead><tbody>' + rb + '</tbody><tfoot><tr><td class="l">TOTALS</td><td>' + intf(P.rebill.totalMinutes) + '</td><td>100%</td><td>' + money(P.subtotal) + '</td><td>' + intf(P.rebill.totalActivities) + '</td><td>100%</td><td>' + money(P.subtotal) + '</td></tr></tfoot></table></div><div class="p-note">Venues are billed by ' + (P.rebill.basis === 'activities' ? 'activities' : 'call time') + '.</div>' : '') +
=======
    (rb ? '<h4>CLIENT REBILL BY CALL TIME</h4><table><thead><tr><th class="l">CLIENT</th><th>MINUTES</th><th>% OF TIME</th><th>REBILL BY TIME</th></tr></thead><tbody>' + rb + '</tbody><tfoot><tr><td class="l">TOTALS</td><td>' + intf(P.rebill.totalMinutes) + '</td><td>100%</td><td>' + money(P.subtotal) + '</td></tr></tfoot></table><div class="p-note">Call minutes from Telnyx for ' + esc(P.period.label) + '.</div>' : '') +
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
    '<h4>AGENTS ' + esc(P.period.invoiceRange) + '</h4><table><thead><tr><th class="l"></th><th>HOURS</th><th>PAY/HOUR</th><th>HOURS TOTAL</th><th>SALES</th><th>BONUS</th><th>GRAND TOTAL</th></tr></thead><tbody>' +
    (mgr.length ? '<tr><td class="l strong" colspan="7">MANAGERS</td></tr>' + mgr.map(agRow).join('') : '') +
    (ag.length ? '<tr><td class="l strong" colspan="7">AGENTS</td></tr>' + ag.map(agRow).join('') : '') +
    '</tbody><tfoot><tr><td class="l">TOTAL</td><td>' + intf(P.totals.hours) + '</td><td></td><td>' + money(P.agents.reduce(function (a, x) { return a + x.hoursPay; }, 0)) + '</td><td>' + money(P.totals.sales) + '</td><td>' + money(P.agents.reduce(function (a, x) { return a + x.bonus + x.extra; }, 0)) + '</td><td>' + money(P.totals.payroll) + '</td></tr>' +
    '<tr><td class="l">WSS</td><td>' + intf(P.totals.hours) + '</td><td></td><td>' + money(ovr.amount) + '</td><td></td><td>' + money(sovr.amount) + '</td><td>' + money(ovr.amount + sovr.amount) + '</td></tr>' +
    '<tr><td class="l">CLIENT TOTAL</td><td colspan="5"></td><td>' + money(P.subtotal) + '</td></tr></tfoot></table>' +
    '</article>';
}

function downloadPeriodCsv() {
  var P = PERIOD, rows = [];
  var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var add = function (arr) { rows.push(arr.map(q).join(',')); };
  add(['Invoice', P.invoiceNo || 'Draft', 'Period', P.period.label]); add([]);
  add(['DESCRIPTION', 'QUANTITY', 'TOTAL']); P.lines.forEach(function (l) { add([l.description, l.quantity == null ? '' : l.quantity, l.amount]); }); add(['SUBTOTAL', '', P.subtotal]); add([]);
  add(['LOCATION', 'ORDERS', 'SALES']); P.locations.forEach(function (l) { add([l.name, l.orders, l.sales]); }); add([]);
  add(['ORDER NO', 'DATE', 'AGENT', 'GUEST', 'CLIENT', 'TOTAL', 'EXCLUDED']);
  P.sales.forEach(function (x) { (x.credits.length ? x.credits : [{ name: '', amount: x.total }]).forEach(function (c) { add([x.confirmation, x.soldOn, c.name, x.customer, x.clientName || x.destination, c.amount, x.excluded ? 'yes' : '']); }); }); add([]);
  add(['AGENT', 'ROLE', 'HOURS', 'PAY/HOUR', 'HOURS TOTAL', 'SALES', 'BONUS', 'EXTRA', 'GRAND TOTAL']);
  P.agents.forEach(function (a) { add([a.name, a.role, a.hours, a.rate, a.hoursPay, a.sales, a.bonus, a.extra, a.total]); }); add([]);
<<<<<<< HEAD
  add(['ALOWARE LINE', 'VENUE', 'CALL MINUTES', '% OF TIME', 'REBILL BY TIME', 'ACTIVITIES', '% OF ACTIVITIES', 'REBILL BY ACTIVITIES']);
  P.rebill.rows.forEach(function (r) { add([r.name, r.clientNames.join(' + '), r.minutes, (r.shareTime * 100).toFixed(2) + '%', r.amountTime, r.activities, (r.shareActivities * 100).toFixed(2) + '%', r.amountActivities]); });
=======
  add(['CLIENT', 'MINUTES', '% OF TIME', 'REBILL']); P.rebill.rows.forEach(function (r) { add([r.name, r.minutes, (r.share * 100).toFixed(2) + '%', r.amount]); });
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'Invoice' + (P.invoiceNo || '-draft') + ' - ' + P.period.from + ' to ' + P.period.to + '.csv'; a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

/* ── sales ───────────────────────────────────────────────────────────────── */
function agentOptions(selected, blankLabel) {
  var active = AGENTS.filter(function (a) { return a.active !== false || a.id === selected; })
    .sort(function (a, b) { return (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'agent' ? -1 : 1); });
  return '<option value="">' + (blankLabel || 'Choose agent') + '</option>' + active.map(function (a) {
    return '<option value="' + a.id + '"' + (a.id === selected ? ' selected' : '') + '>' + esc(a.name) + '</option>';
  }).join('');
}
function renderSales() {
  if (!PERIOD) return;
  var final = isFinal();
<<<<<<< HEAD
  var vsel = $('sl-venue'), vcur = vsel.value;
  vsel.innerHTML = '<option value="">All venues</option>' + PERIOD.locations.map(function (l) { return '<option value="' + esc(l.key) + '">' + esc(l.name) + ' (' + l.orders + ')</option>'; }).join('');
  vsel.value = PERIOD.locations.some(function (l) { return l.key === vcur; }) ? vcur : '';
  var venue = vsel.value;
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  var q = ($('sl-search').value || '').toLowerCase(), f = $('sl-filter').value;
  var list = PERIOD.sales.filter(function (s) {
    if (f === 'unassigned' && (s.excluded || s.credits.length)) return false;
    if (f === 'unmatched' && (s.excluded || s.clientId)) return false;
    if (f === 'excluded' && !s.excluded) return false;
<<<<<<< HEAD
    if (venue && (s.clientId || ('raw:' + (s.destination || 'Unknown'))) !== venue) return false;
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
    if (q && (s.customer + ' ' + s.confirmation + ' ' + s.destination + ' ' + s.clientName + ' ' + s.package).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  var t = PERIOD.totals;
  $('sl-summary').textContent = PERIOD.period.label + ': ' + t.orders + ' sales, ' + money(t.sales) + (t.unassignedCount ? ' · ' + t.unassignedCount + ' need an agent' : '') + (final ? ' · invoice #' + PERIOD.invoiceNo + ' is finalized' : '');
  $('sl-body').innerHTML = list.length ? list.map(function (s) {
    var loc = s.clientName ? esc(s.clientName) : esc(s.destination || '—') + ' <span class="pill pill-warn">Not matched</span>';
    var agent;
    if (final) agent = s.credits.map(function (c) { return esc(c.name); }).join(', ') || '—';
    else if (s.credits.length > 1) agent = '<button class="btn btn-ghost btn-sm" ' + act('edit-sale', s.id) + '>Split: ' + s.credits.map(function (c) { return esc(c.name.split(' ')[0]); }).join(' + ') + '</button>';
    else agent = '<select class="cell-select" data-chg="sale-agent" data-id="' + esc(s.id) + '"' + (s.credits.length ? '' : ' style="border-color:var(--warn);background:var(--warn-bg)"') + '>' + agentOptions(s.credits[0] && s.credits[0].agentId) + '</select>';
    var actions = final ? '' : '<button class="btn btn-ghost btn-sm" ' + act('edit-sale', s.id) + '>Edit</button><button class="btn btn-ghost btn-sm" ' + act('toggle-sale', s.id) + '>' + (s.excluded ? 'Include' : 'Exclude') + '</button>';
    return '<tr' + (s.excluded ? ' class="row-excluded"' : '') + '><td class="l">' + fmtDate(s.soldOn) + '</td><td class="l">' + esc(s.confirmation || '—') + (s.source === 'manual' ? ' <span class="pill">Manual</span>' : '') + '</td><td class="l">' + esc(s.customer) + '</td><td class="l">' + loc + '</td><td class="l wrap-cell muted">' + esc(s.package || '') + '</td><td class="strong">' + money(s.total) + '</td><td class="l">' + agent + '</td><td class="actions">' + actions + '</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="8">' + (PERIOD.sales.length ? 'No sales match this filter.' : 'No sales for ' + esc(PERIOD.period.label) + ' yet. Sync from CartVIP or add one.') + '</td></tr>';
}
CHANGES['sale-agent'] = async function (id, el) {
  await run(null, async function () { await api('PATCH', '/sales/' + encodeURIComponent(id), { credits: el.value ? [{ agentId: el.value }] : [] }); await loadPeriod(); });
};
ACTIONS['toggle-sale'] = async function (id) {
  var s = PERIOD.sales.find(function (x) { return x.id === id; });
  await run(null, async function () { await api('PATCH', '/sales/' + encodeURIComponent(id), { excluded: !s.excluded }); await loadPeriod(); toast(s.excluded ? 'Sale included again' : 'Sale excluded'); });
};
ACTIONS['edit-sale'] = function (id) { openSaleModal(id); };

function addCreditRow(agentId, amount) {
  var div = document.createElement('div'); div.className = 'list-row';
  div.innerHTML = '<select>' + agentOptions(agentId) + '</select><input placeholder="Auto split" inputmode="decimal" style="max-width:120px" value="' + (amount != null ? amount : '') + '"/><button class="rm" type="button" aria-label="Remove">✕</button>';
  div.querySelector('.rm').onclick = function () { div.remove(); };
  $('ms-credits').appendChild(div);
}
function openSaleModal(id) {
  var s = id ? PERIOD.sales.find(function (x) { return x.id === id; }) : null;
  var manual = !s || s.source === 'manual';
  $('ms-title').textContent = s ? 'Sale ' + (s.confirmation || '') : 'Add sale';
  $('ms-id').value = s ? s.id : '';
  $('ms-manual-fields').classList.toggle('hidden', !manual);
  $('ms-info').innerHTML = s && !manual ? esc(s.customer) + ' · ' + money(s.total) + ' · ' + esc(s.destination) + (s.package ? ' · ' + esc(s.package) : '') + '<br>From CartVIP' + (s.reservationDate ? ', reservation ' + fmtDateY(s.reservationDate) : '') : '';
  $('ms-conf').value = s ? s.confirmation : ''; $('ms-total').value = s ? s.total : '';
  $('ms-customer').value = s ? s.customer : ''; $('ms-package').value = s ? s.package : '';
  var p = PERIOD.period; $('ms-soldon').value = s ? s.soldOn : (today() >= p.from && today() <= p.to ? today() : p.from);
  $('ms-client').value = s && s.clientId ? s.clientId : '';
  $('ms-excluded').checked = !!(s && s.excluded);
  $('ms-credits').innerHTML = '';
  var credits = s ? s.rawCredits : [];
  if (credits.length) credits.forEach(function (c) { addCreditRow(c.agentId, c.amount); }); else addCreditRow();
  $('ms-delete').classList.toggle('hidden', !(s && s.source === 'manual'));
  openModal('m-sale');
}
async function saveSale() {
  var id = $('ms-id').value;
  var credits = [].slice.call($('ms-credits').children).map(function (row) {
    var v = row.querySelector('input').value;
    return { agentId: row.querySelector('select').value, amount: v === '' ? null : num(v) };
  }).filter(function (c) { return c.agentId; });
  var body = { credits: credits, clientId: $('ms-client').value, excluded: $('ms-excluded').checked, soldOn: $('ms-soldon').value };
  var s = id && PERIOD.sales.find(function (x) { return x.id === id; });
  if (!s || s.source === 'manual') Object.assign(body, { confirmation: $('ms-conf').value.trim(), total: $('ms-total').value === '' ? '' : num($('ms-total').value), customer: $('ms-customer').value.trim(), package: $('ms-package').value.trim(), destination: (CLIENTS.find(function (c) { return c.id === body.clientId; }) || {}).name || '' });
  if (s && s.soldOn === body.soldOn) delete body.soldOn;
  await run(null, async function () {
    if (id) await api('PATCH', '/sales/' + encodeURIComponent(id), body); else await api('POST', '/sales', body);
    closeModal('m-sale'); await loadPeriod(); toast('Sale saved');
  });
}
async function deleteSale() {
  if (!confirm('Delete this manual sale?')) return;
  await run(null, async function () { await api('DELETE', '/sales/' + encodeURIComponent($('ms-id').value)); closeModal('m-sale'); await loadPeriod(); toast('Sale deleted'); });
}

/* ── calls ───────────────────────────────────────────────────────────────── */
async function loadCalls() {
  var month = $('ca-month').value, client = $('ca-client').value;
  var r = await Promise.all([api('GET', '/daily?month=' + month), api('GET', '/usage?month=' + month + (client ? '&clientId=' + encodeURIComponent(client) : ''))]);
  var daily = r[0].slice().reverse(), usage = r[1].sort(function (a, b) { return (b.date + a.clientName).localeCompare(a.date + b.clientName); });
  var s = function (k) { return daily.reduce(function (a, d) { return a + (d[k] || 0); }, 0); };
  $('ca-stats').innerHTML = stat('Calls', intf(s('calls'))) + stat('Minutes', intf(s('minutes'))) + stat('Voice cost', money(s('voiceCost'))) + stat('Texts', intf(s('sms'))) + stat('Days pulled', daily.length + ' of ' + (month === today().slice(0, 7) ? Number(today().slice(8)) : new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).getUTCDate()));
  $('ca-daily').innerHTML = daily.length ? daily.map(function (d) {
    return '<tr><td class="l strong">' + fmtDate(d.date) + '</td><td>' + intf(d.calls) + '</td><td>' + intf(d.inbound) + '</td><td>' + intf(d.outbound) + '</td><td>' + intf(d.minutes) + '</td><td>' + money(d.voiceCost) + '</td><td>' + intf(d.sms) + '</td><td>' + money(d.smsCost) + '</td><td>' + (d.unassignedCalls ? '<span class="pill pill-warn">' + d.unassignedCalls + ' calls</span>' : '<span class="muted">—</span>') + '</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="9">' + (STATUS.telnyx ? 'Nothing pulled for this month yet. Pick a day above and pull it.' : 'Telnyx isn\'t connected yet — add TELNYX_API_KEY in Railway.') + '</td></tr>';
  $('ca-usage').innerHTML = usage.length ? usage.map(function (u) {
    var src = u.source === 'telnyx' ? '<span class="pill pill-info">Telnyx</span>' : u.source === 'manual' ? '<span class="pill">Manual</span>' : '<span class="pill">Twilio</span>';
    return '<tr><td class="l">' + fmtDate(u.date) + '</td><td class="l strong">' + esc(u.clientName) + '</td><td class="l"><span class="pill pill-num">' + esc(u.number) + '</span></td><td>' + intf(u.calls) + '</td><td>' + intf(u.minutes) + '</td><td>' + intf(u.sms) + '</td><td>' + (u.voiceCost != null ? money((u.voiceCost || 0) + (u.smsCost || 0)) : '—') + '</td><td class="l">' + src + '</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="8">No calls for this selection.</td></tr>';
}
async function collectDay() {
  var d = $('ca-date').value; if (!d) return toast('Pick a day first.', true);
  await run(event && event.target, async function () {
    var r = await api('POST', '/collect', { date: d });
    toast(fmtDate(d) + ': ' + r.calls + ' calls, ' + r.minutes + ' min' + (r.unassignedCalls ? ', ' + r.unassignedCalls + ' not assigned to a client' : ''));
    $('ca-month').value = d.slice(0, 7); await loadCalls(); loadStatus();
  });
}
function openManualModal() {
  $('mn-date').value = today(); $('mn-number').value = ''; $('mn-calls').value = '0'; $('mn-min').value = '0'; $('mn-sms').value = '0';
  openModal('m-manual');
}
async function saveManual() {
  await run(null, async function () {
    await api('POST', '/usage/manual', { clientId: $('mn-client').value, date: $('mn-date').value, number: $('mn-number').value.trim(), calls: num($('mn-calls').value), minutes: num($('mn-min').value), sms: num($('mn-sms').value) });
    closeModal('m-manual'); loadCalls(); toast('Entry added');
  });
}

<<<<<<< HEAD
/* ── venue invoices ────────────────────────────────────────────────────── */
var VENUE = null, SAVED_INVOICES = [];
function brand(k) { var b = (SETTINGS.brands || {}); return k === 'ai' ? (b.ai || 'AI Receptionist') : (b.callCenter || 'ClubLifter'); }
async function loadVenueInvoices() {
  var r = await Promise.all([api('GET', '/venue-invoices?month=' + $('bi-month').value), api('GET', '/invoices')]);
  VENUE = r[0]; SAVED_INVOICES = r[1];
  $('bi-ai-head').textContent = brand('ai'); $('bi-cc-head').textContent = brand('callcenter');
  var V = VENUE, alerts = [];
  var open = V.periods.filter(function (p) { return p.status !== 'final'; });
  if (open.length) alerts.push('<div class="notice info"><span>' + open.map(function (p) { return esc(p.label); }).join(' and ') + (open.length > 1 ? ' are' : ' is') + ' not finalized yet, so the call-center amounts can still change.</span><button class="btn btn-ghost btn-sm" data-act="open-period" data-id="' + open[0].id + '">Open call center</button></div>');
  var noData = V.periods.filter(function (p) { return p.subtotal && !p.hasRebillData; });
  if (noData.length) alerts.push('<div class="notice warn"><span>' + noData.map(function (p) { return esc(p.label); }).join(' and ') + ' ' + (noData.length > 1 ? 'have' : 'has') + ' no Aloware minutes, so the call-center invoice can\'t be split across venues yet.</span></div>');
  if (V.unlinked.total) alerts.push('<div class="notice info"><span>' + money(V.unlinked.total) + ' of the call-center invoices is on lines not billed to a venue (' + Array.from(new Set(V.unlinked.lines.map(function (l) { return l.lineName; }))).map(esc).join(', ') + ').</span></div>');
  $('bi-alerts').innerHTML = alerts.join('');
  $('bi-stats').innerHTML = stat(esc(brand('ai')), money(V.totals.ai)) + stat(esc(brand('callcenter')) + ' to venues', money(V.totals.callCenter)) + stat('Not billed to a venue', money(V.unlinked.total)) + stat('Venue invoices', V.rows.filter(function (r) { return r.ai.total > 0; }).length + V.rows.filter(function (r) { return r.callCenter.total > 0; }).length);
  var rows = V.rows.filter(function (r) { return r.ai.total || r.callCenter.total || r.sales.orders; });
  $('bi-venues').innerHTML = rows.length ? rows.map(function (r) {
    var covTxt = r.coverage == null ? '<span class="muted">—</span>' : (r.belowTarget ? '<span class="pill pill-warn">' + r.coverage.toFixed(2) + '×</span>' : r.coverage.toFixed(2) + '×');
    return '<tr><td class="l strong">' + esc(r.name) + '</td>' +
      '<td>' + (r.ai.total ? money(r.ai.total) + '<div class="muted small">' + intf(r.ai.minutes) + ' min · ' + intf(r.ai.sms) + ' texts</div>' : '<span class="muted">—</span>') + '</td>' +
      '<td>' + (r.callCenter.total ? money(r.callCenter.total) + '<div class="muted small">' + r.callCenter.lines.map(function (l) { return esc(l.lineName); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + '</div>' : '<span class="muted">—</span>') + '</td>' +
      '<td>' + (r.sales.orders ? money(r.sales.total) + '<div class="muted small">' + r.sales.orders + ' orders</div>' : '<span class="muted">—</span>') + '</td>' +
      '<td>' + covTxt + '</td>' +
      '<td class="actions">' + (r.ai.total ? '<button class="btn btn-ghost btn-sm" ' + act('venue-ai', r.clientId) + '>' + esc(brand('ai')) + '</button>' : '') + (r.callCenter.total ? '<button class="btn btn-ghost btn-sm" ' + act('venue-cc', r.clientId) + '>' + esc(brand('callcenter')) + '</button>' : '') + '</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="6">Nothing to invoice for ' + esc(V.label) + ' yet.</td></tr>';
  $('bi-venues-foot').innerHTML = rows.length ? '<tr><td class="l">Total</td><td>' + money(V.totals.ai) + '</td><td>' + money(V.totals.callCenter) + '</td><td>' + money(rows.reduce(function (a, r) { return a + r.sales.total; }, 0)) + '</td><td></td><td></td></tr>' : '';
  renderSavedInvoices();
}
function venueRow(id) { return VENUE.rows.find(function (r) { return r.clientId === id; }); }
ACTIONS['venue-ai'] = function (id) { var r = venueRow(id); showVenueDoc(aiDoc({ id: null, clientId: id, clientName: r.name, billingContact: r.billingContact, month: VENUE.month, ai: r.ai }), id, 'ai'); };
ACTIONS['venue-cc'] = function (id) { var r = venueRow(id); showVenueDoc(ccDoc({ id: null, clientId: id, clientName: r.name, billingContact: r.billingContact, month: VENUE.month, lines: r.callCenter.lines, total: r.callCenter.total, sales: r.sales }), id, 'callcenter'); };
function showVenueDoc(html, clientId, kind) {
  $('bi-doc').innerHTML = html + '<div class="doc-actions no-print">' + (clientId ? '<button class="btn btn-red" ' + act('save-venue-inv', clientId + '|' + kind) + '>Save this invoice</button>' : '') + '<button class="btn btn-ghost" onclick="printDoc(\'billing\')">Print or save PDF</button></div>';
  $('bi-doc').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function docHead(title, inv, extraMeta) {
  var co = inv.company || SETTINGS.company || {};
  return '<div class="p-head"><div class="p-from"><strong>' + esc(co.name) + '</strong>' + esc(co.address) + '<br>' + esc(co.email) + '<br>' + esc(co.phone) + '</div><div class="p-title" style="text-align:right">INVOICE<div style="font-size:13px;letter-spacing:.02em;color:#111;font-weight:700;margin-top:2px">' + esc(title) + '</div></div></div>' +
    '<div class="p-meta"><div><div class="lbl">BILL TO</div><div class="strong">' + esc(inv.clientName) + '</div>' + (inv.billingContact ? '<div>' + esc(inv.billingContact) + '</div>' : '') + '</div><dl><dt>Invoice</dt><dd>' + (inv.id ? esc(inv.id) : 'Preview') + '</dd><dt>Period</dt><dd>' + monthName(inv.month) + '</dd>' + (extraMeta || '') + '</dl></div>';
}
function docFoot(total, inv) {
  return '<div class="p-total"><dl><div class="due" style="display:contents"><dt>Balance due</dt><dd>' + money(total) + '</dd></div></dl></div>' +
    '<div class="p-terms"><strong>Terms &amp; instructions</strong>' + esc(inv.paymentTerms || SETTINGS.paymentTerms) + '</div>';
}
function aiDoc(inv) {
  var a = inv.ai || { calls: inv.totalCalls, minutes: inv.totalMinutes, sms: inv.totalSms, rateMin: inv.rateMin, rateSms: inv.rateSms, costMinutes: inv.costMinutes, costSms: inv.costSms, total: inv.total };
  return '<article class="paper">' + docHead(brand('ai'), inv) +
    '<table><thead><tr><th class="l">DESCRIPTION</th><th>QUANTITY</th><th>RATE</th><th>TOTAL</th></tr></thead><tbody>' +
    '<tr><td class="l">' + esc(brand('ai')) + ' — voice minutes (' + intf(a.calls || 0) + ' calls)</td><td>' + intf(a.minutes) + '</td><td>$' + Number(a.rateMin).toFixed(3) + '</td><td>' + money(a.costMinutes) + '</td></tr>' +
    '<tr><td class="l">Text messages</td><td>' + intf(a.sms) + '</td><td>$' + Number(a.rateSms).toFixed(3) + '</td><td>' + money(a.costSms) + '</td></tr>' +
    '</tbody></table>' + docFoot(a.total, inv) + '</article>';
}
function ccDoc(inv) {
  var basisWord = function (l) { return l.basis === 'activities' ? intf(l.activities) + ' activities' : intf(l.minutes) + ' call min'; };
  var lines = inv.lines.map(function (l) {
    return '<tr><td class="l">' + esc(brand('callcenter')) + ' call center — ' + esc(l.periodLabel) + '<div class="muted small">Line ' + esc(l.lineName) + ': ' + basisWord(l) + ', ' + pct(l.share) + ' of the period' + (l.splitWith > 1 ? ', split between ' + l.splitWith + ' venues' : '') + (l.status === 'final' ? '' : ' · draft') + '</div></td><td>' + money(l.amount) + '</td></tr>';
  }).join('');
  return '<article class="paper">' + docHead(brand('callcenter'), inv) +
    '<table><thead><tr><th class="l">DESCRIPTION</th><th>TOTAL</th></tr></thead><tbody>' + lines + '</tbody></table>' +
    docFoot(inv.total, inv) +
    (inv.sales && inv.sales.orders ? '<h4>SALES GENERATED FOR YOU THIS MONTH</h4><table><tbody><tr><td class="l">Orders booked through the call center</td><td>' + intf(inv.sales.orders) + '</td></tr><tr><td class="l">Sales value</td><td>' + money(inv.sales.total) + '</td></tr></tbody></table>' : '') +
    '</article>';
}
ACTIONS['save-venue-inv'] = async function (key) {
  var p = key.split('|');
  await run(null, async function () {
    var r = await api('POST', '/venue-invoices/save', { month: VENUE.month, clientId: p[0], kind: p[1] });
    if (r[0]) { toast('Saved ' + r[0].id); showVenueDoc(r[0].kind === 'callcenter' ? ccDoc(r[0]) : aiDoc(r[0]), null); }
    await loadVenueInvoices();
  });
};
async function saveAllVenueInvoices(btn) {
  var open = VENUE.periods.filter(function (p) { return p.status !== 'final'; });
  if (!confirm('Save every ' + brand('ai') + ' and ' + brand('callcenter') + ' invoice for ' + VENUE.label + '?' + (open.length ? '\n\n' + open.length + ' call-center period' + (open.length > 1 ? 's are' : ' is') + ' not finalized, so those amounts can still change. Saving again later replaces them.' : ''))) return;
  await run(btn, async function () { var r = await api('POST', '/venue-invoices/save', { month: VENUE.month }); toast(r.length + ' invoices saved'); await loadVenueInvoices(); });
}
function renderSavedInvoices() {
  var kind = $('bi-kind').value;
  var list = SAVED_INVOICES.map(function (i) { return Object.assign({ kind: 'ai' }, i); })
    .filter(function (i) { return !kind || i.kind === kind; })
    .sort(function (a, b) { return (b.month + a.clientName + a.kind).localeCompare(a.month + b.clientName + b.kind); });
  $('bi-body').innerHTML = list.length ? list.map(function (i) {
    return '<tr><td class="l muted small">' + esc(i.id) + '</td><td class="l strong">' + esc(i.clientName) + '</td><td class="l">' + (i.kind === 'callcenter' ? '<span class="pill pill-ink">' + esc(brand('callcenter')) + '</span>' : '<span class="pill pill-info">' + esc(brand('ai')) + '</span>') + '</td><td class="l">' + monthName(i.month) + '</td><td class="strong">' + money(i.total) + '</td><td class="actions"><button class="btn btn-ghost btn-sm" ' + act('view-saved-inv', i.id) + '>View</button></td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="6">No saved invoices yet.</td></tr>';
}
ACTIONS['view-saved-inv'] = function (id) {
  var i = SAVED_INVOICES.find(function (x) { return x.id === id; });
  showVenueDoc(i.kind === 'callcenter' ? ccDoc(i) : aiDoc(i), null);
};
=======
/* ── receptionist billing ────────────────────────────────────────────────── */
var USAGE_INVOICES = [];
async function loadUsageInvoices() {
  USAGE_INVOICES = (await api('GET', '/invoices')).sort(function (a, b) { return (b.month + a.clientName).localeCompare(a.month + b.clientName); });
  $('bi-body').innerHTML = USAGE_INVOICES.length ? USAGE_INVOICES.map(function (i) {
    return '<tr><td class="l muted small">' + esc(i.id) + '</td><td class="l strong">' + esc(i.clientName) + '</td><td class="l">' + monthName(i.month) + '</td><td>' + intf(i.totalCalls) + '</td><td>' + intf(i.totalMinutes) + '</td><td>' + intf(i.totalSms) + '</td><td class="strong">' + money(i.total) + '</td><td class="actions"><button class="btn btn-ghost btn-sm" ' + act('view-usage-inv', i.id) + '>View</button></td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="8">No saved invoices yet. Preview one above and save it.</td></tr>';
}
ACTIONS['view-usage-inv'] = function (id) { renderUsageDoc(USAGE_INVOICES.find(function (i) { return i.id === id; }), false); };
async function previewUsageInvoice() {
  var c = $('bi-client').value; if (!c) return toast('Choose a client first.', true);
  await run(null, async function () { renderUsageDoc(await api('GET', '/invoices/preview?clientId=' + encodeURIComponent(c) + '&month=' + $('bi-month').value), true); });
}
function renderUsageDoc(inv, preview) {
  var co = inv.company || SETTINGS.company || {};
  $('bi-doc').innerHTML = '<article class="paper">' +
    '<div class="p-head"><div class="p-from"><strong>' + esc(co.name) + '</strong>' + esc(co.address) + '<br>' + esc(co.email) + '<br>' + esc(co.phone) + '</div><div class="p-title">INVOICE</div></div>' +
    '<div class="p-meta"><div><div class="lbl">BILL TO</div><div class="strong">' + esc(inv.clientName) + '</div></div><dl><dt>Invoice</dt><dd>' + (inv.id ? esc(inv.id) : 'Preview') + '</dd><dt>Period</dt><dd>' + monthName(inv.month) + '</dd></dl></div>' +
    '<table><thead><tr><th class="l">DESCRIPTION</th><th>QUANTITY</th><th>RATE</th><th>TOTAL</th></tr></thead><tbody>' +
    '<tr><td class="l">AI receptionist — voice minutes (' + intf(inv.totalCalls || 0) + ' calls)</td><td>' + intf(inv.totalMinutes) + '</td><td>$' + Number(inv.rateMin).toFixed(3) + '</td><td>' + money(inv.costMinutes) + '</td></tr>' +
    '<tr><td class="l">Text messages</td><td>' + intf(inv.totalSms) + '</td><td>$' + Number(inv.rateSms).toFixed(3) + '</td><td>' + money(inv.costSms) + '</td></tr>' +
    '</tbody></table><div class="p-total"><dl><div class="due" style="display:contents"><dt>Balance due</dt><dd>' + money(inv.total) + '</dd></div></dl></div>' +
    '<div class="p-terms"><strong>Terms &amp; instructions</strong>' + esc(inv.paymentTerms || SETTINGS.paymentTerms) + '</div></article>' +
    '<div class="doc-actions no-print">' + (preview ? '<button class="btn btn-red" ' + act('save-usage-inv', inv.clientId + '|' + inv.month) + '>Save this invoice</button>' : '') + '<button class="btn btn-ghost" onclick="printDoc(\'billing\')">Print or save PDF</button></div>';
  $('bi-doc').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
ACTIONS['save-usage-inv'] = async function (key) {
  var p = key.split('|');
  await run(null, async function () { var inv = await api('POST', '/invoices/generate', { clientId: p[0], month: p[1] }); toast('Saved ' + inv.id); renderUsageDoc(inv, false); loadUsageInvoices(); });
};
async function generateAllUsage() {
  var m = $('bi-month').value;
  if (!confirm('Save receptionist invoices for every client for ' + monthName(m) + '?')) return;
  await run(null, async function () { var r = await api('POST', '/invoices/generate-all', { month: m }); toast(r.length + ' invoices saved'); loadUsageInvoices(); });
}
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471

/* ── expenses ────────────────────────────────────────────────────────────── */
var EXPENSES = [];
var FREQ_LABEL = { once: 'One time', weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month', quarterly: 'Every 3 months', yearly: 'Every year' };
function freqText(e) {
  if (e.frequency === 'once') return 'One time · ' + fmtDateY(e.startDate);
  var f = e.frequency === 'custom' ? 'Every ' + (e.everyMonths || 1) + ' months' : FREQ_LABEL[e.frequency] || e.frequency;
  return f + ' · since ' + fmtDateY(e.startDate) + (e.endDate ? ' until ' + fmtDateY(e.endDate) : '');
}
async function loadExpenses() {
  var month = $('ex-month').value;
  EXPENSES = await api('GET', '/expenses?month=' + month);
  var total = EXPENSES.reduce(function (a, e) { return a + e.monthAmount; }, 0);
  var auto = EXPENSES.filter(function (e) { return e.source === 'telnyx'; }).reduce(function (a, e) { return a + e.monthAmount; }, 0);
  var rec = EXPENSES.filter(function (e) { return e.source !== 'telnyx' && e.frequency !== 'once'; }).reduce(function (a, e) { return a + e.monthAmount; }, 0);
  $('ex-stats').innerHTML = stat('Total for ' + monthName(month), money(total)) + stat('Telnyx (automatic)', money(auto)) + stat('Repeating', money(rec)) + stat('One time', money(total - auto - rec));
  var rows = EXPENSES.slice().sort(function (a, b) { return (a.source === 'telnyx' ? -1 : 0) - (b.source === 'telnyx' ? -1 : 0) || b.monthAmount - a.monthAmount; });
  var hasTelnyx = rows.some(function (e) { return e.source === 'telnyx'; });
  var html = rows.map(function (e) {
    var name = esc(e.label) + (e.source === 'telnyx' ? ' <span class="pill pill-info">Automatic</span>' : '') + (e.notes ? '<div class="muted small">' + esc(e.notes) + '</div>' : '');
    var thisMonth = e.occurrences > 1 ? '<span class="muted small">' + e.occurrences + ' × ' + money(e.amount) + ' = </span>' + money(e.monthAmount) : money(e.monthAmount);
    var actions = e.source === 'telnyx'
      ? '<button class="btn btn-ghost btn-sm" ' + act('exp-details', e.id) + '>Details</button><button class="btn btn-ghost btn-sm" ' + act('exp-del', e.id) + '>Delete</button>'
      : '<button class="btn btn-ghost btn-sm" ' + act('exp-edit', e.id) + '>Edit</button><button class="btn btn-ghost btn-sm" ' + act('exp-del', e.id) + '>Delete</button>';
    return '<tr><td class="l strong wrap-cell">' + name + '</td><td class="l muted">' + esc(e.category || '—') + '</td><td class="l">' + (e.source === 'telnyx' ? 'Monthly, pulled at month end' : freqText(e)) + '</td><td>' + money(e.amount) + '</td><td class="strong">' + thisMonth + '</td><td class="actions">' + actions + '</td></tr>';
  }).join('');
  if (!hasTelnyx && month <= today().slice(0, 7)) html = '<tr class="muted"><td class="l wrap-cell">Telnyx — ' + monthName(month) + ' <span class="pill">Not pulled yet</span></td><td class="l">Telecom</td><td class="l">Pulled automatically on the last day of the month</td><td>—</td><td>—</td><td class="actions"><button class="btn btn-ghost btn-sm" onclick="pullTelnyxExpense()">Pull now</button></td></tr>' + html;
  $('ex-body').innerHTML = html || '<tr class="empty-row"><td colspan="6">No expenses this month.</td></tr>';
}
ACTIONS['exp-edit'] = function (id) { openExpenseModal(EXPENSES.find(function (e) { return e.id === id; })); };
ACTIONS['exp-del'] = async function (id) {
  var e = EXPENSES.find(function (x) { return x.id === id; });
  if (!confirm('Delete "' + e.label + '"?' + (e.frequency !== 'once' && e.source !== 'telnyx' ? '\n\nThis removes it from every month. To stop it from now on, edit it and set an end date instead.' : ''))) return;
  await run(null, async function () { await api('DELETE', '/expenses/' + encodeURIComponent(id)); loadExpenses(); toast('Expense deleted'); });
};
ACTIONS['exp-details'] = function (id) { showBreakdown(EXPENSES.find(function (e) { return e.id === id; })); };
function showBreakdown(e) {
  $('mb-title').textContent = e.label;
  $('mb-body').innerHTML = (e.summaryError ? '<div class="notice warn">Telnyx charges summary failed: ' + esc(e.summaryError) + '. The amount below only includes call and text usage.</div>' : '') +
    '<div class="card"><table><tbody>' + (e.breakdown || []).map(function (b) {
      return '<tr><td class="l wrap-cell">' + esc(b.name) + (b.detail && b.detail.length ? '<div class="muted small">' + b.detail.map(function (d) { return esc(d.name) + ': ' + money(d.amount); }).join(' · ') + '</div>' : '') + '</td><td class="strong">' + money(b.amount) + '</td></tr>';
    }).join('') + '</tbody><tfoot><tr><td class="l">Total</td><td>' + money(e.amount) + '</td></tr></tfoot></table></div>' +
    '<p class="muted small" style="margin-top:.75rem">Last pulled ' + (e.syncedAt ? new Date(e.syncedAt).toLocaleString('en-US') : '—') + '. ' + esc(e.notes || '') + '</p>';
  $('mb-resync').onclick = function () { pullTelnyxExpense(e.id.replace('telnyx_', '')); };
  openModal('m-breakdown');
}
async function pullTelnyxExpense(month) {
  month = month || $('ex-month').value;
  await run(null, async function () {
    var e = await api('POST', '/expenses/telnyx-sync', { month: month });
    toast('Telnyx ' + monthName(month) + ': ' + money(e.amount)); await loadExpenses(); showBreakdown(e);
  });
}
function toggleExpenseFields() {
  var f = $('me-freq').value;
  $('me-every-wrap').classList.toggle('hidden', f !== 'custom');
  $('me-end-wrap').classList.toggle('hidden', f === 'once');
  $('me-start-label').textContent = f === 'once' ? 'Date' : 'First charge';
}
function openExpenseModal(e) {
  $('me-title').textContent = e ? 'Edit expense' : 'Add expense';
  $('me-id').value = e ? e.id : '';
  $('me-label').value = e ? e.label : ''; $('me-amount').value = e ? e.amount : '';
  $('me-freq').value = e ? e.frequency : 'once'; $('me-category').value = e ? (e.category || '') : '';
  $('me-every').value = e && e.everyMonths ? e.everyMonths : 2;
  var m = $('ex-month').value;
  $('me-start').value = e ? e.startDate : (m === today().slice(0, 7) ? today() : m + '-01');
  $('me-end').value = e && e.endDate ? e.endDate : ''; $('me-notes').value = e ? (e.notes || '') : '';
  toggleExpenseFields(); openModal('m-expense');
}
async function saveExpense() {
  var id = $('me-id').value, f = $('me-freq').value;
  var body = { label: $('me-label').value.trim(), amount: num($('me-amount').value), frequency: f, category: $('me-category').value.trim(), startDate: $('me-start').value, endDate: f === 'once' ? null : ($('me-end').value || null), everyMonths: num($('me-every').value) || 1, notes: $('me-notes').value.trim() };
  if (!body.label) return toast('Give the expense a name.', true);
  if ($('me-amount').value.trim() === '') return toast('Add the amount.', true);
  if (!body.startDate) return toast('Pick the date.', true);
  await run(null, async function () {
    if (id) await api('PATCH', '/expenses/' + encodeURIComponent(id), body); else await api('POST', '/expenses', body);
    closeModal('m-expense'); loadExpenses(); toast('Expense saved');
  });
}

/* ── clients ─────────────────────────────────────────────────────────────── */
async function loadClients() { CLIENTS = await api('GET', '/clients'); fillClientSelects(); renderClients(); }
function renderClients() {
  var q = ($('cl-search').value || '').toLowerCase();
  var list = CLIENTS.filter(function (c) { return !q || (c.name + ' ' + c.business + ' ' + (c.numbers || []).join(' ')).toLowerCase().indexOf(q) >= 0; });
  $('cl-body').innerHTML = list.length ? list.map(function (c) {
    return '<tr><td class="l strong">' + esc(c.name) + '</td><td class="l muted">' + esc(c.business || '—') + '</td><td class="l wrap-cell">' + ((c.numbers || []).map(function (n) { return '<span class="pill pill-num">' + esc(n) + '</span>'; }).join(' ') || '<span class="muted">none</span>') + '</td><td class="l wrap-cell muted small">' + esc((c.aliases || []).join(', ') || '—') + '</td><td>$' + Number(c.rateMin || 0).toFixed(3) + '</td><td>$' + Number(c.rateSms || 0).toFixed(3) + '</td><td class="actions"><button class="btn btn-ghost btn-sm" ' + act('client-edit', c.id) + '>Edit</button><button class="btn btn-ghost btn-sm" ' + act('client-del', c.id) + '>Delete</button></td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="7">No clients match.</td></tr>';
}
function addListRow(containerId, placeholder, val) {
  var div = document.createElement('div'); div.className = 'list-row';
  div.innerHTML = '<input placeholder="' + esc(placeholder) + '" value="' + esc(val || '') + '"/><button class="rm" type="button" aria-label="Remove">✕</button>';
  div.querySelector('.rm').onclick = function () { div.remove(); };
  $(containerId).appendChild(div);
}
function openClientModal(c) {
  $('mc-title').textContent = c ? 'Edit client' : 'Add client';
  $('mc-id').value = c ? c.id : ''; $('mc-name').value = c ? c.name : ''; $('mc-business').value = c ? (c.business || '') : '';
  $('mc-aliases').value = c ? (c.aliases || []).join(', ') : '';
<<<<<<< HEAD
  $('mc-billing').value = c ? (c.billingContact || '') : '';
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  $('mc-ratemin').value = c ? c.rateMin : SETTINGS.defaultRateMin; $('mc-ratesms').value = c ? c.rateSms : SETTINGS.defaultRateSms;
  $('mc-notes').value = c ? (c.notes || '') : ''; $('mc-numbers').innerHTML = '';
  ((c && c.numbers && c.numbers.length) ? c.numbers : ['']).forEach(function (n) { addListRow('mc-numbers', '+1702…', n); });
  openModal('m-client');
}
ACTIONS['client-edit'] = function (id) { openClientModal(CLIENTS.find(function (c) { return c.id === id; })); };
ACTIONS['client-del'] = async function (id) {
  if (!confirm('Delete this client? Its call history stays.')) return;
  await run(null, async function () { await api('DELETE', '/clients/' + encodeURIComponent(id)); loadClients(); });
};
async function saveClient() {
  var id = $('mc-id').value;
<<<<<<< HEAD
  var body = { name: $('mc-name').value.trim(), business: $('mc-business').value.trim(), aliases: $('mc-aliases').value, billingContact: $('mc-billing').value.trim(), notes: $('mc-notes').value.trim(), rateMin: num($('mc-ratemin').value), rateSms: num($('mc-ratesms').value), numbers: [].slice.call(document.querySelectorAll('#mc-numbers input')).map(function (i) { return i.value.trim(); }).filter(Boolean) };
=======
  var body = { name: $('mc-name').value.trim(), business: $('mc-business').value.trim(), aliases: $('mc-aliases').value, notes: $('mc-notes').value.trim(), rateMin: num($('mc-ratemin').value), rateSms: num($('mc-ratesms').value), numbers: [].slice.call(document.querySelectorAll('#mc-numbers input')).map(function (i) { return i.value.trim(); }).filter(Boolean) };
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  if (!body.name) return toast('Add the client name.', true);
  await run(null, async function () {
    if (id) await api('PATCH', '/clients/' + encodeURIComponent(id), body); else await api('POST', '/clients', body);
    closeModal('m-client'); loadClients(); toast('Client saved');
  });
}

/* ── settings ────────────────────────────────────────────────────────────── */
async function loadSettingsPage() {
  var r = await Promise.all([api('GET', '/settings'), api('GET', '/agents')]);
  SETTINGS = r[0]; AGENTS = r[1];
  var s = SETTINGS, co = s.company || {}, bt = s.billTo || {}, rt = s.rates || {};
  $('st-co-name').value = co.name || ''; $('st-co-address').value = co.address || ''; $('st-co-email').value = co.email || ''; $('st-co-phone').value = co.phone || '';
  $('st-bt-name').value = bt.name || ''; $('st-bt-contact').value = bt.contact || ''; $('st-next-inv').value = s.nextInvoiceNumber || '';
  $('st-terms').value = s.paymentTerms || '';
  $('st-r-mgr').value = rt.managerHourly; $('st-r-agent').value = rt.agentHourly; $('st-r-abonus').value = rt.agentBonusPct; $('st-r-mbonus').value = rt.managerBonusPct;
  $('st-r-ovr').value = rt.overrideHourly; $('st-r-sovr').value = rt.salesOverridePct; $('st-cycle').value = s.cycle || 'semimonthly';
  $('st-rmin').value = s.defaultRateMin; $('st-rsms').value = s.defaultRateSms;
<<<<<<< HEAD
  $('st-r-minmult').value = rt.minSalesMultiple != null ? rt.minSalesMultiple : 1; $('st-basis').value = s.rebillBasis || 'time';
  $('st-brand-ai').value = (s.brands || {}).ai || ''; $('st-brand-cc').value = (s.brands || {}).callCenter || '';
  loadLines();
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  $('st-annot').checked = s.annotationsEnabled !== false;
  renderAgents();
  $('st-telnyx').innerHTML = STATUS.telnyx ? '<span class="pill pill-good">Key set</span> ' + (STATUS.lastCollected ? 'Calls pulled through ' + fmtDateY(STATUS.lastCollected) + '.' : 'No calls pulled yet.') : '<span class="pill pill-warn">Not connected</span> Add TELNYX_API_KEY in Railway, then redeploy.';
  $('st-cartvip').innerHTML = STATUS.cartvip ? '<span class="pill pill-good">Key set</span>' : '<span class="pill pill-warn">Not connected</span> Add CARTVIP_API_KEY in Railway, then redeploy.';
  loadJobs();
}
function renderAgents() {
  var rt = SETTINGS.rates || {};
  $('st-agents').innerHTML = AGENTS.slice().sort(function (a, b) { return (a.role === b.role ? 0 : a.role === 'manager' ? -1 : 1); }).map(function (a) {
    var rate = a.payRate != null ? money(a.payRate) : '<span class="muted">' + money(a.role === 'manager' ? rt.managerHourly : rt.agentHourly) + ' default</span>';
    return '<tr><td class="l strong">' + esc(a.name) + '</td><td class="l">' + (a.role === 'manager' ? 'Manager' : 'Agent') + '</td><td>' + rate + '</td><td class="l muted small">' + esc((a.aliases || []).join(', ') || '—') + '</td><td class="l">' + (a.active === false ? '<span class="pill">Inactive</span>' : '<span class="pill pill-good">Active</span>') + '</td><td class="actions"><button class="btn btn-ghost btn-sm" ' + act('agent-edit', a.id) + '>Edit</button></td></tr>';
  }).join('');
}
async function saveSettings() {
  var body = {
    company: { name: $('st-co-name').value, address: $('st-co-address').value, email: $('st-co-email').value, phone: $('st-co-phone').value },
    billTo: { name: $('st-bt-name').value, contact: $('st-bt-contact').value },
    paymentTerms: $('st-terms').value, nextInvoiceNumber: num($('st-next-inv').value),
<<<<<<< HEAD
    rates: { managerHourly: num($('st-r-mgr').value), agentHourly: num($('st-r-agent').value), agentBonusPct: num($('st-r-abonus').value), managerBonusPct: num($('st-r-mbonus').value), overrideHourly: num($('st-r-ovr').value), salesOverridePct: num($('st-r-sovr').value), minSalesMultiple: num($('st-r-minmult').value) },
    rebillBasis: $('st-basis').value, brands: { ai: $('st-brand-ai').value.trim() || 'AI Receptionist', callCenter: $('st-brand-cc').value.trim() || 'ClubLifter' },
=======
    rates: { managerHourly: num($('st-r-mgr').value), agentHourly: num($('st-r-agent').value), agentBonusPct: num($('st-r-abonus').value), managerBonusPct: num($('st-r-mbonus').value), overrideHourly: num($('st-r-ovr').value), salesOverridePct: num($('st-r-sovr').value) },
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
    cycle: $('st-cycle').value, defaultRateMin: num($('st-rmin').value), defaultRateSms: num($('st-rsms').value),
  };
  var cycleChanged = body.cycle !== SETTINGS.cycle;
  await run(null, async function () {
    SETTINGS = await api('PATCH', '/settings', body);
    if (cycleChanged) { PERIODS = await api('GET', '/periods'); PERIOD_ID = PERIODS[0] && PERIODS[0].id; fillPeriodSelects(); }
    toast('Settings saved');
  });
}
async function toggleAnnotations(on) {
  await run(null, async function () { SETTINGS = await api('PATCH', '/settings', { annotationsEnabled: on }); if (window.WVAnnotate) window.WVAnnotate.setEnabled(on); });
}
function openAgentModal(a) {
  $('ma-title').textContent = a ? 'Edit agent' : 'Add agent';
  $('ma-id').value = a ? a.id : ''; $('ma-name').value = a ? a.name : ''; $('ma-role').value = a ? a.role : 'agent';
  $('ma-rate').value = a && a.payRate != null ? a.payRate : ''; $('ma-active').value = a && a.active === false ? '0' : '1';
  $('ma-aliases').value = a ? (a.aliases || []).join(', ') : '';
  openModal('m-agent');
}
ACTIONS['agent-edit'] = function (id) { openAgentModal(AGENTS.find(function (a) { return a.id === id; })); };
async function saveAgent() {
  var id = $('ma-id').value;
  var body = { name: $('ma-name').value.trim(), role: $('ma-role').value, payRate: $('ma-rate').value.trim() === '' ? null : num($('ma-rate').value), active: $('ma-active').value === '1', aliases: $('ma-aliases').value };
  if (!body.name) return toast('Add the agent\'s name.', true);
  await run(null, async function () {
    if (id) await api('PATCH', '/agents/' + encodeURIComponent(id), body); else await api('POST', '/agents', body);
    AGENTS = await api('GET', '/agents'); renderAgents(); closeModal('m-agent'); toast('Agent saved');
  });
}
async function loadJobs() {
  var jobs = await api('GET', '/jobs');
  $('st-jobs').innerHTML = jobs.length ? jobs.map(function (j) {
    return '<li><span class="muted">' + new Date(j.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '</span><span><b class="' + (j.ok ? 'ok' : 'bad') + '">' + (j.ok ? '✓' : '✕') + '</b> ' + esc(j.job) + (j.detail ? ' — <span class="muted">' + esc(j.detail) + '</span>' : '') + '</span></li>';
  }).join('') : '<li><span></span><span class="muted">Nothing has run yet. The first automatic run is tonight at 11:59 PM Pacific.</span></li>';
}
<<<<<<< HEAD
var LINES = [];
async function loadLines() {
  var r = await Promise.all([api('GET', '/aloware/lines'), api('GET', '/aloware/status')]);
  LINES = r[0]; var st = r[1];
  var cname = function (id) { return (CLIENTS.find(function (c) { return c.id === id; }) || {}).name || '?'; };
  $('st-lines').innerHTML = LINES.length ? LINES.map(function (l) {
    return '<tr><td class="l strong">' + esc(l.name) + (l.auto ? ' <span class="pill pill-warn">New from Aloware</span>' : '') + '</td><td class="l small">' + (l.alowareLineId ? '#' + esc(l.alowareLineId) : '<span class="muted">—</span>') + (l.number ? ' <span class="pill pill-num">' + esc(l.number) + '</span>' : '') + '</td><td class="l small">' + ((l.clientIds || []).length ? l.clientIds.map(cname).map(esc).join(' + ') : '<span class="muted">Not billed to a venue</span>') + '</td><td class="l">' + (l.rebill === false ? '<span class="pill">No</span>' : '<span class="pill pill-good">Yes</span>') + '</td><td class="actions"><button class="btn btn-ghost btn-sm" ' + act('line-edit', l.id) + '>Edit</button></td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="5">No lines yet.</td></tr>';
  $('st-aloware').innerHTML = (st.configured ? '<span class="pill pill-good">Token set</span> ' : '<span class="pill pill-warn">Not connected</span> Add ALOWARE_WEBHOOK_TOKEN in Railway, then redeploy. ') +
    'Webhook URL: <b>' + esc(location.origin + '/hooks/aloware') + '</b><br>' + (st.lastReceivedAt ? 'Last call received ' + new Date(st.lastReceivedAt).toLocaleString('en-US') + ' · ' + intf(st.last7Days) + ' in the last 7 days.' : 'Nothing received yet.');
}
function openLineModal(l) {
  $('ml-title').textContent = l ? 'Edit line' : 'Add line';
  $('ml-id').value = l ? l.id : ''; $('ml-name').value = l ? l.name : '';
  $('ml-alo').value = l && l.alowareLineId ? l.alowareLineId : ''; $('ml-number').value = l ? (l.number || '') : '';
  $('ml-rebill').checked = !l || l.rebill !== false;
  var picked = l ? (l.clientIds || []) : [];
  $('ml-clients').innerHTML = CLIENTS.map(function (c) { return '<label class="check"><input type="checkbox" value="' + esc(c.id) + '"' + (picked.indexOf(c.id) >= 0 ? ' checked' : '') + '/> ' + esc(c.name) + '</label>'; }).join('');
  $('ml-delete').classList.toggle('hidden', !l);
  openModal('m-line');
}
ACTIONS['line-edit'] = function (id) { openLineModal(LINES.find(function (l) { return l.id === id; })); };
async function saveLine() {
  var id = $('ml-id').value;
  var body = { name: $('ml-name').value.trim(), alowareLineId: $('ml-alo').value.trim(), number: $('ml-number').value.trim(), rebill: $('ml-rebill').checked, clientIds: [].slice.call(document.querySelectorAll('#ml-clients input:checked')).map(function (i) { return i.value; }) };
  if (!body.name) return toast('Give the line a name.', true);
  await run(null, async function () {
    if (id) await api('PATCH', '/aloware/lines/' + encodeURIComponent(id), body); else await api('POST', '/aloware/lines', body);
    closeModal('m-line'); loadLines(); toast('Line saved');
  });
}
async function deleteLine() {
  if (!confirm('Delete this line? Its calls stop counting in the rebill until a line with the same Aloware ID or number exists again.')) return;
  await run(null, async function () { await api('DELETE', '/aloware/lines/' + encodeURIComponent($('ml-id').value)); closeModal('m-line'); loadLines(); });
}
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
function showInfo(title, html) { $('mi-title').textContent = title; $('mi-body').innerHTML = html; openModal('m-info'); }
async function testTelnyx() {
  await run(event && event.target, async function () {
    var r = await api('POST', '/integrations/telnyx/test');
    showInfo('Telnyx is connected', '<dl class="kv"><dt>Balance</dt><dd>' + esc(r.balance) + ' ' + esc(r.currency || '') + '</dd><dt>Available credit</dt><dd>' + esc(r.availableCredit || '—') + '</dd></dl>');
  });
}
async function probeTelnyx() {
  await run(event && event.target, async function () {
    var r = await api('GET', '/integrations/telnyx/probe');
    showInfo('Sample Telnyx call records', '<p class="small muted" style="margin-bottom:.6rem">' + esc(r.recordType) + ' records since ' + esc(r.from) + ': ' + esc(r.totalResults) + ' found. Fields: ' + esc(r.fields.join(', ') || 'none') + '</p><pre class="code">' + esc(JSON.stringify(r.sample, null, 2)) + '</pre>');
  });
}
async function testCartvip() {
  await run(event && event.target, async function () {
    var r = await api('POST', '/integrations/cartvip/test');
    showInfo('CartVIP is connected', '<p class="small">' + r.salesLast7Days + ' sales in the last 7 days.</p><p class="small muted" style="margin-top:.5rem">Fields: ' + esc(r.fields.join(', ') || 'none') + '</p>');
  });
}
async function runMonthEnd() {
  var m = today().slice(0, 7);
  if (!confirm('Pull the Telnyx expense for ' + monthName(m) + ' now? It updates again automatically at month end.')) return;
  await run(event && event.target, async function () { var r = await api('POST', '/jobs/month-end', { month: m }); toast(r.telnyx ? 'Telnyx ' + monthName(m) + ': ' + money(r.telnyx.amount) : (r.skipped || 'Done')); loadJobs(); });
}

/* ── boot ────────────────────────────────────────────────────────────────── */
(async function () {
  if (!TOKEN) return showLogin();
  try { ME = await api('GET', '/me'); enterApp(); } catch (e) { /* showLogin already ran */ }
})();
