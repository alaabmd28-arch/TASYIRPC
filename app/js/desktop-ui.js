/* Tasyir bmd — النسخة المكتبية: ماسح الباركود (أي نوع) + إعداداته + تعديلات سطح المكتب.
   يُحمَّل بعد v5.js فيستطيع استدعاء دوال الواجهة (posScan, quickScan, sheet, ...) وإعادة تعريف بعضها.

   أنواع الماسحات المدعومة:
   1) USB / Bluetooth / 2.4GHz اللاسلكي بوضع "لوحة مفاتيح" (HID Keyboard Wedge) — الأكثر شيوعًا. تلقائي، بلا إعداد.
   2) ماسحات COM التسلسلية (RS-232 عبر محوّل، USB-CDC "Virtual COM"، Bluetooth SPP) عبر Web Serial. */
(function () {
  'use strict';
  var N = window.__tasyirNative, TD = window.TD;
  if (!N || !TD || !window.Android) return;

  /* ====================================================================== إعدادات الماسح */
  var CFGK = 'tasyir_scanner_cfg';
  var DEF = { global: true, minLen: 4, gap: 40, sound: true, baud: 9600, vid: null, pid: null, serialOn: false, serialAuto: true };
  var jp = function (s, d) { try { return JSON.parse(s); } catch (e) { return d; } };
  var cfg = Object.assign({}, DEF, jp(localStorage.getItem(CFGK), {}));
  var saveCfg = function () { try { localStorage.setItem(CFGK, JSON.stringify(cfg)); } catch (e) { /* لا شيء */ } };

  var state = { last: null, serial: { status: 'off', name: '', err: '' } };
  var emit = function () { document.dispatchEvent(new CustomEvent('tasyir:scan-state')); };
  var $id = function (i) { return document.getElementById(i); };
  var Lx = function (a, f, e) { return L(a, f, e); };

  /* ====================================================================== صوت */
  var AC = null;
  function tone(freq, ms) {
    if (!cfg.sound) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      var o = AC.createOscillator(), g = AC.createGain();
      o.frequency.value = freq; g.gain.value = 0.15;
      o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + ms / 1000);
    } catch (e) { /* لا شيء */ }
  }
  var beepOk = function () { tone(1000, 90); };
  var beepBad = function () { tone(260, 230); };

  /* ====================================================================== توجيه الباركود */
  var sess = null; // جلسة نافذة المسح المفتوحة

  function sessionOpen() { return !!$id('tsMan'); }

  function unknownSheet(code) {
    sheet('<div id="tsUnk"><h3>' + ic('alert') + ' ' + t('nof') + '</h3>' +
      '<div class="v" style="direction:ltr;text-align:center;word-break:break-all">' + esc(code) + '</div>' +
      '<div class="bar" style="margin-top:12px"><button class="b" data-c="' + esc(code) + '" onclick="window.__nf(this.dataset.c)">' +
      ic('plus') + ' ' + Lx('إضافة منتج بهذا الباركود', 'Ajouter un produit avec ce code', 'Add a product with this barcode') + '</button>' +
      '<button class="b s" onclick="ov.innerHTML=\'\'">' + t('ok') + '</button></div></div>');
  }

  function finish(r) {
    if (r && r[0]) { beepOk(); if (r[1]) toast('[ok] ' + r[1]); }
    else if (r && r[1]) { beepBad(); toast('[warn] ' + r[1]); }
  }

  function sellScan(code) {
    var r = posScan(code);
    if (r && r[0]) { beepOk(); toast('[ok] ' + r[1]); return; }
    beepBad(); unknownSheet(code);
  }

  /** توجيه باركود وصل بدون نافذة مسح مفتوحة، حسب الشاشة الحالية. */
  function passive(code) {
    var o = $id('ov');
    if (o && $id('tsUnk')) o.innerHTML = '';                 // نافذة "غير موجود" السابقة: نغلقها ونتابع

    // 1) نموذج المنتج مفتوح: املأ حقل الباركود
    if ($id('bcv') && $id('f1')) { $id('f1').value = code; try { bcPrev(); } catch (e) { /* لا شيء */ } beepOk(); toast('[ok] ' + code); return; }
    // 2) نافذة الإضافة السريعة لمنتج جديد
    if ($id('qb')) { $id('qb').value = code; beepOk(); return; }
    // 3) نوافذ أخرى مفتوحة
    if (o && o.innerHTML.trim()) {
      if (o.querySelector('[onclick^="printRc("]')) o.innerHTML = ''; // معاينة الإيصال بعد البيع: نغلقها ونتابع
      else { beepBad(); toast('[warn] ' + Lx('أغلق النافذة المفتوحة أولًا', 'Fermez d\'abord la fenêtre ouverte', 'Close the open dialog first')); return; }
    }
    var tb = tab, sb = sub;
    if (tb === 'dash') { go('pos'); tb = 'pos'; }
    if (tb === 'pos' && !sb) return sellScan(code);
    if (tb === 'prod' && !sb) { window._nscb = quickScan; return finish(quickScan(code)); }
    if (tb === 'inv') { iq = code; ilim = 50; R(); beepOk(); return; }
    if (tb === 'cap') { window._nscb = capScan; return finish(capScan(code)); }
    beepBad();
    toast('[warn] ' + Lx('افتح شاشة البيع أو المنتجات لاستعمال الماسح', 'Ouvrez Vente ou Produits pour scanner', 'Open Sell or Products to use the scanner'));
  }

  /** نقطة دخول موحّدة لكل أنواع الماسحات. */
  function route(raw, src) {
    var code = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!code || window.__tlocked) return;
    state.last = { code: code, src: src, t: Date.now() };
    emit();
    if (sessionOpen()) return deliver(code);
    try { passive(code); } catch (e) { console.error(e); toast('[warn] ' + (e && e.message || e)); }
  }
  TD.route = route; // للاختبار والتشخيص

  /* ====================================================================== نافذة المسح (Android.scan) */
  function statusHtml() {
    var s = state.serial;
    var h = Lx('ماسح USB / بلوتوث / لاسلكي: جاهز تلقائيًا', 'Lecteur USB / Bluetooth / sans fil : prêt', 'USB / Bluetooth / wireless scanner: ready');
    if (s.status === 'on') h += ' · COM ✓ ' + esc(s.name);
    return h;
  }

  function openOverlay(multi) {
    sess = { multi: !!multi };
    sv.innerHTML = '<div class="md"><div><div class="tsx">' +
      '<div class="tsi">' + ic('scan', 56) + '</div>' +
      '<b>' + Lx('جاهز للمسح — امسح الباركود بالماسح الضوئي', 'Prêt — scannez le code-barres', 'Ready — scan the barcode') + '</b>' +
      '<div class="k" id="tsStat" style="margin:6px 0 10px">' + statusHtml() + '</div>' +
      '<div id="tsRes" class="tsres"></div>' +
      '<div class="bar"><input id="tsMan" data-scan="type" autocomplete="off" placeholder="' + Lx('أو اكتب الباركود يدويًا ثم Enter', 'Ou saisissez le code puis Entrée', 'Or type the barcode then Enter') + '">' +
      '<button class="b" id="tsGo">' + ic('check') + '</button></div>' +
      '<button class="b s" style="width:100%;margin-top:10px" onclick="stopScan()">' + (multi ? t('ok') : t('cancel')) + '</button>' +
      '</div></div></div>';
    var man = $id('tsMan');
    var go_ = function () { var v = man.value.trim(); man.value = ''; if (v) route(v, 'manual'); man.focus(); };
    man.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go_(); } });
    $id('tsGo').addEventListener('click', go_);
    man.focus();
  }

  function deliver(code) {
    var r;
    try { r = JSON.parse(window.__ns(code)); } catch (e) { r = [0, String(e && e.message || e)]; }
    var good = !!(r && r[0]), msg = (r && r[1]) || '';
    if (good) beepOk(); else beepBad();
    var box = $id('tsRes');
    if (box) {
      box.innerHTML = '<div class="' + (good ? 'grn' : 'red') + '" style="font-weight:700">' + ic(good ? 'check' : 'x') + ' ' + esc(msg || code) + '</div>' +
        (!good && msg ? '<button class="b sm" style="margin-top:6px" data-c="' + esc(code) + '" onclick="window.__nf(this.dataset.c)">' + ic('plus') + ' ' +
          Lx('إضافة منتج بهذا الباركود', 'Ajouter ce produit', 'Add this product') + '</button>' : '');
    }
    if (good && sess && !sess.multi) stopScan();
  }

  window.Android.scan = function (multi) { openOverlay(multi); };
  window.Android.scanToggle = function (on) { if (on) openOverlay(true); else stopScan(); };
  window.Android.stopScan = function () { stopScan(); };

  /* ====================================================================== ماسحات لوحة المفاتيح (Keyboard Wedge) */
  var W = { buf: '', tLast: 0, snap: null, tg: null, timer: 0, swallowUntil: 0 };
  var NOEDIT = { checkbox: 1, radio: 1, button: 1, submit: 1, reset: 1, file: 1, range: 1, color: 1, image: 1 };

  function kind(el) {
    if (!el || el.nodeType !== 1) return 'none';
    var tg = el.tagName;
    if (tg === 'INPUT') return NOEDIT[(el.type || '').toLowerCase()] ? 'none' : 'edit';
    if (tg === 'TEXTAREA' || tg === 'SELECT' || el.isContentEditable) return 'edit';
    return 'none';
  }
  /** حقول يُسمح للماسح بالكتابة فيها مباشرة (باركود/بحث). */
  function allowTyping(el) {
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return false;
    var id = el.id;
    if (id === 'tsMan' || id === 'qb' || (el.dataset && el.dataset.scan === 'type')) return true;
    if (id === 'f1') return !!$id('bcv');          // f1 هو الباركود في نموذج المنتج فقط
    if (id === 'q') return false;                  // بحث البيع: نعالجه نحن (صوت + إضافة)
    var ph = el.placeholder || '';
    return !!ph && ph === t('search');             // حقول بحث المنتجات/المخزون
  }
  function snap(el) {
    if (kind(el) !== 'edit') return null;
    var s = { el: el, v: el.value, i: el.selectedIndex, a: null, b: null };
    try { s.a = el.selectionStart; s.b = el.selectionEnd; } catch (e) { /* لا شيء */ }
    return s;
  }
  function restore(s) {
    if (!s || !s.el) return;
    var el = s.el;
    try {
      if (el.tagName === 'SELECT') { el.selectedIndex = s.i; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
      el.value = s.v;
      if (s.a != null) { try { el.setSelectionRange(s.a, s.b); } catch (e) { /* لا شيء */ } }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) { /* لا شيء */ }
  }
  function reset() { clearTimeout(W.timer); W.buf = ''; W.snap = null; W.tg = null; }

  /** يحوّل الحدث إلى حرف مع تحييد تخطيط لوحة المفاتيح (عربي → أرقام/حروف لاتينية). */
  function chr(e) {
    var k = e.key;
    if (!k || k.length !== 1) return '';
    var c = k.charCodeAt(0);
    if (c >= 0x0660 && c <= 0x0669) return String.fromCharCode(48 + c - 0x0660);   // ٠-٩
    if (c >= 0x06F0 && c <= 0x06F9) return String.fromCharCode(48 + c - 0x06F0);   // ۰-۹
    if (c >= 0x0600 && c <= 0x06FF && /^Key[A-Z]$/.test(e.code || '')) {
      var up = !!e.shiftKey !== !!(e.getModifierState && e.getModifierState('CapsLock'));
      return up ? e.code[3] : e.code[3].toLowerCase();
    }
    return k;
  }

  function complete(src) {
    var code = W.buf, tg = W.tg, sn = W.snap;
    reset();
    if (kind(tg) === 'edit') restore(sn);   // نلغي ما كُتب مؤقتًا في الحقل قبل التعرّف على أنه ماسح
    route(code, src);
  }
  function onIdle() {
    var tg = W.tg;
    if (W.buf.length < cfg.minLen) return reset();
    if (kind(tg) === 'edit') {
      if (allowTyping(tg)) return reset();      // كُتب في حقل باركود/بحث: يكفي
      if (W.buf.length < 8) return reset();     // بدون Enter في حقل عادي: نشترط طولًا كبيرًا لتفادي إتلاف كتابة المستخدم
    }
    complete('keyboard-idle');
  }

  function onKeyDown(e) {
    if (window.__tlocked || !cfg.global) return;
    if (e.ctrlKey || e.metaKey || e.isComposing || e.repeat) { reset(); return; }
    if (e.altKey && !(e.getModifierState && e.getModifierState('AltGraph'))) { reset(); return; }
    var key = e.key, term = key === 'Enter' || key === 'Tab';
    var ch = term ? '' : chr(e);
    if (!ch && !term) {
      if (key === 'Shift' || key === 'CapsLock' || key === 'AltGraph' || key === 'Control' || key === 'Alt' || key === 'Meta') return;
      reset(); return;
    }
    var now = e.timeStamp, tg = e.target, kd = kind(tg);

    if (term) {
      var fast = now - W.tLast <= Math.max(cfg.gap * 2, 80);
      if (W.buf.length >= cfg.minLen && fast) {
        if (kd === 'edit' && allowTyping(tg)) { reset(); return; }   // الماسح يكتب في حقل باركود: دعه يعمل طبيعيًا
        e.preventDefault(); e.stopImmediatePropagation();
        W.swallowUntil = now + 400;
        complete('keyboard');
        return;
      }
      reset(); return;
    }

    if (W.buf && now - W.tLast <= cfg.gap) { W.buf += ch; }
    else { W.buf = ch; W.tg = tg; W.snap = snap(tg); }
    W.tLast = now;
    if (kd === 'none') { e.preventDefault(); W.swallowUntil = now + 400; } // لا نترك أزرارًا أو قوائم تتأثر بالمفاتيح
    clearTimeout(W.timer);
    W.timer = setTimeout(onIdle, Math.max(80, cfg.gap * 2));
  }
  function onKeyUp(e) {
    if (window.__tlocked || !cfg.global) return;
    if (e.timeStamp < W.swallowUntil && (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  addEventListener('keydown', onKeyDown, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('blur', reset);

  // Esc يغلق نافذة المسح
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && sessionOpen()) { e.preventDefault(); stopScan(); } });

  /* ====================================================================== ماسحات COM (Web Serial) */
  var Ser = { port: null, reader: null, run: 0, buf: '', timer: 0 };
  var hex = function (n) { return n == null ? '' : ('0000' + n.toString(16)).slice(-4); };
  function serName(p) {
    var i = (p && p.getInfo && p.getInfo()) || {};
    return i.usbVendorId != null ? 'USB ' + hex(i.usbVendorId) + ':' + hex(i.usbProductId) : 'COM';
  }
  function serFeed(txt) {
    Ser.buf += txt;
    var parts = Ser.buf.split(/[\r\n]+/);
    Ser.buf = parts.pop();
    parts.forEach(function (p) { if (p.trim()) route(p, 'serial'); });
    clearTimeout(Ser.timer);
    if (Ser.buf) Ser.timer = setTimeout(function () { var b = Ser.buf; Ser.buf = ''; if (b.trim()) route(b, 'serial'); }, 120); // ماسح بلا لاحقة سطر
  }
  async function serClose() {
    Ser.run++;
    clearTimeout(Ser.timer); Ser.buf = '';
    try { if (Ser.reader) await Ser.reader.cancel(); } catch (e) { /* لا شيء */ }
    await new Promise(function (r) { setTimeout(r, 60); });
    try { if (Ser.port) await Ser.port.close(); } catch (e) { /* لا شيء */ }
    Ser.port = null; Ser.reader = null;
    state.serial = { status: 'off', name: '', err: '' };
  }
  async function serLoop(port, run) {
    var dec = new TextDecoder('utf-8'), err = '';
    try {
      while (port.readable && run === Ser.run) {
        var reader = port.readable.getReader();
        Ser.reader = reader;
        try {
          for (;;) {
            var r = await reader.read();
            if (r.done) break;
            serFeed(dec.decode(r.value, { stream: true }));
          }
        } finally { try { reader.releaseLock(); } catch (e) { /* لا شيء */ } }
      }
    } catch (e) { err = String(e && e.message || e); }
    if (run === Ser.run) {                                  // انقطاع غير مقصود (فصل الكابل مثلًا)
      state.serial = { status: err ? 'err' : 'off', name: serName(port), err: err };
      Ser.port = null; Ser.reader = null;
      try { await port.close(); } catch (e) { /* لا شيء */ }
      emit(); refreshSettings();
    }
  }
  async function serOpen(port) {
    await serClose();
    await port.open({ baudRate: +cfg.baud || 9600 });
    Ser.port = port;
    var run = ++Ser.run;
    state.serial = { status: 'on', name: serName(port), err: '' };
    emit();
    serLoop(port, run);
  }
  async function serAuto() {
    if (!navigator.serial || !cfg.serialOn || !cfg.serialAuto || Ser.port) return;
    try {
      var ports = await navigator.serial.getPorts();
      var pick = ports.filter(function (p) { var i = p.getInfo ? p.getInfo() : {}; return cfg.vid != null && i.usbVendorId === cfg.vid && i.usbProductId === cfg.pid; })[0] ||
        (cfg.vid == null && ports.length === 1 ? ports[0] : null);
      if (pick) await serOpen(pick);
    } catch (e) { state.serial = { status: 'err', name: '', err: String(e && e.message || e) }; }
    emit(); refreshSettings();
  }

  // قائمة المنافذ القادمة من العملية الرئيسية (Electron يطلب اختيارًا صريحًا)
  N.on('serial:list', function (list) {
    if (!list || !list.length) {
      N.invoke('serial:pick', '');
      sheet('<h3>' + ic('alert') + ' ' + Lx('لا توجد منافذ COM', 'Aucun port COM', 'No COM ports') + '</h3><div class="k">' +
        Lx('وصّل الماسح بالكمبيوتر وضبطه على وضع COM الافتراضي (USB-CDC / Virtual COM) ثم أعد المحاولة.',
          'Branchez le lecteur en mode COM virtuel (USB-CDC) puis réessayez.',
          'Connect the scanner in Virtual COM (USB-CDC) mode, then try again.') + '</div>' +
        '<button class="b s" style="width:100%;margin-top:10px" onclick="ov.innerHTML=\'\'">' + t('ok') + '</button>');
      return;
    }
    sheet('<h3>' + ic('scan') + ' ' + Lx('اختر منفذ الماسح', 'Choisissez le port du lecteur', 'Choose the scanner port') + '</h3>' +
      list.map(function (p) {
        return '<div class="row" data-id="' + esc(p.portId) + '" onclick="TD.serialChoose(this.dataset.id)"><span style="flex:1">' + esc(p.name || p.portName || 'COM') +
          '</span><span class="k" style="direction:ltr">' + esc(p.portName || '') + (p.vid ? ' · ' + hex(+p.vid) + ':' + hex(+p.pid) : '') + '</span></div>';
      }).join('') +
      '<button class="b s" style="width:100%;margin-top:10px" onclick="TD.serialChoose(\'\')">' + t('cancel') + '</button>');
  });
  TD.serialChoose = function (id) { ov.innerHTML = ''; N.invoke('serial:pick', id || ''); };
  TD.serialPick = async function () {
    if (!navigator.serial) { alert(Lx('منافذ COM غير مدعومة هنا', 'Ports COM non pris en charge', 'Serial ports not supported here')); return; }
    try {
      var p = await navigator.serial.requestPort();
      var i = p.getInfo ? p.getInfo() : {};
      cfg.vid = i.usbVendorId == null ? null : i.usbVendorId; cfg.pid = i.usbProductId == null ? null : i.usbProductId;
      cfg.serialOn = true; saveCfg();
      await serOpen(p);
    } catch (e) {
      if (!e || e.name !== 'NotFoundError') state.serial = { status: 'err', name: '', err: String(e && e.message || e) };
    }
    emit(); refreshSettings();
  };
  TD.serialDisconnect = async function () { cfg.serialOn = false; saveCfg(); await serClose(); emit(); refreshSettings(); };
  if (navigator.serial) {
    navigator.serial.addEventListener('connect', function () { serAuto(); });
    navigator.serial.addEventListener('disconnect', function (e) {
      if (e.target === Ser.port) { serClose().then(function () { emit(); refreshSettings(); }); }
    });
  }

  /* ====================================================================== شاشة الإعدادات: الماسح الضوئي */
  function lastHtml() {
    var l = state.last;
    if (!l) return '<span class="k">' + Lx('لم يُمسح شيء بعد', 'Rien scanné', 'Nothing scanned yet') + '</span>';
    var src = { keyboard: 'USB/BT', 'keyboard-idle': 'USB/BT', serial: 'COM', manual: '✎' }[l.src] || l.src;
    return esc(l.code) + ' <span class="k">(' + src + ' · ' + new Date(l.t).toLocaleTimeString(LC()) + ')</span>';
  }
  function swRow(icn, title, sub_, key, on) {
    return '<div class="sr"><span class="ic">' + ic(icn) + '</span><div class="st"><b>' + title + '</b>' + (sub_ ? '<div class="k">' + sub_ + '</div>' : '') +
      '</div><label class="tg"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="TD.set(\'' + key + '\',this.checked)"><i></i></label></div>';
  }
  function sel(key, opts, cur) {
    return '<select onchange="TD.set(\'' + key + '\',+this.value)">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (+o[0] === +cur ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select>';
  }
  TD.set = function (k, v) {
    cfg[k] = v; saveCfg();
    if (k === 'baud' && Ser.port) { var p = Ser.port; serOpen(p).then(function () { emit(); refreshSettings(); }); }
    refreshSettings();
  };
  function refreshSettings() { try { if (tab === 'set' && sub === 'scanner') R(); } catch (e) { /* لا شيء */ } }
  document.addEventListener('tasyir:scan-state', function () {
    var a = $id('tdLast'); if (a) a.innerHTML = lastHtml();
    var b = $id('tsStat'); if (b) b.innerHTML = statusHtml();
  });

  SUBV.scanner = function () {
    var s = state.serial, on = s.status === 'on';
    var serTxt = on ? '<span class="grn">● ' + Lx('متصل', 'Connecté', 'Connected') + ' — ' + esc(s.name) + '</span>'
      : s.status === 'err' ? '<span class="red">● ' + esc(s.err) + '</span>'
        : '<span class="k">○ ' + Lx('غير متصل', 'Non connecté', 'Not connected') + '</span>';
    return '<div class="card"><b>' + ic('scan') + ' ' + Lx('اختبار الماسح', 'Test du lecteur', 'Scanner test') + '</b>' +
      '<div class="k" style="margin:6px 0">' + Lx('امسح أي باركود الآن بأي ماسح: يظهر هنا فورًا إن كان يعمل.', 'Scannez un code maintenant : il apparaît ici si le lecteur fonctionne.', 'Scan any barcode now: it appears here if the scanner works.') + '</div>' +
      '<div class="v" id="tdLast" style="direction:ltr;text-align:center;min-height:38px;word-break:break-all">' + lastHtml() + '</div></div>' +

      '<div class="k" style="margin:0 6px 6px">' + Lx('ماسحات USB / بلوتوث / لاسلكية (وضع لوحة المفاتيح)', 'Lecteurs USB / Bluetooth / sans fil (mode clavier)', 'USB / Bluetooth / wireless scanners (keyboard mode)') + '</div>' +
      '<div class="sg">' + swRow('scan', Lx('الالتقاط التلقائي في كل الشاشات', 'Capture automatique partout', 'Auto-capture on every screen'),
        Lx('لا حاجة للنقر على أي حقل: امسح فيُضاف المنتج مباشرة', 'Pas besoin de cliquer : le produit est ajouté directement', 'No need to click a field: the item is added directly'), 'global', cfg.global) +
      swRow('bell', Lx('صوت عند المسح', 'Bip au scan', 'Beep on scan'), '', 'sound', cfg.sound) + '</div>' +
      '<div class="card"><label class="k">' + Lx('سرعة الماسح (أبطأ = أكثر تسامحًا)', 'Vitesse du lecteur (lent = plus tolérant)', 'Scanner speed (slower = more tolerant)') + '</label>' +
      sel('gap', [[30, Lx('سريع جدًا (30ms)', 'Très rapide (30ms)', 'Very fast (30ms)')], [40, Lx('عادي (40ms)', 'Normal (40ms)', 'Normal (40ms)')], [70, Lx('بطيء (70ms) — بلوتوث', 'Lent (70ms) — Bluetooth', 'Slow (70ms) — Bluetooth')], [120, Lx('بطيء جدًا (120ms)', 'Très lent (120ms)', 'Very slow (120ms)')]], cfg.gap) +
      '<label class="k">' + Lx('أقل عدد أحرف للباركود', 'Longueur minimale du code', 'Minimum barcode length') + '</label>' +
      '<input type="number" min="3" max="20" value="' + cfg.minLen + '" onchange="TD.set(\'minLen\',Math.min(20,Math.max(3,+this.value||4)))">' +
      '<div class="k" style="margin-top:8px">' + Lx('نصيحة: اضبط الماسح على إضافة Enter بعد كل باركود (هو الإعداد الافتراضي في معظم الماسحات).', 'Astuce : réglez le lecteur pour ajouter Entrée après chaque code (réglage par défaut).', 'Tip: set the scanner to append Enter after each barcode (the default on most scanners).') + '</div></div>' +

      '<div class="k" style="margin:0 6px 6px">' + Lx('ماسحات منفذ COM (تسلسلي / USB-CDC / بلوتوث SPP)', 'Lecteurs port COM (série / USB-CDC / Bluetooth SPP)', 'COM-port scanners (serial / USB-CDC / Bluetooth SPP)') + '</div>' +
      '<div class="card"><div style="margin-bottom:8px">' + serTxt + '</div>' +
      '<div class="bar"><button class="b" onclick="TD.serialPick()">' + ic('search') + ' ' + Lx('اختيار منفذ COM', 'Choisir un port COM', 'Choose COM port') + '</button>' +
      (on ? '<button class="b r" onclick="TD.serialDisconnect()">' + Lx('قطع', 'Déconnecter', 'Disconnect') + '</button>' : '') + '</div>' +
      '<label class="k" style="margin-top:8px">Baud rate</label>' + sel('baud', [[9600, '9600'], [19200, '19200'], [38400, '38400'], [57600, '57600'], [115200, '115200']], cfg.baud) +
      '<div class="k" style="margin-top:8px">' + Lx('يُعاد الاتصال تلقائيًا عند تشغيل البرنامج أو إعادة توصيل الكابل.', 'Reconnexion automatique au démarrage ou après rebranchement.', 'Reconnects automatically at startup or when re-plugged.') + '</div></div>';
  };

  // صف "الماسح الضوئي" في أعلى قائمة الإعدادات
  var _vset = VIEWS.set;
  VIEWS.set = function () {
    var h = _vset();
    if (sub) return h;
    var st = state.serial.status === 'on' ? '<span style="color:#16a34a">●</span> COM' : '';
    return '<div class="sg">' + SR(ic('scan'), Lx('الماسح الضوئي', 'Lecteur code-barres', 'Barcode scanner'),
      Lx('USB / بلوتوث / COM — اختبار وإعدادات', 'USB / Bluetooth / COM — test et réglages', 'USB / Bluetooth / COM — test & settings'), st, "sub='scanner';R()") + '</div>' + h;
  };
  var _hdr = hdr;
  hdr = function () {
    _hdr();
    if (sub === 'scanner') { var e = $id('ttl'); if (e) e.textContent = Lx('الماسح الضوئي', 'Lecteur code-barres', 'Barcode scanner'); }
  };

  /* ====================================================================== تعديلات الطابعة (بلوتوث أندرويد ← طابعات النظام) */
  var _pr = SUBV.printer;
  SUBV.printer = function () {
    return _pr()
      .replace(' Bluetooth</button>', ' ' + Lx('إعدادات الطابعات', 'Réglages imprimantes', 'Printer settings') + '</button>')
      .replace(Lx('الأجهزة المقترنة', 'Appareils associés', 'Paired devices'), Lx('الطابعات المثبّتة', 'Imprimantes installées', 'Installed printers'));
  };
  window.btLoad = async function () {
    var b = $id('btl'); if (!b) return;
    var list = []; try { list = await TD.listPrinters(); } catch (e) { /* لا شيء */ }
    b.innerHTML = list.map(function (d) {
      return '<div class="row" data-n="' + esc(d.name) + '" data-d="' + esc(d.displayName) + '" onclick="btPick(this.dataset.n,this.dataset.d)"><span style="flex:1">' + esc(d.displayName) + '</span>' +
        (d.isDefault ? '<span class="tag">' + Lx('الافتراضية', 'Par défaut', 'Default') + '</span>' : '') + '</div>';
    }).join('') || '<div class="k">' + Lx('لا توجد طابعات مثبّتة. ثبّت تعريف الطابعة في ويندوز أولًا.', 'Aucune imprimante installée. Installez d\'abord le pilote.', 'No printers installed. Install the printer driver first.') + '</div>';
  };

  /* ====================================================================== ترخيص أندرويد: صفّ غير منفَّذ يُخفى */
  var _R = R;
  R = function () {
    _R.apply(this, arguments);
    try {
      document.querySelectorAll('#m .sr').forEach(function (r) {
        if (/Tasyir/.test(r.textContent) && /(ترخيص|Licence|license)/i.test(r.textContent)) r.remove();
      });
    } catch (e) { /* لا شيء */ }
  };

  /* ====================================================================== تشغيل */
  serAuto();
  try { R(); } catch (e) { /* لا شيء */ }
})();
