/* Shared UI helpers: icons, cards, meta line, track/scroll layout. */
(function () {
  var el = N.el, ui = N.ui = {};
  var NS = 'http://www.w3.org/2000/svg', XL = 'http://www.w3.org/1999/xlink';

  ui.icon = function (name, cls) {
    var s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    var u = document.createElementNS(NS, 'use'); u.setAttributeNS(XL, 'xlink:href', '#i-' + name); u.setAttribute('href', '#i-' + name);
    s.appendChild(u); return s;
  };
  ui.setIcon = function (svg, name) {
    var u = svg.firstChild; u.setAttributeNS(XL, 'xlink:href', '#i-' + name); u.setAttribute('href', '#i-' + name);
  };
  ui.btn = function (text, fn, cls, icon) {
    var b = el('button', 'btn f fl' + (cls ? ' ' + cls : ''));
    if (icon) b.appendChild(ui.icon(icon));
    b.appendChild(el('span', '', text)); b.onclick = fn; return b;
  };
  ui.pill = function (text, fn, cur) {
    var b = el('button', 'pill f fl' + (cur ? ' cur' : ''), text); b.onclick = fn; return b;
  };
  ui.clock = function () {
    var c = el('div', 'clock tab');
    function tick() { var d = new Date(), h = d.getHours(), m = d.getMinutes(); c.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
    tick(); c._t = setInterval(tick, 20000); return c;
  };

  /* ---------- images ---------- */
  ui.posterUrl = function (p) {
    var po = p && p.image && p.image.poster; if (!po) return '';
    return (po.webp && (po.webp.large || po.webp.medium)) || (po.jpg && (po.jpg.large || po.jpg.medium)) || '';
  };
  ui.coverUrl = function (p) { var c = p && p.image && p.image.cover; return c ? (c.webp || c.jpg || '') : ''; };
  ui.load = function (c) {
    if (c._on || !c._src) return; c._on = true;
    var im = c._im; if (!im) return;
    im.onload = function () { im.classList.add('in'); };
    im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); c._im = null; };
    im.src = c._src;
  };
  ui.unload = function (c) {
    if (!c._on) return; c._on = false;
    var im = c._im; if (im) { im.classList.remove('in'); im.onload = null; im.removeAttribute('src'); }
  };

  /* ---------- cards ---------- */
  // kind: poster | land | top | grid | tile ; returns the focusable .card element
  ui.card = function (post, kind, o) {
    o = o || {}; var c = el('div', 'card f k-' + (kind === 'poster' ? 'p' : kind)), po = post.options || {};
    var url = kind === 'land' ? (ui.coverUrl(post) || ui.posterUrl(post)) : ui.posterUrl(post);
    if (kind === 'tile') url = o.image || '';
    c._post = post; c._src = url;
    var holder = c;
    if (kind === 'top') {
      c.appendChild(el('div', 'rank', String(o.rank)));
      c.appendChild(el('div', 'rank hi', String(o.rank)));
      holder = el('div', 'pbox'); c.appendChild(holder);
      if (o.rank >= 10) c.classList.add('wide');
    }
    var ph = el('div', 'ph'); ph.appendChild(el('span', '', kind === 'tile' ? '' : N.title(post))); holder.appendChild(ph);
    if (url) { var im = el('img', 'im'); im.alt = ''; im.decoding = 'async'; holder.appendChild(im); c._im = im; }
    if (kind === 'tile') {
      c.appendChild(el('div', 'shade')); c.appendChild(el('div', 'tn', o.name)); c.appendChild(el('div', 'tc tab', o.count !== undefined ? String(o.count) : ''));
    } else if (kind !== 'land') {
      ui.badge(holder, po);
    }
    return c;
  };
  ui.badge = function (c, po) {
    var b = null;
    if (po.coming_soon) { b = el('div', 'bdg soon', N.t('soon')); }
    else if (po.free_stream) { b = el('div', 'bdg free', N.t('free')); }
    if (b) c.appendChild(b);
  };
  // grid cell: poster + title under it. Returns the cell; cell.card is the focusable.
  ui.cell = function (post) {
    var cell = el('div', 'gcell'), c = ui.card(post, 'grid');
    cell.appendChild(c); cell.appendChild(el('div', 'gt', N.title(post))); cell.card = c; c._cell = cell; return cell;
  };
  // episode tiles (typographic; the API has no stills)
  ui.epName = function (it) {
    var i = (it && it.info) || {}, t = i.title || i.name || (it && it.title);
    if (t && typeof t === 'object') t = (N.lang === 'fa' && t.local) ? t.local : (t.english || t.local);
    return t ? String(t) : '';
  };
  // episode numbers may be combined ("11,12"): order by the leading number, show "11–12"
  ui.epNum = function (v) { var n = parseInt(String(v === undefined || v === null ? '' : v), 10); return isNaN(n) ? 0 : n; };
  ui.epLabel = function (v, fallback) {
    var s = (v === undefined || v === null || v === '') ? String(fallback === undefined ? '' : fallback) : String(v);
    return s.replace(/\s*[,&+\-–]\s*/g, '–');
  };
  ui.epCmp = function (a, b) {
    var ai = (a && a.info) || {}, bi = (b && b.info) || {};
    return (ui.epNum(ai.season) - ui.epNum(bi.season)) || (ui.epNum(ai.episode) - ui.epNum(bi.episode));
  };
  ui.epTile = function (it, idx, o) {
    o = o || {}; var i = it.info || {}, n = ui.epLabel(i.episode, idx + 1), e = el('div', 'ep f');
    e.appendChild(el('div', 'en tab' + (n.length > 3 ? ' sm' : ''), 'E' + (/^\d$/.test(n) ? '0' + n : n)));
    e.appendChild(el('div', 'et', ui.epName(it) || (N.t('episode') + ' ' + n)));
    var dur = Number(i.duration || i.time || 0);
    if (o.watched) { var ck = ui.icon('check', 'chk'); e.appendChild(ck); }
    else if (dur) { if (dur > 600) dur = dur / 60; e.appendChild(el('div', 'ed tab', Math.round(dur) + ' ' + N.t('min'))); }
    if (o.progress > 0) { var pb = el('div', 'ep-p'), pi = el('i'); pi.style.transform = 'scaleX(' + Math.min(1, o.progress) + ')'; pb.appendChild(pi); e.appendChild(pb); }
    return e;
  };
  ui.skelCard = function (kind) { var c = el('div', 'card skel k-' + (kind || 'p')); return c; };

  /* ---------- text bits ---------- */
  ui.typeLabel = function (post, withSeasons) {
    var po = post.options || {}, pi = post.info || {}, s;
    if (po.title_type === 'anime') s = N.t('anime'); else if (po.is_series) s = N.t('series'); else s = N.t('movie');
    if (withSeasons && po.is_series && pi.seasons) s += ' · ' + pi.seasons + ' ' + N.t('seasons');
    return s;
  };
  ui.duration = function (min) {
    min = Number(min); if (!min) return '';
    var h = Math.floor(min / 60), m = min % 60;
    if (N.lang === 'fa') return (h ? h + ' ساعت ' : '') + (m ? m + ' دقیقه' : '');
    return (h ? h + 'h ' : '') + (m ? m + 'm' : '');
  };
  // Meta line: [IMDb 7.8] 30nama-score · year · duration · [age] · genres
  ui.meta = function (post, nGenres) {
    var m = el('div', 'meta'), pi = post.info || {}, sc = post.score || {}, bits = 0;
    function dot() { if (m.lastChild) m.appendChild(el('i', 'dot-s')); }
    if (sc.imdb && sc.imdb.score) { m.appendChild(el('span', 'imdb tab', 'IMDb ' + sc.imdb.score)); }
    if (sc['30nama'] && sc['30nama'].score) { var s3 = el('span', 'sc tab', String(sc['30nama'].score)); m.appendChild(s3); }
    if (pi.year) { dot(); m.appendChild(el('span', 'tab', pi.year + (pi.year_end && pi.year_end !== pi.year && (post.options || {}).is_series ? '–' + pi.year_end : ''))); }
    var d = ui.duration(pi.time && pi.time.default); if (d) { dot(); m.appendChild(el('span', 'tab', d)); }
    if (pi.age) { dot(); m.appendChild(el('span', 'age', pi.age)); }
    if (post.genre && post.genre.length) {
      dot(); m.appendChild(el('span', '', post.genre.slice(0, nGenres || 2).map(function (g) { return g.name; }).join(', ')));
    }
    return m;
  };

  /* ---------- layout: start-anchored tracks, vertical scroll ---------- */
  var START = 184;
  // cards: array of elements with known widths; sets card._x (logical start) and track._total
  ui.layoutTrack = function (track, cards, widths, gap) {
    var x = START; gap = gap === undefined ? 24 : gap;
    for (var i = 0; i < cards.length; i++) { cards[i]._x = x; x += widths[i] + gap; }
    track._total = x - gap; track._s = null;
  };
  ui.slideTo = function (track, x) {
    var s = Math.max(0, x - START), max = Math.max(0, (track._total || 0) - 1824);
    if (s > max) s = max;
    if (track._s === s) return; track._s = s;
    track.style.transform = 'translateX(' + (N.isRtl() ? s : -s) + 'px)';
  };
  function topIn(e, box) { var t = 0; while (e && e !== box) { t += e.offsetTop; e = e.offsetParent; } return t; }
  ui.topIn = topIn;
  // keep `target` row at (at most) `anchor` px from the top of the screen
  ui.vscroll = function (box, target, anchor) {
    var ty = -Math.max(0, topIn(target, box) - anchor);
    if (box._ty === ty) return ty; box._ty = ty;
    box.style.transform = 'translateY(' + ty + 'px)'; return ty;
  };
  // is `dir` ('left'|'right') towards the end edge in the current direction?
  ui.step = function (dir) { var r = N.isRtl(); return (dir === 'right') !== r ? 1 : -1; };
})();
