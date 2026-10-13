/* مولّد QR صغير (وضع Byte، تصحيح L، الإصدارات 1–6 = حتى 134 بايت). يُرجع SVG. */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.QR = f(); })(this, function () {
  'use strict';
  var EXP = [], LOG = [], i;
  (function () { var x = 1; for (i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  var mul = function (a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; };
  function gen(n) { var p = [1], j, q; for (var k = 0; k < n; k++) { q = []; for (j = 0; j <= p.length; j++) q[j] = 0; for (j = 0; j < p.length; j++) { q[j] ^= p[j]; q[j + 1] ^= mul(p[j], EXP[k]); } p = q; } return p; }
  function rs(data, n) { var g = gen(n), r = [], k; for (k = 0; k < n; k++) r.push(0); data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); for (k = 0; k < n; k++) r[k] ^= mul(g[k + 1], f); }); return r; }
  var VER = { 1: [7, [[1, 19]]], 2: [10, [[1, 34]]], 3: [15, [[1, 55]]], 4: [20, [[1, 80]]], 5: [26, [[1, 108]]], 6: [18, [[2, 68]]] };
  var ALIGN = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };

  function matrix(text) {
    var bytes = [], s = unescape(encodeURIComponent(String(text))), v, t, dc, k, j;
    for (k = 0; k < s.length; k++) bytes.push(s.charCodeAt(k));
    for (v = 1; v <= 5; v++) { t = VER[v]; dc = t[1].reduce(function (a, b) { return a + b[0] * b[1]; }, 0); if (Math.ceil((12 + bytes.length * 8) / 8) <= dc) break; }
    if (v > 5) throw new Error('QR: text too long');
    var bits = [], put = function (val, n) { for (var b = n - 1; b >= 0; b--) bits.push((val >> b) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, dc * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    var cw = []; for (k = 0; k < bits.length; k += 8) { var x = 0; for (j = 0; j < 8; j++) x = (x << 1) | bits[k + j]; cw.push(x); }
    for (k = 0; cw.length < dc; k ^= 1) cw.push(k ? 0x11 : 0xec);
    var ecn = t[0], blocks = [], pos = 0;
    t[1].forEach(function (g) { for (var c = 0; c < g[0]; c++) { var d = cw.slice(pos, pos + g[1]); pos += g[1]; blocks.push({ d: d, e: rs(d, ecn) }); } });
    var out = [], maxd = Math.max.apply(null, blocks.map(function (b) { return b.d.length; }));
    for (k = 0; k < maxd; k++) blocks.forEach(function (b) { if (k < b.d.length) out.push(b.d[k]); });
    for (k = 0; k < ecn; k++) blocks.forEach(function (b) { out.push(b.e[k]); });

    var size = 17 + 4 * v, m = [], fn = [], y, x2;
    for (y = 0; y < size; y++) { m.push([]); fn.push([]); for (x2 = 0; x2 < size; x2++) { m[y].push(false); fn[y].push(false); } }
    var setF = function (x, yy, d) { if (x >= 0 && yy >= 0 && x < size && yy < size) { m[yy][x] = d; fn[yy][x] = true; } };
    for (k = 0; k < size; k++) { setF(6, k, k % 2 === 0); setF(k, 6, k % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) { for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var d = Math.max(Math.abs(dx), Math.abs(dy)); setF(c[0] + dx, c[1] + dy, d !== 2 && d !== 4); } });
    var al = ALIGN[v] || [];
    al.forEach(function (a, ia) { al.forEach(function (b, ib) { if ((ia === 0 && ib === 0) || (ia === 0 && ib === al.length - 1) || (ia === al.length - 1 && ib === 0)) return; for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setF(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }); });
    function format(mask) {
      var data = (1 << 3) | mask, rem = data, b;           // مستوى L = 01
      for (k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
      var fb = ((data << 10) | rem) ^ 0x5412, bit = function (n) { return ((fb >> n) & 1) !== 0; };
      for (b = 0; b <= 5; b++) setF(8, b, bit(b)); setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8)); for (b = 9; b < 15; b++) setF(14 - b, 8, bit(b));
      for (b = 0; b < 8; b++) setF(size - 1 - b, 8, bit(b)); for (b = 8; b < 15; b++) setF(8, size - 15 + b, bit(b)); setF(8, size - 8, true);
    }
    format(0);
    var idx = 0, total = out.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (j = 0; j < 2; j++) {
        var xx = right - j, up = ((right + 1) & 2) === 0, yy = up ? size - 1 - vert : vert;
        if (!fn[yy][xx] && idx < total) { m[yy][xx] = ((out[idx >> 3] >> (7 - (idx & 7))) & 1) !== 0; idx++; }
      }
    }
    for (y = 0; y < size; y++) for (x2 = 0; x2 < size; x2++) if (!fn[y][x2] && (x2 + y) % 2 === 0) m[y][x2] = !m[y][x2];   // القناع 0
    format(0);
    return m;
  }
  function svg(text, quiet) {
    var m = matrix(text), q = quiet == null ? 4 : quiet, n = m.length + q * 2, d = '';
    m.forEach(function (row, y) { row.forEach(function (c, x) { if (c) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z'; }); });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"><rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  return { matrix: matrix, svg: svg };
});
