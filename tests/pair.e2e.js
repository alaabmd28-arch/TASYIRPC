// حاسوب + هاتف: خادم المزامنة الحقيقي، ومتصفحان منفصلان. التشغيل: node tests/pair.e2e.js
const { chromium } = require('playwright'), path = require('path'), os = require('os');
const { SyncServer, PORT } = require('../lib/syncserver'), SC = require('../app/js/sync-core.js');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(), c1 = await b.newContext({ viewport: { width: 1200, height: 800 } }), c2 = await b.newContext({ viewport: { width: 400, height: 800 } });
  const pc = await c1.newPage(), ph = await c2.newPage(), errs = [];
  [pc, ph].forEach((p) => p.on('pageerror', (e) => errs.push(e.message)));
  const waiters = {}; let rid = 0;
  const srv = new SyncServer(path.join(os.tmpdir(), 'pair' + Date.now() + '.json'), path.join(__dirname, '..', 'app'), (body) => new Promise((res, rej) => {
    const id = ++rid; waiters[id] = { res, rej }; pc.evaluate((m) => window.__req(m), { id, body }).catch(rej);
  }));
  await pc.exposeFunction('__res', (o) => { const w = waiters[o.id]; if (w) o.err ? w.rej(new Error(o.err)) : w.res(o.res); });
  await pc.exposeFunction('__inv', async (ch, a) => {
    if (ch === 'sync:config') { try { await srv.configure(a); } catch (e) { return { ...srv.status(), error: e.message }; } }
    const s = srv.status(); if (!s.hosts.length) s.hosts = ['192.168.1.5']; return s;
  });
  await pc.addInitScript(() => {
    window.__tasyirNative = { platform: 'win32', sendSync: (c) => (c === 'pin:info' ? { on: false, timeout: 0 } : true), send: (c, o) => { if (c === 'sync:res') window.__res(o); },
      invoke: async (c, a) => (c.startsWith('sync:') ? window.__inv(c, a) : []), on: (c, cb) => { if (c === 'sync:req') window.__req = (m) => cb(m); } };
    if (!localStorage.getItem('shopdb_v1')) localStorage.setItem('shopdb_v1', JSON.stringify({ lang: 'ar', shop: 'Shop', products: [
      { id: 'a1', arch: false, name: 'Milk', bc: '6111000000011', cost: 5000, price: 8000, stock: 10, min: 1, unit: 'u', fam: '', img: '' },
      { id: 'a2', arch: false, name: 'Bread', bc: '222', cost: 1000, price: 2000, stock: 50, min: 1, unit: 'u', fam: '', img: '' }], customers: [], sales: [], ledger: [], expenses: [], seq: 0 }));
  });
  await pc.goto(`file://${path.join(__dirname, '..', 'app', 'root', 'index.html')}`.replace('file://', 'file://')); // يحتاج http لـ fetch؟ لا: الحاسوب لا يستعمل fetch
  await pc.waitForTimeout(500);
  // 1) شاشة ربط الهاتف على الحاسوب
  await pc.evaluate(() => { tab = 'set'; sub = 'phone'; R(); });
  await pc.waitForSelector('#syc'); await pc.fill('#syc', 'ABCD-1234'); await pc.click('text=تفعيل الربط');
  await pc.waitForSelector('svg[viewBox]'); const url = (await pc.textContent('#m')).match(/http:\/\/[^\s]+\/m\?t=[0-9a-f]{32}/)[0];
  ok(url.length <= 100, 'QR يظهر والرابط قصير: ' + url.length);
  ok(await pc.evaluate(() => !!document.querySelector('#m svg path')), 'رسم QR موجود');
  // 2) الهاتف يفتح الرابط
  const phoneUrl = url.replace(/http:\/\/[^/]+/, `http://127.0.0.1:${PORT}`);
  await ph.goto(phoneUrl); await ph.waitForSelector('#syc'); await ph.fill('#syc', 'WRONG-0000'); await ph.click('.md button.b:not(.s)');
  await ph.waitForSelector('text=غير مطابق'); ok(true, 'كود خاطئ مرفوض');
  await ph.goto(phoneUrl); await ph.waitForSelector('#syc'); await ph.fill('#syc', 'abcd 1234'); await ph.click('.md button.b:not(.s)');
  await ph.waitForFunction(() => db.products.length === 2, null, { timeout: 8000 }); ok(true, 'الهاتف استلم منتجات الحاسوب بالكود الصحيح');
  ok(await ph.evaluate(() => db.products.find((p) => p.bc === '222').price === 2000), 'السعر نفسه');
  // 3) تعديل سعر على الهاتف ← الحاسوب
  await ph.evaluate(() => { db.products.find((p) => p.bc === '222').price = 2500; save(); });
  await ph.waitForTimeout(3500); await ph.evaluate(() => TDsync.now()); await ph.waitForTimeout(600);
  ok(await pc.evaluate(() => db.products.find((p) => p.bc === '222').price === 2500), 'تعديل السعر على الهاتف وصل للحاسوب');
  // 4) بيع على الهاتف ينقص مخزون الحاسوب + الفاتورة
  await ph.evaluate(() => { const p = db.products.find((x) => x.bc === '6111000000011'); cart = [{ pid: p.id, name: p.name, price: p.price, cost: p.cost, qty: 3, tier: 'p1' }]; doSell(24000); });
  await ph.waitForTimeout(300); await ph.evaluate(() => TDsync.now()); await ph.waitForTimeout(600);
  ok(await pc.evaluate(() => db.sales.length === 1 && db.products.find((p) => p.bc === '6111000000011').stock === 7), 'بيع الهاتف: الفاتورة والمخزون عند الحاسوب');
  // 5) تعديل من الحاسوب ثم حذف ← الهاتف
  await pc.evaluate(() => { db.products.find((p) => p.bc === '222').name = 'Bread XL'; db.products.push({ id: 'a3', arch: false, name: 'New', bc: '333', cost: 1, price: 2, stock: 1, min: 0, unit: 'u', fam: '', img: '' }); saveNow(); });
  await ph.evaluate(() => TDsync.now()); await ph.waitForTimeout(600);
  ok(await ph.evaluate(() => db.products.find((p) => p.bc === '222').name === 'Bread XL' && db.products.some((p) => p.bc === '333')), 'تعديل وإضافة من الحاسوب وصلا للهاتف');
  await pc.evaluate(() => { db.products = db.products.filter((p) => p.bc !== '333'); saveNow(); });
  await ph.evaluate(() => TDsync.now()); await ph.waitForTimeout(600);
  ok(await ph.evaluate(() => !db.products.some((p) => p.bc === '333')), 'الحذف انتقل للهاتف');
  ok(await ph.evaluate(() => db.sales.length === 1), 'لا تكرار للفواتير');
  await ph.screenshot({ path: '/home/claude/shot-phone.png' }); await pc.evaluate(() => { tab = 'set'; sub = 'phone'; R(); }); await pc.screenshot({ path: '/home/claude/shot-pc-qr.png' });
  ok(errs.length === 0, 'لا أخطاء JS ' + errs.join('|'));
  await srv.stop(); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
