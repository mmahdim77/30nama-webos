/* Seek previews. 30nama has no thumbnail sprites, so frames come from the stream itself: the lowest video variant (240p, ~25 KB
   MPEG-TS per 4 s segment) is fetched for the target time, its first keyframe is demuxed and decoded in software with WebCodecs,
   and drawn into a small canvas. Never touches the main <video> (a second hardware pipeline would preempt playback on webOS).
   N.thumbs.open(masterUrl) per item, N.thumbs.at(sec, cb(canvas|null)) while seeking, N.thumbs.close() on stop. */
(function () {
  var T = N.thumbs = { ok: typeof VideoDecoder !== 'undefined' && typeof fetch !== 'undefined' };
  var cur = null; // { segs: [{t, d, url}], cache: {idx: canvas}, order: [], gen }
  var gen = 0, CACHE = 40, W = 384, H = 216;

  function text(u) { return fetch(N.proxied(u)).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); }); }
  function abs(u, base) {
    var dev = /^\/proxy\?url=(.+)$/.exec(u); if (dev) return decodeURIComponent(dev[1]); // tools/devserver.js already rewrote the URI
    try { return new URL(u, base).href; } catch (e) { return u; }
  }

  // master -> lowest-bandwidth video variant -> segment timeline (also records the variant heights for the quality menu)
  function timeline(master, c) {
    return text(master).then(function (m) {
      var lines = m.split(/\r?\n/), best = null, bw = Infinity;
      if (m.indexOf('#EXTINF') >= 0) return { url: master, text: m }; // already a media playlist
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        if (l.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
        var res = /RESOLUTION=\d+x(\d+)/.exec(l); if (res) c.heights.push(+res[1]);
        var b = /BANDWIDTH=(\d+)/.exec(l), u = lines[i + 1];
        if (u && u.charAt(0) !== '#' && b && +b[1] < bw) { bw = +b[1]; best = abs(u.trim(), master); }
      }
      if (!best) throw new Error('no variant');
      return text(best).then(function (t) { return { url: best, text: t }; });
    }).then(function (pl) {
      var lines = pl.text.split(/\r?\n/), segs = [], t = 0, d = 0;
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l.indexOf('#EXTINF:') === 0) d = parseFloat(l.slice(8)) || 0;
        else if (l && l.charAt(0) !== '#') { segs.push({ t: t, d: d, url: abs(l, pl.url) }); t += d; }
      }
      return segs;
    });
  }

  /* ---------- MPEG-TS -> first H.264 access unit (Annex B) ---------- */
  function firstAccessUnit(u8) {
    var pmtPid = -1, vidPid = -1, pes = [], have = false;
    for (var off = 0; off + 188 <= u8.length; off += 188) {
      if (u8[off] !== 0x47) { // resync
        var j = off + 1; while (j < u8.length && u8[j] !== 0x47) j++; off = j - 188; continue;
      }
      var pusi = u8[off + 1] & 0x40, pid = ((u8[off + 1] & 0x1f) << 8) | u8[off + 2], afc = (u8[off + 3] >> 4) & 3, p = off + 4;
      if (afc === 2) continue;
      if (afc === 3) p += 1 + u8[p];
      if (p >= off + 188) continue;
      if (pid === 0 && pusi) { // PAT
        p += 1 + u8[p];
        var secEnd = p + 3 + (((u8[p + 1] & 0x0f) << 8) | u8[p + 2]) - 4;
        for (var q = p + 8; q + 4 <= secEnd; q += 4) {
          var prog = (u8[q] << 8) | u8[q + 1];
          if (prog !== 0) { pmtPid = ((u8[q + 2] & 0x1f) << 8) | u8[q + 3]; break; }
        }
      } else if (pid === pmtPid && pusi && vidPid < 0) { // PMT
        p += 1 + u8[p];
        var slen = ((u8[p + 1] & 0x0f) << 8) | u8[p + 2], end = p + 3 + slen - 4, pil = ((u8[p + 10] & 0x0f) << 8) | u8[p + 11];
        for (var r = p + 12 + pil; r + 5 <= end; ) {
          var st = u8[r], epid = ((u8[r + 1] & 0x1f) << 8) | u8[r + 2], esl = ((u8[r + 3] & 0x0f) << 8) | u8[r + 4];
          if (st === 0x1b && vidPid < 0) vidPid = epid; // H.264
          r += 5 + esl;
        }
      } else if (pid === vidPid) {
        if (pusi) {
          if (have) break; // next PES = next access unit: the first one is complete
          have = true; p += 9 + u8[p + 8]; // skip PES header
        }
        if (have && p < off + 188) pes.push(u8.subarray(p, off + 188));
      }
    }
    if (!pes.length) return null;
    var len = 0, i; for (i = 0; i < pes.length; i++) len += pes[i].length;
    var out = new Uint8Array(len), o = 0; for (i = 0; i < pes.length; i++) { out.set(pes[i], o); o += pes[i].length; }
    return out;
  }
  // codec string from the SPS NAL: avc1.PPCCLL
  function codecOf(au) {
    for (var i = 0; i + 4 < au.length; i++) {
      if (au[i] === 0 && au[i + 1] === 0 && au[i + 2] === 1 && (au[i + 3] & 0x1f) === 7) {
        var h = function (b) { return (b < 16 ? '0' : '') + b.toString(16); };
        return 'avc1.' + h(au[i + 4]) + h(au[i + 5]) + h(au[i + 6]);
      }
    }
    return null;
  }
  function hasIdr(au) {
    for (var i = 0; i + 3 < au.length; i++) if (au[i] === 0 && au[i + 1] === 0 && au[i + 2] === 1 && (au[i + 3] & 0x1f) === 5) return true;
    return false;
  }

  function decode(au) {
    return new Promise(function (res, rej) {
      var codec = codecOf(au), done = false;
      if (!codec || !hasIdr(au)) return rej(new Error('no keyframe'));
      var dec = new VideoDecoder({
        output: function (frame) {
          if (done) { frame.close(); return; }
          done = true;
          var c = document.createElement('canvas'); c.width = W; c.height = H;
          try { c.getContext('2d').drawImage(frame, 0, 0, W, H); } catch (e) {}
          frame.close(); try { dec.close(); } catch (e) {}
          res(c);
        },
        error: function (e) { if (!done) { done = true; rej(e); } }
      });
      // software decode: the hardware decoders belong to the main player
      dec.configure({ codec: codec, hardwareAcceleration: 'prefer-software', optimizeForLatency: true });
      dec.decode(new EncodedVideoChunk({ type: 'key', timestamp: 0, data: au }));
      dec.flush().catch(function () {}).then(function () { if (!done) { done = true; try { dec.close(); } catch (e) {} rej(new Error('no frame')); } });
    });
  }

  function idxAt(sec) {
    var s = cur.segs, lo = 0, hi = s.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (s[mid].t <= sec) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function frameFor(i) {
    var c = cur, hit = c.cache[i];
    if (hit) return hit.then ? hit : Promise.resolve(hit);
    var p = fetch(N.proxied(c.segs[i].url)).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
      .then(function (buf) { var au = firstAccessUnit(new Uint8Array(buf)); if (!au) throw new Error('demux'); return decode(au); })
      .then(function (cv) { if (c.cache[i] === p) c.cache[i] = cv; return cv; }, function (e) { delete c.cache[i]; throw e; });
    c.cache[i] = p; c.order.push(i);
    while (c.order.length > CACHE) delete c.cache[c.order.shift()];
    return p;
  }

  T.open = function (master) {
    T.close(); if (!T.ok || !master) return;
    var my = ++gen; cur = { segs: null, cache: {}, order: [], ready: null, heights: [] };
    var c = cur;
    c.ready = timeline(master, c).then(function (segs) { if (my === gen) c.segs = segs; return segs; }, function () { if (my === gen) c.segs = []; });
  };
  T.close = function () { gen++; cur = null; want = null; };
  T.heights = function () { return cur ? cur.heights.slice() : []; };

  // latest-wins: while keys repeat only the most recent target is fetched once the previous fetch settles
  var busy = false, want = null;
  T.at = function (sec, cb) {
    if (!cur) return cb(null);
    want = { sec: sec, cb: cb, c: cur };
    if (!busy) run();
  };
  function run() {
    var w = want; want = null; if (!w || w.c !== cur) { busy = false; return; }
    busy = true;
    w.c.ready.then(function () {
      if (!w.c.segs || !w.c.segs.length) return null;
      var i = idxAt(w.sec);
      return frameFor(i).catch(function () { return i + 1 < w.c.segs.length ? frameFor(i + 1) : null; });
    }).then(function (cv) { if (w.c === cur) w.cb(cv || null); }, function () { if (w.c === cur) w.cb(null); })
      .then(function () { busy = false; if (want) run(); });
  }
  T._demux = firstAccessUnit; T._decode = decode; // debugging hooks
  T.prefetch = function (sec) { if (cur && cur.segs && cur.segs.length) frameFor(idxAt(sec)).catch(function () {}); };
})();
