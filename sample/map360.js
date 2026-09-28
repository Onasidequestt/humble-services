/* Humble 360 Map — one renderer for any owner-led business.
   Model (validate, totals, what-if, owner copy) runs in Node and the browser; the view needs a DOM.
   Input: one business.json (schema humble-360-map/1, see README.md). No dependencies. */
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.Map360 = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA = 'humble-360-map/1';
  const GROUPS = [
    { id: 'people', label: 'People', blurb: 'Wages, payroll taxes and benefits', list: true, work: true },
    { id: 'materials', label: 'Materials', blurb: 'What the work is made from: parts, supplies, subcontractors', list: true, work: true },
    { id: 'overhead', label: 'Overhead', blurb: 'The cost of keeping the doors open', list: true },
    { id: 'owner', label: 'Owner pay', blurb: 'Salary and draws paid to the owner' },
    { id: 'debt', label: 'Loan payments', blurb: 'Principal and interest on loans and leases' },
    { id: 'tax', label: 'Taxes', blurb: 'Income taxes paid by or for the business' },
    { id: 'profit', label: 'Profit kept', blurb: 'What is left after everyone has been paid' },
  ];
  const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
  const FLAGS = {
    fix_now: { label: 'Fix now', glyph: '!' },
    improve_next: { label: 'Improve next', glyph: '▲' },
    build_toward: { label: 'Build toward', glyph: '◆' },
  };
  const LENSES = { financial: 'Financial', operational: 'Operational', owner: 'Owner & organization', transferability: 'Transferability' };
  const LENS_GLOSS = { financial: 'Cash, margins and loans', operational: 'How the work gets done day to day', owner: 'How much runs through you', transferability: 'How easily it could be handed on or sold' };
  const LENS_WORDS = [null, 'At risk', 'Fragile', 'Workable', 'Solid', 'Strong'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ---------------- model ---------------- */
  const sum = (a, f) => (a || []).reduce((s, x) => s + (f ? f(x) : x), 0);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const amt = (o) => (o && typeof o.amount === 'number' ? o.amount : 0);
  // Month labels live beside the numbers they name; without them the months are unnamed calendar order.
  const monthLabels = (p) => (p.monthly && p.monthly.months) || MONTHS;

  function totals(p) {
    const g = {
      people: sum(p.people, amt), materials: sum(p.materials, amt), overhead: sum(p.overhead, amt),
      owner: amt(p.owner), debt: amt(p.debt), tax: amt(p.tax),
    };
    const rev = sum(p.revenue, amt);
    const spend = g.people + g.materials + g.overhead + g.owner + g.debt + g.tax;
    const profit = rev - spend;
    g.profit = Math.max(0, profit);
    return { rev, g, spend, profit, units: sum(p.revenue, (r) => r.units || 0), headcount: sum(p.people, (x) => x.headcount || 0) };
  }

  function nodeIds(p) {
    const ids = new Set(['core', 'owner', 'debt', 'tax', 'profit', 'people', 'materials', 'overhead', 'revenue']);
    for (const r of p.revenue || []) ids.add('revenue:' + r.id);
    for (const g of ['people', 'materials', 'overhead']) for (const x of p[g] || []) ids.add(g + ':' + x.id);
    return ids;
  }

  function validate(d) {
    const e = [];
    if (!d || typeof d !== 'object') return ['not an object'];
    if (d.schema !== SCHEMA) e.push(`schema must be "${SCHEMA}"`);
    if (typeof d.sample !== 'boolean') e.push('sample must be true or false');
    if (!d.business || !d.business.name) e.push('business.name is required');
    if (!d.output || !d.output.units) e.push('output.units is required (e.g. "jobs")');
    if (!Array.isArray(d.periods) || !d.periods.length) { e.push('periods must hold at least one snapshot'); return e; }
    const ok = (n) => Number.isInteger(n) && n >= 0;
    const pids = new Set();
    d.periods.forEach((p, i) => {
      const at = `periods[${i}]`;
      if (!p.id || pids.has(p.id)) e.push(`${at}.id missing or repeated`); pids.add(p.id);
      if (!p.label) e.push(`${at}.label is required`);
      if (!Array.isArray(p.revenue) || !p.revenue.length) e.push(`${at}.revenue needs at least one line`);
      for (const g of ['revenue', 'people', 'materials', 'overhead']) {
        const seen = new Set();
        for (const [j, x] of (p[g] || []).entries()) {
          if (!x.id || seen.has(x.id)) e.push(`${at}.${g}[${j}].id missing or repeated`); seen.add(x.id);
          if (!x.label) e.push(`${at}.${g}[${j}].label is required`);
          if (!ok(x.amount)) e.push(`${at}.${g}[${j}].amount must be whole dollars ≥ 0`);
          if (g === 'people' && !ok(x.headcount)) e.push(`${at}.people[${j}].headcount must be a whole number`);
          if (g === 'revenue' && x.units != null && !ok(x.units)) e.push(`${at}.revenue[${j}].units must be a whole number`);
        }
      }
      for (const g of ['owner', 'debt', 'tax']) if (p[g] != null && !ok(p[g].amount)) e.push(`${at}.${g}.amount must be whole dollars ≥ 0`);
      const t = totals(p);
      if (p.monthly) {
        for (const [k, want] of [['revenue', t.rev], ['spend', t.spend]]) {
          const a = p.monthly[k];
          if (!Array.isArray(a) || a.length !== 12) e.push(`${at}.monthly.${k} must have 12 numbers`);
          else if (Math.abs(sum(a) - want) > 12) e.push(`${at}.monthly.${k} sums to ${sum(a)}, period total is ${want}`);
        }
        if (p.monthly.months && p.monthly.months.length !== 12) e.push(`${at}.monthly.months must have 12 labels`);
      }
      if (p.months) e.push(`${at}.months belongs inside monthly (monthly.months), next to the numbers it names`);
    });
    const last = d.periods[d.periods.length - 1];
    if (d.business && totals(last).headcount !== d.business.headcount) e.push(`business.headcount is ${d.business && d.business.headcount} but people in "${last.label}" add up to ${totals(last).headcount}`);
    const all = new Set(); d.periods.forEach((p) => nodeIds(p).forEach((x) => all.add(x)));
    for (const [j, f] of (d.findings || []).entries()) {
      if (!FLAGS[f.flag]) e.push(`findings[${j}].flag must be fix_now, improve_next or build_toward`);
      if (!LENSES[f.lens]) e.push(`findings[${j}].lens must be financial, operational, owner or transferability`);
      if (!all.has(f.node)) e.push(`findings[${j}].node "${f.node}" is not on the map`);
      if (!f.title) e.push(`findings[${j}].title is required`);
    }
    for (const [k, v] of Object.entries(d.lenses || {})) {
      if (!LENSES[k]) e.push(`lenses.${k} is not a lens`);
      else if (v !== null && !(Number.isInteger(v) && v >= 1 && v <= 5)) e.push(`lenses.${k} must be 1–5 or null`);
    }
    for (const [j, n] of ((d.internal && d.internal.notes) || []).entries()) if (!all.has(n.node)) e.push(`internal.notes[${j}].node "${n.node}" is not on the map`);
    return e;
  }

  /* An owner copy is a new object with every consultant-only field REMOVED, so it can be embedded in a file the owner keeps. */
  function ownerCopy(d) {
    const c = clone(d);
    delete c.internal;
    const scrub = (o) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k === 'internal' || k === 'internal_note') delete o[k]; else scrub(o[k]); } };
    scrub(c);
    return c;
  }

  /* What-if: plain arithmetic on one period. Taxes are held at the period's figure (the view says so). */
  function whatIf(p, lv) {
    if (!lv) return p;
    const q = clone(p);
    const pr = 1 + (lv.price || 0) / 100, vo = 1 + (lv.volume || 0) / 100;
    const ma = 1 + (lv.materials || 0) / 100, ov = 1 + (lv.overhead || 0) / 100;
    for (const r of q.revenue) { r.amount = Math.round(r.amount * pr * vo); if (r.units != null) r.units = Math.round(r.units * vo); }
    for (const m of q.materials || []) m.amount = Math.round(m.amount * vo * ma);
    for (const o of q.overhead || []) o.amount = Math.round(o.amount * ov);
    if (lv.hires > 0) {
      q.people = q.people || [];
      let role = q.people.find((x) => 'people:' + x.id === lv.hireRole);
      if (!role) { role = { id: 'whatif_hires', label: 'New hires (what-if)', headcount: 0, amount: 0 }; q.people.push(role); }
      role.headcount += lv.hires;
      role.amount += Math.round(lv.hires * (lv.hireCost || 0));
    }
    delete q.monthly;
    return q;
  }

  function findingsFor(d, key) { return (d.findings || []).filter((f) => f.node === key || f.node.startsWith(key + ':')); }
  function notesFor(d, key) { return ((d.internal && d.internal.notes) || []).filter((n) => n.node === key || n.node.startsWith(key + ':')); }

  /* ---------------- formatting ---------------- */
  function money(n, exact) {
    const s = n < 0 ? '−' : ''; const a = Math.abs(n);
    if (exact || a < 10000) return s + '$' + Math.round(a).toLocaleString('en-US');
    if (a < 995000) return s + '$' + Math.round(a / 1000) + 'k';
    return s + '$' + (a / 1e6).toFixed(a < 9.95e6 ? 2 : 1) + 'M';
  }
  const num = (n) => Math.round(n).toLocaleString('en-US');
  const cents = (part, whole) => { const c = whole > 0 ? Math.round((100 * part) / whole) : 0; return c === 0 && part && whole > 0 ? 'under 1¢' : c + '¢'; };
  const pct = (a, b) => (b ? ((100 * (a - b)) / Math.abs(b)) : 0);
  function delta(a, b) {
    if (b == null) return '';
    if (!b) return a ? 'new' : '';
    const v = pct(a, b); const r = Math.round(v);
    return (r > 0 ? '▲ ' : r < 0 ? '▼ ' : '± ') + Math.abs(r) + '%';
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // One plain sentence an owner reads first: what was kept, or that the year ran short.
  function headline(p) {
    const t = totals(p);
    if (!t.rev) return '';
    if (t.profit < 0) return `Of every $1 that came in, $${(t.spend / t.rev).toFixed(2)} went out: the extra ${money(-t.profit)} came from cash, savings or credit.`;
    return `Of every $1 that came in, ${cents(t.profit, t.rev)} was kept: ${money(t.profit)} of ${money(t.rev)}${t.profit < 0.03 * t.rev ? ', a thin cushion' : ''}.`;
  }
  // One plain sentence on what changed since the first snapshot, shown whenever a later snapshot is on screen.
  const sinceWord = (p) => p.label.split('·')[0].trim().replace(/^at\s+/i, '').toLowerCase();
  function since(p0, p1) {
    const a = totals(p0), b = totals(p1);
    if (!a.rev || !b.rev) return '';
    const r = Math.round(pct(b.rev, a.rev));
    const moneyIn = r > 0 ? `money in is up ${r}%` : r < 0 ? `money in is down ${-r}%` : 'money in is about the same';
    const ca = Math.round((100 * a.profit) / a.rev), cb = Math.round((100 * b.profit) / b.rev);
    let kept;
    if (a.profit >= 0 && b.profit >= 0) kept = `${cents(b.profit, b.rev)} of each $1 is kept, ` + (cb > ca ? `up from ${cents(a.profit, a.rev)}` : cb < ca ? `down from ${cents(a.profit, a.rev)}` : 'the same as then');
    else if (a.profit < 0 && b.profit >= 0) kept = `the ${money(-a.profit)} shortfall has turned into ${money(b.profit)} kept`;
    else if (a.profit >= 0) kept = `the year now runs ${money(-b.profit)} short, where it kept ${money(a.profit)} then`;
    else kept = `the shortfall is ${money(-b.profit)}, ${-b.profit < -a.profit ? 'down' : 'up'} from ${money(-a.profit)}`;
    return `Since ${sinceWord(p0)}: ${moneyIn}, and ${kept}.`;
  }
  // Good or bad news for the owner, one rule for tiles and map. Money in, owner pay and profit read by direction.
  // A cost reads by its share of each $1 (the ¢ figure printed beside it): payroll growing slower than sales is good news.
  const COSTS = new Set(['people', 'materials', 'overhead', 'debt', 'tax']);
  function tone(group, a, b, revA, revB) {
    if (b == null) return 'neu';
    if (COSTS.has(group)) { if (!revA || !revB) return 'neu'; const d = Math.round((100 * a) / revA) - Math.round((100 * b) / revB); return d < 0 ? 'up' : d > 0 ? 'dn' : 'neu'; }
    if (b && Math.round(pct(a, b)) === 0) return 'neu';
    const rose = a > b; return group === 'loss' ? (rose ? 'dn' : 'up') : rose ? 'up' : 'dn';
  }
  const api = { SCHEMA, GROUPS, FLAGS, LENSES, validate, totals, whatIf, ownerCopy, money, cents, nodeIds, monthLabels, headline, since, tone };
  if (typeof document === 'undefined') return api;

  /* ---------------- scene graph (pure layout, pixel units) ---------------- */
  function graphOf(p) {
    const t = totals(p);
    const rev = p.revenue.filter((r) => r.amount > 0).map((r) => ({ key: 'revenue:' + r.id, group: 'revenue', label: r.label, amount: r.amount, units: r.units, item: r, shade: Math.max(0, p.revenue.indexOf(r)) % 4 }));
    const loss = t.profit < 0 ? -t.profit : 0;
    if (loss) rev.push({ key: 'loss', group: 'loss', label: 'Covered from cash', amount: loss });
    const groups = GROUPS.map((G) => {
      const a = t.g[G.id];
      const items = G.list ? (p[G.id] || []).filter((i) => i.amount > 0).map((i) => ({ key: G.id + ':' + i.id, group: G.id, label: i.label, amount: i.amount, item: i })) : [];
      const own = p[G.id] && !Array.isArray(p[G.id]) ? p[G.id] : null;
      return { key: G.id, group: G.id, label: (own && own.label) || G.label, amount: a, items };
    }).filter((g) => g.amount > 0);
    return { t, rev, groups, total: t.rev + loss, loss };
  }

  // pre(x) adds extra space above an item (the loss node sits apart from the money that came in)
  function stack(list, top, avail, k, gap, minH, pre) {
    const hs = list.map((x) => Math.max(minH, x.amount * k));
    const gb = list.map((x, i) => (i ? gap + (pre ? pre(x) : 0) : 0));
    let y = top + Math.max(0, (avail - sum(hs) - sum(gb)) / 2);
    return list.map((x, i) => { y += gb[i]; const r = { y, h: hs[i] }; y += hs[i]; return r; });
  }

  function relax(labels, lo, hi) {
    const LGAP = 8; // breathing room between stacked labels
    labels.sort((a, b) => a.want - b.want);
    for (const l of labels) l.y = l.want - l.lh / 2;
    for (let i = 1; i < labels.length; i++) { const p = labels[i - 1]; if (labels[i].y < p.y + p.lh + LGAP) labels[i].y = p.y + p.lh + LGAP; }
    const last = labels[labels.length - 1];
    if (last && last.y + last.lh > hi) {
      last.y = hi - last.lh;
      for (let i = labels.length - 2; i >= 0; i--) { const n = labels[i + 1]; if (labels[i].y + labels[i].lh + LGAP > n.y) labels[i].y = n.y - labels[i].lh - LGAP; }
    }
    if (labels[0] && labels[0].y < lo) { labels[0].y = lo; for (let i = 1; i < labels.length; i++) { const p = labels[i - 1]; if (labels[i].y < p.y + p.lh + LGAP) labels[i].y = p.y + p.lh + LGAP; } }
  }

  function geometry(W, H) {
    const inside = W < 720;
    const nodeW = inside ? 10 : 14;
    const labL = inside ? 0 : Math.min(200, Math.round(W * 0.22));
    const labR = inside ? 0 : Math.min(230, Math.round(W * 0.27));
    const xL = inside ? 4 : labL;
    const xR = inside ? Math.round(W * 0.585) : W - labR - nodeW;
    const coreW = inside ? 18 : Math.max(84, Math.min(128, Math.round((xR - xL) * 0.2)));
    const xC = inside ? Math.round(W * 0.43) : Math.round((xL + nodeW + xR) / 2 - coreW / 2);
    const rightChars = Math.floor((W - xR - nodeW - (inside ? 10 : 16)) / 6.7);
    return { W, H, inside, nodeW, xL, xR, xC, coreW, rightChars, top: inside ? 62 : 30, bottom: H - 16 };
  }

  const clip = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)).trimEnd() + '…' : s);
  // a name too long for its column wraps once at a space; only a name longer than two lines is clipped
  function nameLines(s, n) {
    if (s.length <= n) return [s];
    const cut = s.lastIndexOf(' ', n);
    return cut < n * 0.4 ? [clip(s, n)] : [s.slice(0, cut).trimEnd(), clip(s.slice(cut + 1), n)];
  }
  // d = the compare/what-if change, drawn as its own coloured tspan after sub; o.more (the drill word) shares the name's last line
  // a name never gives up letters to the drill word: when both do not fit, the word shrinks to a bare ›
  const lab = (o, name, n, sub, d) => {
    let nm = nameLines(name, n);
    if (o.more) { const w = nameLines(name, n - o.more.length - 4); if (w.join(' ').includes('…') && !nm.join(' ').includes('…')) o.more = true; else nm = w; }
    return Object.assign(o, { lh: 20 + 16 * nm.length, lines: [...nm, sub], nl: nm.length, delta: d || '' });
  };

  function sceneMoney(gr, geo, ctx) {
    const S = { nodes: {}, links: {}, labels: {} };
    const { xL, xR, xC, coreW, nodeW, top, bottom, inside } = geo;
    const avail = bottom - top;
    const gap = inside ? 6 : 10;
    const lossGap = gr.loss ? (inside ? 10 : 22) : 0; // the cash that covered a loss stands apart from real money in
    const k = Math.min((avail - gap * (gr.rev.length - 1) - lossGap) / gr.total, (avail - gap * (gr.groups.length - 1)) / gr.total);
    const coreH = gr.total * k;
    const coreY = top + (avail - coreH) / 2;
    S.k = k;
    S.nodes.core = { key: 'core', kind: 'core', x: xC, y: coreY, w: coreW, h: coreH, op: 1 };
    const L = stack(gr.rev, top, avail, k, gap, 3, (x) => (x.group === 'loss' ? lossGap : 0));
    let cy = coreY;
    const maxChars = inside ? Math.floor((xC - xL - nodeW - 12) / 6.6) : 30, rc = Math.min(30, geo.rightChars);
    const labsL = [], labsR = [];
    gr.rev.forEach((r, i) => {
      S.nodes[r.key] = { key: r.key, kind: r.group === 'loss' ? 'loss' : 'rev', group: r.group, shade: r.shade, x: xL, y: L[i].y, w: nodeW, h: L[i].h, op: 1, exitDx: -50 };
      const b = r.amount * k;
      const y0 = L[i].y + (L[i].h - b) / 2;
      S.links['in>' + r.key] = { key: 'in>' + r.key, from: r.key, to: 'core', group: r.group === 'loss' ? 'loss' : 'rev', shade: r.shade, x0: xL + nodeW, y0, y0b: y0 + b, x1: xC, y1: cy, y1b: cy + b, money: 1, work: r.group === 'loss' ? 0 : -1, value: r.amount, op: 1 };
      cy += b;
      const sub = r.group === 'loss' ? money(r.amount) + ' more went out than came in' : money(r.amount) + (r.units ? ' · ' + num(r.units) + ' ' + ctx.units : '');
      const d = ctx.dl(r.key, r.amount);
      labsL.push(lab({ key: r.key, want: L[i].y + L[i].h / 2, flags: ctx.flags(r.key), cls: r.group === 'loss' ? 'loss' : '', dcls: ctx.dc(r.group, r.key, r.amount, gr.t.rev) }, r.label, maxChars, sub, d));
    });
    let sy = coreY;
    const R = stack(gr.groups, top, avail, k, gap, 3);
    gr.groups.forEach((g, i) => {
      S.nodes[g.key] = { key: g.key, kind: 'group', group: g.group, x: xR, y: R[i].y, w: nodeW, h: R[i].h, op: 1, exitDx: 50, drill: !!(GROUP[g.group].list && g.items.length) };
      const b = g.amount * k;
      const y1 = R[i].y + (R[i].h - b) / 2;
      S.links['c>' + g.key] = { key: 'c>' + g.key, from: 'core', to: g.key, group: g.group, x0: xC + coreW, y0: sy, y0b: sy + b, x1: xR, y1, y1b: y1 + b, money: 1, work: GROUP[g.group].work ? -1 : 0, value: g.amount, op: 1 };
      sy += b;
      const sub = money(g.amount) + ' · ' + cents(g.amount, gr.t.rev || gr.total) + ' of each $1';
      const n = g.items.length, d = ctx.dl(g.key, g.amount);
      const more = S.nodes[g.key].drill ? n + (g.group === 'people' ? ' role' : ' line') + (n === 1 ? '' : 's') : '';
      labsR.push(lab({ key: g.key, want: R[i].y + R[i].h / 2, flags: ctx.flags(g.key), more, dcls: ctx.dc(g.group, g.key, g.amount, gr.t.rev) }, g.label, rc, sub, d));
    });
    placeLabels(S, labsL, labsR, geo, 'L', 'R');
    // the core shows money in (the same figure as the Money in tile); a gap covered from cash is its own line, never blended in
    coreLabel(S, geo, S.nodes.core, [inside ? 'The business' : 'THE BUSINESS', money(gr.t.rev), gr.t.units ? num(gr.t.units) + ' ' + ctx.units : '', gr.loss ? '+' + money(gr.loss) + ' cash' : '']);
    return S;
  }

  function sceneGroup(gr, geo, ctx, gkey, prevK) {
    const S = { nodes: {}, links: {}, labels: {} };
    const g = gr.groups.find((x) => x.key === gkey);
    if (!g) return sceneMoney(gr, geo, ctx);
    const { xL, xR, xC, coreW, nodeW, top, bottom, inside } = geo;
    const avail = bottom - top - (inside ? 0 : 20);
    const t0 = top + (inside ? 0 : 20);
    const k0 = prevK || (avail / gr.total);
    const coreH = gr.total * k0, coreY = t0 + (avail - coreH) / 2;
    const cw = inside ? 10 : 22, cx = inside ? xL : 28;
    S.nodes.core = { key: 'core', kind: 'core', x: cx, y: coreY, w: cw, h: coreH, op: 0, thin: true }; // invisible but still the click target under the context bar
    let off = 0; for (const x of gr.groups) { if (x.key === gkey) break; off += x.amount * k0; }
    { let yy = coreY; for (const x of gr.groups) { const hh = x.amount * k0; S.nodes['ctx:' + x.key] = { key: 'ctx:' + x.key, kind: 'ctx', group: x.group, x: cx, y: yy, w: cw, h: Math.max(0, hh - 1), op: x.key === gkey ? 1 : 0.3 }; yy += hh; } }
    const gap = inside ? 5 : 8;
    const n = g.items.length;
    const room = Math.min(avail, (inside ? 70 : 92) * Math.max(2, n) + gap * Math.max(0, n - 1));
    const kg = (room - gap * Math.max(0, n - 1)) / g.amount;
    const fh = g.amount * kg, fy = t0 + (avail - fh) / 2;
    const fx = Math.round((cx + cw + xR) / 2 - 9);
    S.nodes[gkey] = { key: gkey, kind: 'group', group: g.group, x: fx, y: fy, w: inside ? 12 : 18, h: fh, op: 1, focus: true };
    S.links['c>' + gkey] = { key: 'c>' + gkey, from: 'core', to: gkey, group: g.group, x0: cx + cw, y0: coreY + off, y0b: coreY + off + g.amount * k0, x1: fx, y1: fy, y1b: fy + fh, money: 1, work: GROUP[g.group].work ? -1 : 0, value: g.amount, op: 1 };
    const R = stack(g.items, t0, avail, kg, gap, 3); // centred: a compact column when there are few items
    const maxChars = Math.min(30, geo.rightChars);
    let sy = fy; const labsR = [];
    g.items.forEach((it, i) => {
      S.nodes[it.key] = { key: it.key, kind: 'item', group: g.group, x: xR, y: R[i].y, w: nodeW, h: R[i].h, op: 1, enterFrom: gkey, exitDx: 40 };
      const b = it.amount * kg; const y1 = R[i].y + (R[i].h - b) / 2;
      S.links[gkey + '>' + it.key] = { key: gkey + '>' + it.key, from: gkey, to: it.key, group: g.group, x0: fx + S.nodes[gkey].w, y0: sy, y0b: sy + b, x1: xR, y1, y1b: y1 + b, money: 1, work: GROUP[g.group].work ? -1 : 0, value: it.amount, op: 1 };
      sy += b;
      let sub = money(it.amount);
      if (g.group === 'people' && it.item.headcount) sub += ' · ' + it.item.headcount + (it.item.headcount === 1 ? ' person' : ' people') + ' · ' + money(it.amount / it.item.headcount) + ' each';
      else sub += ' · ' + cents(it.amount, gr.t.rev) + ' of each $1';
      const d = ctx.dl(it.key, it.amount);
      labsR.push(lab({ key: it.key, want: R[i].y + R[i].h / 2, flags: ctx.flags(it.key), dcls: ctx.dc(g.group, it.key, it.amount, gr.t.rev) }, it.label, maxChars, sub, d));
    });
    placeLabels(S, [], labsR, geo, 'L', 'R');
    const lx = inside ? xL + cw + 6 : cx - 2;
    S.labels['lab:core:back'] = { key: 'lab:core:back', x: lx, y: inside ? coreY + coreH / 2 - 18 : Math.max(2, coreY - 40), anchor: 'start', lines: [inside ? '‹ Whole' : '‹ Whole business', money(gr.t.rev) + (gr.loss ? ' + ' + money(gr.loss) + ' cash' : '')], cls: 'back', op: 1, for: 'core' };
    const head = GROUP[g.group].label === g.label ? g.label : g.label;
    S.labels['lab:focus'] = { key: 'lab:focus', x: fx + 9, y: fy - (inside ? 30 : 34), anchor: 'middle', lines: [head, money(g.amount) + ' · ' + cents(g.amount, gr.t.rev) + ' of each $1'], cls: 'focus', op: 1, for: gkey, noLead: true };
    if (inside) { S.labels['lab:focus'].y = 6; }
    return S;
  }

  function sceneWork(gr, geo, ctx, prevK) {
    const S = { nodes: {}, links: {}, labels: {} };
    const { xL, xR, xC, coreW, nodeW, top, bottom, inside } = geo;
    const avail = bottom - top;
    const inputs = [];
    for (const g of gr.groups) if (GROUP[g.group].work) for (const it of g.items) inputs.push(it);
    const outs = gr.rev.filter((r) => r.group !== 'loss');
    const revT = sum(outs, (r) => r.amount);
    const gap = inside ? 6 : 10;
    const k = Math.min(prevK || 1e9, (avail - gap * (outs.length - 1)) / revT, (avail - gap * Math.max(0, inputs.length - 1)) / Math.max(1, sum(inputs, (x) => x.amount)));
    const coreH = revT * k, coreY = top + (avail - coreH) / 2;
    S.k = k;
    S.nodes.core = { key: 'core', kind: 'core', x: xC, y: coreY, w: coreW, h: coreH, op: 1 };
    const inT = sum(inputs, (x) => x.amount);
    const Lh = inT * k + gap * Math.max(0, inputs.length - 1);
    const L = stack(inputs, coreY, Math.min(avail, Lh), k, gap, 3);
    const maxChars = inside ? Math.floor((xC - xL - nodeW - 12) / 6.6) : 30;
    let cy = coreY; const labsL = [], labsR = [];
    inputs.forEach((it, i) => {
      S.nodes[it.key] = { key: it.key, kind: 'item', group: it.group, x: xL, y: L[i].y, w: nodeW, h: L[i].h, op: 1, exitDx: -40 };
      const b = it.amount * k; const y0 = L[i].y + (L[i].h - b) / 2;
      S.links['w>' + it.key] = { key: 'w>' + it.key, from: it.key, to: 'core', group: it.group, x0: xL + nodeW, y0, y0b: y0 + b, x1: xC, y1: cy, y1b: cy + b, money: -1, work: 1, value: it.amount, op: 1 };
      cy += b;
      const sub = it.group === 'people' && it.item.headcount ? it.item.headcount + (it.item.headcount === 1 ? ' person' : ' people') + ' · ' + money(it.amount) : money(it.amount) + (it.item.who ? ' · ' + it.item.who : '');
      labsL.push(lab({ key: it.key, want: L[i].y + L[i].h / 2, flags: ctx.flags(it.key) }, it.label, maxChars, sub));
    });
    const inset = inside ? 3 : 6;
    { let yy = coreY; for (const G of ['people', 'materials']) { const a = sum(inputs.filter((x) => x.group === G), (x) => x.amount) * k; if (a > 8) S.nodes['seg:' + G] = { key: 'seg:' + G, kind: 'seg', group: G, x: xC + inset, y: yy + (yy === coreY ? inset : 2), w: coreW - 2 * inset, h: a - (yy === coreY ? inset : 2) - 2, op: 1 }; yy += a; } }
    if (coreY + coreH - cy > 10) S.nodes.margin = { key: 'margin', kind: 'margin', x: xC + inset, y: cy + 4, w: coreW - 2 * inset, h: coreY + coreH - cy - 4 - inset, op: 1 };
    const R = stack(outs, top, avail, k, gap, 3);
    let sy = coreY;
    outs.forEach((r, i) => {
      S.nodes[r.key] = { key: r.key, kind: 'rev', group: 'revenue', shade: r.shade, x: xR, y: R[i].y, w: nodeW, h: R[i].h, op: 1, exitDx: 50 };
      const b = r.amount * k; const y1 = R[i].y + (R[i].h - b) / 2;
      S.links['o>' + r.key] = { key: 'o>' + r.key, from: 'core', to: r.key, group: 'rev', shade: r.shade, x0: xC + coreW, y0: sy, y0b: sy + b, x1: xR, y1, y1b: y1 + b, money: -1, work: 1, value: r.amount, op: 1 };
      sy += b;
      const sub = r.units ? num(r.units) + ' ' + ctx.units + ' · ' + money(r.amount / r.units) + ' avg' : money(r.amount);
      labsR.push(lab({ key: r.key, want: R[i].y + R[i].h / 2, flags: ctx.flags(r.key) }, r.label, Math.min(30, geo.rightChars), sub));
    });
    placeLabels(S, labsL, labsR, geo, 'L', 'R');
    const per = gr.t.units ? ctx.units + ' · ' + money(revT / gr.t.units, true) + ' each' : 'a year';
    const topPart = Object.assign({}, S.nodes.core, { h: S.nodes.margin ? S.nodes.margin.y - coreY : coreH });
    coreLabel(S, geo, topPart, [inside ? 'The work' : 'THE WORK', gr.t.units ? num(gr.t.units) : money(revT), per]);
    if (S.nodes.margin && !inside && S.nodes.margin.h >= 64) {
      const m = S.nodes.margin; const left = revT - inT;
      S.labels['lab:margin'] = { key: 'lab:margin', x: m.x + m.w / 2, y: m.y + m.h / 2 - 24, anchor: 'middle', lines: ['LEFT OVER', money(left), cents(left, revT) + ' of $1'], cls: 'core margin', op: 1, for: 'margin', noLead: true };
    }
    return S;
  }

  function placeLabels(S, labsL, labsR, geo, a, b) {
    const { xL, xR, nodeW, top, bottom, inside } = geo;
    const lo = inside ? top - 6 : 2, hi = bottom + 14;
    relax(labsL, lo, hi); relax(labsR, lo, hi);
    for (const l of labsL) {
      const n = S.nodes[l.key];
      const x = inside ? xL + nodeW + 7 : xL - 12, anchor = inside ? 'start' : 'end';
      S.labels['lab:' + l.key + ':' + anchor] = { key: 'lab:' + l.key + ':' + anchor, x, y: l.y, anchor, lines: l.lines, nl: l.nl, flags: l.flags, delta: l.delta, dcls: l.dcls, cls: l.cls, op: 1, for: l.key, ny: n.y + n.h / 2, nx: inside ? xL + nodeW : xL };
    }
    for (const l of labsR) {
      const n = S.nodes[l.key];
      const x = xR + nodeW + (inside ? 7 : 12), anchor = 'start';
      S.labels['lab:' + l.key + ':' + anchor] = { key: 'lab:' + l.key + ':' + anchor, x, y: l.y, anchor, lines: l.lines, nl: l.nl, flags: l.flags, more: l.more, delta: l.delta, dcls: l.dcls, cls: l.cls, op: 1, for: l.key, ny: n.y + n.h / 2, nx: xR + nodeW };
    }
  }

  function coreLabel(S, geo, core, lines) {
    const fits = !geo.inside && core.h >= 84;
    S.labels['lab:core:in'] = fits
      ? { key: 'lab:core:in', x: core.x + core.w / 2, y: core.y + core.h / 2 - 30, anchor: 'middle', lines, cls: 'core', op: 1, for: 'core', noLead: true }
      : { key: 'lab:core:in', x: core.x + core.w / 2, y: Math.max(2, core.y - (geo.inside ? 60 : 58)), anchor: 'middle', lines, cls: 'core-out', op: 1, for: 'core', noLead: true };
  }

  /* ---------------- tween engine ---------------- */
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const NPROPS = ['x', 'y', 'w', 'h', 'op'];
  const LPROPS = ['x0', 'y0', 'y0b', 'x1', 'y1', 'y1b', 'op'];
  const TPROPS = ['x', 'y', 'op', 'ny', 'nx'];

  function bandPath(l) {
    const xm = (l.x0 + l.x1) / 2;
    return `M${l.x0.toFixed(1)},${l.y0.toFixed(1)}C${xm.toFixed(1)},${l.y0.toFixed(1)} ${xm.toFixed(1)},${l.y1.toFixed(1)} ${l.x1.toFixed(1)},${l.y1.toFixed(1)}L${l.x1.toFixed(1)},${l.y1b.toFixed(1)}C${xm.toFixed(1)},${l.y1b.toFixed(1)} ${xm.toFixed(1)},${l.y0b.toFixed(1)} ${l.x0.toFixed(1)},${l.y0b.toFixed(1)}Z`;
  }
  function linePath(l, f) {
    const a = lerp(l.y0, l.y0b, f), b = lerp(l.y1, l.y1b, f), xm = (l.x0 + l.x1) / 2;
    return `M${l.x0.toFixed(1)},${a.toFixed(1)}C${xm.toFixed(1)},${a.toFixed(1)} ${xm.toFixed(1)},${b.toFixed(1)} ${l.x1.toFixed(1)},${b.toFixed(1)}`;
  }

  const NS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function h(tag, cls, html, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }

  /* ---------------- mount ---------------- */
  function mount(el, input, opts) {
    opts = Object.assign({ view: 'internal', title: 'Humble 360 Map' }, opts || {});
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const st = { view: opts.view, pi: 0, scene: 'money', focus: null, sel: null, compare: false, wi: null, live: null, raf: 0, hot: null };
    let data, raw;

    el.classList.add('m360');
    el.innerHTML = '';
    const top = h('div', 'm360-head', null, el);
    const kpis = h('div', 'm360-kpis', null, el);
    const wibar = h('div', 'm360-whatif', null, el); wibar.hidden = true;
    const main = h('div', 'm360-main', null, el);
    const mapCard = h('section', 'm360-card m360-mapcard', null, main);
    const tools = h('div', 'm360-tools', null, mapCard);
    const mapBox = h('div', 'm360-mapbox', null, mapCard);
    const svg = sv('svg', { class: 'm360-svg', role: 'group', 'aria-label': 'Flow map of the business' }, mapBox);
    const defs = sv('defs', {}, svg);
    const pat = sv('pattern', { id: 'm360-hatch-' + Math.random().toString(36).slice(2, 7), width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    sv('rect', { width: 6, height: 6, class: 'm360-hatch-bg' }, pat); sv('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'm360-hatch-ln' }, pat);
    const gLinks = sv('g', { class: 'm360-links' }, svg);
    const gNodes = sv('g', { class: 'm360-nodes' }, svg);
    const gLabels = sv('g', { class: 'm360-labels' }, svg);
    const legend = h('div', 'm360-legend', null, mapCard);
    const panel = h('aside', 'm360-card m360-panel', null, main);
    panel.setAttribute('aria-live', 'polite');
    const trend = h('section', 'm360-card m360-trend', null, el);
    const lower = h('div', 'm360-lower', null, el);
    const findEl = h('section', 'm360-card m360-findings', null, lower);
    const lensEl = h('section', 'm360-card m360-lenses', null, lower);
    const notesEl = h('section', 'm360-card m360-notes', null, el);
    const ledger = h('details', 'm360-card m360-ledger', null, el);
    const foot = h('footer', 'm360-foot', null, el);
    const tip = h('div', 'm360-tip', null, el); tip.hidden = true;
    // phone only (CSS): a sticky row to jump between the long page's parts
    const jump = h('nav', 'm360-jump', null, null); jump.setAttribute('aria-label', 'Jump to');
    el.insertBefore(jump, main);
    for (const [lab, to] of [['Map', mapCard], ['Months', trend], ['Findings', findEl], ['Numbers', ledger]]) {
      const bt = h('button', null, lab, jump); bt.type = 'button';
      bt.onclick = () => { if (to.tagName === 'DETAILS') to.open = true; to.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); };
    }
    const els = new Map();

    function periods() { return data.periods; }
    function period() { return periods()[st.pi]; }
    function shown() { return st.wi ? whatIf(period(), st.wi) : period(); }
    function base() { return st.wi ? period() : st.compare && st.pi > 0 ? periods()[0] : null; }
    function ctx() {
      const b = base(); let bm = null;
      const bRev = b ? totals(b).rev : 0;
      if (b) { const g = graphOf(b); bm = new Map(); for (const r of g.rev) bm.set(r.key, r.amount); for (const x of g.groups) { bm.set(x.key, x.amount); for (const i of x.items) bm.set(i.key, i.amount); } bm.set('core', g.total); }
      return {
        units: data.output.units, unit: data.output.unit || data.output.units,
        dl: (key, a) => (bm ? delta(a, bm.has(key) ? bm.get(key) : 0) : ''),
        dc: (group, key, a, rev) => (bm ? tone(group, a, bm.has(key) ? bm.get(key) : 0, rev, bRev) : 'neu'),
        flags: (key) => { const f = findingsFor(data, key); return Object.keys(FLAGS).filter((k) => f.some((x) => x.flag === k)); },
        base: bm,
      };
    }

    /* ---- header, controls ---- */
    function renderHead() {
      const b = data.business;
      const ps = periods();
      top.innerHTML = `
        <div class="m360-title">
          <div class="m360-eyebrow">${esc(opts.title)}${data.sample ? ' <span class="m360-sample" title="' + esc(data.sample_basis || '') + '">SAMPLE</span>' : ''}${st.view === 'internal' ? ' <span class="m360-internal">Internal view</span>' : ''}</div>
          <h2>${esc(b.name)}</h2>
          <div class="m360-sub">${esc([b.industry, b.place, b.founded ? 'since ' + b.founded : ''].filter(Boolean).join(' · '))}</div>
          <p class="m360-lede${totals(period()).profit < 0 ? ' neg' : ''}">${esc(headline(period()))}</p>${ps.length > 1 && st.pi > 0 ? `<p class="m360-since">${esc(since(ps[0], period()))}</p>` : ''}${firstFix()}
        </div>
        <div class="m360-ctl">
          ${ps.length > 1 ? `<div class="m360-seg" role="group" aria-label="Which snapshot">${ps.map((p, i) => `<button type="button" data-pi="${i}" aria-pressed="${i === st.pi}">${esc(p.label)}</button>`).join('')}</div>` : `<div class="m360-one">${esc(ps[0].label)}</div>`}
          ${ps.length > 1 && st.pi > 0 ? `<label class="m360-check"><input type="checkbox" data-cmp ${st.compare ? 'checked' : ''} ${st.wi ? 'disabled' : ''}> Show change since ${esc(sinceWord(ps[0]))}</label>` : ''}
          <button type="button" class="m360-btn ${st.wi ? 'on' : ''}" data-wi aria-expanded="${!!st.wi}">${st.wi ? 'Close what-if' : 'What if…'}</button>
        </div>`;
      top.querySelectorAll('[data-pi]').forEach((btn) => btn.onclick = () => { st.pi = +btn.dataset.pi; if (st.pi === 0) st.compare = false; st.wi = null; refresh(); });
      const cb = top.querySelector('[data-cmp]'); if (cb) cb.onchange = () => { st.compare = cb.checked; refresh(); };
      const ff = top.querySelector('[data-first]');
      if (ff) ff.onclick = () => { findEl.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); const c = findEl.querySelector('.m360-find.fl-fix_now, .m360-find.fl-improve_next'); if (c) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); } };
      top.querySelector('[data-wi]').onclick = () => { st.wi = st.wi ? null : { price: 0, volume: 0, materials: 0, overhead: 0, hires: 0, hireRole: firstRole(), hireCost: roleCost(firstRole()) }; refresh(); };
    }
    function firstRole() { const p = period().people || []; return p.length ? 'people:' + p[0].id : 'people:whatif_hires'; }
    function roleCost(key) { const r = (period().people || []).find((x) => 'people:' + x.id === key); return r && r.headcount ? Math.round(r.amount / r.headcount / 1000) * 1000 : 55000; }

    function renderWhatIf() {
      wibar.hidden = !st.wi;
      if (!st.wi) { wibar.innerHTML = ''; return; }
      if (wibar.dataset.built === String(st.pi)) return updateWiOut();
      wibar.dataset.built = String(st.pi);
      const roles = (period().people || []).map((r) => `<option value="people:${esc(r.id)}">${esc(r.label)}</option>`).join('');
      const s = (k, label, min, max, unit, hint, g) => `<label class="m360-lever g-${g}"><span>${label} <output data-o="${k}"></output></span><input type="range" min="${min}" max="${max}" step="1" value="${st.wi[k]}" data-k="${k}" aria-label="${label}"><small>${hint}</small></label>`;
      wibar.innerHTML = `
        <div class="m360-wi-head"><strong>What if…</strong> <span>Arithmetic on the “${esc(period().label)}” numbers. Not a forecast or a promise: real results depend on customers, staff and the market. Taxes are held where they were.</span> <button type="button" class="m360-btn ghost" data-reset>Reset</button></div>
        <div class="m360-levers">
          ${s('price', 'Prices', -10, 15, '%', 'Same work, charged more or less', 'rev')}
          ${s('volume', 'Amount of work', -25, 30, '%', 'More or fewer ' + esc(data.output.units) + '; materials move with it', 'rev')}
          ${s('materials', 'Materials cost', -15, 15, '%', 'Supplier prices, waste, buying better', 'materials')}
          ${s('overhead', 'Overhead', -20, 20, '%', 'Rent, insurance, software, the rest', 'overhead')}
          <label class="m360-lever g-people"><span>Add people <output data-o="hires"></output></span><input type="range" min="0" max="5" step="1" value="${st.wi.hires}" data-k="hires" aria-label="Add people">
            <small class="m360-hire"><select data-role aria-label="Role for new people">${roles}<option value="people:whatif_hires">A new role</option></select> at <input type="number" data-cost step="1000" min="0" value="${st.wi.hireCost}" aria-label="Yearly cost per person"> a year each</small></label>
        </div>
        <div class="m360-wi-out" data-out></div>`;
      const sel = wibar.querySelector('[data-role]'); sel.value = st.wi.hireRole;
      wibar.querySelectorAll('input[type=range]').forEach((r) => r.oninput = () => { st.wi[r.dataset.k] = +r.value; soft(); });
      sel.onchange = () => { st.wi.hireRole = sel.value; st.wi.hireCost = roleCost(sel.value); wibar.querySelector('[data-cost]').value = st.wi.hireCost; soft(); };
      wibar.querySelector('[data-cost]').oninput = (e) => { st.wi.hireCost = Math.max(0, +e.target.value || 0); soft(); };
      wibar.querySelector('[data-reset]').onclick = () => { Object.assign(st.wi, { price: 0, volume: 0, materials: 0, overhead: 0, hires: 0 }); wibar.querySelectorAll('input[type=range]').forEach((r) => r.value = st.wi[r.dataset.k]); soft(); };
      updateWiOut();
    }
    function updateWiOut() {
      if (!st.wi) return;
      wibar.querySelectorAll('[data-o]').forEach((o) => { const v = st.wi[o.dataset.o]; o.closest('.m360-lever').classList.toggle('moved', !!v); o.textContent = o.dataset.o === 'hires' ? (v ? '+' + v : 'none') : (v > 0 ? '+' : '') + v + '%'; });
      const a = totals(period()), b = totals(shown());
      const out = wibar.querySelector('[data-out]');
      const margin = (t) => (t.rev ? Math.round((100 * t.profit) / t.rev) : 0);
      out.innerHTML = `<em class="m360-paper">On paper only</em> Profit kept <strong>${money(a.profit)}</strong> → <strong class="${b.profit < a.profit ? 'dn' : b.profit > a.profit ? 'up' : ''}">${money(b.profit)}</strong> <span>(${margin(a)}% → ${margin(b)}% of what comes in; ${b.profit >= a.profit ? '+' : '−'}${money(Math.abs(b.profit - a.profit))} a year)</span>`;
    }
    let softT = 0;
    function soft() { updateWiOut(); cancelAnimationFrame(softT); softT = requestAnimationFrame(() => { renderKpis(true); draw(220); renderPanel(); renderLedger(); }); }

    /* ---- KPI band ---- */
    const kpiPrev = {};
    function renderKpis(quick) {
      const t = totals(shown()); const b = base() ? totals(base()) : null;
      const rows = [
        ['rev', 'Money in', t.rev, money, b && b.rev, 'a year'],
        ['units', cap(data.output.units), t.units, (v) => (t.units ? num(v) : '—'), b && b.units, t.units && t.rev ? money(t.rev / t.units, true) + ' each on average' : 'not entered yet'],
        ['people', 'Payroll', t.g.people, money, b && b.g.people, (t.headcount ? num(t.headcount) + (t.headcount === 1 ? ' person · ' : ' people · ') : '') + cents(t.g.people, t.rev) + ' of each $1'],
        ['materials', 'Materials', t.g.materials, money, b && b.g.materials, cents(t.g.materials, t.rev) + ' of each $1'],
        ['owner', 'Owner pay', t.g.owner, money, b && b.g.owner, t.rev ? cents(t.g.owner, t.rev) + ' of each $1' : ''],
        ['profit', t.profit < 0 ? 'Loss' : 'Profit kept', t.profit, money, b && b.profit, t.rev ? cents(Math.abs(t.profit), t.rev) + ' of each $1' : ''],
      ];
      kpis.classList.toggle('is-wi', !!st.wi);
      kpis.innerHTML = rows.map(([k, lab, v, f, bv, sub]) => `<div class="m360-kpi k-${k}${k === 'profit' && v < 0 ? ' neg' : ''}"><div class="m360-kpi-l">${lab}</div><div class="m360-kpi-v" data-kv="${k}">${f(kpiPrev[k] != null ? kpiPrev[k] : v)}</div><div class="m360-kpi-s">${bv != null ? `<span class="m360-d ${tone(k === 'people' || k === 'materials' || k === 'owner' || k === 'profit' ? k : 'revenue', v, bv, t.rev, b.rev)}">${delta(v, bv)}</span> ` : ''}${esc(sub)}</div></div>`).join('');
      for (const [k, , v, f] of rows) countTo(kpis.querySelector(`[data-kv="${k}"]`), kpiPrev[k] != null ? kpiPrev[k] : v, v, f, quick ? 160 : 650), kpiPrev[k] = v;
    }
    function countTo(node, a, b, f, dur) {
      if (reduce || a === b) { node.textContent = f(b); return; }
      const t0 = performance.now();
      const step = (now) => { const t = Math.min(1, (now - t0) / dur); node.textContent = f(lerp(a, b, ease(t))); if (t < 1 && node.isConnected) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }

    /* ---- the map ---- */
    function renderTools() {
      const g = st.scene === 'group' ? graphOf(shown()).groups.find((x) => x.key === st.focus) : null;
      tools.innerHTML = `
        <div class="m360-tabs" role="tablist" aria-label="Map view">
          <button type="button" role="tab" data-scene="money" aria-selected="${st.scene !== 'work'}">Where the money goes</button>
          <button type="button" role="tab" data-scene="work" aria-selected="${st.scene === 'work'}">How the work gets done</button>
        </div>
        <nav class="m360-crumb" aria-label="Map position">${st.scene === 'group' && g ? `<button type="button" data-up>Whole business</button> <span aria-hidden="true">›</span> <strong>${esc(g.label)}</strong>` : st.scene === 'work' ? '<strong>From people and materials to finished ' + esc(data.output.units) + '</strong>' : '<strong>Whole business</strong> <span class="m360-hint">· tap a colour on the right to look inside</span>'}</nav>`;
      tools.querySelectorAll('[data-scene]').forEach((b) => b.onclick = () => { st.scene = b.dataset.scene; st.focus = null; st.sel = null; refresh(); });
      const up = tools.querySelector('[data-up]'); if (up) up.onclick = () => goUp();
      legend.innerHTML = st.scene === 'work'
        ? '<span><i class="lg-work"></i>work and goods move toward customers →</span><span><i class="lg-money rev"></i>← money comes back</span><span><i class="lg-margin"></i>left over after the crew and materials: it pays overhead, you, loans, taxes and profit</span>'
        : '<span><i class="lg-money"></i>money moves →</span><span><i class="lg-work rev"></i>← work, labour and goods move the other way</span>' + (graphOf(shown()).loss ? '<span><i class="lg-loss"></i>shortfall covered from cash</span>' : '');
    }
    function goUp() { st.scene = 'money'; st.focus = null; refresh(); }

    function sceneNow() {
      const W = Math.max(300, mapBox.clientWidth || 800);
      const gr = graphOf(shown());
      const H = Math.max(W < 720 ? 470 : 440, Math.min(640, Math.round(W * 0.62)), 60 + 44 * Math.max(gr.rev.length, gr.groups.length, maxItems(gr) * (st.scene === 'group' ? 1 : 0)));
      const geo = geometry(W, H);
      const c = ctx();
      const money0 = sceneMoney(gr, geo, c);
      let S = money0;
      if (st.scene === 'group' && st.focus) S = sceneGroup(gr, geo, c, st.focus, money0.k);
      if (st.scene === 'work') S = sceneWork(gr, geo, c, money0.k);
      S.W = W; S.H = H; S.gr = gr;
      return S;
    }
    function maxItems(gr) { const g = gr.groups.find((x) => x.key === st.focus); return g ? g.items.length : 0; }

    function draw(dur) {
      const S = sceneNow();
      svg.setAttribute('viewBox', `0 0 ${S.W} ${S.H}`);
      svg.setAttribute('width', S.W); svg.setAttribute('height', S.H);
      const prev = st.live || { nodes: {}, links: {}, labels: {} };
      const from = { nodes: {}, links: {}, labels: {} }, to = { nodes: {}, links: {}, labels: {} };
      for (const [kind, props] of [['nodes', NPROPS], ['links', LPROPS], ['labels', TPROPS]]) {
        const keys = new Set([...Object.keys(prev[kind]), ...Object.keys(S[kind])]);
        for (const k of keys) {
          const a = prev[kind][k], b = S[kind][k];
          if (a && b) { from[kind][k] = Object.assign({}, b, pick(a, props)); to[kind][k] = b; }
          else if (b) {
            let s = Object.assign({}, b, { op: 0 });
            if (kind === 'nodes' && b.enterFrom && prev.nodes[b.enterFrom]) { const p = prev.nodes[b.enterFrom]; s = Object.assign({}, b, { x: p.x, y: p.y + p.h / 2, h: 0, op: 0 }); }
            if (kind === 'links') s = Object.assign({}, b, { x1: b.x0, y1: b.y0, y1b: b.y0b, op: 0 });
            from[kind][k] = s; to[kind][k] = b;
          } else {
            from[kind][k] = a;
            const e = Object.assign({}, a, { op: 0, gone: true });
            if (kind === 'nodes' && a.exitDx) e.x = a.x + a.exitDx;
            if (kind === 'links') Object.assign(e, { x1: a.x0, y1: a.y0, y1b: a.y0b });
            to[kind][k] = e;
          }
        }
      }
      ensureEls(to);
      cancelAnimationFrame(st.raf);
      const d = reduce ? 0 : dur;
      const t0 = performance.now();
      const frame = (now) => {
        const t = d ? Math.min(1, (now - t0) / d) : 1; const e = ease(t);
        const cur = { nodes: {}, links: {}, labels: {} };
        for (const [kind, props] of [['nodes', NPROPS], ['links', LPROPS], ['labels', TPROPS]]) {
          for (const k in to[kind]) {
            const a = from[kind][k], b = to[kind][k]; const o = Object.assign({}, b);
            for (const p of props) if (typeof a[p] === 'number' && typeof b[p] === 'number') o[p] = lerp(a[p], b[p], e);
            // fades run on the clock (t), not the eased curve: leavers are gone by 30%, arrivals start at 50%, so the move itself is never a double exposure
            if (b.gone) o.op = a.op * Math.max(0, 1 - t / 0.3);
            else if (!prev[kind][k]) o.op = b.op * Math.max(0, Math.min(1, (t - 0.5) / 0.5));
            else if (kind === 'labels') o.op = lerp(a.op, b.op, e);
            else if (b.op < a.op) o.op = lerp(b.op, a.op, Math.max(0, 1 - t / 0.3));
            else if (b.op > a.op) o.op = lerp(a.op, b.op, Math.max(0, Math.min(1, (t - 0.5) / 0.5)));
            cur[kind][k] = o;
          }
        }
        paint(cur);
        if (t < 1) st.raf = requestAnimationFrame(frame);
        else {
          for (const kind of ['nodes', 'links', 'labels']) for (const k in to[kind]) if (to[kind][k].gone) { const el2 = els.get(kind + '|' + k); if (el2) el2.remove(); els.delete(kind + '|' + k); delete cur[kind][k]; }
          st.live = cur; st.liveK = S.k;
        }
        st.live = st.live && t < 1 ? cur : st.live;
      };
      st.live = from; // if interrupted, the next draw starts from here
      st.raf = requestAnimationFrame(frame);
      if (!d) frame(t0 + 1);
      markSel();
    }
    function pick(o, props) { const r = {}; for (const p of props) if (p in o) r[p] = o[p]; return r; }

    function colorVar(group, shade) { return group === 'rev' || group === 'revenue' ? `var(--m-rev${shade || 0})` : group === 'loss' ? 'var(--m-alert)' : `var(--m-${group})`; }

    function ensureEls(S) {
      for (const k in S.links) {
        const id = 'links|' + k; if (els.has(id)) continue;
        const l = S.links[k];
        const g = sv('g', { class: 'm360-link g-' + l.group, 'data-from': l.from, 'data-to': l.to }, gLinks);
        sv('path', { class: 'm360-band', fill: colorVar(l.group, l.shade) }, g);
        if (l.group !== 'loss') sv('path', { class: 'm360-flow' + (l.money < 0 ? ' rev' : ''), stroke: colorVar(l.group, l.shade) }, g);
        if (l.work) sv('path', { class: 'm360-workln' + (l.work < 0 ? ' rev' : '') }, g);
        g.addEventListener('pointermove', (ev) => showTip(ev, linkTip(l)));
        g.addEventListener('pointerleave', hideTip);
        els.set(id, g);
      }
      for (const k in S.nodes) {
        const id = 'nodes|' + k; if (els.has(id)) continue;
        const n = S.nodes[k];
        const g = sv('g', { class: 'm360-node k-' + n.kind + (n.group ? ' g-' + n.group : ''), 'data-key': k }, gNodes);
        const r = sv('rect', { class: 'm360-rect' }, g);
        if (n.kind === 'loss') r.setAttribute('fill', `url(#${pat.id})`);
        else if (n.kind === 'margin') r.setAttribute('class', 'm360-rect m360-margin');
        else if (n.kind === 'seg') { r.setAttribute('class', 'm360-rect m360-coreseg'); r.setAttribute('fill', colorVar(n.group)); }
        else if (n.kind !== 'core') r.setAttribute('fill', colorVar(n.group, n.shade));
        if (n.kind !== 'margin' && n.kind !== 'ctx' && n.kind !== 'seg') {
          sv('rect', { class: 'm360-hit' }, g);
          g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
          g.addEventListener('click', () => activate(k));
          g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(k); } });
          g.addEventListener('pointerenter', () => setHot(k)); g.addEventListener('pointerleave', () => setHot(null));
          g.addEventListener('focus', () => setHot(k)); g.addEventListener('blur', () => setHot(null));
        }
        els.set(id, g);
      }
      for (const k in S.labels) {
        const id = 'labels|' + k; if (els.has(id)) continue;
        const l = S.labels[k];
        const g = sv('g', { class: 'm360-lab ' + (l.cls || '') }, gLabels);
        if (!l.noLead) sv('path', { class: 'm360-lead' }, g);
        sv('text', { 'text-anchor': l.anchor }, g);
        if (l.for && l.for !== 'margin') { g.style.cursor = 'pointer'; g.addEventListener('click', () => activate(l.for)); g.addEventListener('pointerenter', () => setHot(l.for)); g.addEventListener('pointerleave', () => setHot(null)); }
        els.set(id, g);
      }
      // labels' text may change without a new key (period switch): rewrite text for existing keys
      for (const k in S.labels) {
        const l = S.labels[k]; if (l.gone) continue;
        const g = els.get('labels|' + k); const t = g.querySelector('text');
        const sig = JSON.stringify([l.lines, l.flags, l.more, l.delta, l.dcls]);
        if (g.dataset.sig === sig) continue; g.dataset.sig = sig;
        writeText(t, l);
      }
      for (const k in S.nodes) {
        const n = S.nodes[k]; if (n.gone) continue;
        const g = els.get('nodes|' + k);
        g.setAttribute('aria-label', nodeAria(k));
        g.classList.toggle('drill', !!n.drill); g.classList.toggle('focus', !!n.focus); g.classList.toggle('thin', !!n.thin);
      }
    }

    // the first nl lines are the name (bold); flags and the drill arrow follow the name's last line
    function writeText(t, l) {
      t.textContent = '';
      const nl = l.nl || 1, core = /core/.test(l.cls || '');
      l.lines.forEach((line, i) => { if (!line) return; const ts = sv('tspan', { x: 0, dy: i ? (core ? (i === 1 ? 24 : 18) : i < nl ? 16 : 17) : 13, class: i < nl ? 'ln0' : 'ln' + (i - nl + 1) }, t); ts.textContent = line; });
      const name = t.children[Math.min(nl, t.children.length) - 1]; if (!name) return;
      if (l.more) { const s = sv('tspan', { class: 'm360-more' }, name); s.textContent = l.more === true ? '  ›' : '  ' + l.more + ' ›'; } // before the flags, so a ▲ flag never reads as "up 6 roles"
      if (l.flags && l.flags.length) { const ts = sv('tspan', { class: 'm360-flagt' }, name); for (const f of l.flags) { const s = sv('tspan', { class: 'fl-' + f }, ts); s.textContent = ' ' + FLAGS[f].glyph; } }
      const subl = l.delta && t.children[nl];
      if (subl) { const s = sv('tspan', { class: 'm360-dt ' + (l.dcls || 'neu') }, subl); s.textContent = '  ' + l.delta; }
    }
    function paint(cur) {
      for (const k in cur.links) {
        const l = cur.links[k]; const g = els.get('links|' + k); if (!g) continue;
        g.style.opacity = l.op;
        const b = Math.abs(l.y0b - l.y0);
        const [band, flow, work] = [g.querySelector('.m360-band'), g.querySelector('.m360-flow'), g.querySelector('.m360-workln')];
        g.classList.toggle('thin', b < 8);
        band.setAttribute('d', bandPath(l));
        if (flow) { flow.setAttribute('d', linePath(l, 0.5)); flow.style.strokeWidth = Math.max(1.4, Math.min(4.2, b * 0.22)).toFixed(2); flow.style.display = b < 2.2 ? 'none' : ''; }
        if (work) { work.setAttribute('d', linePath(l, b > 14 ? 0.16 : 0.5)); work.style.display = b < 7 ? 'none' : ''; }
      }
      for (const k in cur.nodes) {
        const n = cur.nodes[k]; const g = els.get('nodes|' + k); if (!g) continue;
        g.style.opacity = n.op;
        const [r, hit] = g.querySelectorAll('rect');
        const rx = n.kind === 'core' && !n.thin ? 10 : Math.min(3, n.w / 2);
        set(r, { x: n.x, y: n.y, width: Math.max(0, n.w), height: Math.max(0, n.h), rx });
        if (hit) set(hit, { x: n.x - 8, y: n.y - 4, width: n.w + 16, height: Math.max(20, n.h + 8) });
      }
      for (const k in cur.labels) {
        const l = cur.labels[k]; const g = els.get('labels|' + k); if (!g) continue;
        g.style.opacity = l.op;
        g.querySelector('text').setAttribute('transform', `translate(${l.x.toFixed(1)},${l.y.toFixed(1)})`);
        const lead = g.querySelector('.m360-lead');
        if (lead && l.ny != null) {
          const ly = l.y + 9; const off = Math.abs(ly - l.ny) > 4;
          const tx = l.anchor === 'end' ? l.x + 4 : l.x - 4;
          lead.setAttribute('d', off ? `M${l.nx.toFixed(1)},${l.ny.toFixed(1)}C${((l.nx + tx) / 2).toFixed(1)},${l.ny.toFixed(1)} ${((l.nx + tx) / 2).toFixed(1)},${ly.toFixed(1)} ${tx.toFixed(1)},${ly.toFixed(1)}` : '');
        }
      }
    }
    function set(e, a) { for (const k in a) e.setAttribute(k, typeof a[k] === 'number' ? a[k].toFixed(1) : a[k]); }

    function setHot(k) {
      st.hot = k;
      svg.classList.toggle('has-hot', !!k);
      gLinks.querySelectorAll('.m360-link').forEach((g) => g.classList.toggle('hot', !!k && (g.dataset.from === k || g.dataset.to === k || (k === 'core'))));
      gNodes.querySelectorAll('.m360-node').forEach((g) => g.classList.toggle('hot', g.dataset.key === k));
    }
    function markSel() { gNodes.querySelectorAll('.m360-node').forEach((g) => g.classList.toggle('sel', g.dataset.key === st.sel)); }

    function activate(k) {
      if (k === 'margin') return;
      const gr = graphOf(shown());
      const grp = gr.groups.find((x) => x.key === k);
      if (st.scene === 'money' && grp && grp.items.length && GROUP[grp.group].list) { st.scene = 'group'; st.focus = k; st.sel = k; return refresh(); }
      if (st.scene === 'group' && k === 'core') { st.sel = null; return goUp(); }
      st.sel = st.sel === k ? null : k;
      markSel(); renderPanel();
      if (typeof matchMedia === 'function' && matchMedia('(max-width: 959px)').matches && st.sel) panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    }

    function nodeAria(k) {
      const gr = graphOf(shown()); const x = find(gr, k);
      if (!x) return k;
      return `${x.label}, ${money(x.amount)}${k === 'core' ? '' : ', ' + cents(x.amount, gr.t.rev) + ' of each dollar'}`;
    }
    function find(gr, k) {
      if (k === 'core') return { label: data.business.name, amount: gr.t.rev };
      for (const r of gr.rev) if (r.key === k) return r;
      for (const g of gr.groups) { if (g.key === k) return g; for (const i of g.items) if (i.key === k) return i; }
      return null;
    }
    function linkTip(l) {
      const gr = graphOf(shown());
      const a = find(gr, l.from), b = find(gr, l.to);
      const v = st.live && st.live.links[l.key] ? null : null; void v;
      const val = (find(gr, l.to === 'core' ? l.from : l.to) || {}).amount || l.value;
      return `<strong>${esc(a ? (l.from === 'core' ? 'The business' : a.label) : '')} → ${esc(b ? (l.to === 'core' ? 'The business' : b.label) : '')}</strong><br>${money(val)} · ${cents(val, gr.t.rev)} of each $1`;
    }
    function showTip(ev, html) { tip.innerHTML = html; tip.hidden = false; const r = el.getBoundingClientRect(); let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14; if (x + 240 > r.width) x = ev.clientX - r.left - 250; tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
    function hideTip() { tip.hidden = true; }

    /* ---- side panel ---- */
    function renderPanel() {
      const p = shown(); const gr = graphOf(p); const t = gr.t; const c = ctx();
      const k = st.sel;
      const x = k ? find(gr, k) : null;
      let html = '';
      const chg = (key, a) => (c.base ? `<div class="m360-row"><span>${st.wi ? 'Before this what-if' : 'At ' + esc(periods()[0].label.split('·')[0].trim().toLowerCase())}</span><span>${c.base.has(key) ? money(c.base.get(key)) : 'not there yet'} <em class="m360-d">${delta(a, c.base.has(key) ? c.base.get(key) : 0)}</em></span></div>` : '');
      if (!x || k === 'core') {
        const parts = gr.groups.map((g) => ({ g: g.group, label: g.label, a: g.amount }));
        html += `<div class="m360-ph">The whole business</div><h3>Of every $1 that comes in</h3>
          <div class="m360-dollar" role="img" aria-label="${esc(parts.map((q) => q.label + ' ' + cents(q.a, t.rev)).join(', '))}">${parts.map((q) => `<i style="flex:${q.a};background:${colorVar(q.g)}" title="${esc(q.label)} ${cents(q.a, t.rev)}"></i>`).join('')}</div>
          <ul class="m360-cents">${parts.map((q) => `<li><button type="button" data-go="${q.g}"><i style="background:${colorVar(q.g)}"></i><span>${esc(q.label)}</span><b>${cents(q.a, t.rev)}</b></button></li>`).join('')}</ul>
          ${gr.loss ? `<p class="m360-warn">More went out than came in: ${money(gr.loss)} was covered from cash or savings.</p>` : ''}
          <div class="m360-rows">
            ${t.units ? `<div class="m360-row"><span>${cap(data.output.units)} a year</span><span>${num(t.units)}</span></div><div class="m360-row"><span>Money in per ${esc(data.output.unit || 'unit')}</span><span>${money(t.rev / t.units, true)}</span></div><div class="m360-row"><span>Profit kept per ${esc(data.output.unit || 'unit')}</span><span>${money(t.profit / t.units, true)}</span></div>` : ''}
          </div>
          <p class="m360-tipline">Tap any colour on the map to see what is inside it.</p>`;
      } else {
        const grp = GROUP[x.group] || null;
        const kind = k.startsWith('revenue:') ? 'Money in' : k === 'loss' ? 'Shortfall' : k.includes(':') ? GROUP[k.split(':')[0]].label : 'Money out';
        html += `<div class="m360-ph"><i style="background:${colorVar(x.group)}"></i>${esc(kind)}</div><h3>${esc(x.label)}</h3>
          ${grp && !k.includes(':') ? `<p class="m360-blurb">${esc(grp.blurb)}</p>` : ''}
          <div class="m360-big">${money(x.amount)} <small>${k === 'loss' ? 'a year' : cents(x.amount, t.rev) + ' of each $1'}</small></div><div class="m360-rows">`;
        if (k === 'loss') html += `<p class="m360-warn">More went out than came in. The gap was covered from cash, savings or credit.</p>`;
        if (k.startsWith('revenue:')) {
          const r = x.item;
          html += `<div class="m360-row"><span>Share of money in</span><span>${Math.round((100 * x.amount) / t.rev)}%</span></div>`;
          if (r.units) html += `<div class="m360-row"><span>${cap(data.output.units)}</span><span>${num(r.units)}</span></div><div class="m360-row"><span>Average per ${esc(data.output.unit || 'unit')}</span><span>${money(x.amount / r.units, true)}</span></div>`;
        }
        if (x.items && x.items.length) html += x.items.map((i) => `<div class="m360-row m360-item"><button type="button" data-sel="${esc(i.key)}">${esc(i.label)}</button><span>${money(i.amount)}</span><i class="m360-bar"><b style="width:${(100 * i.amount / x.amount).toFixed(1)}%;background:${colorVar(x.group)}"></b></i></div>`).join('');
        if (k === 'people') html += `<div class="m360-row"><span>People on payroll</span><span>${num(t.headcount)}</span></div><div class="m360-row"><span>Average cost per person</span><span>${money(x.amount / Math.max(1, t.headcount))}</span></div>`;
        if (x.item && x.group === 'people') html += `<div class="m360-row"><span>People</span><span>${x.item.headcount}</span></div><div class="m360-row"><span>Cost per person</span><span>${money(x.amount / Math.max(1, x.item.headcount))}</span></div><div class="m360-row"><span>Share of payroll</span><span>${Math.round(100 * x.amount / t.g.people)}%</span></div>`;
        if (x.item && x.item.who) html += `<div class="m360-row"><span>Paid to</span><span>${esc(x.item.who)}</span></div>`;
        if (t.units && k !== 'loss' && !k.startsWith('revenue:')) html += `<div class="m360-row"><span>Per ${esc(data.output.unit || 'unit')}</span><span>${money(x.amount / t.units, true)}</span></div>`;
        html += chg(k, x.amount) + '</div>';
        if (x.item && x.item.note) html += `<p class="m360-note">${esc(x.item.note)}</p>`;
        if (k === 'profit') html += `<p class="m360-note">This is what is left after people, materials, overhead, the owner, loans and taxes are paid.</p>`;
      }
      const fs = k && k !== 'core' ? findingsFor(data, k) : [];
      if (fs.length) html += `<div class="m360-pfind"><div class="m360-ph">What we found here</div>${fs.map(findCard).join('')}</div>`;
      const ns = st.view === 'internal' && k ? notesFor(data, k) : [];
      if (ns.length) html += `<div class="m360-pnotes"><div class="m360-ph">Consultant notes · internal</div>${ns.map((n) => `<p>${esc(n.text)}</p>`).join('')}</div>`;
      if (st.sel) html = `<button type="button" class="m360-close" data-clear aria-label="Back to the whole business">×</button>` + html;
      panel.innerHTML = html;
      panel.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => activate(b.dataset.go));
      panel.querySelectorAll('[data-sel]').forEach((b) => b.onclick = () => { const key = b.dataset.sel; const g = key.split(':')[0]; if (st.scene !== 'group' || st.focus !== g) { if (st.scene !== 'work') { st.scene = 'group'; st.focus = g; } st.sel = key; refresh(); } else { st.sel = key; markSel(); renderPanel(); } });
      panel.querySelectorAll('[data-node]').forEach((b) => b.onclick = () => showNode(b.dataset.node));
      const cl = panel.querySelector('[data-clear]'); if (cl) cl.onclick = () => { st.sel = null; markSel(); renderPanel(); };
    }

    function firstFix() {
      const fs = data.findings || []; const f = fs.find((x) => x.flag === 'fix_now') || fs.find((x) => x.flag === 'improve_next');
      return f ? `<button type="button" class="m360-first fl-${f.flag}" data-first="${esc(f.id || '')}"><b aria-hidden="true">${FLAGS[f.flag].glyph}</b>${f.flag === 'fix_now' ? 'First to fix' : 'Next to improve'}: ${esc(f.title)} <span aria-hidden="true">↓</span></button>` : '';
    }
    function where(key) {
      if (key === 'core') return 'The whole business';
      const [g, id] = key.split(':');
      if (g === 'revenue') { const r = (period().revenue.find((x) => x.id === id) || periods().flatMap((p) => p.revenue).find((x) => x.id === id)); return 'Money in › ' + (r ? r.label : id); }
      const G = GROUP[g]; if (!id) return G ? G.label : key;
      const it = periods().flatMap((p) => p[g] || []).find((x) => x.id === id);
      return G.label + ' › ' + (it ? it.label : id);
    }
    function findCard(f) {
      return `<article class="m360-find fl-${f.flag}"><div class="m360-find-h"><span class="m360-flag fl-${f.flag}"><b aria-hidden="true">${FLAGS[f.flag].glyph}</b>${FLAGS[f.flag].label}</span><span class="m360-lens">${esc(LENSES[f.lens])}</span></div><h4>${esc(f.title)}</h4>${f.detail ? `<p>${esc(f.detail)}</p>` : ''}<button type="button" class="m360-where" data-node="${esc(f.node)}">On the map: ${esc(where(f.node))} →</button></article>`;
    }
    function showNode(key) {
      const g = key.split(':')[0];
      if (key.includes(':') && GROUP[g] && GROUP[g].list) { st.scene = 'group'; st.focus = g; }
      else if (st.scene !== 'money' && !(st.scene === 'work' && key.startsWith('revenue:'))) { st.scene = 'money'; st.focus = null; }
      st.sel = key; refresh();
      mapCard.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }

    /* ---- monthly trend ---- */
    function renderTrend() {
      const p = period(); const m = p.monthly;
      if (st.wi) { trend.innerHTML = `<h3>Month by month</h3><p class="m360-empty">Hidden during a what-if: the monthly figures are real, the what-if is not.</p>`; return; }
      if (!m) { trend.innerHTML = `<h3>Month by month</h3><p class="m360-empty">Monthly figures were not entered for “${esc(p.label)}”.</p>`; return; }
      const labels = monthLabels(p);
      const W = Math.max(280, trend.clientWidth - 40 || 800), H = 170, pl = 52, pr = 8, pt = 12, pb = 26;
      const max = Math.max(...m.revenue, ...m.spend) * 1.08;
      const tk = niceTicks(max);
      const bw = (W - pl - pr) / 12;
      const y = (v) => pt + (H - pt - pb) * (1 - v / tk[tk.length - 1]);
      let s = `<svg class="m360-tsvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Money in and money out for each month">`;
      for (const v of tk) s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="ax" x="${pl - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${money(v)}</text>`;
      m.revenue.forEach((v, i) => { const x = pl + i * bw + bw * 0.18; const top = y(v); s += `<path class="bar${v < m.spend[i] ? ' short' : ''}" d="M${x.toFixed(1)},${y(0).toFixed(1)}V${(top + 4).toFixed(1)}q0,-4 4,-4h${(bw * 0.64 - 8).toFixed(1)}q4,0 4,4V${y(0).toFixed(1)}Z"/>`; s += `<text class="ax" x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(String(labels[i]).split(' ')[0])}</text>`; });
      s += `<path class="spend" d="${m.spend.map((v, i) => (i ? 'L' : 'M') + (pl + i * bw + bw / 2).toFixed(1) + ',' + y(v).toFixed(1)).join('')}"/>`;
      m.spend.forEach((v, i) => { s += `<circle class="spend-dot" cx="${(pl + i * bw + bw / 2).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4"/>`; });
      m.revenue.forEach((v, i) => { s += `<rect class="hitm" data-i="${i}" x="${(pl + i * bw).toFixed(1)}" y="${pt}" width="${bw.toFixed(1)}" height="${H - pt - pb}"/>`; });
      s += '</svg>';
      const low = m.revenue.indexOf(Math.min(...m.revenue)), high = m.revenue.indexOf(Math.max(...m.revenue));
      const shortN = m.revenue.filter((v, i) => v < m.spend[i]).length;
      trend.innerHTML = `<div class="m360-th"><h3>Month by month · ${esc(p.label)}</h3><div class="m360-tleg"><span><i class="lg-bar"></i>Money in</span><span><i class="lg-spend"></i>Money out</span><span><i class="lg-short"></i>Month where more went out</span></div></div>
        <p class="m360-tsum">Busiest month ${esc(labels[high])} (${money(m.revenue[high])}), slowest ${esc(labels[low])} (${money(m.revenue[low])}). ${shortN ? `<i class="lg-short m360-sw"></i>${shortN} month${shortN > 1 ? 's' : ''} (red bars) spent more than came in.` : 'Every month took in more than it spent.'}</p>${s}`;
      trend.querySelectorAll('.hitm').forEach((r) => { r.addEventListener('pointermove', (ev) => { const i = +r.dataset.i; showTip(ev, `<strong>${esc(labels[i])}</strong><br>In ${money(m.revenue[i])} · Out ${money(m.spend[i])}<br>${m.revenue[i] >= m.spend[i] ? 'Kept' : 'Short'} ${money(Math.abs(m.revenue[i] - m.spend[i]))}`); r.classList.add('on'); }); r.addEventListener('pointerleave', () => { hideTip(); r.classList.remove('on'); }); });
    }
    function niceTicks(max) {
      const raw = max / 3; const mag = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / mag;
      const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
      const out = []; for (let v = 0; v <= max + step * 0.01; v += step) out.push(v); if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
      return out;
    }

    /* ---- findings, lenses, notes, ledger, footer ---- */
    function renderLower() {
      const fs = data.findings || [];
      findEl.innerHTML = `<h3>What we found</h3>${fs.length ? `<div class="m360-fcols">${Object.keys(FLAGS).map((k) => { const list = fs.filter((f) => f.flag === k); return `<div class="m360-fcol"><div class="m360-fcol-h fl-${k}"><b aria-hidden="true">${FLAGS[k].glyph}</b>${FLAGS[k].label} <span>${list.length}</span></div>${list.length ? list.map(findCard).join('') : '<p class="m360-empty">None</p>'}</div>`; }).join('')}</div>` : '<p class="m360-empty">No findings yet. They appear here once the assessment is done.</p>'}`;
      findEl.querySelectorAll('[data-node]').forEach((b) => b.onclick = () => showNode(b.dataset.node));
      const L = data.lenses || {};
      lensEl.innerHTML = `<h3>The four lenses</h3><p class="m360-lsub">How well each part of the business would hold up today, scored 1 to 5 by Humble Services: at risk, fragile, workable, solid, strong. A starting point to build on, not a grade.</p>${Object.keys(LENSES).map((k) => { const v = L[k]; return `<div class="m360-lensrow"><div class="m360-lensname">${esc(LENSES[k])}<small>${LENS_GLOSS[k]}</small></div><div class="m360-meter" role="img" aria-label="${esc(LENSES[k])}: ${v ? v + ' of 5, ' + LENS_WORDS[v] : 'not scored yet'}">${[1, 2, 3, 4, 5].map((i) => `<i class="${v && i <= v ? 'on s' + v : ''}"></i>`).join('')}</div><div class="m360-lensword ${v ? '' : 'none'}">${v ? LENS_WORDS[v] : 'Not scored yet'}</div></div>`; }).join('')}`;
      const ns = (st.view === 'internal' && data.internal && data.internal.notes) || [];
      notesEl.hidden = !ns.length;
      notesEl.innerHTML = ns.length ? `<h3>Consultant notes <span class="m360-internal">Internal · never in the owner copy</span></h3><ul>${ns.map((n) => `<li><button type="button" class="m360-where" data-node="${esc(n.node)}">${esc(where(n.node))}</button> ${esc(n.text)}</li>`).join('')}</ul>` : '';
      notesEl.querySelectorAll('[data-node]').forEach((b) => b.onclick = () => showNode(b.dataset.node));
      const src = data.sources || [];
      foot.innerHTML = `${data.sample ? `<p><strong>Sample business.</strong> ${esc(data.sample_basis || 'Invented for demonstration.')}</p>` : ''}
        <p>Findings are observations for discussion with Humble Services. They are not legal, tax, investment or valuation advice, and no result is promised.</p>
        ${src.length ? `<details><summary>Where the sample numbers come from (${src.length})</summary><ul>${src.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}</li>`).join('')}</ul></details>` : ''}`;
    }
    function renderLedger() {
      const p = shown(); const gr = graphOf(p); const c = ctx();
      const row = (key, label, a, cls) => `<tr class="${cls || ''}"><th scope="row">${esc(label)}</th><td>${money(a, true)}</td><td>${gr.t.rev ? cents(a, gr.t.rev) : ''}</td>${c.base ? `<td>${c.base.has(key) ? money(c.base.get(key), true) : '—'}</td><td>${delta(a, c.base.has(key) ? c.base.get(key) : 0)}</td>` : ''}</tr>`;
      let body = gr.rev.filter((r) => r.group !== 'loss').map((r) => row(r.key, r.label, r.amount, 'in')).join('') + row('core', 'Total money in', gr.t.rev, 'tot');
      for (const g of gr.groups) { body += row(g.key, g.label, g.amount, 'grp'); for (const i of g.items) body += row(i.key, '— ' + i.label, i.amount, 'itm'); }
      if (gr.loss) body += row('loss', 'Shortfall covered from cash', gr.loss, 'loss');
      ledger.innerHTML = `<summary>All the numbers · ${esc(st.wi ? 'what-if on ' + period().label : p.label)}</summary><div class="m360-tablewrap"><table><thead><tr><th scope="col">Line</th><th scope="col">A year</th><th scope="col">Of each $1</th>${c.base ? `<th scope="col">${st.wi ? 'Before what-if' : esc(periods()[0].label)}</th><th scope="col">Change</th>` : ''}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    /* ---- lifecycle ---- */
    function refresh(dur) {
      renderHead(); renderWhatIf(); renderKpis(); renderTools(); draw(dur == null ? 720 : dur); renderPanel(); renderTrend(); renderLower(); renderLedger();
    }
    function setData(next, keepState) {
      const errs = validate(next);
      if (errs.length) { el.dataset.errors = errs.length; }
      raw = next;
      data = st.view === 'owner' ? ownerCopy(next) : clone(next);
      if (!keepState) { st.pi = data.periods.length - 1; st.scene = 'money'; st.focus = null; st.sel = null; st.compare = false; st.wi = null; st.live = null; els.forEach((e) => e.remove()); els.clear(); for (const k in kpiPrev) delete kpiPrev[k]; }
      else st.pi = Math.min(st.pi, data.periods.length - 1);
      wibar.dataset.built = '';
      refresh(keepState ? 300 : 0);
      return errs;
    }
    let rw = 0, lastW = 0;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const w = mapBox.clientWidth; if (Math.abs(w - lastW) < 2) return; lastW = w; clearTimeout(rw); rw = setTimeout(() => { draw(0); renderTrend(); }, 60); }) : null;
    if (ro) ro.observe(mapBox);
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { if (st.scene === 'group') goUp(); else if (st.sel) { st.sel = null; markSel(); renderPanel(); } } });
    const errors = setData(input);
    return {
      errors,
      setData: (d, keep) => setData(d, keep),
      setView: (v) => { st.view = v; setData(raw, true); },
      state: () => ({ scene: st.scene, focus: st.focus, sel: st.sel, pi: st.pi, compare: st.compare, whatIf: st.wi && Object.assign({}, st.wi) }),
      go: (o) => { Object.assign(st, o); refresh(o.dur); },
      destroy: () => { if (ro) ro.disconnect(); cancelAnimationFrame(st.raf); el.innerHTML = ''; el.classList.remove('m360'); },
    };
  }
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

  return Object.assign(api, { mount });
});
