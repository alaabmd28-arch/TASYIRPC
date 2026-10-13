'use strict';
/* خادم الشبكة المحلية: يقدّم التطبيق للهاتف (GET) ويستقبل المزامنة (POST /sync) بعد التحقق من إثبات كود التفعيل. */
const http = require('http'), os = require('os'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = 47321, MAX = 60e6;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };
const hmacHex = (k, m) => crypto.createHmac('sha256', Buffer.from(k, 'hex')).update(m).digest('hex');
const lanHosts = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);

class SyncServer {
  constructor(file, appDir, forward, now = () => Date.now()) {
    Object.assign(this, { file, appDir, forward, now, srv: null, clients: {}, fails: [] });
    try { this.cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { this.cfg = {}; }
  }
  _save() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.cfg), { mode: 0o600 }); }
  status() { return { enabled: !!this.srv, hasCode: !!this.cfg.K, token: this.cfg.token || '', hosts: lanHosts(), port: PORT, clients: this.clients, wanted: !!this.cfg.enabled }; }
  async configure({ enable, K, resetToken }) {
    if (K && /^[0-9a-f]{64}$/.test(K)) this.cfg.K = K;
    if (!this.cfg.token || resetToken) { this.cfg.token = crypto.randomBytes(16).toString('hex'); this.clients = {}; }
    this.cfg.enabled = !!enable && !!this.cfg.K; this._save();
    if (this.cfg.enabled) await this.start(); else await this.stop();
    return this.status();
  }
  start() {
    if (this.srv) return Promise.resolve();
    return new Promise((ok, no) => {
      const s = http.createServer((q, r) => this._req(q, r));
      s.once('error', (e) => { this.srv = null; no(e); });
      s.listen(PORT, '0.0.0.0', () => { this.srv = s; ok(); });
    });
  }
  stop() { return new Promise((ok) => { const s = this.srv; this.srv = null; if (!s) return ok(); s.close(() => ok()); s.closeAllConnections && s.closeAllConnections(); }); }
  _send(r, code, obj) { r.writeHead(code, { 'content-type': 'application/json' }); r.end(JSON.stringify(obj)); }
  _static(q, r) {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/m' || p === '/') { r.writeHead(302, { location: '/root/index.html' + (q.url.includes('?') ? '?' + q.url.split('?')[1] : '') }); return r.end(); }
    const f = path.normalize(path.join(this.appDir, p));
    if (!f.startsWith(this.appDir + path.sep)) { r.writeHead(404); return r.end(); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(d); });
  }
  _req(q, r) {
    if (q.method === 'GET') return this._static(q, r);
    if (q.method !== 'POST' || q.url !== '/sync') { r.writeHead(404); return r.end(); }
    const t = this.now(); this.fails = this.fails.filter((x) => t - x < 60000);
    if (this.fails.length >= 10) return this._send(r, 429, { err: 'too many attempts' });
    let size = 0; const parts = [];
    q.on('data', (c) => { size += c.length; if (size > MAX) q.destroy(); else parts.push(c); });
    q.on('end', async () => {
      let b; try { b = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (_) { return this._send(r, 400, { err: 'bad json' }); }
      let ok = false;
      try {
        const a = Buffer.from(String(b.proof), 'hex'), e = Buffer.from(hmacHex(this.cfg.K, `${this.cfg.token}.${b.ts}`), 'hex');
        ok = a.length === e.length && crypto.timingSafeEqual(a, e) && Math.abs(this.now() - Number(b.ts)) < 600000;
      } catch (_) { /* غير مصرّح */ }
      if (!ok) { this.fails.push(this.now()); return this._send(r, 403, { err: 'activation code mismatch' }); }
      try { const res = await this.forward(b); this.clients[q.socket.remoteAddress] = this.now(); this._send(r, 200, res); }
      catch (e) { this._send(r, 503, { err: String(e && e.message || e) }); }
    });
  }
}
module.exports = { SyncServer, PORT, lanHosts, hmacHex };
