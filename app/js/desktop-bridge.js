/* Tasyir bmd — جسر النسخة المكتبية
   يعيد بناء واجهة `Android.*` التي كانت توفّرها طبقة أندرويد الأصلية، فتعمل الواجهة الأصلية
   (index.html + v2..v5) دون تعديل. يُحمَّل أولًا لأن الواجهة تفحص window.Android أثناء التحميل.
   خارج Electron (متصفح عادي) لا يفعل شيئًا فيبقى السلوك الأصلي (الكاميرا). */
(function () {
  'use strict';
  var N = window.__tasyirNative;
  if (!N) return;
  var TD = (window.TD = window.TD || {});
  TD.N = N;
  TD.desktop = true;
  window.__tlocked = false;

  var jp = function (s, d) { try { return JSON.parse(s); } catch (e) { return d; } };
  function lang() {
    var d = jp(localStorage.getItem('shopdb_v1'), null);
    return (d && d.lang) || ((navigator.language || '').indexOf('fr') === 0 ? 'fr' : 'ar');
  }

  /* ------------------------------------------------------------------ طباعة حرارية */
  var printers = [];
  function refreshPrinters() {
    return N.invoke('printers:list').then(function (l) { printers = l || []; return printers; }).catch(function () { return printers; });
  }
  TD.listPrinters = refreshPrinters;

  /* ------------------------------------------------------------------ واجهة Android الأصلية */
  window.Android = {
    // PIN
    pinInfo: function () { return JSON.stringify(N.sendSync('pin:info') || { on: false, timeout: 60 }); },
    pinSetup: function (p) { return N.sendSync('pin:setup', String(p)) || ''; },
    pinVerify: function (p) { return !!N.sendSync('pin:verify', String(p)); },
    pinDisable: function (p) { return !!N.sendSync('pin:disable', String(p)); },
    pinTimeout: function (s) { N.sendSync('pin:timeout', +s || 0); },
    // نظام
    setSecure: function (on) { N.send('win:secure', !!on); },
    setLang: function (l) { N.send('win:lang', String(l || '')); },
    support: function (msg) { N.send('support', String(msg || '')); },
    saveFile: function (name, type, b64) {
      N.invoke('file:save', { name: name, b64: b64 }).then(function (p) {
        if (p && window.toast) window.toast('[ok] ' + p);
      }).catch(function (e) { alert(e && e.message || e); });
    },
    // طابعات (بدل بلوتوث أندرويد: أي طابعة مثبّتة في النظام)
    btDevices: function () {
      refreshPrinters();
      return JSON.stringify({ list: printers.map(function (p) { return { mac: p.name, name: p.displayName }; }) });
    },
    btSettings: function () { N.send('printers:settings'); },
    btPrint: function (mac, png, W) {
      var done = function (e) { try { if (window.__btr) window.__btr(e || ''); } catch (_) { /* لا شيء */ } };
      N.invoke('printers:print', { name: mac, png: png, W: W }).then(done).catch(function () { done('io'); });
    }
    // scan / stopScan / scanToggle تُضاف في desktop-ui.js (تحتاج دوال الواجهة)
    // licenseInfo / openLicense: غير مُنفَّذة عمدًا — انظر README (الترخيص)
  };
  refreshPrinters();

  /* ------------------------------------------------------------------ نسخ احتياطي تلقائي على القرص */
  // الواجهة تستدعي window.onSaved بعد كل حفظ؛ نكتب نسخة JSON يومية في Documents/Tasyir Backups
  var bt = 0;
  function flushBackup() {
    clearTimeout(bt); bt = 0;
    try { var j = localStorage.getItem('shopdb_v1'); if (j) N.send('backup:write', j); } catch (_) { /* لا شيء */ }
  }
  window.onSaved = function () { clearTimeout(bt); bt = setTimeout(flushBackup, 20000); };
  addEventListener('pagehide', function () { if (bt) flushBackup(); });

  /* ------------------------------------------------------------------ شاشة قفل PIN */
  var TX = {
    ar: { title: 'التطبيق مقفل', ph: 'أدخل PIN', ok: 'فتح', forgot: 'نسيت PIN؟', rk: 'مفتاح الاسترجاع', rec: 'استرجاع', back: 'رجوع', bad: 'PIN غير صحيح', wait: 'محاولات كثيرة. انتظر # ثانية', done: 'أُلغي PIN. فعّل PIN جديدًا من الإعدادات.', badk: 'مفتاح الاسترجاع غير صحيح' },
    fr: { title: 'Application verrouillée', ph: 'Saisissez le PIN', ok: 'Ouvrir', forgot: 'PIN oublié ?', rk: 'Clé de récupération', rec: 'Récupérer', back: 'Retour', bad: 'PIN incorrect', wait: 'Trop d\'essais. Attendez # s', done: 'PIN supprimé. Activez-en un nouveau dans les réglages.', badk: 'Clé de récupération incorrecte' },
    en: { title: 'App locked', ph: 'Enter PIN', ok: 'Unlock', forgot: 'Forgot PIN?', rk: 'Recovery key', rec: 'Recover', back: 'Back', bad: 'Wrong PIN', wait: 'Too many attempts. Wait # s', done: 'PIN removed. Set a new one in Settings.', badk: 'Wrong recovery key' }
  };
  var lockEl = null, hiddenAt = 0, waitTimer = 0;

  var CSS = '#tlock{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
    'background:linear-gradient(160deg,#0f766e,#0b3f3b);font-family:system-ui,"Segoe UI",Tahoma,sans-serif;color:#fff;overflow:auto}' +
    '#tlock .tl{width:min(340px,92vw);text-align:center;padding:20px}' +
    '#tlock h2{margin:0 0 4px;font-size:22px}#tlock .sub{opacity:.8;font-size:13px;margin-bottom:16px}' +
    '#tlock input{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:0;font-size:22px;text-align:center;letter-spacing:8px;color:#0f172a}' +
    '#tlock input.rk{letter-spacing:2px;font-size:18px;direction:ltr}' +
    '#tlock .pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0;direction:ltr}' +
    '#tlock button{border:0;border-radius:12px;padding:14px 0;font-size:20px;font-weight:700;background:rgba(255,255,255,.16);color:#fff;cursor:pointer}' +
    '#tlock button:hover{background:rgba(255,255,255,.26)}#tlock button.go{background:#fff;color:#0f766e;width:100%;margin-top:4px}' +
    '#tlock a{color:#fff;opacity:.85;font-size:13px;cursor:pointer;text-decoration:underline}' +
    '#tlock .err{min-height:20px;margin:8px 0;color:#fecaca;font-size:14px}';

  function el(tag, props, kids) {
    var e = document.createElement(tag), k;
    for (k in props || {}) { if (k === 'text') e.textContent = props[k]; else e[k] = props[k]; }
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }

  function unlockUI(msgAfter) {
    if (lockEl) { lockEl.remove(); lockEl = null; }
    clearInterval(waitTimer);
    window.__tlocked = false;
    document.dispatchEvent(new CustomEvent('tasyir:unlocked'));
    if (msgAfter) setTimeout(function () { if (window.toast) window.toast('[ok] ' + msgAfter); }, 300);
  }

  function showLock() {
    if (lockEl) return;
    var t = TX[lang()] || TX.ar;
    window.__tlocked = true;
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) { /* لا شيء */ }
    var st = el('style', { textContent: CSS });
    var pin = el('input', { type: 'password', inputMode: 'numeric', maxLength: 6, placeholder: t.ph, autocomplete: 'off', id: 'tl-pin' });
    var err = el('div', { className: 'err' });
    var pad = el('div', { className: 'pad' });
    var setErr = function (m) { err.textContent = m || ''; };

    function lockedFor(sec) {
      clearInterval(waitTimer);
      var left = sec; setErr(t.wait.replace('#', left));
      waitTimer = setInterval(function () { left -= 1; if (left <= 0) { clearInterval(waitTimer); setErr(''); } else setErr(t.wait.replace('#', left)); }, 1000);
    }
    function submit() {
      var v = pin.value; if (v.length < 4) return;
      var r = N.sendSync('pin:unlock', v) || {};
      if (r.ok) return unlockUI();
      pin.value = '';
      if (r.wait) lockedFor(r.wait); else setErr(t.bad);
    }
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].forEach(function (k) {
      pad.appendChild(el('button', {
        type: 'button', text: k,
        onclick: function () {
          if (k === '⌫') pin.value = pin.value.slice(0, -1);
          else if (k === '✓') submit();
          else if (pin.value.length < 6) pin.value += k;
          pin.focus();
        }
      }));
    });
    pin.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    pin.addEventListener('input', function () { pin.value = pin.value.replace(/\D/g, '').slice(0, 6); });

    // لوحة الاسترجاع
    var rk = el('input', { type: 'text', placeholder: t.rk, className: 'rk', autocomplete: 'off', id: 'tl-rk' });
    var rerr = el('div', { className: 'err' });
    var recBtn = el('button', { type: 'button', className: 'go', text: t.rec });
    var backBtn = el('a', { text: t.back });
    var recPanel = el('div', { style: 'display:none' }, [rk, rerr, recBtn, el('div', { style: 'margin-top:12px' }, [backBtn])]);
    var main = el('div', {}, [pin, err, pad, el('button', { type: 'button', className: 'go', text: t.ok, onclick: submit }),
      el('div', { style: 'margin-top:14px' }, [el('a', { text: t.forgot, onclick: function () { main.style.display = 'none'; recPanel.style.display = ''; rk.focus(); } })])]);
    backBtn.onclick = function () { recPanel.style.display = 'none'; main.style.display = ''; pin.focus(); };
    recBtn.onclick = function () {
      var r = N.sendSync('pin:recover', rk.value) || {};
      if (r.ok) return unlockUI(t.done);
      rerr.textContent = r.wait ? t.wait.replace('#', r.wait) : t.badk;
    };
    rk.addEventListener('keydown', function (e) { if (e.key === 'Enter') recBtn.onclick(); });

    lockEl = el('div', { id: 'tlock', dir: lang() === 'ar' ? 'rtl' : 'ltr' }, [st,
      el('div', { className: 'tl' }, [el('h2', { text: t.title }), el('div', { className: 'sub', text: 'Tasyir bmd' }), main, recPanel])]);
    document.documentElement.appendChild(lockEl);
    pin.focus();
  }

  function pinOn() { var i = N.sendSync('pin:info'); return !!(i && i.on); }
  TD.lockNow = function () { if (pinOn()) showLock(); };

  // 1) قفل عند بدء التشغيل  2) قفل بعد الخلفية (تصغير النافذة) حسب المهلة  3) Ctrl+L
  if (pinOn()) showLock();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    var i = N.sendSync('pin:info') || {};
    if (i.on && hiddenAt && (Date.now() - hiddenAt) / 1000 >= (i.timeout || 0)) showLock();
    hiddenAt = 0;
  });
  N.on('lock:now', function () { TD.lockNow(); });
})();
