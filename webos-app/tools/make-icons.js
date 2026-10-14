// Generates placeholder PNG icons (no deps). Usage: node tools/make-icons.js
var zlib = require('zlib'), fs = require('fs'), path = require('path');
function crc32(buf) { var c, crc = 0xffffffff; for (var n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { var len = Buffer.alloc(4); len.writeUInt32BE(data.length); var td = Buffer.concat([Buffer.from(type), data]); var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size) {
  var raw = Buffer.alloc((size * 4 + 1) * size);
  for (var y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (var x = 0; x < size; x++) {
      var i = y * (size * 4 + 1) + 1 + x * 4;
      var cx = x / size - 0.5, cy = y / size - 0.5, d = Math.sqrt(cx * cx + cy * cy);
      var tri = cx > -0.12 && cx < 0.2 && Math.abs(cy) < (0.2 - cx) * 0.75 * (cx + 0.12 > 0 ? 1 : 0) + 0 && Math.abs(cy) < (0.2 - cx) * 0.8;
      var r = 17, g = 20, b = 28;
      if (d < 0.42) { r = 229; g = 9; b = 20; }
      if (tri) { r = 255; g = 255; b = 255; }
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
    }
  }
  var ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
var root = path.join(__dirname, '..');
// webOS launcher sizes: icon 80x80, largeIcon 130x130
fs.writeFileSync(path.join(root, 'icon.png'), png(80));
fs.writeFileSync(path.join(root, 'largeIcon.png'), png(130));
console.log('icons written');
