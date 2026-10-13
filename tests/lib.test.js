const {Security}=require('../lib/security'),{pngSize,pageSizeMicrons}=require('../lib/printing'),os=require('os'),path=require('path'),a=require('assert');
let t=1000;const s=new Security(path.join(os.tmpdir(),'sec'+Date.now()+'.json'),()=>t);
const k=s.setup('1234');a(k.length===16);a(s.unlock('1234').ok);
for(let i=0;i<5;i++)s.unlock('0000');a(s.unlock('1234').wait>0);t+=400000;a(s.unlock('1234').ok);
a(!s.disable('1'));a(s.recover(k.replace(/(.{4})/g,'$1-')).ok);a(!s.info().on);
const png='iVBORw0KGgoAAAANSUhEUgAAAYAAAAAKCAYAAAB';a.deepStrictEqual(pngSize(png),{w:384,h:10});
a.deepStrictEqual(pageSizeMicrons(384,384,10).width,58000);console.log('lib tests OK');
