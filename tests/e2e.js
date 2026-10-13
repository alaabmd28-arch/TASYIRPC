// اختبار الواجهة في Chromium مع محاكاة جسر Electron: node tests/e2e.js (يتطلب playwright)
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','app');
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html'});r.end(d)})});
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
srv.listen(0,async()=>{
 const b=await chromium.launch(),p=await b.newPage({viewport:{width:1280,height:800}});
 await p.addInitScript(()=>{let pin=sessionStorage.getItem('pin');window.__tasyirNative={platform:'win32',
  sendSync:(c,a)=>c==='pin:info'?{on:!!pin,timeout:0}:c==='pin:setup'?(pin=a,sessionStorage.setItem('pin',a),'ABCD2345EFGH6789'):c==='pin:unlock'?{ok:a===pin,wait:0}:c==='pin:verify'?a===pin:true,
  send(){},invoke:async()=>[],on(){}};
  localStorage.setItem('shopdb_v1',JSON.stringify({lang:'ar',shop:'',products:[{id:'p1',arch:false,name:'Milk',bc:'6111000000011',cost:5000,price:8000,stock:10,min:1,unit:'u',fam:'',img:''}],customers:[],sales:[],ledger:[],expenses:[],seq:0}))});
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`http://localhost:${srv.address().port}/root/index.html`);
 await p.waitForTimeout(500);
 ok(await p.evaluate(()=>!!window.Android&&typeof Android.scan==='function'),'Android bridge موجود');
 await p.evaluate(()=>go('pos'));
 // 1) ماسح سريع والتركيز على حقل البحث
 await p.click('#q');await p.keyboard.type('6111000000011\n',{delay:0});await p.waitForTimeout(200);
 ok(await p.evaluate(()=>cart.length===1&&cart[0].qty===1),'مسح سريع أضاف المنتج للسلة');
 ok(await p.inputValue('#q')==='','حقل البحث لم يتلوث بالباركود');
 // 2) كتابة بشرية بطيئة لا تُعتبر ماسحًا
 await p.keyboard.type('mil',{delay:150});ok(await p.inputValue('#q')==='mil','الكتابة البشرية لم تُعترض');
 await p.fill('#q','');
 // 3) المسح بدون تركيز على أي حقل (مرتين => كمية 2)
 await p.evaluate(()=>document.activeElement.blur());await p.keyboard.type('6111000000011\n',{delay:0});await p.waitForTimeout(200);
 ok(await p.evaluate(()=>cart[0].qty===2),'مسح بدون تركيز يعمل');
 // 4) باركود غير موجود
 await p.keyboard.type('999888777666\n',{delay:0});await p.waitForTimeout(200);
 ok(await p.evaluate(()=>!!document.getElementById('tsUnk')),'غير موجود: نافذة إضافة منتج');
 await p.click('#tsUnk button:first-child');await p.waitForTimeout(300);
 ok(await p.evaluate(()=>document.getElementById('f1').value==='999888777666'),'الباركود عُبّئ في نموذج المنتج');
 // 5) نموذج المنتج مفتوح + مسح
 await p.evaluate(()=>document.activeElement.blur());await p.keyboard.type('123456789012\n',{delay:0});await p.waitForTimeout(200);
 ok(await p.evaluate(()=>document.getElementById('f1').value==='123456789012'),'المسح يملأ حقل الباركود');
 await p.evaluate(()=>{ov.innerHTML=''});
 // 6) نافذة المسح (Android.scan)
 await p.evaluate(()=>scan(posScan,1));await p.keyboard.type('6111000000011\n',{delay:0});await p.waitForTimeout(200);
 ok(await p.evaluate(()=>cart[0].qty===3&&/×3/.test(document.getElementById('tsRes').textContent)),'نافذة المسح تعرض النتيجة');
 await p.evaluate(()=>stopScan());
 // 7) ماسح COM وهمي
 await p.evaluate(()=>TD.route('6111000000011','serial'));ok(await p.evaluate(()=>cart[0].qty===4),'توجيه COM يعمل');
 // 8) الإعدادات + شاشة القفل
 await p.evaluate(()=>{tab='set';sub='scanner';R()});ok(/اختبار الماسح/.test(await p.textContent('#m')),'شاشة إعدادات الماسح');
 await p.screenshot({path:'/home/claude/shot-scanner.png'});
 await p.evaluate(()=>{Android.pinSetup('1234')});await p.reload();await p.waitForTimeout(400);
 ok(await p.evaluate(()=>!!document.getElementById('tlock')),'قفل PIN عند التشغيل');
 await p.fill('#tl-pin','1234');await p.keyboard.press('Enter');await p.waitForTimeout(200);
 ok(await p.evaluate(()=>!document.getElementById('tlock')),'فتح القفل بـ PIN صحيح');
 ok(errs.length===0,'لا أخطاء JS '+errs.join('|'));
 await b.close();srv.close();
});
