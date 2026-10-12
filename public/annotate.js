/* Feedback toolbar for the build phase: draw, arrows, boxes, text notes and comment pins.
   Everything is saved on the server per tab, so João sees what Jenna marked (and the reverse). */
(function () {
  var CSS = `
  #annot-svg{position:absolute;top:0;left:0;z-index:22;pointer-events:none;overflow:visible}
  #annot-svg.drawing{pointer-events:all;cursor:crosshair}
  #annot-svg.erasing .ann-shape{pointer-events:visiblePainted;cursor:pointer}
  #annot-svg.erasing .ann-shape:hover{opacity:.45}
  #annot-svg.hidden-layer,#annot-pins.hidden-layer{display:none}
  #annot-pins{position:absolute;top:0;left:0;width:0;height:0;z-index:23}
  .annot-pin{position:absolute;transform:translate(-50%,-100%);width:28px;height:28px;border-radius:14px 14px 14px 2px;color:#fff;font:700 12px/28px var(--font,system-ui);text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;border:2px solid #fff;padding:0}
  .annot-pin:focus-visible{outline:2px solid #161616;outline-offset:2px}
  #annot-root{position:fixed;right:12px;top:50%;transform:translateY(-50%);z-index:150;display:flex;align-items:center;gap:8px;font-family:var(--font,system-ui)}
  #annot-root.off{display:none}
  .annot-bar{background:#161616;border-radius:14px;padding:6px;display:flex;flex-direction:column;gap:2px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
  .annot-bar button{width:36px;height:36px;border:none;border-radius:9px;background:none;color:#cfcfcf;display:flex;align-items:center;justify-content:center;position:relative;padding:0}
  .annot-bar button:hover{background:#2b2b2b;color:#fff}
  .annot-bar button.on{background:#EC2229;color:#fff}
  .annot-bar button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
  .annot-bar .sep{height:1px;background:#333;margin:4px 6px}
  .annot-bar .sw{width:36px;height:22px}
  .annot-bar .sw i{width:14px;height:14px;border-radius:50%;display:block;box-shadow:0 0 0 1.5px #5a5a5a}
  .annot-bar .sw.on{background:none}
  .annot-bar .sw.on i{box-shadow:0 0 0 2px #161616,0 0 0 3.5px #fff}
  .annot-badge{position:absolute;top:2px;right:2px;min-width:15px;height:15px;border-radius:8px;background:#EC2229;color:#fff;font-size:10px;font-weight:700;line-height:15px;padding:0 3px}
  .annot-tab{background:#161616;color:#fff;border:none;border-radius:10px;padding:10px 8px;writing-mode:vertical-rl;font-size:12px;font-weight:600;letter-spacing:.02em;box-shadow:0 8px 24px rgba(0,0,0,.25)}
  .annot-hint{position:fixed;left:50%;top:64px;transform:translateX(-50%);background:#161616;color:#fff;font:500 12.5px/1 var(--font,system-ui);padding:8px 12px;border-radius:8px;z-index:151;pointer-events:none;opacity:.92}
  .annot-card{position:absolute;z-index:160;width:280px;background:#fff;border:1px solid #d5d5d0;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.2);padding:12px;font:13px/1.45 var(--font,system-ui);color:#161616}
  .annot-card textarea,.annot-card input{width:100%;border:1px solid #cfcfcb;border-radius:8px;padding:7px 9px;font:inherit;resize:vertical}
  .annot-card textarea:focus,.annot-card input:focus{outline:none;border-color:#161616}
  .annot-card .meta{font-size:11.5px;color:#7c7c7c;margin-bottom:4px}
  .annot-card .body{white-space:pre-wrap;margin-bottom:8px}
  .annot-card .reply{border-top:1px solid #eee;padding-top:6px;margin-top:6px}
  .annot-card .row{display:flex;gap:6px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap}
  .annot-card button{border:1px solid #cfcfcb;background:#fff;border-radius:7px;padding:5px 10px;font:600 12px var(--font,system-ui);cursor:pointer}
  .annot-card button.primary{background:#161616;border-color:#161616;color:#fff}
  .annot-card button.left{margin-right:auto}
  .annot-drawer{position:fixed;right:64px;top:50%;transform:translateY(-50%);width:320px;max-height:70vh;overflow:auto;background:#fff;border:1px solid #d5d5d0;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.2);z-index:155;font:13px/1.45 var(--font,system-ui)}
  .annot-drawer h4{font-size:13px;padding:12px 14px 6px;display:flex;justify-content:space-between;align-items:center}
  .annot-drawer h4 label{font-weight:500;font-size:12px;color:#7c7c7c;display:flex;gap:4px;align-items:center}
  .annot-drawer .item{display:block;width:100%;text-align:left;border:none;background:none;padding:9px 14px;border-top:1px solid #eee;cursor:pointer;font:inherit;color:inherit}
  .annot-drawer .item:hover{background:#f6f6f3}
  .annot-drawer .item .meta{font-size:11.5px;color:#7c7c7c}
  .annot-drawer .item.done{opacity:.55}
  .annot-drawer .none{padding:10px 14px 14px;color:#7c7c7c}
  @media print{#annot-svg,#annot-pins,#annot-root,.annot-card,.annot-drawer,.annot-hint{display:none!important}}
  @media (max-width:640px){#annot-root{top:auto;bottom:12px;transform:none}.annot-drawer{right:12px;left:12px;width:auto;top:auto;bottom:70px;transform:none}}
  `;
  var ICON = {
    pointer: '<path d="M5 3l13 7-5.5 1.8L10.7 17z"/>',
    pen: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
    arrow: '<path d="M5 19L19 5"/><path d="M10 5h9v9"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="2"/>',
    text: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    comment: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
    eraser: '<path d="M7 20h13"/><path d="M4.5 15.5l9-9 6 6-6.5 6.5H8z"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    close: '<path d="M9 6l6 6-6 6"/>',
  };
  var COLORS = ['#EC2229', '#2563EB', '#16A34A', '#F59E0B', '#161616'];
  var PAGE_NAMES = { overview: 'Overview', callcenter: 'Call center', sales: 'Sales', calls: 'Calls', billing: 'Receptionist billing', expenses: 'Expenses', clients: 'Clients', settings: 'Settings' };
  var NS = 'http://www.w3.org/2000/svg';

  var state = { enabled: false, page: 'overview', tool: 'pointer', color: COLORS[0], visible: true, all: [], mine: [], collapsed: false, showResolved: false, user: null };
  var svg, pins, root, bar, hintEl, card, drawer, draft = null, pollTimer;

  function api(m, p, b) { return window.wvApi(m, p, b); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function originX() { var w = document.querySelector('.wrap'); return w ? w.getBoundingClientRect().left + window.scrollX : 0; }
  function toLocal(ev) { return { x: ev.pageX - originX(), y: ev.pageY }; }
  function ago(iso) { var d = new Date(iso); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

  function build() {
    var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    svg = el('svg', { id: 'annot-svg' }); document.body.appendChild(svg);
    pins = document.createElement('div'); pins.id = 'annot-pins'; document.body.appendChild(pins);
    root = document.createElement('div'); root.id = 'annot-root'; root.className = 'off'; document.body.appendChild(root);
    renderBar();

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('click', function (e) {
      if (state.tool !== 'eraser') return;
      var shape = e.target.closest('.ann-shape'); if (shape) remove(shape.dataset.id);
    });
    document.addEventListener('keydown', function (e) {
      if (!state.enabled) return;
      if (e.key === 'Escape') { closeCard(); setTool('pointer'); }
    });
    window.addEventListener('wv:page', function (e) { state.page = e.detail; closeCard(); render(); });
    window.addEventListener('resize', render);
    new ResizeObserver(function () { render(); }).observe(document.getElementById('app') || document.body);
  }

  function btn(name, title, extra) {
    return '<button type="button" data-tool="' + name + '" title="' + title + '" aria-label="' + title + '"' + (extra || '') + '><svg viewBox="0 0 24 24">' + ICON[name] + '</svg></button>';
  }
  function renderBar() {
    if (state.collapsed) {
      root.innerHTML = '<button class="annot-tab" type="button" title="Open the feedback toolbar">Feedback</button>';
      root.firstChild.onclick = function () { state.collapsed = false; renderBar(); };
      return;
    }
    var open = state.all.filter(function (a) { return a.kind === 'comment' && !a.resolved; }).length;
    root.innerHTML = '<div class="annot-bar" role="toolbar" aria-label="Feedback tools">' +
      btn('pointer', 'Use the dashboard normally (Esc)') + btn('pen', 'Draw') + btn('arrow', 'Arrow') + btn('rect', 'Highlight box') +
      btn('text', 'Text note') + btn('comment', 'Comment pin') + btn('eraser', 'Erase a drawing') +
      '<div class="sep"></div>' +
      COLORS.map(function (c) { return '<button type="button" class="sw' + (c === state.color ? ' on' : '') + '" data-color="' + c + '" title="Color" aria-label="Color ' + c + '"><i style="background:' + c + '"></i></button>'; }).join('') +
      '<div class="sep"></div>' +
      btn('undo', 'Undo my last mark') + btn('trash', 'Clear drawings on this tab') + btn('eye', state.visible ? 'Hide marks' : 'Show marks') +
      '<button type="button" data-tool="list" title="All comments" aria-label="All comments"><svg viewBox="0 0 24 24">' + ICON.list + '</svg>' + (open ? '<span class="annot-badge">' + open + '</span>' : '') + '</button>' +
      btn('close', 'Collapse toolbar') + '</div>';
    root.querySelectorAll('[data-tool]').forEach(function (b) {
      var t = b.dataset.tool;
      if (t === state.tool) b.classList.add('on');
      if (t === 'eye' && !state.visible) b.classList.add('on');
      if (t === 'list' && drawer) b.classList.add('on');
      b.onclick = function () { onToolButton(t); };
    });
    root.querySelectorAll('[data-color]').forEach(function (b) { b.onclick = function () { state.color = b.dataset.color; renderBar(); }; });
  }
  function onToolButton(t) {
    if (t === 'undo') return undo();
    if (t === 'trash') return clearPage();
    if (t === 'eye') { state.visible = !state.visible; render(); return renderBar(); }
    if (t === 'list') return toggleDrawer();
    if (t === 'close') { setTool('pointer'); closeDrawer(); state.collapsed = true; return renderBar(); }
    setTool(state.tool === t ? 'pointer' : t);
  }
  var HINTS = { pen: 'Drag to draw', arrow: 'Drag from the tail to the point', rect: 'Drag to box an area', text: 'Click where the note goes', comment: 'Click where the comment goes', eraser: 'Click a drawing to erase it' };
  function setTool(t) {
    state.tool = t; closeCard();
    if (t !== 'pointer' && !state.visible) { state.visible = true; render(); }
    svg.classList.toggle('drawing', ['pen', 'arrow', 'rect', 'text', 'comment'].indexOf(t) >= 0);
    svg.classList.toggle('erasing', t === 'eraser');
    if (hintEl) { hintEl.remove(); hintEl = null; }
    if (HINTS[t]) { hintEl = document.createElement('div'); hintEl.className = 'annot-hint'; hintEl.textContent = HINTS[t] + ' · Esc to stop'; document.body.appendChild(hintEl); }
    renderBar();
  }

  // ── drawing ────────────────────────────────────────────────────────────────
  function onDown(e) {
    if (e.button !== 0) return;
    var p = toLocal(e);
    if (state.tool === 'text' || state.tool === 'comment') { e.preventDefault(); return openComposer(state.tool, p); }
    if (['pen', 'arrow', 'rect'].indexOf(state.tool) < 0) return;
    e.preventDefault(); svg.setPointerCapture(e.pointerId);
    draft = { kind: state.tool, color: state.color, start: p, points: [[p.x, p.y]], node: null };
  }
  function onMove(e) {
    if (!draft) return;
    var p = toLocal(e);
    if (draft.kind === 'pen') {
      var last = draft.points[draft.points.length - 1];
      if (Math.hypot(p.x - last[0], p.y - last[1]) > 2) draft.points.push([Math.round(p.x), Math.round(p.y)]);
      draft.data = { points: draft.points };
    } else if (draft.kind === 'arrow') draft.data = { x1: draft.start.x, y1: draft.start.y, x2: p.x, y2: p.y };
    else draft.data = { x: Math.min(draft.start.x, p.x), y: Math.min(draft.start.y, p.y), w: Math.abs(p.x - draft.start.x), h: Math.abs(p.y - draft.start.y) };
    if (draft.node) draft.node.remove();
    draft.node = shapeNode({ kind: draft.kind, color: draft.color, data: draft.data, id: 'draft' }, originX());
    svg.appendChild(draft.node);
  }
  async function onUp() {
    if (!draft) return;
    var d = draft; draft = null;
    if (d.node) d.node.remove();
    if (!d.data) return;
    if (d.kind === 'arrow' && Math.hypot(d.data.x2 - d.data.x1, d.data.y2 - d.data.y1) < 8) return;
    if (d.kind === 'rect' && (d.data.w < 6 || d.data.h < 6)) return;
    if (d.kind === 'pen' && d.points.length < 2) return;
    await save({ kind: d.kind, color: d.color, data: d.data });
  }

  async function save(a) {
    try {
      var saved = await api('POST', '/annotations', Object.assign({ page: state.page }, a));
      state.all.push(saved); state.mine.push(saved.id); render(); renderBar();
      return saved;
    } catch (e) { alert('Could not save the mark: ' + e.message); }
  }
  async function remove(id) {
    try { await api('DELETE', '/annotations/' + id); } catch (e) { return alert(e.message); }
    state.all = state.all.filter(function (a) { return a.id !== id; });
    state.mine = state.mine.filter(function (x) { return x !== id; });
    render(); renderBar(); if (drawer) renderDrawer();
  }
  function undo() { var id = state.mine.pop(); if (id) remove(id); }
  async function clearPage() {
    var n = state.all.filter(function (a) { return a.page === state.page && a.kind !== 'comment'; }).length;
    if (!n) return;
    if (!confirm('Erase all ' + n + ' drawings on the ' + (PAGE_NAMES[state.page] || state.page) + ' tab? Comments stay.')) return;
    try { await api('DELETE', '/annotations?page=' + state.page); } catch (e) { return alert(e.message); }
    state.all = state.all.filter(function (a) { return a.page !== state.page || a.kind === 'comment'; });
    render();
  }

  // ── rendering ──────────────────────────────────────────────────────────────
  // Size to the app content (not the document), so the layer never props the page open.
  function sizeSvg() {
    var app = document.getElementById('app');
    var h = Math.max(app ? app.getBoundingClientRect().bottom + window.scrollY : 0, window.innerHeight);
    svg.setAttribute('width', document.documentElement.clientWidth); svg.setAttribute('height', Math.ceil(h));
  }
  function markerFor(color) {
    var id = 'ah' + color.replace('#', '');
    if (!svg.querySelector('#' + id)) {
      var defs = svg.querySelector('defs') || svg.insertBefore(el('defs', {}), svg.firstChild);
      var m = el('marker', { id: id, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse' });
      m.appendChild(el('path', { d: 'M0 0L10 5L0 10z', fill: color }));
      defs.appendChild(m);
    }
    return 'url(#' + id + ')';
  }
  function shapeNode(a, ox) {
    var d = a.data, g;
    if (a.kind === 'pen') {
      g = el('polyline', { points: d.points.map(function (p) { return (p[0] + ox) + ',' + p[1]; }).join(' '), fill: 'none', stroke: a.color, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    } else if (a.kind === 'arrow') {
      g = el('line', { x1: d.x1 + ox, y1: d.y1, x2: d.x2 + ox, y2: d.y2, stroke: a.color, 'stroke-width': 3.5, 'stroke-linecap': 'round', 'marker-end': markerFor(a.color) });
    } else if (a.kind === 'rect') {
      g = el('rect', { x: d.x + ox, y: d.y, width: d.w, height: d.h, rx: 6, fill: a.color, 'fill-opacity': 0.08, stroke: a.color, 'stroke-width': 2.5 });
    } else if (a.kind === 'text') {
      g = el('g', {});
      var lines = String(a.text).split('\n');
      var t = el('text', { x: d.x + ox, y: d.y, fill: a.color, 'font-size': 15, 'font-weight': 700, 'font-family': 'Public Sans, system-ui, sans-serif', stroke: '#fff', 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round' });
      lines.forEach(function (ln, i) { var s = el('tspan', { x: d.x + ox, dy: i ? 19 : 0 }); s.textContent = ln; t.appendChild(s); });
      g.appendChild(t);
    }
    if (g) { g.classList.add('ann-shape'); g.dataset.id = a.id; var title = el('title', {}); title.textContent = 'By ' + (a.author || '') + ' · ' + (a.createdAt ? ago(a.createdAt) : ''); g.appendChild(title); }
    return g;
  }
  function render() {
    if (!svg) return;
    sizeSvg();
    svg.querySelectorAll('.ann-shape').forEach(function (n) { if (n.dataset.id !== 'draft') n.remove(); });
    pins.innerHTML = '';
    var on = state.enabled && state.visible;
    svg.classList.toggle('hidden-layer', !on); pins.classList.toggle('hidden-layer', !on);
    if (!on) return;
    var ox = originX();
    var here = state.all.filter(function (a) { return a.page === state.page; });
    here.filter(function (a) { return a.kind !== 'comment'; }).forEach(function (a) { var n = shapeNode(a, ox); if (n) svg.appendChild(n); });
    commentsOn(state.page).forEach(function (a, i) {
      if (a.resolved && !state.showResolved) return;
      var b = document.createElement('button');
      b.className = 'annot-pin'; b.type = 'button'; b.textContent = a.number;
      b.style.left = (a.data.x + ox) + 'px'; b.style.top = a.data.y + 'px';
      b.style.background = a.resolved ? '#9a9a9a' : a.color;
      b.title = (a.author || '') + ': ' + a.text;
      b.onclick = function (ev) { ev.stopPropagation(); openThread(a); };
      pins.appendChild(b);
    });
  }
  function commentsOn(page) {
    return state.all.filter(function (a) { return a.page === page && a.kind === 'comment'; })
      .sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt); })
      .map(function (a, i) { a.number = i + 1; return a; });
  }

  // ── text + comment cards ───────────────────────────────────────────────────
  function closeCard() { if (card) { card.remove(); card = null; } }
  function placeCard(x, y) {
    card.style.left = Math.min(x + originX() + 14, document.documentElement.scrollWidth - 300) + 'px';
    card.style.top = (y + 8) + 'px';
    document.body.appendChild(card);
  }
  function openComposer(kind, p) {
    closeCard();
    card = document.createElement('div'); card.className = 'annot-card';
    var isComment = kind === 'comment';
    card.innerHTML = '<div class="meta">' + (isComment ? 'New comment' : 'Text note') + ' on ' + esc(PAGE_NAMES[state.page] || state.page) + '</div>' +
      '<textarea rows="3" placeholder="' + (isComment ? 'What should change here?' : 'Type the note') + '"></textarea>' +
      '<div class="row"><button type="button" data-x="cancel">Cancel</button><button type="button" class="primary" data-x="save">' + (isComment ? 'Post comment' : 'Add note') + '</button></div>';
    placeCard(p.x, p.y);
    var ta = card.querySelector('textarea'); ta.focus();
    var submit = async function () {
      var text = ta.value.trim(); if (!text) return;
      closeCard();
      var saved = await save({ kind: kind, color: state.color, data: { x: Math.round(p.x), y: Math.round(p.y) }, text: text });
      if (saved && isComment) setTool('pointer');
    };
    card.querySelector('[data-x=save]').onclick = submit;
    card.querySelector('[data-x=cancel]').onclick = closeCard;
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !isComment)) { e.preventDefault(); submit(); } });
  }
  function openThread(a) {
    closeCard();
    card = document.createElement('div'); card.className = 'annot-card';
    card.innerHTML = '<div class="meta">#' + a.number + ' · ' + esc(a.author) + ' · ' + ago(a.createdAt) + (a.resolved ? ' · resolved' : '') + '</div>' +
      '<div class="body">' + esc(a.text) + '</div>' +
      (a.replies || []).map(function (r) { return '<div class="reply"><div class="meta">' + esc(r.author) + ' · ' + ago(r.at) + '</div><div class="body">' + esc(r.text) + '</div></div>'; }).join('') +
      '<input placeholder="Reply"/>' +
      '<div class="row"><button type="button" class="left" data-x="del">Delete</button><button type="button" data-x="res">' + (a.resolved ? 'Reopen' : 'Resolve') + '</button><button type="button" class="primary" data-x="reply">Reply</button></div>';
    placeCard(a.data.x, a.data.y);
    var input = card.querySelector('input');
    var patch = async function (body) {
      try { var u = await api('PATCH', '/annotations/' + a.id, body); Object.assign(a, u); } catch (e) { return alert(e.message); }
      render(); renderBar(); if (drawer) renderDrawer();
    };
    card.querySelector('[data-x=reply]').onclick = async function () { var t = input.value.trim(); if (!t) return; await patch({ reply: t }); openThread(a); };
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') card.querySelector('[data-x=reply]').click(); });
    card.querySelector('[data-x=res]').onclick = async function () { await patch({ resolved: !a.resolved }); closeCard(); };
    card.querySelector('[data-x=del]').onclick = function () { if (confirm('Delete this comment and its replies?')) { closeCard(); remove(a.id); } };
  }
  document.addEventListener('mousedown', function (e) {
    if (card && !card.contains(e.target) && !e.target.closest('.annot-pin') && !e.target.closest('#annot-svg.drawing')) closeCard();
  });

  // ── comments drawer ────────────────────────────────────────────────────────
  function closeDrawer() { if (drawer) { drawer.remove(); drawer = null; } }
  function toggleDrawer() { if (drawer) closeDrawer(); else { drawer = document.createElement('div'); drawer.className = 'annot-drawer'; document.body.appendChild(drawer); renderDrawer(); } renderBar(); }
  function renderDrawer() {
    var pages = Object.keys(PAGE_NAMES);
    var html = '<h4>Comments <label><input type="checkbox"' + (state.showResolved ? ' checked' : '') + ' data-x="resolved"/> Show resolved</label></h4>';
    var any = false;
    pages.forEach(function (p) {
      var list = commentsOn(p).filter(function (a) { return state.showResolved || !a.resolved; });
      if (!list.length) return; any = true;
      html += list.map(function (a) {
        return '<button type="button" class="item' + (a.resolved ? ' done' : '') + '" data-id="' + a.id + '"><div class="meta">' + esc(PAGE_NAMES[p]) + ' #' + a.number + ' · ' + esc(a.author) + ' · ' + ago(a.createdAt) + (a.replies && a.replies.length ? ' · ' + a.replies.length + ' repl' + (a.replies.length > 1 ? 'ies' : 'y') : '') + '</div>' + esc(a.text.length > 120 ? a.text.slice(0, 120) + '…' : a.text) + '</button>';
      }).join('');
    });
    if (!any) html += '<div class="none">No open comments. Pick the comment tool and click anywhere on the page.</div>';
    drawer.innerHTML = html;
    drawer.querySelector('[data-x=resolved]').onchange = function (e) { state.showResolved = e.target.checked; renderDrawer(); render(); };
    drawer.querySelectorAll('.item').forEach(function (b) {
      b.onclick = function () {
        var a = state.all.find(function (x) { return x.id === b.dataset.id; }); if (!a) return;
        if (a.resolved) state.showResolved = true;
        var go = function () { window.scrollTo({ top: Math.max(0, a.data.y - 200), behavior: 'smooth' }); setTimeout(function () { render(); openThread(commentsOn(a.page).find(function (x) { return x.id === a.id; })); }, 350); };
        if (state.page !== a.page) { window.showPage(a.page); setTimeout(go, 400); } else go();
      };
    });
  }

  async function refresh() {
    try { state.all = await api('GET', '/annotations'); } catch (e) { return; }
    if (!draft) { render(); renderBar(); if (drawer) renderDrawer(); }
  }

  window.WVAnnotate = {
    init: function (opts) {
      if (!svg) build();
      state.user = opts.user;
      this.setEnabled(opts.enabled);
    },
    setEnabled: function (on) {
      if (!svg) return;
      state.enabled = !!on;
      root.className = on ? '' : 'off';
      if (!on) { setTool('pointer'); closeDrawer(); closeCard(); if (hintEl) { hintEl.remove(); hintEl = null; } }
      clearInterval(pollTimer);
      if (on) { refresh(); pollTimer = setInterval(refresh, 60000); }
      render();
    },
  };
})();
