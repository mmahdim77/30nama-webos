// Dev server: serves webos-app/ and proxies /proxy?url=<encoded> (no deps). Node 18+.
// Usage: node tools/devserver.js [port]   then open http://localhost:8080/
var http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
var ROOT = path.join(__dirname, '..');
var PORT = Number(process.argv[2]) || 8080;
var UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.128 Safari/537.36 WebAppManager';
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml' };
var FWD = /^(content-type|c-[a-z-]+|range|accept|accept-language)$/i;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', '*');
}
function proxify(base, target) {
  try { return '/proxy?url=' + encodeURIComponent(new URL(target, base).href); } catch (e) { return target; }
}
function rewriteM3U8(text, base) {
  return text.split(/\r?\n/).map(function (line) {
    if (!line) return line;
    if (line.charAt(0) === '#') return line.replace(/URI="([^"]+)"/g, function (m, u) { return 'URI="' + proxify(base, u) + '"'; });
    return proxify(base, line);
  }).join('\n');
}
function readBody(req) {
  return new Promise(function (ok) { var c = []; req.on('data', function (d) { c.push(d); }); req.on('end', function () { ok(Buffer.concat(c)); }); });
}
// NOTE: uses node's https module, not fetch(): Cloudflare 403-challenges undici's TLS fingerprint.
function upstream(target, method, headers, body, hops, cb) {
  var u = new URL(target), lib = u.protocol === 'https:' ? require('https') : require('http');
  var h = Object.assign({}, headers); if (body && body.length) h['content-length'] = body.length;
  var r = lib.request(target, { method: method, headers: h }, function (res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
      res.resume(); return upstream(new URL(res.headers.location, target).href, method, headers, body, hops + 1, cb);
    }
    cb(null, res, target);
  });
  r.on('error', function (e) { cb(e); });
  r.end(body && body.length ? body : undefined);
}
async function handleProxy(req, res, q) {
  var target = q.query.url;
  if (!target || !/^https?:\/\//i.test(target)) { res.writeHead(400); return res.end('bad url'); }
  var headers = { 'user-agent': UA };
  Object.keys(req.headers).forEach(function (k) { if (FWD.test(k)) headers[k] = req.headers[k]; });
  var body = (req.method !== 'GET' && req.method !== 'HEAD') ? await readBody(req) : null;
  upstream(target, req.method, headers, body, 0, function (err, up, finalUrl) {
    if (err) { res.writeHead(502); return res.end('proxy error: ' + err.message); }
    cors(res);
    var ct = up.headers['content-type'] || '';
    if (/mpegurl/i.test(ct) || /\.m3u8(\?|$)/i.test(finalUrl)) {
      var c = []; up.on('data', function (d) { c.push(d); });
      up.on('end', function () {
        res.writeHead(up.statusCode, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(rewriteM3U8(Buffer.concat(c).toString('utf8'), finalUrl));
      });
      return;
    }
    var out = { 'Content-Type': ct || 'application/octet-stream' };
    ['content-length', 'content-range', 'accept-ranges'].forEach(function (h) { if (up.headers[h]) out[h] = up.headers[h]; });
    res.writeHead(up.statusCode, out); up.pipe(res);
  });
}
http.createServer(function (req, res) {
  var q = url.parse(req.url, true);
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  if (q.pathname === '/proxy') return handleProxy(req, res, q);
  var p = decodeURIComponent(q.pathname); if (p === '/') p = '/index.html';
  var f = path.normalize(path.join(ROOT, p));
  if (f.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end(); }
  fs.readFile(f, function (err, data) {
    if (err && /[\\\/]js[\\\/]tmdb-token\.js$/.test(f)) { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end('/* no tmdb-token.js: TMDB disabled */'); }
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, function () { console.log('30nama dev server http://localhost:' + PORT + '/'); });
