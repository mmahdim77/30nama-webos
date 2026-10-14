/* Player: <video> through hls.js (quality + audio control) or webOS native HLS. Own WebVTT overlay, seek previews, control bar. */
(function () {
  var K = N.keys, $ = N.$, el = N.el;
  var P = N.player = {
    open: false, items: [], index: 0, post: null, be: null, paused: false,
    cues: [], subLang: 'off', subCache: {}, hbTimer: null, tickTimer: null, osdTimer: null,
    menuOpen: false, menuKind: null, aboutOpen: false, seekAcc: 0, seekTimer: null, seekN: 0, skip: null, resume: null,
    zone: 'scrub' // 'scrub': Left/Right seek, OK play/pause | 'bar': Left/Right move along the control bar, OK activates
  };

  /* ---------- backend: <video> ----------
     engine 'hls': hls.js over MSE. Default: exposes quality levels and the 2.0/5.1 audio renditions, and plays 4K H.264 on webOS
     without dropped frames. engine 'native': webOS hardware HLS pipeline (<video src=m3u8>), adaptive quality only.
     Either one falls back to the other once if it fails before the first frame. N.store 'engine' = 'auto' | 'native' | 'hls'. */
  function nativeHls(v) { return !!(v.canPlayType && v.canPlayType('application/vnd.apple.mpegurl')); }
  function mse() { return !!(window.Hls && Hls.isSupported()); }
  function pickEngine(v, force) {
    var pref = force || N.store.get('engine', 'auto');
    if (pref === 'native' && nativeHls(v)) return 'native';
    return mse() ? 'hls' : 'native';
  }
  function chOf(t) { return parseInt(t && (t.channels || (t.attrs && t.attrs.CHANNELS)), 10) || 0; }
  function chLabel(ch) { return ch >= 6 ? '5.1' : ch === 2 ? N.t('stereo') : ch === 1 ? 'Mono' : ''; }
  function videoBackend(force) {
    var v = $('video'), hls = null, engine = pickEngine(v, force), fellBack = false, rec = { net: 0, media: 0 };
    function detach() {
      v.onwaiting = v.onplaying = v.onended = v.onerror = v.onloadedmetadata = null;
      if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
      v.removeAttribute('src'); try { v.load(); } catch (e) {}
    }
    function changed() { if (be.onTracks) be.onTracks(); }
    // stored quality: 'auto' or a height; a fixed height picks that level (or the closest lower one)
    function levelFor(h) {
      var best = -1, bh = -1, low = -1, lh = 1e9;
      hls.levels.forEach(function (l, i) { if (l.height <= h && l.height > bh) { best = i; bh = l.height; } if (l.height < lh) { low = i; lh = l.height; } });
      return best >= 0 ? best : low;
    }
    function applyQuality() {
      var q = N.store.get('quality', 'auto');
      if (!hls.levels.length) return;
      if (q !== 'auto') { var i = levelFor(Number(q)); hls.startLevel = i; hls.currentLevel = i; }
      else hls.startLevel = levelFor(1080); // adaptive, but begin at 1080p
    }
    function applyAudio() {
      var want = N.store.get('audioCh', 0), ts = hls.audioTracks || [];
      if (!want) return;
      for (var i = 0; i < ts.length; i++) if (chOf(ts[i]) === want) { if (hls.audioTrack !== i) hls.audioTrack = i; return; }
    }
    var be = {
      onTracks: null,
      engine: function () { return engine; },
      load: function (url, startSec, cb) {
        var started = false;
        function go() {
          if (started) return; started = true;
          if (engine === 'native' && startSec > 5) { try { v.currentTime = startSec; } catch (e) {} }
          var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
          P.spin(false); if (cb) cb();
        }
        function fail(msg) {
          if (!started && !fellBack) {
            var alt = engine === 'native' ? (mse() ? 'hls' : null) : (nativeHls(v) ? 'native' : null);
            if (alt) { fellBack = true; detach(); engine = alt; be.load(url, startSec, cb); return; }
          }
          P.onError(msg);
        }
        v.onwaiting = function () { P.spin(true); };
        v.onplaying = function () { P.spin(false); };
        v.onended = function () { P.onEnded(); };
        var src = N.proxied(url);
        if (engine === 'hls') {
          v.onerror = null; v.onloadedmetadata = null;
          // Auto quality: a film's first segments are tiny black frames, so the first throughput sample is far too low and plain
          // ABR fetched 240p/360p, which then played for ~20 s while it climbed to 4K. So: no low-level bandwidth probe, start at
          // 1080p (applyQuality), and never auto-select below 720p (minAutoBitrate). Pinning a level in the menu bypasses this.
          hls = new Hls({
            enableWorker: true, startPosition: startSec > 5 ? startSec : -1,
            maxBufferLength: 30, maxMaxBufferLength: 60, backBufferLength: 30, maxBufferSize: 60 * 1000 * 1000,
            abrEwmaDefaultEstimate: 8000000, testBandwidth: false, minAutoBitrate: 1400000
          });
          hls.on(Hls.Events.ERROR, function (ev, d) {
            if (!d || !d.fatal) return;
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR && started && rec.net++ < 2) { hls.startLoad(); return; }
            if (d.type === Hls.ErrorTypes.MEDIA_ERROR && rec.media++ < 2) { hls.recoverMediaError(); return; }
            fail('hls ' + d.details);
          });
          hls.on(Hls.Events.MANIFEST_PARSED, function () { applyQuality(); setTimeout(go, 0); changed(); });
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, function () { applyAudio(); changed(); });
          hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, changed);
          hls.on(Hls.Events.LEVEL_SWITCHED, function () { applyAudio(); changed(); });
          hls.loadSource(src); hls.attachMedia(v);
        } else {
          v.onerror = function () { var c = v.error && v.error.code; fail('video error' + (c ? ' ' + c : '')); };
          v.onloadedmetadata = function () { go(); changed(); };
          v.src = src;
        }
      },
      play: function () { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); },
      pause: function () { v.pause(); },
      seek: function (s) { v.currentTime = Math.max(0, s); },
      time: function () { return v.currentTime || 0; },
      buffered: function () { try { var b = v.buffered, t = v.currentTime || 0; for (var i = 0; i < b.length; i++) if (b.start(i) <= t + 0.5 && b.end(i) >= t) return b.end(i); } catch (e) {} return 0; },
      duration: function () { return isFinite(v.duration) ? v.duration : 0; },
      height: function () { return v.videoHeight || 0; },
      // nominal height of the playing level (videoHeight of a 2.39:1 film at 1080p is 804)
      levelHeight: function () { var l = hls && hls.levels && hls.levels[hls.currentLevel]; return (l && l.height) || v.videoHeight || 0; },
      // [{id, h}] highest first; empty for native (it cannot pin a level)
      levels: function () {
        if (!hls || !hls.levels) return [];
        return hls.levels.map(function (l, i) { return { id: i, h: l.height }; }).filter(function (l) { return l.h > 0; }).sort(function (a, b) { return b.h - a.h; });
      },
      setLevel: function (id) { if (hls) hls.currentLevel = id; }, // -1 = adaptive
      audioTracks: function () {
        var out = [], i;
        if (hls) {
          var ts = hls.audioTracks || [];
          for (i = 0; i < ts.length; i++) {
            var name = langName(ts[i].lang) || (ts[i].name && ts[i].name !== 'audio' ? ts[i].name : '');
            out.push({ id: i, ch: chOf(ts[i]), label: [name, chLabel(chOf(ts[i]))].filter(Boolean).join(' · ') || ('Track ' + (i + 1)), sel: hls.audioTrack === i });
          }
          return out;
        }
        var at = v.audioTracks;
        if (at) for (i = 0; i < at.length; i++) out.push({ id: i, label: langName(at[i].language) || at[i].label || ('Track ' + (i + 1)), sel: !!at[i].enabled });
        return out;
      },
      setAudio: function (id) {
        if (hls) { hls.audioTrack = id; var ch = chOf((hls.audioTracks || [])[id]); if (ch) N.store.set('audioCh', ch); return; }
        var at = v.audioTracks; if (!at) return;
        for (var i = 0; i < at.length; i++) at[i].enabled = i === id;
        changed();
      },
      stop: function () { try { v.pause(); } catch (e) {} detach(); }
    };
    return be;
  }
  var LANGS = { eng: 'English', en: 'English', per: 'Persian', fas: 'Persian', fa: 'Persian', fre: 'French', fra: 'French', ger: 'German', deu: 'German', spa: 'Spanish', jpn: 'Japanese', ja: 'Japanese', kor: 'Korean', tur: 'Turkish', ara: 'Arabic', rus: 'Russian' };
  function langName(l) { if (!l) return ''; var s = String(l).toLowerCase(); return LANGS[s] || LANGS[s.slice(0, 3)] || String(l); }

  /* m3u8 may be a string, or an array of quality entries {label, default|6ch|2ch} (original app maps over it, 'Auto' = adaptive). */
  function entryUrl(e) {
    if (!e) return null;
    if (typeof e === 'string') return e;
    if (e instanceof Array) return entryUrl(e[0]);
    return entryUrl(e['default'] || e.file || e.url || e.src || e.link || e.m3u8 || e.path || e.source);
  }
  P.pickUrl = function (m) {
    if (!(m instanceof Array)) return entryUrl(m);
    // Prefer 'Auto': its master lists every variant (240p-2160p), so hls.js can adapt and the Quality menu can pin any level.
    // The fixed-label entries are single-variant masters; the highest one is only a fallback.
    var best = null, bestH = -1, auto = null, i, e, u;
    for (i = 0; i < m.length; i++) {
      e = m[i]; u = entryUrl(e); if (!u) continue;
      if (e && /^(auto|خودکار)$/i.test(String(e.label || ''))) { auto = u; continue; }
      var h = parseInt(String(e && e.label || '').replace(/\D/g, ''), 10) || 0;
      if (h > bestH) { best = u; bestH = h; }
    }
    return auto || best;
  };

  /* ---------- subtitles ---------- */
  function subUrl(v) {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (v instanceof Array) return subUrl(v[0]);
    return v.url || v.file || v.src || v.link || v.vtt || null;
  }
  function ts(s) {
    var m = /^(?:(\d+):)?(\d+):(\d+)[.,](\d+)$/.exec(s.trim()); if (!m) return null;
    return (+m[1] || 0) * 3600 + (+m[2]) * 60 + (+m[3]) + Number('0.' + m[4]);
  }
  P.parseVTT = function (text) {
    var cues = [], blocks = text.replace(/\r/g, '').replace(/^﻿/, '').split(/\n\n+/);
    blocks.forEach(function (b) {
      var lines = b.split('\n'), i = 0;
      while (i < lines.length && lines[i].indexOf('-->') < 0) i++;
      if (i >= lines.length) return;
      var parts = lines[i].split('-->'), s = ts(parts[0]), e = ts(parts[1].trim().split(/\s+/)[0]);
      if (s === null || e === null) return;
      var txt = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\{\\an?\d\}/g, '');
      cues.push({ s: s, e: e, t: txt });
    });
    cues.sort(function (a, b) { return a.s - b.s; });
    return cues;
  };
  P.setSub = function (lang) {
    P.subLang = lang; P.cues = []; $('subtitle').textContent = '';
    if (lang === 'off') return Promise.resolve();
    var item = P.items[P.index], u = item && item.file && subUrl(item.file.subtitle && item.file.subtitle[lang]);
    if (!u) return Promise.resolve();
    if (P.subCache[u]) { P.cues = P.subCache[u]; return Promise.resolve(); }
    return fetch(N.proxied(u)).then(function (r) { return r.text(); }).then(function (t) {
      P.subCache[u] = P.parseVTT(t); if (P.subLang === lang) P.cues = P.subCache[u];
    }).catch(function () { N.toast(N.t('subFailed')); });
  };
  function renderSub(t) {
    var cs = P.cues, txt = '';
    if (cs.length) {
      var lo = 0, hi = cs.length - 1, idx = -1;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (cs[mid].s <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
      for (var j = idx; j >= 0 && j > idx - 4; j--) if (cs[j].e > t) { txt = cs[j].t; break; }
    }
    var e = $('subtitle'); if (e._t !== txt) { e._t = txt; e.textContent = txt; }
  }
  function availableSubs(item) {
    var s = item && item.file && item.file.subtitle, out = [];
    if (s) ['en', 'fa'].forEach(function (l) { if (subUrl(s[l])) out.push(l); });
    return out;
  }
  function subName(l) { return l === 'off' ? N.t('off') : l === 'en' ? N.t('english') : N.t('persian'); }

  /* ---------- lifecycle ---------- */
  var SCRUB_W = 1728, glyphT = null, unState = null, epsOpen = false, thumbsT = null;
  function isSeries() { return !!(P.post && P.post.options && P.post.options.is_series); }
  P.spin = function (on) { $('player-spin').classList.toggle('hidden', !on); };
  P.start = function (post, items, index, resume) {
    if (N.rail && N.rail.open) N.rail.close(false);
    P.post = post; P.items = items; P.resume = resume || null; P.open = true;
    $('player').classList.remove('hidden');
    $('subtitle').style.fontSize = N.store.get('subSize', 46) + 'px';
    document.body.classList.add('playing');
    N.nav.pushHandler(P.onKey);
    P.zone = 'scrub';
    P.playIndex(index);
    clearInterval(P.tickTimer); P.tickTimer = setInterval(P.tick, 250);
  };
  function seriesLine(item, i) {
    var info = item.info || {};
    if (P.items.length > 1 || info.season) return 'S' + (info.season || 1) + ' · E' + N.ui.epLabel(info.episode, i + 1) + (N.ui.epName(item) ? ' — ' + N.ui.epName(item) : '');
    return '';
  }
  // o: {force: engine, start: seconds} (used by reload)
  P.playIndex = function (i, o) {
    o = o || {};
    var item = P.items[i]; if (!item) return;
    P.reportNow();
    if (P.be) P.be.stop();
    N.thumbs.close(); clearTimeout(thumbsT);
    P.index = i; P.paused = false; P.cues = []; P.subLang = N.store.get('sub', 'off');
    $('subtitle').textContent = ''; P.hideSkip(); P.hideUpNext(true); P.closeEps(true); P.closeMenu(true); P.closeAbout(true);
    cancelSeek();
    var m3u8 = item.file && P.pickUrl(item.file.m3u8);
    if (typeof m3u8 === 'string') m3u8 = m3u8.replace(/^\s+|\s+$/g, '');
    if (!m3u8 || typeof m3u8 !== 'string') { var raw = ''; try { raw = JSON.stringify(item.file && item.file.m3u8).slice(0, 160); } catch (e) {} N.toast(N.t('noStream') + ' ' + raw, 6000); return P.close(); }
    $('osd-title').textContent = N.title(P.post);
    $('osd-sub').textContent = seriesLine(item, i);
    var start = 0, info = item.info || {};
    if (o.start !== undefined) start = o.start;
    else if (P.resume && String(P.resume.file_id) === String(info.file_id)) start = Number(P.resume.time) || 0;
    P.resume = null;
    P.be = videoBackend(o.force);
    P.be.onTracks = function () { if (P.open) P.renderBar(); };
    P.spin(true); P.glyph(false);
    P.renderBar();
    clearTimeout(P.loadT);
    var be0 = P.be;
    P.loadT = setTimeout(function () { if (P.be === be0 && P.loading) P.onError('timeout'); }, 25000);
    P.loading = true;
    try { P.be.load(m3u8, start, function () {
      P.loading = false; clearTimeout(P.loadT);
      var subs = availableSubs(item);
      var want = P.subLang; if (want !== 'off' && subs.indexOf(want) < 0) want = 'off';
      P.setSub(want); P.showOsd(); P.renderBar();
      // seek previews: fetch the low-res timeline once playback is underway (keeps startup bandwidth for the movie)
      thumbsT = setTimeout(function () { if (P.be === be0) N.thumbs.open(m3u8); }, 2500);
    }); } catch (e) { P.onError(String(e && e.message || e)); }
    clearInterval(P.hbTimer); P.hbTimer = setInterval(P.report, N.config.heartbeatMs);
    P.tick();
  };
  // restart the current item at the current position (engine switch for a pinned quality)
  P.reload = function (force) { if (P.be) P.playIndex(P.index, { force: force, start: P.be.time() }); };
  P.close = function () {
    if (!P.open) return;
    P.reportNow();
    clearInterval(P.hbTimer); clearInterval(P.tickTimer); clearTimeout(P.osdTimer); clearTimeout(P.seekTimer); clearTimeout(thumbsT);
    if (P.be) P.be.stop();
    P.be = null; N.thumbs.close();
    P.closeMenu(true); P.closeEps(true); P.closeAbout(true); P.hideUpNext(true); P.hideSkip(); cancelSeek();
    P.open = false; $('player').classList.add('hidden'); document.body.classList.remove('playing');
    $('player').classList.remove('osd-on'); $('osd').classList.add('off');
    $('subtitle').textContent = '';
    if (P.zone === 'bar') N.nav.clear(); P.zone = 'scrub';
    N.nav.popHandler(P.onKey);
    if (N.onPlayerClosed) N.onPlayerClosed();
  };
  P.onError = function (m) { P.loading = false; clearTimeout(P.loadT); N.toast(N.t('playErr') + ': ' + m, 6000); P.spin(false); P.showOsd(); };
  P.onEnded = function () { if (P.index + 1 < P.items.length) P.playIndex(P.index + 1); else P.close(); };

  /* ---------- progress reporting (observer) ---------- */
  P.report = function () {
    if (!P.be || !N.isLoggedIn()) return;
    var item = P.items[P.index], info = item.info || {}, u = N.session.user || {};
    N.api.call('observer', {
      post_id: info.post_id || (P.post && P.post.id), file_id: info.file_id,
      user_id: u.user_id || u.id || '', time: Math.floor(P.be.time()), duration: Math.floor(P.be.duration()),
      token: (item.options && item.options.token) || ''
    }).catch(function () {});
  };
  P.reportNow = function () { if (P.be && P.be.time() > 1) P.report(); };

  /* ---------- control bar ---------- */
  function qualityOpts() {
    var pref = N.store.get('quality', 'auto'), hs = [], seen = {};
    var lv = P.be ? P.be.levels() : [];
    (lv.length ? lv.map(function (l) { return l.h; }) : N.thumbs.heights()).forEach(function (h) { if (!seen[h]) { seen[h] = 1; hs.push(h); } });
    hs.sort(function (a, b) { return b - a; });
    if (hs.length < 2) return [];
    var cur = P.be ? P.be.levelHeight() : 0, out = [{ id: 'auto', label: N.t('engAuto') + (pref === 'auto' && cur ? '  (' + cur + 'p)' : ''), sel: pref === 'auto' }];
    hs.forEach(function (h) { out.push({ id: h, label: h + 'p' + (h >= 2160 ? '  4K' : h >= 1080 ? '  Full HD' : h >= 720 ? '  HD' : ''), sel: Number(pref) === h }); });
    return out;
  }
  function qualityVal() { var q = N.store.get('quality', 'auto'); return q === 'auto' ? N.t('engAuto') : q + 'p'; }
  function audioVal() { var t = P.be ? P.be.audioTracks().filter(function (x) { return x.sel; })[0] : null; return t ? t.label : ''; }
  var BAR = [
    { k: 'prev', icon: 'prev', label: 'pPrev', show: function () { return isSeries() && P.index > 0; }, run: function () { P.playIndex(P.index - 1); } },
    { k: 'play', icon: 'pause', label: 'pause', show: function () { return true; }, run: function () { P.togglePause(); } },
    { k: 'next', icon: 'next', label: 'pNext', show: function () { return isSeries() && P.index + 1 < P.items.length; }, run: function () { P.playIndex(P.index + 1); } },
    { k: 'eps', icon: 'list', label: 'episodes', show: function () { return P.items.length > 1; }, run: function () { P.openEps(); } },
    { k: 'subs', icon: 'cc', label: 'subtitles', show: function () { return availableSubs(P.items[P.index]).length > 0; }, val: function () { return subName(P.subLang); }, run: function () { P.openMenu('subs'); } },
    { k: 'audio', icon: 'audio', label: 'audio', show: function () { return !!P.be && P.be.audioTracks().length > 1; }, val: audioVal, run: function () { P.openMenu('audio'); } },
    { k: 'quality', icon: 'hd', label: 'quality', show: function () { return qualityOpts().length > 1; }, val: qualityVal, run: function () { P.openMenu('quality'); } },
    { k: 'about', icon: 'info', label: 'about', show: function () { return true; }, run: function () { P.openAbout(); } }
  ];
  function barBtns() { return Array.prototype.slice.call($('pbar').children); }
  function barBtn(k) { var b = barBtns(); for (var i = 0; i < b.length; i++) if (b[i]._k === k) return b[i]; return null; }
  P.renderBar = function () {
    var bar = $('pbar'), focusK = P.zone === 'bar' && N.nav.cur && N.nav.cur._k, focusI = focusK ? barBtns().indexOf(N.nav.cur) : -1;
    bar.innerHTML = '';
    BAR.forEach(function (d) {
      if (!d.show()) return;
      var b = el('button', 'pb f fl'); b._k = d.k; b._d = d;
      b.appendChild(N.ui.icon(d.k === 'play' ? (P.paused ? 'play' : 'pause') : d.icon));
      b.appendChild(el('span', 'pl', N.t(d.k === 'play' ? (P.paused ? 'play' : 'pause') : d.label)));
      var v = d.val && d.val(); if (v) b.appendChild(el('em', 'pv2', v));
      b.onclick = function () { P.showOsd(); d.run(); };
      b.onfocus2 = function () { P.zone = 'bar'; $('scrub').classList.remove('act'); };
      bar.appendChild(b);
    });
    if (focusK) { var t = barBtn(focusK) || barBtns()[Math.min(focusI, barBtns().length - 1)]; if (t) N.nav.focus(t, true); }
  };
  // values change after the first render (hls.js picks the audio track / level later): refresh the small labels in place
  function refreshVals() {
    barBtns().forEach(function (b) {
      if (!b._d.val) return;
      var v = b._d.val() || '', em = b.querySelector('.pv2');
      if (!em && v) { em = el('em', 'pv2'); b.appendChild(em); }
      if (em && em.textContent !== v) em.textContent = v;
    });
  }
  function focusBar(k) {
    var b = (k && barBtn(k)) || barBtn('play') || barBtns()[0]; if (!b) return;
    P.zone = 'bar'; N.nav.focus(b, true); P.showOsd();
  }
  function leaveBar() { if (N.nav.cur && N.nav.cur._k) N.nav.clear(); P.zone = 'scrub'; }
  function moveBar(dir) {
    var b = barBtns(), i = b.indexOf(N.nav.cur), j = i + N.ui.step(dir);
    if (i < 0) { focusBar(); return; }
    if (b[j]) N.nav.focus(b[j], true);
  }

  /* ---------- scrubber / OSD / seek previews ---------- */
  function setT(id, txt) { var e = $(id); if (e._t !== txt) { e._t = txt; e.textContent = txt; } }
  function drawScrub(t, d, buf) {
    var f = d ? Math.max(0, Math.min(1, t / d)) : 0, b = d ? Math.max(0, Math.min(1, buf / d)) : 0, sc = $('scrub');
    sc.querySelector('.fill').style.transform = 'scaleX(' + f.toFixed(4) + ')';
    sc.querySelector('.buf').style.transform = 'scaleX(' + b.toFixed(4) + ')';
    var x = f * SCRUB_W; sc.querySelector('.thumb').style.transform = 'translateX(' + x.toFixed(1) + 'px)';
    return x;
  }
  var pvAt = -1;
  function preview(t) {
    var pv = $('scrub').querySelector('.pv');
    if (!N.thumbs.ok) { pv.classList.add('none'); return; }
    if (Math.abs(t - pvAt) < 1) return; pvAt = t;
    pv.classList.add('stale');
    N.thumbs.at(t, function (cv) {
      if (!P.seekAcc) return;
      if (!cv) { pv.classList.add('none'); return; }
      pv.classList.remove('none', 'stale');
      pv.firstChild.getContext('2d').drawImage(cv, 0, 0, 384, 216);
    });
  }
  function clockNow() { var d = new Date(), h = d.getHours(), m = d.getMinutes(); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  function tn(v) { if (typeof v === 'string' && v.indexOf(':') > 0) { var p = v.split(':'), r = 0; for (var i = 0; i < p.length; i++) r = r * 60 + (parseFloat(p[i]) || 0); return r; } return Number(v); }
  var techT = 0;
  P.tick = function () {
    if (!P.be) return;
    var t = P.be.time(), d = P.be.duration(), tt = t;
    renderSub(t);
    if (P.seekAcc && d) tt = Math.max(0, Math.min(d, t + P.seekAcc));
    var x = drawScrub(tt, d, P.be.buffered());
    setT('osd-t1', N.fmtTime(tt)); setT('osd-t2', d ? '-' + N.fmtTime(Math.max(0, d - tt)) : '');
    setT('osd-clock', clockNow());
    if (Date.now() - techT > 1000) {
      techT = Date.now();
      var h = P.be.levelHeight(), a = P.be.audioTracks().filter(function (z) { return z.sel; })[0];
      setT('osd-tech', [h ? h + 'p' : '', a && a.ch ? chLabel(a.ch) : ''].filter(Boolean).join('  ·  '));
      if (!$('osd').classList.contains('off')) refreshVals();
    }
    if (P.seekAcc) {
      setT('bub-t', N.fmtTime(tt)); setT('bub-d', (P.seekAcc > 0 ? '+' : '') + N.fmtTime(Math.abs(P.seekAcc)).replace(/^0:/, '') + (Math.abs(P.seekAcc) < 60 ? 's' : ''));
      // the bubble follows the thumb but stays fully on screen
      var bx = Math.max(120, Math.min(SCRUB_W - 120, x));
      $('scrub').querySelector('.bubble').style.transform = 'translateX(' + bx.toFixed(1) + 'px)';
      preview(tt);
    }
    var o = (P.items[P.index] || {}).options || {}, show = null;
    var isS = tn(o.intro_end) > 0 && t >= tn(o.intro_start) && t < tn(o.intro_end) - 1;
    var isP = !isS && tn(o.previously_end) > 0 && t >= tn(o.previously_start) && t < tn(o.previously_end) - 1;
    if (isS) show = { label: N.t('skipIntro'), to: tn(o.intro_end) };
    else if (isP) show = { label: N.t('skipRecap'), to: tn(o.previously_end) };
    P.skip = show;
    if (show) P.showSkip(show.label); else P.hideSkip();
    // up next at credits
    var hasNext = P.index + 1 < P.items.length;
    if (hasNext && tn(o.end) > 0 && t >= tn(o.end) && !unState) P.showUpNext();
    else if (unState && tn(o.end) > 0 && t < tn(o.end) - 3 && !unState.dismissed) P.hideUpNext(true);
  };
  // the pill never takes focus by itself: OK keeps toggling pause; Up focuses it (then OK skips; Down/Back/seek keys release it)
  P.skipFocus = false;
  P.showSkip = function (label) {
    var b = $('skip-btn'), txt = P.skipFocus ? 'OK  ·  ' + label + '  ⏭' : '▲  ' + label;
    if (b._l !== txt) { b._l = txt; b.textContent = txt; }
    b.classList.toggle('focus', P.skipFocus); b.classList.add('show');
  };
  P.hideSkip = function () { P.skipFocus = false; var b = $('skip-btn'); b.classList.remove('show', 'focus'); b._l = null; P.skip = null; };
  P.setSkipFocus = function (on) { P.skipFocus = on; if (P.skip) P.showSkip(P.skip.label); };
  function sheetOpen() { return P.menuOpen || epsOpen || P.aboutOpen; }
  P.showOsd = function () {
    $('osd').classList.remove('off'); $('player').classList.add('osd-on'); $('scrub').classList.toggle('act', P.zone !== 'bar'); clearTimeout(P.osdTimer);
    P.osdTimer = setTimeout(function () {
      if (!P.paused && !sheetOpen() && !P.seekAcc) P.hideChrome(true);
    }, P.zone === 'bar' ? 7000 : 4000);
  };
  P.hideChrome = function (keepUpNext) {
    clearTimeout(P.osdTimer); $('osd').classList.add('off'); $('player').classList.remove('osd-on'); $('scrub').classList.remove('act');
    leaveBar();
    if (!keepUpNext && $('upnext').classList.contains('show')) P.hideUpNext(); // keeps autoplay countdown semantics: dismissed
  };
  P.glyph = function (kind) { // kind: 'play' | 'pause' | false
    var g = $('pglyph'); clearTimeout(glyphT);
    g.classList.remove('pulse', 'hold');
    if (!kind) return;
    N.ui.setIcon(g.firstChild, kind);
    void g.offsetWidth;
    if (kind === 'pause') { g.classList.add('pulse'); glyphT = setTimeout(function () { g.classList.remove('pulse'); g.classList.add('hold'); }, 600); }
    else g.classList.add('pulse');
  };
  P.togglePause = function () {
    if (!P.be) return;
    P.paused = !P.paused;
    if (P.paused) P.be.pause(); else P.be.play();
    P.glyph(P.paused ? 'pause' : 'play');
    var pb = barBtn('play'); if (pb) { N.ui.setIcon(pb.firstChild, P.paused ? 'play' : 'pause'); pb.children[1].textContent = N.t(P.paused ? 'play' : 'pause'); }
    P.showOsd();
  };
  // Left/Right: 10 s steps, growing to 30 s and 60 s while the key is held or pressed repeatedly. The jump happens 1.2 s after the
  // last press (or at once with OK), so the preview can be looked at first; Back cancels.
  function commitSeek() {
    clearTimeout(P.seekTimer);
    if (!P.seekAcc || !P.be) { cancelSeek(); return; }
    var d = P.be.duration(), t = P.be.time() + P.seekAcc;
    if (d) t = Math.min(t, d - 2);
    cancelSeek();
    P.be.seek(Math.max(0, t));
    P.showOsd();
  }
  function cancelSeek() {
    clearTimeout(P.seekTimer); P.seekAcc = 0; P.seekN = 0; pvAt = -1;
    var sc = $('scrub'); sc.classList.remove('seeking'); sc.querySelector('.pv').classList.add('stale');
  }
  P.seekBy = function (sec) {
    if (!P.be) return;
    P.seekAcc += sec; P.seekN++; clearTimeout(P.seekTimer);
    $('scrub').classList.add('seeking'); P.showOsd(); P.tick();
    P.seekTimer = setTimeout(commitSeek, 1200);
  };
  P.seekStep = function (dir, base) {
    var n = P.seekN, step = base === 30 ? (n < 3 ? 30 : 60) : (n < 3 ? 10 : n < 8 ? 30 : 60);
    P.seekBy(dir * step);
  };

  /* ---------- up next ---------- */
  P.showUpNext = function () {
    var next = P.items[P.index + 1]; if (!next) return;
    var u = $('upnext'), auto = N.store.get('autoplay', true);
    var info = next.info || {};
    u.querySelector('.u1').textContent = N.t('nextEpisode');
    u.querySelector('.u2').textContent = 'S' + (info.season || 1) + ' · E' + N.ui.epLabel(info.episode, P.index + 2);
    u.querySelector('.u3').textContent = N.ui.epName(next) || N.title(P.post);
    var cv = N.ui.coverUrl(P.post) || N.ui.posterUrl(P.post);
    u.querySelector('.th').style.backgroundImage = cv ? 'url("' + cv + '")' : '';
    $('un-play').textContent = N.t('playNow'); $('un-cred').textContent = N.t('credits');
    unState = { sel: 'play', dismissed: false, auto: auto, active: false };
    uSel();
    u.classList.remove('hold', 'count'); u.classList.add('show');
    if (auto) { void u.offsetWidth; u.classList.add('count'); }
    u.querySelector('.cd').style.display = auto ? '' : 'none';
    u.querySelector('.cd').onanimationend = function () { if (unState && unState.auto) { P.hideUpNext(true); P.playIndex(P.index + 1); } };
  };
  function uSel() {
    var on = !!unState && unState.active;
    $('un-play').classList.toggle('focus', on && unState.sel === 'play');
    $('un-cred').classList.toggle('focus', on && unState.sel === 'cred');
  }
  P.hideUpNext = function (force) {
    var u = $('upnext');
    u.classList.remove('show', 'count', 'hold');
    if (force) unState = null; else if (unState) unState.dismissed = true;
  };

  /* ---------- menus (subtitles / audio / quality): end-side sheet ---------- */
  P.openMenu = function (kind) {
    if (!P.be) return;
    var m = $('player-menu'); m.innerHTML = ''; var item = P.items[P.index];
    function section(title, opts, onPick) {
      if (title) m.appendChild(el('div', 'h', title));
      opts.forEach(function (o) {
        var b = el('div', 'opt f fl' + (o.sel ? ' sel' : '')); b.appendChild(N.ui.icon('check')); b.appendChild(el('span', '', o.label));
        b.onclick = function () { onPick(o); P.closeMenu(); };
        m.appendChild(b);
      });
    }
    if (kind === 'audio') section(N.t('audio'), P.be.audioTracks(), function (o) { P.be.setAudio(o.id); });
    else if (kind === 'quality') section(N.t('quality'), qualityOpts(), function (o) { P.setQuality(o.id); });
    else {
      var sopts = [{ id: 'off', label: N.t('off'), sel: P.subLang === 'off' }];
      availableSubs(item).forEach(function (l) { sopts.push({ id: l, label: subName(l), sel: P.subLang === l }); });
      section(N.t('subtitles'), sopts, function (o) { N.store.set('sub', o.id); P.setSub(o.id); });
      var sz = N.store.get('subSize', 46);
      section(N.t('subSize'), [{ id: 38, label: N.t('small') }, { id: 46, label: N.t('medium') }, { id: 54, label: N.t('large') }].map(function (o) { o.sel = o.id === sz; return o; }),
        function (o) { N.store.set('subSize', o.id); $('subtitle').style.fontSize = o.id + 'px'; });
    }
    P.menuKind = kind;
    m.classList.add('open'); P.menuOpen = true; N.nav.pushScope(m);
    var sel = m.querySelector('.opt.sel'); N.nav.focus(sel || m.querySelector('.opt'), true);
    $('osd').classList.remove('off'); $('player').classList.add('osd-on'); clearTimeout(P.osdTimer);
  };
  P.closeMenu = function (silent) {
    if (!P.menuOpen) return;
    $('player-menu').classList.remove('open'); P.menuOpen = false; N.nav.popScope(); N.nav.clear();
    if (!silent) { P.renderBar(); focusBar(P.menuKind); }
  };
  P.setQuality = function (id) {
    N.store.set('quality', id);
    if (!P.be) return;
    if (P.be.engine() !== 'hls') { if (id !== 'auto') P.reload('hls'); return; } // native cannot pin a level
    if (id === 'auto') P.be.setLevel(-1);
    else { var lv = P.be.levels(), pick = lv.filter(function (l) { return l.h === id; })[0]; if (pick) P.be.setLevel(pick.id); }
    P.renderBar();
  };

  /* ---------- about sheet ---------- */
  function names(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (!(v instanceof Array)) v = [v];
    return v.map(function (x) { return typeof x === 'string' ? x : (x && (x.name || x.title)) || ''; }).filter(Boolean).slice(0, 4).join(', ');
  }
  P.openAbout = function () {
    var a = $('player-about'), post = P.post || {}, item = P.items[P.index] || {};
    a.innerHTML = '';
    var top = el('div', 'ab-top'), pu = N.ui.posterUrl(post);
    if (pu) { var im = el('img', 'ab-po'); im.alt = ''; im.src = pu; top.appendChild(im); }
    var hd = el('div', 'ab-hd');
    hd.appendChild(el('div', 'ab-type', N.ui.typeLabel(post, true)));
    hd.appendChild(el('div', 'ab-title', N.title(post)));
    var sl = seriesLine(item, P.index); if (sl && isSeries()) hd.appendChild(el('div', 'ab-ep', sl));
    top.appendChild(hd); a.appendChild(top);
    var meta = N.ui.meta(post, 3); meta.classList.add('ab-meta'); a.appendChild(meta);
    var body = el('div', 'ab-body');
    body.appendChild(el('div', 'ab-plot', N.plot(post)));
    var cr = post.crew || {}, rows = [[N.t('Director'), names(cr.director)], [N.t('Creator'), names(cr.creator)], [N.t('Writer'), names(cr.writer)],
      [N.t('cast'), (post.cast || []).slice(0, 8).map(function (x) { return x.name; }).join(', ')]];
    rows.forEach(function (r) { if (!r[1]) return; var d = el('div', 'ab-row'); d.appendChild(el('b', '', r[0])); d.appendChild(el('span', '', r[1])); body.appendChild(d); });
    a.appendChild(body);
    var close = N.ui.btn(N.t('close'), function () { P.closeAbout(); }, ''); close.classList.add('ab-close'); a.appendChild(close);
    a.classList.add('open'); P.aboutOpen = true; N.nav.pushScope(a); N.nav.focus(close, true);
    $('osd').classList.remove('off'); $('player').classList.add('osd-on'); clearTimeout(P.osdTimer);
  };
  P.closeAbout = function (silent) {
    if (!P.aboutOpen) return;
    $('player-about').classList.remove('open'); P.aboutOpen = false; N.nav.popScope(); N.nav.clear();
    if (!silent) focusBar('about');
  };

  /* ---------- episodes sheet: season pills + episode tiles ---------- */
  P.openEps = function () {
    if (P.items.length < 2) return;
    var box = $('player-eps'), tr = box.querySelector('.eptrack'), tabs = box.querySelector('.peps-tabs');
    if (!tabs) { tabs = el('div', 'peps-tabs'); box.insertBefore(tabs, box.firstChild); }
    var seasons = [], map = {}, pills = {}, tiles = [], shown = null, count = el('div', 'peps-n tab');
    P.items.forEach(function (it, i) { var s = (it.info && it.info.season) || 1; if (!map[s]) { map[s] = []; seasons.push(s); } map[s].push(i); });
    var curS = (P.items[P.index].info && P.items[P.index].info.season) || 1;
    tabs.innerHTML = '';
    function tileTarget() { for (var i = 0; i < tiles.length; i++) if (tiles[i]._i === P.index) return tiles[i]; return tiles[0]; }
    function show(s) {
      if (shown === s) return; shown = s;
      for (var k in pills) pills[k].classList.toggle('cur', String(k) === String(s));
      count.textContent = map[s].length + ' ' + N.t(map[s].length === 1 ? 'episode' : 'episodes');
      tr.innerHTML = ''; tiles = [];
      map[s].forEach(function (i) {
        var t = N.ui.epTile(P.items[i], i, {}); t._i = i;
        t.onclick = function () { P.closeEps(true); P.playIndex(i); };
        t.onfocus2 = function () { N.ui.slideTo(tr, t._x); };
        t.onnav = function (dir) {
          if (dir === 'up') return pills[s] || true;
          if (dir === 'down') return true;
          var j = tiles.indexOf(t) + N.ui.step(dir); return tiles[j] || true;
        };
        if (i === P.index) { t.classList.add('now'); t.appendChild(el('div', 'np', N.t('nowPlaying'))); }
        tr.appendChild(t); tiles.push(t);
      });
      N.ui.layoutTrack(tr, tiles, tiles.map(function () { return 360; }));
      var f0 = tileTarget();
      tr.style.transition = 'none'; tr.style.transform = ''; tr._s = null; N.ui.slideTo(tr, f0 ? f0._x : 184); void tr.offsetWidth; tr.style.transition = '';
    }
    seasons.forEach(function (s) {
      var p = N.ui.pill(N.t('season') + ' ' + s, function () { var t = tileTarget(); if (t) N.nav.focus(t, true); }, s === curS);
      p.onfocus2 = function () { show(s); };
      p.onnav = function (dir) { if (dir === 'down') return tileTarget() || true; if (dir === 'up') return true; var n = p[N.ui.step(dir) > 0 ? 'nextSibling' : 'previousSibling']; return n || true; };
      tabs.appendChild(p); pills[s] = p;
    });
    tabs.appendChild(count);
    show(curS);
    box.classList.add('open'); epsOpen = true; N.nav.pushScope(box);
    N.nav.focus(tileTarget(), true); $('osd').classList.remove('off'); $('player').classList.add('osd-on'); clearTimeout(P.osdTimer);
  };
  P.closeEps = function (silent) {
    if (!epsOpen) return;
    $('player-eps').classList.remove('open'); epsOpen = false; N.nav.popScope(); N.nav.clear();
    if (!silent) focusBar('eps');
  };

  /* ---------- keys ---------- */
  P.onKey = function (e) {
    if (!P.open) return false;
    var k = e.keyCode, back = N.isBack(k) || k === K.BACKSPACE;
    if (P.aboutOpen) {
      if (back) { P.closeAbout(); return true; }
      if (k === K.UP || k === K.DOWN) { var ab = $('player-about').querySelector('.ab-body'); if (ab) ab.scrollTop += k === K.DOWN ? 120 : -120; return true; }
      return false; // OK on Close
    }
    if (P.menuOpen) {
      if (back) { P.closeMenu(); return true; }
      return false; // spatial nav inside the menu scope
    }
    if (epsOpen) {
      if (back || (k === K.DOWN && N.nav.cur && N.nav.cur.classList.contains('ep'))) { P.closeEps(); return true; }
      return false;
    }
    // media / channel keys work in every zone
    if (k === K.STOP) { P.close(); return true; }
    if (k === K.PLAYPAUSE) { P.togglePause(); return true; }
    if (k === K.PLAY) { if (P.paused) P.togglePause(); return true; }
    if (k === K.PAUSE) { P.togglePause(); return true; } // LG remotes with one play/pause button send PAUSE for both
    if (k === K.RW || k === K.FF) { if (P.zone === 'bar') leaveBar(); P.seekStep(k === K.FF ? 1 : -1, 30); return true; }
    if ((k === K.CH_UP || k === K.CH_DOWN) && isSeries()) {
      var ni = P.index + (k === K.CH_UP ? 1 : -1); if (P.items[ni]) P.playIndex(ni); return true;
    }
    if (back) {
      // Back peels one layer at a time: pending seek, focused pill/card, control bar, OSD; only a bare player exits
      if (P.seekAcc) { cancelSeek(); P.showOsd(); return true; }
      if (P.skipFocus) { P.setSkipFocus(false); return true; }
      if (unState && unState.active) { unState.active = false; uSel(); return true; }
      if (!$('osd').classList.contains('off') || $('upnext').classList.contains('show')) { P.hideChrome(); return true; }
      P.close(); return true;
    }
    var osdWasOn = !$('osd').classList.contains('off');
    if (k === K.POINTER_SHOW || k === K.POINTER_HIDE) return true;
    P.showOsd();
    if (P.zone === 'bar') {
      if (k === K.LEFT || k === K.RIGHT) { moveBar(k === K.LEFT ? 'left' : 'right'); return true; }
      if (k === K.UP) { leaveBar(); P.showOsd(); return true; }
      if (k === K.ENTER) { if (N.nav.cur && N.nav.cur._k) N.nav.activate(N.nav.cur); return true; }
      return true;
    }
    var unShown = unState && $('upnext').classList.contains('show');
    if (k === K.UP && !P.skipFocus && !(unShown && unState.active) && (unShown || P.skip)) {
      // Up focuses the skip pill / Up Next card
      if (unShown) { unState.active = true; $('upnext').classList.add('hold'); uSel(); } else P.setSkipFocus(true);
      return true;
    }
    if (P.skipFocus) {
      if (k === K.ENTER) { if (P.skip) P.be.seek(P.skip.to); P.setSkipFocus(false); return true; }
      if (k === K.DOWN) { P.setSkipFocus(false); return true; }
      P.setSkipFocus(false); // any other key releases it and keeps its normal meaning
    }
    if (unShown && unState.active) {
      if (k === K.DOWN || k === K.UP) { unState.active = false; uSel(); return true; }
    }
    if (unShown) {
      if (k === K.ENTER && unState.active) {
        var sel = unState.sel; P.hideUpNext(sel !== 'cred');
        if (sel === 'play') P.playIndex(P.index + 1);
        return true;
      }
      $('upnext').classList.add('hold');
      if (unState.active && (k === K.LEFT || k === K.RIGHT)) { unState.sel = unState.sel === 'play' ? 'cred' : 'play'; uSel(); return true; }
    }
    if (k === K.ENTER) { if (P.seekAcc) commitSeek(); else P.togglePause(); return true; }
    if (k === K.LEFT) { P.seekStep(-1); return true; }
    if (k === K.RIGHT) { P.seekStep(1); return true; }
    if (k === K.DOWN || k === K.UP) { if (P.seekAcc) commitSeek(); focusBar(osdWasOn ? null : 'play'); return true; }
    return true;
  };

  // Magic Remote pointer over the video brings the controls back
  $('player').addEventListener('mousemove', function (e) { if (P.open && (e.movementX || e.movementY)) P.showOsd(); });

  // Home / app switch: webOS keeps the app alive in the background. Pause and save progress; the user resumes with OK.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden || !P.open || !P.be) return;
    P.reportNow();
    if (!P.paused) P.togglePause();
  });
})();
