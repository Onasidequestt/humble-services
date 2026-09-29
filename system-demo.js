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
  var person = null;
  // On a phone the inspector would sit far below the list, so it moves to just under the panel that was tapped,
  // with a "Back to the list" button. On a wide screen it stays in its own column on the right.
  var narrow = window.matchMedia('(max-width: 900px)');
  var lastRow = null;
  var home = [].slice.call(app.querySelectorAll('.dm-insp')).map(function (insp) { return { insp: insp, parent: insp.parentNode }; });
  function dockAll() { home.forEach(function (h) { if (h.insp.parentNode !== h.parent) h.parent.appendChild(h.insp); }); }
  narrow.addEventListener('change', function () { if (!narrow.matches) dockAll(); });

  function forPerson(el) { return (el.getAttribute('data-for') || el.getAttribute('data-roles') || '').split(' ').indexOf(person) >= 0; }

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
    show(p === 'owner' ? 'home' : 'books', true);
  }

  function backToDoor() {
    person = null;
    shell.hidden = true;
    door.hidden = false;
    var h = door.querySelector('h2');
    h.setAttribute('tabindex', '-1');
    h.focus();
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
    if (t.hasAttribute('data-person')) { openAs(t.getAttribute('data-person')); return; }
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

  // Start at the front door, or straight in when the link names a person (for example system-demo.html#as-cfo).
  shell.hidden = true;
  screens.forEach(function (s) { resetInspector(s); });
  var m = /^#as-(owner|cfo|cpa|acct)$/.exec(window.location.hash);
  if (m) openAs(m[1]);
})();
