'use strict';
const {
  app, BrowserWindow, ipcMain, dialog, shell, protocol, session, Menu,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Security } = require('./lib/security');
const { pngSize, receiptHtml, pageSizeMicrons } = require('./lib/printing');
const { SyncServer } = require('./lib/syncserver');

const APP_DIR = path.join(__dirname, 'app');
const SCHEME = 'tasyir';
const ORIGIN = `${SCHEME}://app`;
const START_URL = `${ORIGIN}/root/index.html`;
const WHATSAPP = 'https://wa.me/213791071026';

// يجب تسجيل البروتوكول قبل جاهزية التطبيق: يمنح التطبيق origin ثابتًا
// (فيبقى localStorage و IndexedDB سليمين مهما تغيّر مسار التثبيت).
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let security = null;
let sync = null;
const waiters = new Map();
let reqId = 0;
let pendingSerial = null; // callback انتظار اختيار منفذ COM

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

/* ---------------------------------------------------------------- حالة النافذة */
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadWinState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) || {}; } catch (_) { return {}; }
}
function saveWinState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({
      ...b, max: win.isMaximized(), zoom: win.webContents.getZoomFactor(),
    }));
  } catch (_) { /* غير حرج */ }
}

/* ---------------------------------------------------------------- مساعدات */
function openExternalSafe(url) {
  try {
    const u = new URL(url);
    if (['https:', 'http:', 'mailto:', 'tel:'].includes(u.protocol)) shell.openExternal(url);
  } catch (_) { /* رابط غير صالح */ }
}

const isOurs = (url) => typeof url === 'string' && url.startsWith(ORIGIN);
const sanitizeName = (n) => String(n || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120);

/* ---------------------------------------------------------------- النافذة */
function createWindow() {
  const st = loadWinState();
  win = new BrowserWindow({
    width: st.width || 1280, height: st.height || 820,
    x: Number.isInteger(st.x) ? st.x : undefined, y: Number.isInteger(st.y) ? st.y : undefined,
    minWidth: 900, minHeight: 600,
    backgroundColor: '#0f766e', title: 'Tasyir bmd', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
    },
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => {
    if (st.zoom && st.zoom > 0.5 && st.zoom < 3) win.webContents.setZoomFactor(st.zoom);
  });

  // روابط خارجية (واتساب، اتصال…) تُفتح في المتصفح لا داخل التطبيق
  win.webContents.setWindowOpenHandler(({ url }) => { openExternalSafe(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isOurs(url)) { e.preventDefault(); openExternalSafe(url); }
  });

  // اختصارات: F11 ملء الشاشة، Ctrl+L قفل، Ctrl +/-/0 تكبير
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const wc = win.webContents;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    else if (ctrl && input.key.toLowerCase() === 'l') { wc.send('lock:now'); event.preventDefault(); }
    else if (ctrl && (input.key === '+' || input.key === '=')) { wc.setZoomFactor(Math.min(2.5, wc.getZoomFactor() + 0.1)); event.preventDefault(); }
    else if (ctrl && (input.key === '-' || input.key === '_')) { wc.setZoomFactor(Math.max(0.6, wc.getZoomFactor() - 0.1)); event.preventDefault(); }
    else if (ctrl && input.key === '0') { wc.setZoomFactor(1); event.preventDefault(); }
    else if (!app.isPackaged && ctrl && input.shift && input.key.toLowerCase() === 'i') { wc.toggleDevTools(); event.preventDefault(); }
  });

  win.on('close', saveWinState);
  win.on('closed', () => { win = null; });
  win.loadURL(START_URL);
}

/* ---------------------------------------------------------------- الطباعة */
async function listPrinters() {
  if (!win) return [];
  const list = await win.webContents.getPrintersAsync();
  return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
}

/** يطبع صورة الإيصال بصمت على الطابعة المختارة. يعيد '' عند النجاح أو رمز الخطأ الذي تفهمه الواجهة. */
async function printReceipt(printerName, b64, W) {
  let dims;
  try { dims = pngSize(b64); } catch (_) { return 'img'; }
  if (printerName) {
    let known = [];
    try { known = await listPrinters(); } catch (_) { /* نتابع */ }
    if (known.length && !known.some((p) => p.name === printerName)) return 'nodev';
  }
  const tmp = path.join(os.tmpdir(), `tasyir-rc-${process.pid}-${Date.now()}.html`);
  const pw = new BrowserWindow({
    show: false, width: 700, height: 900,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  try {
    fs.writeFileSync(tmp, receiptHtml(b64, W));
    await pw.loadFile(tmp);
    const size = pageSizeMicrons(W, dims.w, dims.h);
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve('conn'), 25000);
      const opts = {
        silent: true, printBackground: true,
        margins: { marginType: 'none' }, pageSize: size,
      };
      if (printerName) opts.deviceName = printerName;
      pw.webContents.print(opts, (ok) => { clearTimeout(timer); resolve(ok ? '' : 'io'); });
    });
  } catch (_) {
    return 'io';
  } finally {
    if (!pw.isDestroyed()) pw.destroy();
    fs.unlink(tmp, () => {});
  }
}

