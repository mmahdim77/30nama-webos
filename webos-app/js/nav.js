/* Spatial navigation + remote key handling. */
(function () {
  var K = N.keys;
  var nav = N.nav = { cur: null, scopes: [], handlers: [] };

  // webOS delivers every remote key (media, color, Back with disableBackHistoryAPI) to the foreground app: nothing to register.
  nav.registerKeys = function () {};

  function visible(el) { return el.offsetWidth > 0 && el.offsetHeight > 0; }
  function root() { return nav.scopes.length ? nav.scopes[nav.scopes.length - 1] : document.body; }
  nav.pushScope = function (el) { nav.scopes.push(el); };
  nav.popScope = function () { nav.scopes.pop(); };
  nav.candidates = function () {
    var rt = root(), list = rt.querySelectorAll('.f'), out = [], inSheet = rt.classList && rt.classList.contains('sheet-eps');
    for (var i = 0; i < list.length; i++) {
      if (!visible(list[i]) || list[i].disabled) continue;
      if (!inSheet && list[i].closest && list[i].closest('.sheet-eps')) continue; // the closed episodes sheet is laid out but off-screen/hidden: never a target
      out.push(list[i]);
    }
    return out;
  };

  nav.focus = function (el, noScroll) {
    if (!el) return;
    if (nav.cur && nav.cur !== el) { nav.cur.classList.remove('focus'); }
    nav.cur = el; el.classList.add('focus');
    if (el.tagName === 'INPUT') { try { el.focus(); } catch (e) {} }
    else if (document.activeElement && document.activeElement.tagName === 'INPUT') { document.activeElement.blur(); }
    if (!noScroll) nav.ensureVisible(el);
    if (nav.onFocusChange) nav.onFocusChange(el);
    if (el.onfocus2) el.onfocus2(el);
  };
  nav.focusFirst = function (container) {
    var c = (container || root()).querySelectorAll('.f'), i;
    for (i = 0; i < c.length; i++) if (visible(c[i])) { nav.focus(c[i]); return c[i]; }
    return null;
  };
  nav.clear = function () { if (nav.cur) nav.cur.classList.remove('focus'); nav.cur = null; };

  nav.ensureVisible = function (el) {
    var p = el.parentNode;
    while (p && p !== document.body) {
      if (p.reveal) { p.reveal(el); return; }
      if (p.classList && p.classList.contains('scroll')) {
        var pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
        var mv = p.hasAttribute('data-mv') ? Number(p.getAttribute('data-mv')) : 130, mh = 60;
        if (r.bottom > pr.bottom - mv) p.scrollTop += r.bottom - (pr.bottom - mv);
        else if (r.top < pr.top + mv) p.scrollTop -= (pr.top + mv) - r.top;
        pr = p.getBoundingClientRect(); r = el.getBoundingClientRect();
        if (r.right > pr.right - mh) p.scrollLeft += r.right - (pr.right - mh);
        else if (r.left < pr.left + mh) p.scrollLeft -= (pr.left + mh) - r.left;
      }
      p = p.parentNode;
    }
  };

  nav.move = function (dir) {
    var cur = nav.cur;
    if (!cur || !visible(cur) || !root().contains(cur)) { nav.focusFirst(); return; }
    var n = cur;
    while (n && n !== document.body) {
      if (n.onnav) { var r0 = n.onnav(dir, cur); if (r0) { if (r0.nodeType) nav.focus(r0); return true; } }
      n = n.parentNode;
    }
    var cr = cur.getBoundingClientRect(), cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    var best = null, bs = 1e12, c = nav.candidates();
    for (var i = 0; i < c.length; i++) {
      var el = c[i]; if (el === cur) continue;
      var r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, prim, sec;
      if (dir === 'right') { if (x <= cx + 2) continue; prim = Math.max(0, r.left - cr.right); sec = Math.abs(y - cy); }
      else if (dir === 'left') { if (x >= cx - 2) continue; prim = Math.max(0, cr.left - r.right); sec = Math.abs(y - cy); }
      else if (dir === 'down') { if (y <= cy + 2) continue; prim = Math.max(0, r.top - cr.bottom); sec = Math.abs(x - cx); }
      else { if (y >= cy - 2) continue; prim = Math.max(0, cr.top - r.bottom); sec = Math.abs(x - cx); }
      var s = prim + sec * (dir === 'left' || dir === 'right' ? 4 : 1.5);
      if (s < bs) { bs = s; best = el; }
    }
    if (best) nav.focus(best);
    else if (nav.onEdge) nav.onEdge(dir, cur);
    return !!best;
  };

  // handlers: functions(e) returning true when handled; the topmost (last) goes first
  nav.pushHandler = function (fn) { nav.handlers.push(fn); };
  nav.popHandler = function (fn) { var i = nav.handlers.indexOf(fn); if (i >= 0) nav.handlers.splice(i, 1); };

  function isInput() { var a = document.activeElement; return a && a.tagName === 'INPUT'; }

  // key-repeat detection: halves move durations and defers heavy swaps (stage / billboard)
  var lastKey = 0, fastT = null, fast = false;
  nav.settleFns = [];
  nav.isFast = function () { return fast; };
  nav.onSettle = function (fn) { nav.settleFns.push(fn); };
  nav.offSettle = function (fn) { var i = nav.settleFns.indexOf(fn); if (i >= 0) nav.settleFns.splice(i, 1); };
  function trackRepeat(e) {
    var k = e.keyCode; if (k < 37 || k > 40) return;
    var now = Date.now();
    if (e.repeat || now - lastKey < 160) { if (!fast) { fast = true; document.body.classList.add('fast'); } }
    lastKey = now; clearTimeout(fastT);
    fastT = setTimeout(function () {
      if (!fast) return; fast = false; document.body.classList.remove('fast');
      for (var i = 0; i < nav.settleFns.length; i++) { try { nav.settleFns[i](); } catch (x) {} }
    }, 220);
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === K.POINTER_SHOW || k === K.POINTER_HIDE) { nav.pointer = k === K.POINTER_SHOW; return; }
    if (nav.locked && !N.isBack(k)) { e.preventDefault(); return; }
    trackRepeat(e);
    for (var i = nav.handlers.length - 1; i >= 0; i--) {
      if (nav.handlers[i](e) === true) { e.preventDefault(); return; }
    }
    if (N.isBack(k) || (k === K.BACKSPACE && !isInput())) {
      e.preventDefault(); if (N.onBack) N.onBack(); return;
    }
    if (isInput()) {
      if (k === K.IME_DONE || k === K.ENTER) { if (nav.cur && nav.cur.onenter) nav.cur.onenter(); e.preventDefault(); return; }
      if (k === K.LEFT || k === K.RIGHT) return; // caret movement
    }
    if (k === K.LEFT) { e.preventDefault(); nav.move('left'); }
    else if (k === K.RIGHT) { e.preventDefault(); nav.move('right'); }
    else if (k === K.UP) { e.preventDefault(); nav.move('up'); }
    else if (k === K.DOWN) { e.preventDefault(); nav.move('down'); }
    else if (k === K.ENTER) {
      e.preventDefault();
      // never activate a stale (detached/hidden) element: refocus a live one instead
      if (nav.cur && (!document.body.contains(nav.cur) || !visible(nav.cur))) { nav.cur = null; nav.focusFirst(); return; }
      if (nav.cur) nav.activate(nav.cur);
    }
  });

  /* Magic Remote: with the cursor shown, OK fires both keydown(13) and a click on the element under the cursor. Whichever arrives
     first activates; its twin from the other source within 400 ms is dropped, so a card never opens twice. Repeated presses from
     the same source always count. Clicks also reach onenter-only elements. */
  var lastAct = { el: null, t: 0, src: '' }, synth = false;
  function fOf(t) { while (t && t !== document.body) { if (t.classList && t.classList.contains('f')) return t; t = t.parentNode; } return null; }
  function twin(el, src) { return lastAct.el === el && lastAct.src !== src && Date.now() - lastAct.t < 400; }
  nav.activate = function (el) {
    if (twin(el, 'key')) return;
    lastAct = { el: el, t: Date.now(), src: 'key' };
    if (el.onenter) { el.onenter(); return; }
    synth = true; try { el.click(); } finally { synth = false; }
  };
  document.addEventListener('click', function (e) {
    if (synth) return;
    var t = fOf(e.target); if (!t) return;
    if (twin(t, 'click')) { e.stopPropagation(); e.preventDefault(); return; }
    lastAct = { el: t, t: Date.now(), src: 'click' };
    if (t !== nav.cur) nav.focus(t, true);
    if (t.onenter) { e.stopPropagation(); e.preventDefault(); t.onenter(); }
  }, true);
  // cursor state also arrives as a webOS DOM event (some firmware versions send only this one)
  document.addEventListener('cursorStateChange', function (e) { nav.pointer = !!(e.detail && e.detail.visibility); });
  // Magic Remote wheel: one notch = one step up/down
  var wheelT = 0;
  document.addEventListener('wheel', function (e) {
    var now = Date.now(); if (now - wheelT < 180 || !e.deltaY) return; wheelT = now;
    if (nav.locked || (N.player && N.player.open)) return;
    nav.move(e.deltaY > 0 ? 'down' : 'up');
  }, { passive: true });
  // mouse support for desktop testing (only on real pointer movement, so content sliding under a still cursor never steals focus)
  document.addEventListener('mousemove', function (e) {
    if (!e.movementX && !e.movementY) return;
    var t = e.target; while (t && t !== document.body) { if (t.classList && t.classList.contains('f')) { if (t !== nav.cur) nav.focus(t); return; } t = t.parentNode; }
  });
})();
