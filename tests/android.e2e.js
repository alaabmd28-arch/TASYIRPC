// تطبيق أندرويد (ملفات assets الفعلية + جسر Android مُحاكى) ↔ حاسوب (خادم المزامنة الحقيقي)
const { chromium } = require('playwright'), path = require('path'), os = require('os'), http = require('http'), fs = require('fs');
const { SyncServer, PORT } = require('../lib/syncserver');
const ASSETS = process.argv[2] || '/home/claude/src/TasyirBMD/app/src/main/assets/htmlapp';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const CODE = 'ABCDEFGHJKMNPQRSTVWXYZ12';
(async () => {
  const mk = (root) => http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(d); }); }).listen(0);
  const st = mk(ASSETS), std = mk(path.join(__dirname, '..', 'app')), sp = st.address().port, spd = std.address().port, b = await chromium.launch(), c1 = await b.newContext(), c2 = await b.newContext({ viewport: { width: 400, height: 800 } });
  const pc = await c1.newPage(), ph = await c2.newPage(), errs = [];
  [pc, ph].forEach((p) => p.on('pageerror', (e) => errs.push(e.message)));
  const waiters = {}; let rid = 0;
  const srv = new SyncServer(path.join(os.tmpdir(), 'an' + Date.now() + '.json'), path.join(__dirname, '..', 'app'), (body) => new Promise((res, rej) => { const id = ++rid; waiters[id] = { res, rej }; pc.evaluate((m) => window.__req(m), { id, body }).catch(rej); }));
  await pc.exposeFunction('__res', (o) => { const w = waiters[o.id]; if (w) o.err ? w.rej(new Error(o.err)) : w.res(o.res); });
  await pc.exposeFunction('__inv', async (ch, a) => { if (ch === 'sync:config') await srv.configure(a); const s = srv.status(); s.hosts = ['127.0.0.1']; return s; });
  await pc.addInitScript(() => {
    window.__tasyirNative = { platform: 'win32', sendSync: (c) => (c === 'pin:info' ? { on: false, timeout: 0 } : true), send: (c, o) => { if (c === 'sync:res') window.__res(o); }, invoke: async (c, a) => (c.startsWith('sync:') ? window.__inv(c, a) : []), on: (c, cb) => { if (c === 'sync:req') window.__req = (m) => cb(m); } };
    localStorage.setItem('shopdb_v1', JSON.stringify({ lang: 'ar', shop: 'Shop', products: [{ id: 'a1', arch: false, name: 'Milk', bc: '6111000000011', cost: 5000, price: 8000, stock: 10, min: 1, unit: 'u', fam: '', img: '' }], customers: [], sales: [], ledger: [], expenses: [], seq: 0 }));
  });
  await pc.goto(`http://127.0.0.1:${spd}/root/index.html`); await pc.waitForTimeout(500);
  await pc.evaluate(() => { tab = 'set'; sub = 'phone'; R(); }); await pc.waitForSelector('#syc');
  await pc.fill('#syc', 'abcd-efgh-jkmn-pqrs-tvwx-yz12'); await pc.click('text=تفعيل الربط'); await pc.waitForSelector('svg[viewBox]');
  const url = (await pc.textContent('#m')).match(/http:\/\/[^\s]+\/m\?t=[0-9a-f]{32}/)[0].replace('127.0.0.1', '127.0.0.1');
  // هاتف أندرويد: جسر Android مُحاكى
  await ph.exposeFunction('__post', async (u, body) => { try { const r = await fetch(u, { method: 'POST', body }); return [r.status, await r.text()]; } catch (e) { return [0, 'ConnectException']; } });
  await ph.addInitScript(([url, code]) => {
    window.Android = { syncPost: (id, u, body) => { window.__post(u, body).then(([s, t]) => window.__syncRes(id, s, t)); }, licenseOwns: (c) => c.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === code, scan: () => { setTimeout(() => window.__ns(url), 50); }, setLang() {}, pinInfo: () => '{"on":false}', licenseInfo: () => '{"state":"active","days":9,"unlimited":false,"device":"X"}' };
  }, [url, CODE]);
  await ph.goto(`http://127.0.0.1:${sp}/root/index.html`); await ph.waitForTimeout(500);
  await ph.evaluate(() => { tab = 'set'; sub = ''; R(); });
  ok(/المزامنة مع الحاسوب/.test(await ph.textContent('#m')), 'صف المزامنة ظاهر في إعدادات أندرويد');
  await ph.evaluate(() => { sub = 'sync'; R(); }); await ph.click('text=ربط بالحاسوب');
  await ph.click('.md .bar button.b'); await ph.waitForFunction(() => document.getElementById('syu').value.includes('/m?t='));
  ok(true, 'مسح QR بماسح التطبيق التقط الرابط');
  await ph.fill('#syc', 'WRONG123456789012345WXYZ');
  await ph.evaluate(() => TDsync.link()); ok(/ليس كود التفعيل/.test(await ph.textContent('#sye')), 'كود غير مفعَّل على الهاتف مرفوض');
  await ph.fill('#syc', 'abcd efgh jkmn pqrs tvwx yz12'); await ph.evaluate(() => TDsync.link());
  await ph.waitForFunction(() => db.products.length === 1 && db.products[0].price === 8000, null, { timeout: 8000 }); ok(true, 'ربط ناجح بنفس كود التفعيل واستلام بيانات الحاسوب');
  await ph.evaluate(() => { db.products[0].price = 9000; save(); }); await ph.waitForTimeout(3500); await ph.evaluate(() => TDsync.now()); await ph.waitForTimeout(600);
  ok(await pc.evaluate(() => db.products[0].price === 9000), 'تعديل سعر على أندرويد وصل للحاسوب');
  await pc.evaluate(() => { db.products.push({ id: 'z9', arch: false, name: 'Tea', bc: '999', cost: 1, price: 2, stock: 5, min: 0, unit: 'u', fam: '', img: '' }); saveNow(); });
  await ph.evaluate(() => TDsync.now()); await ph.waitForTimeout(600);
  ok(await ph.evaluate(() => db.products.some((p) => p.bc === '999')), 'منتج جديد من الحاسوب وصل لأندرويد');
  // كود مختلف على الحاسوب => رفض
  await pc.evaluate(() => { sub = 'phone'; R(); }); await pc.click('text=إيقاف الربط'); await pc.waitForSelector('#syc'); await pc.fill('#syc', 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ'); await pc.click('text=تفعيل الربط');
  await ph.evaluate(() => TDsync.now()); await ph.waitForTimeout(600); ok(/غير مطابق|غير متاح/.test(await ph.textContent('#m') + await ph.evaluate(() => document.getElementById('tst') ? document.getElementById('tst').textContent : '')), 'كود مختلف: رفض');
  ok(errs.length === 0, 'لا أخطاء JS ' + errs.join('|'));
  await srv.stop(); st.close(); std.close(); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