/* ---------------------------------------------------------------- النسخ الاحتياطي التلقائي */
function writeAutoBackup(json) {
  if (typeof json !== 'string' || json.length < 2 || json.length > 80e6) return;
  JSON.parse(json); // نرفض أي محتوى غير JSON صالح
  const dir = path.join(app.getPath('documents'), 'Tasyir Backups');
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const file = path.join(dir, `auto-${stamp}.json`);
  fs.writeFileSync(file + '.tmp', json);
  fs.renameSync(file + '.tmp', file);
  // نحتفظ بآخر 14 نسخة تلقائية فقط
  const autos = fs.readdirSync(dir).filter((f) => /^auto-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  autos.slice(0, Math.max(0, autos.length - 14)).forEach((f) => fs.unlink(path.join(dir, f), () => {}));
}

/* ---------------------------------------------------------------- IPC */
function registerIpc() {
  // --- PIN (متزامن: الواجهة الأصلية تستدعيها بشكل متزامن)
  const sync = (ch, fn) => ipcMain.on(ch, (e, ...a) => { try { e.returnValue = fn(...a); } catch (_) { e.returnValue = null; } });
  sync('pin:info', () => security.info());
  sync('pin:setup', (pin) => security.setup(pin));
  sync('pin:verify', (pin) => security.verify(String(pin)));
  sync('pin:disable', (pin) => security.disable(String(pin)));
  sync('pin:timeout', (s) => { security.setTimeoutSec(s); return true; });
  sync('pin:unlock', (pin) => security.unlock(String(pin)));
  sync('pin:recover', (key) => security.recover(key));

  // --- نافذة / نظام
  ipcMain.on('win:secure', (_e, on) => { if (win) win.setContentProtection(!!on); });
  ipcMain.on('win:lang', () => { /* لا شيء: اللغة تُدار داخل الواجهة */ });
  ipcMain.on('support', (_e, msg) => openExternalSafe(`${WHATSAPP}?text=${encodeURIComponent(String(msg || ''))}`));
  ipcMain.on('printers:settings', () => {
    if (process.platform === 'win32') shell.openExternal('ms-settings:printers');
    else if (process.platform === 'darwin') shell.openExternal('x-apple.systempreferences:com.apple.preference.printfax');
  });
  ipcMain.on('backup:write', (_e, json) => { try { writeAutoBackup(json); } catch (_) { /* غير حرج */ } });

  // --- مزامنة الهاتف: الحاسوب هو المحور؛ الطلب يُمرَّر للواجهة التي تملك قاعدة البيانات
  ipcMain.handle('sync:status', () => sync.status());
  ipcMain.handle('sync:config', (_e, o) => sync.configure(o || {}).catch((e) => ({ ...sync.status(), error: String(e && e.message || e) })));
  ipcMain.on('sync:res', (_e, { id, res, err }) => { const w = waiters.get(id); if (w) { waiters.delete(id); err ? w.rej(new Error(err)) : w.ok(res); } });

  // --- ملفات
  ipcMain.handle('file:save', async (_e, { name, b64 }) => {
    const def = path.join(app.getPath('documents'), sanitizeName(name));
    const r = await dialog.showSaveDialog(win, { defaultPath: def });
    if (r.canceled || !r.filePath) return '';
    fs.writeFileSync(r.filePath, Buffer.from(String(b64 || ''), 'base64'));
    return r.filePath;
  });

  // --- طابعات
  ipcMain.handle('printers:list', async () => { try { return await listPrinters(); } catch (_) { return []; } });
  ipcMain.handle('printers:print', (_e, { name, png, W }) => printReceipt(String(name || ''), String(png || ''), Number(W) || 384));

  // --- منافذ COM (ماسحات تسلسلية / بلوتوث SPP / USB-CDC)
  ipcMain.handle('serial:pick', (_e, id) => {
    if (pendingSerial) { const cb = pendingSerial; pendingSerial = null; cb(String(id || '')); }
    return true;
  });
}

function registerSession() {
  const ses = session.defaultSession;
  const ALLOW = new Set(['media', 'serial', 'fullscreen', 'clipboard-sanitized-write']);
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(isOurs(wc.getURL()) && ALLOW.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission, origin) => isOurs(origin) && ALLOW.has(permission));
  // يسمح بتذكّر منافذ COM التي اختارها المستخدم (لإعادة الاتصال تلقائيًا)
  ses.setDevicePermissionHandler((d) => d.deviceType === 'serial' && isOurs(d.origin));
  ses.on('select-serial-port', (event, portList, _wc, callback) => {
    event.preventDefault();
    if (pendingSerial) pendingSerial('');
    pendingSerial = callback;
    if (win) {
      win.webContents.send('serial:list', portList.map((p) => ({
        portId: p.portId, name: p.displayName || p.portName || '', portName: p.portName || '',
        vid: p.vendorId || '', pid: p.productId || '',
      })));
    }
  });
}

function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    try {
      const u = new URL(request.url);
      let p = decodeURIComponent(u.pathname);
      if (p === '/' || p === '') p = '/root/index.html';
      const full = path.normalize(path.join(APP_DIR, p));
      if (full !== APP_DIR && !full.startsWith(APP_DIR + path.sep)) return new Response('forbidden', { status: 403 });
      const data = await fs.promises.readFile(full);
      const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
      return new Response(data, { headers: { 'content-type': type } });
    } catch (_) {
      return new Response('not found', { status: 404 });
    }
  });
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  security = new Security(path.join(app.getPath('userData'), 'security.json'));
  registerProtocol();
  sync = new SyncServer(path.join(app.getPath('userData'), 'sync.json'), APP_DIR, (body) => new Promise((ok, rej) => {
    if (!win) return rej(new Error('desktop app closed'));
    const id = ++reqId;
    const t = setTimeout(() => { waiters.delete(id); rej(new Error('timeout')); }, 20000);
    waiters.set(id, { ok: (v) => { clearTimeout(t); ok(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
    win.webContents.send('sync:req', { id, body });
  }));
  if (sync.cfg.enabled) sync.start().catch(() => {});
  registerSession();
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
