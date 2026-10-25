const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const state={version:1,days:{},receipts:Array.from({length:3},(_,i)=>({id:'failed-'+i,filename:'test-'+i+'.png',mime:'image/png',size:100,category:'出差餐补',date:'',amountMinor:null,merchant:'',location:'',note:'',ocrText:'',warnings:['old failure'],confirmed:false,status:'failed'}))};
   window.__ocrState=state;window.__ocrCalls=0;window.__engineUnavailable=true;window.__rotateFallback=false;window.__ocrSizes=[];
   window.Desktop={list:async()=>structuredClone(state),read:async()=>{const c=document.createElement('canvas');c.width=200;c.height=400;return {bytes:Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]),v=>v.charCodeAt(0)),mime:'image/png'};},
    ocr:async bytes=>{window.__ocrCalls++;if(window.__engineUnavailable)throw Error('[OCR_RUNTIME_UNAVAILABLE] internal module missing');if(window.__rotateFallback){const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));window.__ocrSizes.push([image.width,image.height]);const rotated=image.width>image.height;image.close();if(!rotated)return 'sideways unreadable text';}return 'TEST SHOP\n11 Oct 2026\nTOTAL GBP 12.80';},
    recognized:async(id,result)=>{const r=state.receipts.find(r=>r.id===id);if(result.error){r.status='failed';r.warnings=[result.error];}else{r.status='review';r.ocrText=result.text;r.warnings=result.warnings||[];}return structuredClone(state);}};
  });
  await page.goto(pathToFileURL(path.resolve(__dirname,'../ui/index.html')).href);await page.waitForSelector('body[data-ready=true]');await page.locator('nav [data-tab=inbox]').click();await page.locator('#selectAll').check();await page.locator('#scanSelected').click();await page.waitForFunction(()=>document.querySelector('#activity').classList.contains('hidden'));
  assert.equal(await page.evaluate(()=>window.__ocrCalls),1);assert.match(await page.locator('#toast').innerText(),/已暂停批量识别/);
  const state=await page.evaluate(()=>window.__ocrState);assert.equal(state.receipts.length,3);assert.deepEqual(state.receipts[1].warnings,['old failure']);assert.deepEqual(state.receipts[2].warnings,['old failure']);assert.match(state.receipts[0].warnings[0],/本地识别引擎无法启动/);assert.ok(!state.receipts[0].warnings[0].includes('OCR_RUNTIME_UNAVAILABLE'));
  await page.evaluate(()=>window.__engineUnavailable=false);await page.locator('#scanSelected').click();await page.waitForFunction(()=>document.querySelector('#activity').classList.contains('hidden'));
  assert.equal(await page.evaluate(()=>window.__ocrCalls),4);assert.equal(await page.evaluate(()=>window.__ocrState.receipts.filter(r=>r.status==='review').length),3);assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.__rotateFallback=true);await page.locator('#scanSelected').click();await page.waitForFunction(()=>document.querySelector('#activity').classList.contains('hidden'));assert.equal(await page.evaluate(()=>window.__ocrCalls),10);assert.deepEqual(await page.evaluate(()=>window.__ocrSizes),[[200,400],[400,200],[200,400],[400,200],[200,400],[400,200]]);assert.ok((await page.evaluate(()=>window.__ocrState.receipts)).every(r=>r.warnings[0].includes('原始文件保留')));assert.deepEqual(errors,[]);
  console.log('OCR FAILURE/ROTATION UI PASS: engine failure pause and retry; missing amounts trigger rotated temporary images and retain originals');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
