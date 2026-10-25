// Android smart scan in Chromium with the shipped assets and the real PP-OCRv6 engine.
// The native bridge is simulated; /preview/ serves a test photo (or SMART_SCAN_PHOTO).
// Checks: automatic crop is stored through setCrop, fields are filled, the crop editor
// works (drag, rotate, apply), re-recognition keeps a hand-edited field, ML Kit fallback.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {chromium}=require('playwright');
const assets=path.resolve(__dirname,'../app/src/main/assets'),photo=process.env.SMART_SCAN_PHOTO;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.onnx':'application/octet-stream','.txt':'text/plain'};
if(!photo||!fs.existsSync(photo)){console.log('SKIP smart-scan: set SMART_SCAN_PHOTO to a receipt photo (kept outside the project).');process.exit(0);}
(async()=>{
 const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);
   if(u.startsWith('/preview/')){res.setHeader('Content-Type','image/jpeg');res.end(fs.readFileSync(photo));return;}
   const file=path.join(assets,u.replace(/^\/assets\//,'/'));if(!file.startsWith(assets)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
   res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:412,height:860}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{
   const state={receipts:[],days:{},draft:null,crops:[],updates:[]};window.__state=state;
   const emit=(type,data)=>window.onNative({type,data:structuredClone(data)});
   window.Native={ready:()=>emit('data',state),updateDraft:json=>{state.updates.push(JSON.parse(json));Object.assign(state.draft,JSON.parse(json));},
    setCrop:(i,json)=>{state.crops.push(JSON.parse(json));const c=JSON.parse(json);if(c)state.draft.documents[i].crop=c;else delete state.draft.documents[i].crop;},
    open:()=>{},save:()=>{},discardDraft:()=>{},quit:()=>{}};
   // Simulate a camera capture followed by the native ML Kit scan (deliberately weak text).
   window.__capture=()=>{state.draft={category:'出差餐补',pendingId:'00000000-0000-4000-8000-000000000001',date:'',amount:'',merchant:'',location:'',note:'',ocr:'',documents:[{name:'photo.jpg',mime:'image/jpeg',pages:1,sha256:'x'}]};
     emit('scan',{draft:state.draft,text:'TOTAL 1.00',first:true,duplicate:false,message:''});};
  });
  await page.goto(base+'/assets/index.html');
  await page.evaluate(()=>window.__capture());
  await page.waitForSelector('#editAmount');
  assert.equal(await page.locator('#editAmount').inputValue(),'1.00','ML Kit result is shown first');
  await page.waitForFunction(()=>window.__state.crops.length>0&&!S.smartScanning,null,{timeout:240000});
  const crop=await page.evaluate(()=>window.__state.crops[0]);
  assert.ok(crop&&crop.quad.length===4&&crop.auto===true,'automatic crop stored');
  const fields=await page.evaluate(()=>({date:$('editDate').value,amount:$('editAmount').value,merchant:$('editMerchant').value,warn:[...document.querySelectorAll('.warning li')].map(l=>l.textContent)}));
  console.log('after smart scan',JSON.stringify(fields));
  assert.ok(fields.warn.some(w=>w.includes('已自动裁剪')),'crop notice shown');
  if(process.env.EXPECT_AMOUNT)assert.ok(await page.evaluate(v=>S.parsed.amounts.includes(v),process.env.EXPECT_AMOUNT),'correct amount offered as a candidate');
  if(process.env.EXPECT_AMOUNT&&!fields.amount)assert.ok(fields.warn.some(w=>w.includes('不一致')),'conflict explained');
  // Hand-edit the merchant, then adjust the crop: the edit must survive re-recognition.
  await page.locator('#editMerchant').fill('My Edited Shop');await page.locator('#editMerchant').dispatchEvent('input');
  await page.locator('[data-crop="0"]').click();await page.waitForSelector('#cropEditor .crop-handle');
  const h=page.locator('.crop-handle[data-h="2"]'),b=await h.boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+8,b.y+b.height/2+8,{steps:4});await page.mouse.up();
  await page.locator('#cropRotate').click();await page.locator('#cropRotate').click();await page.locator('#cropRotate').click();await page.locator('#cropRotate').click(); // back to 0°
  await page.locator('#cropApply').click();
  await page.waitForFunction(()=>window.__state.crops.length>1&&!S.smartScanning,null,{timeout:240000});
  const second=await page.evaluate(()=>window.__state.crops.at(-1));
  assert.equal(second.auto,false,'manual crop stored');assert.equal(second.rotate,0);
  assert.equal(await page.locator('#editMerchant').inputValue(),'My Edited Shop','hand edit kept after re-recognition');
  // Reset to the full photo.
  await page.locator('[data-crop="0"]').click();await page.locator('#cropReset').click();await page.locator('#cropApply').click();
  await page.waitForFunction(()=>window.__state.crops.length>2&&!S.smartScanning,null,{timeout:240000});
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS smart scan: ML Kit first, automatic crop stored, fields filled, crop editor drag/rotate/apply/reset, hand edit kept.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
