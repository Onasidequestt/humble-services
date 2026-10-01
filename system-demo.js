/* system-demo.html: the clickable demo. Everything it shows is already in the page as made-up sample text; this file
   only shows and hides parts of it. It builds no markup from strings, makes no network call and never leaves the page.
   Without scripts the page still reads top to bottom: the four screens simply stack. */
(function () {
  'use strict';
  var app = document.getElementById('dm-app');
  if (!app) return;
  var door = document.getElementById('dm-door');
  var shell = document.getElementById('dm-shell');
  var who = document.getElementById('dm-who');
  var screens = [].slice.call(app.querySelectorAll('.dm-screen[data-screen]'));
  var pills = [].slice.call(app.querySelectorAll('.dm-pill'));
  var PEOPLE = {
    owner: 'you, the owner',
    cfo: 'your CFO',
    cpa: 'your CPA',
    acct: 'an accountant'
  };
  // The seat table on the Company screen is the one source for every seat, number and access rule shown.
  var seatRows = [].slice.call(app.querySelectorAll('#og-seats tbody tr'));
  var cats = [].slice.call(app.querySelectorAll('#og-seats thead th[data-cat]'));
  function seat(k) { return app.querySelector('#og-seats tr[data-seat="' + k + '"]'); }
  function seatName(tr) { return tr.querySelector('th').textContent; }
  seatRows.forEach(function (tr) { var k = tr.getAttribute('data-seat'); if (!PEOPLE[k]) PEOPLE[k] = seatName(tr); });
  var person = null;
  // On a phone the inspector would sit far below the list, so it moves to just under the panel that was tapped,
  // with a "Back to the list" button. On a wide screen it stays in its own column on the right.
  var narrow = window.matchMedia('(max-width: 900px)');
  var lastRow = null;
  var home = [].slice.call(app.querySelectorAll('.dm-insp')).map(function (insp) { return { insp: insp, parent: insp.parentNode }; });
  function dockAll() { home.forEach(function (h) { if (h.insp.parentNode !== h.parent) h.parent.appendChild(h.insp); }); }
  narrow.addEventListener('change', function () { if (!narrow.matches) dockAll(); });

  function forPerson(el) { var f = el.getAttribute('data-for') || el.getAttribute('data-roles') || ''; return f === '*' || f.split(' ').indexOf(person) >= 0; }

  function resetInspector(screen) {
    screen.querySelectorAll('.dm-detail').forEach(function (d) { d.hidden = true; });
    screen.querySelectorAll('[data-show][aria-pressed]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    screen.querySelectorAll('.dm-insp-empty').forEach(function (p) { p.hidden = false; });
    screen.querySelectorAll('.dm-say').forEach(function (p) { p.textContent = ''; });
    screen.querySelectorAll('.dm-back').forEach(function (b) { b.hidden = true; });
  }

  function show(name, focus) {
    dockAll();
    screens.forEach(function (s) {
      s.hidden = s.getAttribute('data-screen') !== name;
      if (!s.hidden) resetInspector(s);
    });
    if (name === 'company') drawMap();
    if (name === 'access') fillAccess();
    pills.forEach(function (p) {
      if (p.getAttribute('data-screen') === name) p.setAttribute('aria-current', 'page'); else p.removeAttribute('aria-current');
    });
    if (focus) {
      var h = app.querySelector('.dm-screen[data-screen="' + name + '"] h2');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
    }
  }

  function openAs(p) {
    person = p;
    door.hidden = true;
    shell.hidden = false;
    who.textContent = 'Open as: ';
    var b = document.createElement('b');
    b.textContent = PEOPLE[p];
    who.appendChild(b);
    pills.forEach(function (x) { x.parentNode.hidden = !forPerson(x); });
    app.querySelectorAll('[data-roles]').forEach(function (el) { el.hidden = !forPerson(el); });
    show(p === 'owner' ? 'home' : /^board_/.test(p) ? 'company' : /^(cfo|cpa|acct)$/.test(p) ? 'books' : 'access', true);
  }

  function backToDoor() {
    person = null;
    shell.hidden = true;
    door.hidden = false;
    var h = door.querySelector('h2');
    h.setAttribute('tabindex', '-1');
    h.focus();
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  // The four levels of the access model, lowest first; each table cell carries its level code in data-level.
  var LEVELS = ['none', 'rollup', 'read', 'write'];
  var BADGE = { none: 'bad', rollup: 'key', read: 'ok', write: 'ok' };
  var AI_NOTE = 'An AI seat opens only what the seat table lists for it, never more than Read: it reads and proposes, and a person approves any change. Where its work runs, and what may leave the company, is not decided yet.';
  function cell(tr, i) { return tr.querySelectorAll('td[data-level]')[i]; }
  function level(tr, i) { return cell(tr, i).getAttribute('data-level'); }
  function word(tr, i) { return cell(tr, i).textContent; }
  function tableSeat(p) { return seat(p === 'owner' ? 'ceo' : p === 'acct' ? 'cpa' : p); }
  function openInsp(screen, btn, fill) {
    resetInspector(screen);
    screen.querySelectorAll('.dm-insp-empty').forEach(function (p) { p.hidden = true; });
    var d = screen.querySelector('.dm-detail');
    while (d.firstChild) d.removeChild(d.firstChild);
    fill(d);
    d.hidden = false;
    btn.setAttribute('aria-pressed', 'true');
    lastRow = btn;
    if (narrow.matches) {
      var insp = d.closest('.dm-insp'), panel = btn.closest('.dm-frame');
      panel.parentNode.insertBefore(insp, panel.nextSibling);
      insp.querySelector('.dm-back').hidden = false;
      insp.scrollIntoView({ block: 'start' });
    }
  }
  function badge(tr, i) { return el('span', 'dm-badge ' + BADGE[level(tr, i)], word(tr, i)); }

  // What I can see: one line per kind of record, from this seat's row of the table.
  function fillAccess() {
    var tr = tableSeat(person), list = document.getElementById('ac-list');
    if (!tr || !list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    var n = { none: 0, rollup: 0, read: 0, write: 0 };
    cats.forEach(function (th, i) {
      var lv = level(tr, i); n[lv]++;
      var b = el('button', 'dm-row' + (lv === 'none' ? ' locked' : '')); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('data-cat', th.getAttribute('data-cat'));
      var t = el('span'); t.appendChild(el('b', '', th.textContent));
      t.appendChild(el('small', '', lv === 'none' ? 'Locked for this seat' : th.getAttribute(lv === 'rollup' ? 'data-rollup' : 'data-read')));
      b.appendChild(t); b.appendChild(badge(tr, i));
      var li = el('li'); li.appendChild(b); list.appendChild(li);
    });
    document.getElementById('ac-head').textContent = 'Open as ' + seatName(tr) + (tr.getAttribute('data-kind') === 'ai' ? ' (AI seat): ' : ' (human seat): ') +
      (n.write + n.read) + ' to read, ' + n.rollup + ' as totals only, ' + n.none + ' locked.' + (person === 'acct' ? ' In this example org an accountant sits in the same seat as your CPA.' : '');
  }
  function whoCan(i) {
    return seatRows.filter(function (r) { return level(r, i) === 'read' || level(r, i) === 'write'; }).map(seatName).join(', ');
  }
  function catDetail(btn) {
    var tr = tableSeat(person), key = btn.getAttribute('data-cat');
    var i = cats.map(function (c) { return c.getAttribute('data-cat'); }).indexOf(key), th = cats[i], lv = level(tr, i);
    openInsp(btn.closest('.dm-screen'), btn, function (d) {
      d.appendChild(el('h4', '', th.textContent));
      if (lv === 'none') {
        var w = el('div', 'dm-frame dm-wall ac-wall');
        w.appendChild(el('p', 'dm-headline', 'No access'));
        w.appendChild(el('p', '', seatName(tr) + ' cannot open ' + th.textContent.toLowerCase() + '. The system would refuse.'));
        var nb = el('p'); nb.appendChild(el('span', 'dm-badge todo', 'Not built yet')); w.appendChild(nb);
        d.appendChild(w);
      } else {
        var p = el('p'); p.appendChild(badge(tr, i));
        p.appendChild(document.createTextNode(' ' + th.getAttribute(lv === 'rollup' ? 'data-rollup' : 'data-read') + (lv === 'write' ? ' This seat can also change it.' : '')));
        d.appendChild(p);
        var s = el('p'); s.appendChild(el('span', 'dm-badge todo', 'Not built yet')); d.appendChild(s);
      }
      d.appendChild(el('p', '', 'Who can read it in full: ' + whoCan(i) + '.'));
      if (tr.getAttribute('data-kind') === 'ai') d.appendChild(el('p', '', AI_NOTE));
    });
  }

  // The CEO's map: every seat from the table, drawn as boxes with lines to whom they report.
  var map = document.getElementById('og-map');
  // On a small phone the departments stack in one column: they hang off a left-hand spine from the CEO, the same way
  // a team hangs off its manager, so no line runs through another department's boxes.
  var oneCol = window.matchMedia('(max-width: 480px)');
  function node(tr, depth) {
    var b = el('button', 'og-node' + (tr.getAttribute('data-kind') === 'ai' ? ' ai' : '') + (depth ? ' og-kid' : ''));
    b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('data-seat', tr.getAttribute('data-seat'));
    if (depth) b.style.marginLeft = (depth * 22) + 'px';
    b.appendChild(el('b', '', seatName(tr)));
    if (tr.getAttribute('data-kind') === 'ai') b.appendChild(el('span', 'dm-badge ai', 'AI seat'));
    else b.appendChild(el('small', '', tr.querySelector('td').textContent));
    return b;
  }
  function kids(k) { return seatRows.filter(function (r) { return r.getAttribute('data-parent') === k; }); }
  function addKids(col, k, depth) { kids(k).forEach(function (c) { col.appendChild(node(c, depth)); addKids(col, c.getAttribute('data-seat'), depth + 1); }); }
  function drawMap() {
    if (!map || map.getAttribute('data-drawn')) { lines(); return; }
    map.setAttribute('data-drawn', '1');
    while (map.firstChild) map.removeChild(map.firstChild);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'og-lines'); svg.setAttribute('aria-hidden', 'true');
    map.appendChild(svg);
    // Seats that report to no one: the board members sit on top, the CEO below them.
    var roots = seatRows.filter(function (r) { return !r.getAttribute('data-parent'); });
    var ceo = roots.filter(function (r) { return kids(r.getAttribute('data-seat')).length; })[0];
    var top = el('div', 'og-top');
    roots.filter(function (r) { return r !== ceo; }).forEach(function (r) { top.appendChild(node(r, 0)); });
    map.appendChild(top);
    var mid = el('div', 'og-mid'); mid.appendChild(node(ceo, 0)); map.appendChild(mid);
    var grid = el('div', 'og-depts');
    kids(ceo.getAttribute('data-seat')).forEach(function (r) {
      var col = el('div', 'og-col'); col.appendChild(node(r, 0)); addKids(col, r.getAttribute('data-seat'), 1); grid.appendChild(col);
    });
    map.appendChild(grid);
    lines();
    var ex = document.getElementById('og-examples');
    if (ex) ex.getAttribute('data-ex').split(';').forEach(function (pair) {
      var p = pair.split(':'), tr = seat(p[0]), li = el('li');
      li.appendChild(el('b', '', seatName(tr) + ': '));
      p[1].split(',').forEach(function (k, n) {
        var i = cats.map(function (c) { return c.getAttribute('data-cat'); }).indexOf(k);
        if (n) li.appendChild(document.createTextNode(', '));
        li.appendChild(document.createTextNode(cats[i].textContent + ' '));
        li.appendChild(badge(tr, i));
      });
      ex.appendChild(li);
    });
  }
  function lines() {
    if (!map || !map.offsetWidth) return;
    var svg = map.querySelector('.og-lines'), o = map.getBoundingClientRect();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('width', map.offsetWidth); svg.setAttribute('height', map.offsetHeight);
    map.querySelectorAll('.og-node').forEach(function (b) {
      var up = seat(b.getAttribute('data-seat')).getAttribute('data-parent');
      if (!up) return;
      var a = map.querySelector('.og-node[data-seat="' + up + '"]').getBoundingClientRect(), c = b.getBoundingClientRect(), d;
      if (b.classList.contains('og-kid')) { var lx = a.left - o.left + 10; d = 'M' + lx + ' ' + (a.bottom - o.top) + 'V' + (c.top + c.height / 2 - o.top) + 'H' + (c.left - o.left); }
      else if (oneCol.matches) { var sx = 8, ay2 = a.bottom - o.top + 10; d = 'M' + (a.left + a.width / 2 - o.left) + ' ' + (a.bottom - o.top) + 'V' + ay2 + 'H' + sx + 'V' + (c.top + c.height / 2 - o.top) + 'H' + (c.left - o.left); }
      else { var ax = a.left + a.width / 2 - o.left, cx = c.left + c.width / 2 - o.left, cy = c.top - o.top; d = 'M' + ax + ' ' + (a.bottom - o.top) + 'V' + (cy - 12) + 'H' + cx + 'V' + cy; }
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d); if (b.classList.contains('ai')) path.setAttribute('class', 'ai');
      svg.appendChild(path);
    });
  }
  window.addEventListener('resize', function () { if (map && map.getAttribute('data-drawn')) lines(); });
  function seatDetail(btn) {
    var tr = seat(btn.getAttribute('data-seat'));
    openInsp(btn.closest('.dm-screen'), btn, function (d) {
      d.appendChild(el('h4', '', seatName(tr)));
      var kv = el('dl', 'dm-kv'), td = tr.querySelectorAll('td');
      [['Department', td[0].textContent], ['Kind', td[1].textContent]].forEach(function (p) { kv.appendChild(el('dt', '', p[0])); kv.appendChild(el('dd', '', p[1])); });
      d.appendChild(kv);
      LEVELS.slice().reverse().forEach(function (lv) {
        var idx = cats.map(function (c, i) { return i; }).filter(function (i) { return level(tr, i) === lv; });
        if (!idx.length) return;
        var p = el('p'); p.appendChild(badge(tr, idx[0])); p.appendChild(document.createTextNode(' ' + idx.map(function (i) { return cats[i].textContent; }).join(', ')));
        d.appendChild(p);
      });
      if (tr.getAttribute('data-kind') === 'ai') d.appendChild(el('p', '', AI_NOTE));
      var acts = el('div', 'dm-acts'), go = el('button', 'dm-btn go', 'Open as this seat'); go.type = 'button'; go.setAttribute('data-person', tr.getAttribute('data-seat'));
      acts.appendChild(go); d.appendChild(acts);
    });
  }

  function say(btn) {
    var frame = btn.closest('.dm-frame');
    var line = frame.querySelector('.dm-say');
    if (!line) {
      line = document.createElement('p');
      line.className = 'dm-say';
      line.setAttribute('aria-live', 'polite');
      frame.appendChild(line);
    }
    line.textContent = 'Demo only. ' + btn.getAttribute('data-say');
  }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t || !app.contains(t)) return;
    if (t.hasAttribute('data-person')) { openAs(t.getAttribute('data-person')); if (t.hasAttribute('data-go')) show(t.getAttribute('data-go'), true); return; }
    if (t.id === 'dm-change') { backToDoor(); return; }
    if (t.classList.contains('dm-back')) {
      var back = lastRow;
      resetInspector(t.closest('.dm-screen'));
      dockAll();
      if (back) { back.focus(); back.scrollIntoView({ block: 'center' }); }
      return;
    }
    if (t.classList.contains('dm-pill')) { show(t.getAttribute('data-screen'), false); return; }
    if (t.hasAttribute('data-goto')) { show(t.getAttribute('data-goto'), true); return; }
    if (t.hasAttribute('data-say')) { say(t); return; }
    if (t.classList.contains('og-node')) { seatDetail(t); return; }
    if (t.hasAttribute('data-cat')) { catDetail(t); return; }
    if (t.hasAttribute('data-show')) {
      var screen = t.closest('.dm-screen');
      var target = document.getElementById(t.getAttribute('data-show'));
      if (!target) return;
      resetInspector(screen);
      screen.querySelectorAll('.dm-insp-empty').forEach(function (p) { p.hidden = true; });
      target.hidden = false;
      if (t.hasAttribute('aria-pressed')) t.setAttribute('aria-pressed', 'true');
      lastRow = t;
      var insp = target.closest('.dm-insp');
      if (narrow.matches) {
        var panel = t.closest('.dm-frame');
        if (panel.parentNode.classList.contains('dm-two')) panel = panel.parentNode;
        panel.parentNode.insertBefore(insp, panel.nextSibling);
        insp.querySelector('.dm-back').hidden = false;
        insp.scrollIntoView({ block: 'start' });
      }
    }
  });

  // On a phone the seat table folds away behind "Show the seat table"; the map and each seat's view already read from it.
  var tbl = document.getElementById('og-tbl');
  if (tbl && narrow.matches) tbl.open = false;

  // Start at the front door, or straight in when the link names a person (for example system-demo.html#as-cfo).
  shell.hidden = true;
  screens.forEach(function (s) { resetInspector(s); });
  var m = /^#as-([a-z_]+)$/.exec(window.location.hash);
  if (m && PEOPLE[m[1]]) openAs(m[1]);
})();
