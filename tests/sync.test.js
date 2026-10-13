const S=require('../app/js/sync-core.js'),{SyncServer}=require('../lib/syncserver.js'),a=require('assert'),os=require('os'),path=require('path');
const A=()=>({shop:'',seq:0,settings:{currency:'DA'},products:[],customers:[],sales:[],ledger:[],expenses:[],suppliers:[],supLedger:[],workers:[],capSessions:[]});
(async()=>{
 a.strictEqual(S.sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 a.strictEqual(S.hmac('0b'.repeat(20)+'0'.repeat(0),'x').length,64);
 const K=S.keyOf('abcd-1234'),tok='t'.repeat(32);let now=1000;
 const hub=A(),ph=A();
 hub.products.push({id:'h1',name:'Milk',bc:'611',price:100,cost:50,stock:5});
 ph.products.push({id:'p1',name:'Milk phone',bc:'611',price:90,cost:50,stock:7},{id:'p2',name:'Eggs',bc:'222',price:10,cost:5,stock:1});
 ph.customers.push({id:'c1',name:'Ali',phone:'05'});ph.sales.push({id:'s1',no:'INV-1',lines:[{pid:'p1',qty:1}],cust:'c1',total:90});
 const cfg={K,token:tok};const post=async b=>S.hubHandle(hub,b,now);
 const sync=async()=>{now+=10;await S.clientSync(ph,cfg,post,now)};
 await sync();await sync();
 a.strictEqual(hub.products.length,2);a.strictEqual(ph.products.length,2);                 // دمج المكرر بالباركود
 a.ok(ph.products.some(p=>p.id==='h1'));a.strictEqual(hub.sales[0].lines[0].pid,'h1');a.strictEqual(ph.sales[0].lines[0].pid,'h1');
 a.strictEqual(hub.customers.length,1);
 ph.products.find(p=>p.id==='h1').price=120;await sync();await sync();                    // تعديل سعر من الهاتف يصل للحاسوب
 a.strictEqual(hub.products.find(p=>p.id==='h1').price,120);
 now+=10;S.stamp(hub,now);hub.products.find(p=>p.id==='p2').price=33;now+=5;await sync();await sync(); // تعديل من الحاسوب يصل للهاتف
 a.strictEqual(ph.products.find(p=>p.id==='p2').price,33);
 hub.products=hub.products.filter(p=>p.id!=='p2');now+=5;await sync();await sync();        // حذف
 a.ok(!ph.products.some(p=>p.id==='p2'));
 hub.settings.currency='EUR';now+=5;await sync();await sync();a.strictEqual(ph.settings.currency,'EUR');
 // الخادم: رفض كود خاطئ وقبول الصحيح
 const srv=new SyncServer(path.join(os.tmpdir(),'ss'+Date.now()+'.json'),path.join(__dirname,'..','app'),async b=>({ok:1}));
 await srv.configure({enable:true,K});const port=require('../lib/syncserver').PORT,tk=srv.cfg.token;
 const call=async(k)=>{const ts=Date.now();const r=await fetch(`http://127.0.0.1:${port}/sync`,{method:'POST',body:JSON.stringify({ts,proof:S.proofOf(k,tk,ts)})});return r.status};
 a.strictEqual(await call(K),200);a.strictEqual(await call(S.keyOf('WRONG-CODE')),403);
 a.strictEqual((await fetch(`http://127.0.0.1:${port}/root/index.html`)).status,200);
 a.strictEqual((await fetch(`http://127.0.0.1:${port}/../main.js`)).status,404);
 await srv.stop();console.log('sync tests OK');
})().catch(e=>{console.error(e);process.exit(1)});
