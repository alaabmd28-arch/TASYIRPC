/* Tasyir — ربط الهاتف بالحاسوب (QR) ومزامنة كل البيانات.
   على الحاسوب: يعرض QR ويجيب على طلبات الهاتف.  على الهاتف (المتصفح): يربط بكود التفعيل ويزامن تلقائيًا. */
(function () {
  'use strict';
  var N = window.__tasyirNative, SC = window.SyncCore, $i = function (i) { return document.getElementById(i); };
  if (!SC) return;
  var jp = function (s, d) { try { return JSON.parse(s); } catch (e) { return d; } };
  var busyUI = function () { var o = $i('ov'); return (o && o.innerHTML.trim()) || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)); };
  var refresh = function () { try { if (!busyUI()) R(); } catch (e) { /* لا شيء */ } };
  var Lx = function (a, f, e) { return L(a, f, e); };

  var TT = function () { return { phone: Lx('ربط الهاتف', 'Lier le téléphone', 'Link phone'), sync: Lx('المزامنة مع الحاسوب', 'Synchronisation PC', 'Computer sync') }; };
  var _hdr = hdr; hdr = function () { _hdr(); if (sub === 'phone' || sub === 'sync') { var e = $i('ttl'); if (e) e.textContent = TT()[sub]; } };

  /* =============================== الحاسوب =============================== */
  if (N) {
    N.on('sync:req', function (m) {
      var out;
      try { out = { id: m.id, res: SC.hubHandle(db, m.body, Date.now()) }; saveNow(); setTimeout(refresh, 50); }
      catch (e) { out = { id: m.id, err: String(e && e.message || e) }; }
      N.send('sync:res', out);
    });
    var st = { s: null, err: '', code: '' };
    var load = function () { return N.invoke('sync:status').then(function (s) { st.s = s; refreshSet(); }); };
    var refreshSet = function () { try { if (tab === 'set' && sub === 'phone') R(); } catch (e) { /* لا شيء */ } };
    window.TDsync = {
      on: function () {
        var c = ($i('syc') || {}).value || '';
        if (SC.normCode(c).length < 4) { st.err = Lx('أدخل كود التفعيل', 'Saisissez le code', 'Enter the activation code'); return refreshSet(); }
        st.err = ''; N.invoke('sync:config', { enable: true, K: SC.keyOf(c) }).then(function (s) { st.err = s.error || ''; st.s = s; refreshSet(); });
      },
      off: function () { N.invoke('sync:config', { enable: false }).then(function (s) { st.s = s; refreshSet(); }); },
      reset: function () { if (confirm(t('cf'))) N.invoke('sync:config', { enable: true, resetToken: true }).then(function (s) { st.s = s; refreshSet(); }); }
    };
    SUBV.phone = function () {
      if (!st.s) { load(); return '<div class="card k">…</div>'; }
      var s = st.s, h = '';
      if (!s.enabled) {
        h = '<div class="card"><b>' + ic('key') + ' ' + Lx('كود التفعيل', 'Code d\'activation', 'Activation code') + '</b><div class="k" style="margin:6px 0">' +
          Lx('أدخل نفس كود التفعيل الذي تستعمله على الهاتف. لن يُربط إلا هاتف أدخل الكود نفسه.', 'Saisissez le même code que sur le téléphone. Seul un téléphone avec le même code pourra se lier.', 'Enter the same activation code used on the phone. Only a phone with the same code can link.') + '</div>' +
          '<input id="syc" autocomplete="off" style="direction:ltr"><div class="red" style="margin-top:6px">' + esc(st.err) + '</div>' +
          '<button class="b" style="width:100%;margin-top:8px" onclick="TDsync.on()">' + ic('check') + ' ' + Lx('تفعيل الربط', 'Activer', 'Enable linking') + '</button></div>';
      } else {
        h = '<div class="card"><b>' + ic('scan') + ' ' + Lx('امسح الـQR من الهاتف بكاميرا الهاتف', 'Scannez ce QR avec l\'appareil photo du téléphone', 'Scan this QR with the phone camera') + '</b>' +
          '<div class="k" style="margin:6px 0">' + Lx('الهاتف والحاسوب على نفس شبكة الواي فاي. بعد المسح أدخل كود التفعيل على الهاتف.', 'Téléphone et PC sur le même Wi-Fi. Après le scan, saisissez le code sur le téléphone.', 'Phone and computer on the same Wi-Fi. After scanning, enter the activation code on the phone.') + '</div>' +
          (s.hosts.length ? s.hosts.map(function (ip) {
            var u = 'http://' + ip + ':' + s.port + '/m?t=' + s.token, q = '';
            try { q = QR.svg(u); } catch (e) { q = '<div class="red">QR error</div>'; }
            return '<div style="text-align:center;margin:10px 0"><div style="width:240px;max-width:100%;margin:0 auto;border:1px solid var(--ln);border-radius:10px;overflow:hidden">' + q + '</div><div class="k" style="direction:ltr;margin-top:4px;word-break:break-all">' + esc(u) + '</div></div>';
          }).join('') : '<div class="red">' + Lx('لا توجد شبكة. وصّل الحاسوب بالواي فاي.', 'Aucun réseau détecté.', 'No network detected.') + '</div>') + '</div>' +
          '<div class="card"><div class="k">' + Lx('الأجهزة المتصلة', 'Appareils connectés', 'Connected devices') + '</div>' +
          (Object.keys(s.clients).map(function (ip) { return '<div class="row"><span style="direction:ltr">' + esc(ip.replace('::ffff:', '')) + '</span><span class="k">' + new Date(s.clients[ip]).toLocaleTimeString(LC()) + '</span></div>'; }).join('') || '<div class="k">—</div>') + '</div>' +
          '<div class="bar"><button class="b r" onclick="TDsync.off()">' + Lx('إيقاف الربط', 'Arrêter', 'Stop linking') + '</button><button class="b s" onclick="TDsync.reset()">' + Lx('فصل كل الهواتف', 'Délier tous', 'Unlink all phones') + '</button></div>' +
          '<div class="k" style="margin-top:10px">' + Lx('يعمل الربط ما دام برنامج الحاسوب مفتوحًا. ويطلب ويندوز السماح بالشبكة عند أول مرة: اختر «السماح».', 'Fonctionne tant que le programme PC est ouvert. Windows demandera l\'autorisation réseau : choisissez « Autoriser ».', 'Works while the desktop app is open. Windows asks for network permission the first time: choose “Allow”.') + '</div>';
      }
      return h;
    };
    setInterval(function () { if (tab === 'set' && sub === 'phone' && st.s && st.s.enabled) N.invoke('sync:status').then(function (s) { var a = JSON.stringify(s.clients); if (a !== JSON.stringify((st.s || {}).clients)) { st.s = s; refreshSet(); } }); }, 5000);
    var _v = VIEWS.set; VIEWS.set = function () {
      var h = _v(); if (sub) return h;
      return '<div class="sg">' + SR(ic('scan'), TT().phone, Lx('QR + مزامنة الأسعار والمخزون والمبيعات', 'QR + prix, stock et ventes', 'QR + prices, stock and sales'), st.s && st.s.enabled ? '<span style="color:#16a34a">●</span>' : '', "sub='phone';R()") + '</div>' + h;
    };
    return;
  }

  /* ================================ الهاتف ================================ */
  var CK = 'tasyir_sync', cfg = jp(localStorage.getItem(CK), null), state = { ts: 0, err: '', run: 0 };
  var save = function () { try { localStorage.setItem(CK, JSON.stringify(cfg)); } catch (e) { /* لا شيء */ } };
  var post = function (b) {
    return fetch(location.origin + '/sync', { method: 'POST', body: JSON.stringify(b) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.err || ('HTTP ' + r.status)); return j; }); });
  };
  var MSG = function (e) { return /mismatch/.test(e) ? Lx('كود التفعيل غير مطابق لكود الحاسوب', 'Code différent de celui du PC', 'Activation code does not match the computer') : /Failed to fetch|NetworkError|Load failed/i.test(e) ? Lx('الحاسوب غير متاح: تأكد من الواي فاي وأن البرنامج مفتوح', 'PC injoignable : vérifiez le Wi-Fi', 'Computer unreachable: check Wi-Fi and that the app is open') : e; };
  async function run(manual) {
    if (!cfg || !cfg.K || state.run) return;
    state.run = 1;
    try {
      await SC.clientSync(db, cfg, post, Date.now());
      save(); saveNow(); state.ts = Date.now(); state.err = '';
      if (manual) toast('[ok] ' + Lx('تمت المزامنة', 'Synchronisé', 'Synced'));
      refresh();
    } catch (e) { state.err = MSG(String(e && e.message || e)); if (manual) toast('[warn] ' + state.err); }
    finally { state.run = 0; if (tab === 'set' && sub === 'sync') refresh(); }
  }
  var timer = 0, prevSaved = window.onSaved;
  window.onSaved = function () { try { prevSaved && prevSaved(); } catch (e) { /* لا شيء */ } if (!cfg || state.run) return; clearTimeout(timer); timer = setTimeout(run, 2500); };
  setInterval(function () { if (!document.hidden) run(); }, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) run(); });
  addEventListener('online', function () { run(); });

  window.TDsync = {
    link: function () {
      var code = ($i('syc') || {}).value || '', mode = (document.querySelector('input[name=sym]:checked') || {}).value || 'merge', tok = ($i('syt') || {}).value;
      if (SC.normCode(code).length < 4) return;
      cfg = { token: tok, K: SC.keyOf(code), srv: 0, push: 0, adopt: mode === 'adopt' }; save();
      state.err = ''; ov.innerHTML = '';
      run(true).then(function () { if (state.err) { cfg = null; try { localStorage.removeItem(CK); } catch (e) { /* لا شيء */ } sheet('<h3>' + ic('alert') + '</h3><div class="red">' + esc(state.err) + '</div><button class="b s" style="width:100%;margin-top:10px" onclick="ov.innerHTML=\'\'">' + t('ok') + '</button>'); } else { history.replaceState(null, '', location.pathname); } });
    },
    now: function () { run(true); },
    unlink: function () { if (!confirm(t('cf'))) return; cfg = null; try { localStorage.removeItem(CK); } catch (e) { /* لا شيء */ } sub = ''; R(); }
  };
  function linkSheet(tok) {
    var has = db.products.length > 0;
    sheet('<h3>' + ic('scan') + ' ' + Lx('ربط بالحاسوب', 'Lier au PC', 'Link to computer') + '</h3>' +
      '<input id="syt" type="hidden" value="' + esc(tok) + '"><label class="k">' + Lx('كود التفعيل (نفسه على الحاسوب)', 'Code d\'activation (le même que sur le PC)', 'Activation code (same as on the computer)') + '</label>' +
      '<input id="syc" autocomplete="off" style="direction:ltr">' +
      '<label class="row" style="gap:8px"><input type="radio" name="sym" value="adopt" ' + (has ? '' : 'checked') + '><span>' + Lx('هاتف جديد: خذ بيانات الحاسوب (يمسح بيانات الهاتف الحالية)', 'Nouveau téléphone : prendre les données du PC (efface celles d\'ici)', 'New phone: take the computer\'s data (erases this phone\'s data)') + '</span></label>' +
      '<label class="row" style="gap:8px"><input type="radio" name="sym" value="merge" ' + (has ? 'checked' : '') + '><span>' + Lx('دمج بيانات الهاتف مع الحاسوب', 'Fusionner avec les données du PC', 'Merge phone data with the computer') + '</span></label>' +
      '<div class="bar" style="margin-top:10px"><button class="b" onclick="TDsync.link()">' + ic('check') + ' ' + Lx('ربط', 'Lier', 'Link') + '</button><button class="b s" onclick="ov.innerHTML=\'\'">' + t('cancel') + '</button></div>');
  }
  SUBV.sync = function () {
    return '<div class="card"><b>' + (cfg ? '<span style="color:#16a34a">●</span> ' + Lx('مرتبط بالحاسوب', 'Lié au PC', 'Linked to computer') : Lx('غير مرتبط', 'Non lié', 'Not linked')) + '</b>' +
      (cfg ? '<div class="k" style="margin:6px 0">' + (state.err ? '<span class="red">' + esc(state.err) + '</span>' : state.ts ? Lx('آخر مزامنة: ', 'Dernière synchro : ', 'Last sync: ') + new Date(state.ts).toLocaleTimeString(LC()) : '…') + '</div>' +
        '<div class="bar"><button class="b" onclick="TDsync.now()">' + ic('refresh') + ' ' + Lx('زامن الآن', 'Synchroniser', 'Sync now') + '</button><button class="b r" onclick="TDsync.unlink()">' + Lx('فصل', 'Délier', 'Unlink') + '</button></div>'
        : '<div class="k" style="margin-top:6px">' + Lx('افتح على الحاسوب: الإعدادات ← ربط الهاتف، وامسح الـQR بكاميرا الهاتف.', 'Sur le PC : Réglages → Lier le téléphone, puis scannez le QR.', 'On the computer: Settings → Link phone, then scan the QR with the phone camera.') + '</div>') + '</div>';
  };
  var _vs = VIEWS.set; VIEWS.set = function () {
    var h = _vs(); if (sub) return h;
    return '<div class="sg">' + SR(ic('refresh'), TT().sync, '', cfg ? '<span style="color:#16a34a">●</span>' : '', "sub='sync';R()") + '</div>' + h;
  };
  var tok = (location.search.match(/[?&]t=([0-9a-f]{32})/) || [])[1];
  if (tok && (!cfg || cfg.token !== tok)) setTimeout(function () { linkSheet(tok); }, 400);
  else if (cfg) setTimeout(run, 1200);
})();
