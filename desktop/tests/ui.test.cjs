// Browser UI regression only: the Desktop bridge is simulated, not Electron/OCR.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const state={version:1,days:{'2026-10-09':'business','2026-10-10':'business','2026-10-11':'business'},receipts:[{id:'meal-test',filename:'meal.png',mime:'image/png',size:100,category:'出差餐补',date:'',amountMinor:1280,merchant:'',location:'London',note:'',ocrText:'ASDA\n09/10/2026\n2026-10-08\nTOTAL £12.80\nCARD £11.50\nVAT £2.30\nDiscount £1.30',warnings:[],confirmed:false,status:'pending'},{id:'other-meal',filename:'other.png',mime:'image/png',size:100,category:'出差餐补',date:'2026-10-10',amountMinor:14000,merchant:'Tesco',location:'London',note:'',ocrText:'',warnings:[],confirmed:true,status:'confirmed'}]};
   window.__saved=[];window.__exports=[];window.__marked=[];window.__testState=state;
   window.Desktop={
    list:async()=>structuredClone(state),
    read:async()=>({bytes:Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/a0AAAAASUVORK5CYII='),c=>c.charCodeAt(0)),mime:'image/png'}),
    save:async(id,fields)=>{window.__saved.push({...fields});Object.assign(state.receipts[0],fields,{amountMinor:Math.round(Number(fields.amount)*100),status:fields.confirmed?'confirmed':'pending'});return structuredClone(state);},
    mark:async(from,to,type)=>{window.__marked.push({from,to,type});const day=new Date(from+'T00:00:00Z'),last=new Date(to+'T00:00:00Z');while(day<=last){const key=day.toISOString().slice(0,10);if(type)state.days[key]=type;else delete state.days[key];day.setUTCDate(day.getUTCDate()+1);}return structuredClone(state);},
    export:async q=>{window.__exports.push(q);if(window.__cancelExport)return null;if(window.__failExport)throw Error('simulated export failure');const ml=d=>d.slice(0,4)+'年'+Number(d.slice(5,7))+'月';const period=ml(q.from)+(q.from.slice(0,7)===q.to.slice(0,7)?'':'至'+(q.from.slice(0,4)===q.to.slice(0,4)?Number(q.to.slice(5,7))+'月':ml(q.to)));const base=q.category==='市内交通（地铁）'?period+'_市内交通报账':q.from+'至'+q.to+'_'+q.category+'报账';return {folder:'test-output',pdfName:base+'_发票合集.pdf',xlsxName:base+'_明细汇总.xlsx',count:q.ids.length,pages:1};},
    archiveExport:async()=>{for(const r of state.receipts)if(window.__exports.at(-1).ids.includes(r.id))r.archivedAt=Date.now();return structuredClone(state);},
    trash:async ids=>{for(const r of state.receipts)if(ids.includes(r.id))r.deletedAt=Date.now();return structuredClone(state);},
    recover:async ids=>{for(const r of state.receipts)if(ids.includes(r.id))delete r.deletedAt;return structuredClone(state);},
    unarchive:async ids=>{for(const r of state.receipts)if(ids.includes(r.id))delete r.archivedAt;return structuredClone(state);},
    openExport:async()=>{}
   };
  });
  await page.goto(process.env.BAOZHANG_UI_URL||pathToFileURL(path.resolve(__dirname,'../ui/index.html')).href);
  await page.waitForSelector('body[data-ready=true]');assert.equal(await page.locator('[data-daytype]').count(),4);await page.locator('[data-day="2026-10-09"]').click();
  for(const type of ['office','holiday','','business']){await page.locator('[data-daytype="'+type+'"]').click();await page.locator('[data-daytype="'+type+'"].active').waitFor();assert.equal(await page.evaluate(()=>window.__marked.at(-1).type),type);}
  await page.locator('#markRange').click();await page.locator('#markFrom').fill('2026-10-09');await page.locator('#markTo').fill('2026-10-11');await page.locator('#markType').selectOption('business');await page.locator('#markForm button[type=submit]').click();
  assert.match(await page.locator('.trip-budget').innerText(),/£150\.00/);assert.equal(await page.locator('.trip-budget.over').count(),0);
  await page.locator('nav [data-tab=inbox]').click();await page.locator('[data-row=meal-test]').click();
  assert.equal(await page.locator('[data-amountcandidate]').count(),2);assert.equal(await page.locator('[data-amountcandidate="2.30"]').count(),0);assert.equal(await page.locator('[data-amountcandidate="1.30"]').count(),0);await page.locator('#editAmount').fill('99.99');await page.locator('#editConfirmed').check();await page.locator('[data-amountcandidate="11.50"]').click();assert.equal(await page.locator('#editAmount').inputValue(),'11.50');assert.equal(await page.locator('#editConfirmed').isChecked(),false);await page.locator('[data-amountcandidate="12.80"]').click();assert.equal(await page.locator('#editAmount').inputValue(),'12.80');
  assert.equal(await page.locator('[data-datecandidate]').count(),2);await page.locator('#editConfirmed').check();await page.locator('[data-datecandidate="2026-10-09"]').click();assert.equal(await page.locator('#editDate').inputValue(),'2026-10-09');assert.equal(await page.locator('#editConfirmed').isChecked(),false);
  assert.match(await page.locator('#editorBudget .over').innerText(),/£2\.80/);
  assert.equal(await page.locator('#mealMerchantChoices button').count(),5);
  for(const merchant of ['Tesco','麦当劳',"Sainsbury's",'ASDA','Costco']){
   await page.locator('#editMerchant').fill('');await page.getByRole('button',{name:merchant,exact:true}).click();assert.equal(await page.locator('#editMerchant').inputValue(),merchant);
  }
  await page.locator('#saveDraft').click();assert.equal(await page.evaluate(()=>window.__saved.at(-1).merchant),'Costco');assert.equal(await page.evaluate(()=>window.__saved.at(-1).confirmed),false);
  assert.equal(await page.evaluate(()=>window.__saved.at(-1).date),'2026-10-09');
  await page.locator('#editCategory').selectOption('办公用品');assert.equal(await page.locator('#mealMerchantChoices').isVisible(),false);assert.equal(await page.locator('#editorBudget .trip-budget').count(),0);
  await page.locator('#editCategory').selectOption('出差餐补');assert.equal(await page.locator('#mealMerchantChoices').isVisible(),true);
  await page.locator('#editMerchant').fill('自选餐厅 <店名>');await page.locator('#editConfirmed').check();await page.locator('#saveReceipt').click();
  assert.equal(await page.evaluate(()=>window.__saved.at(-1).merchant),'自选餐厅 <店名>');assert.equal(await page.locator('#editMerchant').inputValue(),'自选餐厅 <店名>');
  await page.getByRole('button',{name:'麦当劳',exact:true}).click();assert.equal(await page.locator('#editConfirmed').isChecked(),false);await page.locator('#editConfirmed').check();await page.locator('#saveReceipt').click();
  await page.locator('nav [data-tab=export]').click();await page.locator('[data-exportcat="2"]').click();
  await page.locator('#exportFrom').fill('2026-10-09');await page.locator('#exportFrom').dispatchEvent('change');await page.locator('#exportTo').fill('2026-10-09');await page.locator('#exportTo').dispatchEvent('change');
  assert.equal(await page.locator('[data-exportid]').count(),1);assert.match(await page.locator('.trip-budget.over').innerText(),/£152\.80/);assert.equal(await page.locator('#generateExport').isDisabled(),false);
  await page.locator('#exportFrom').fill('2026-10-01');await page.locator('#exportFrom').dispatchEvent('change');await page.locator('#exportTo').fill('2026-10-31');await page.locator('#exportTo').dispatchEvent('change');
  await page.evaluate(()=>window.__cancelExport=true);await page.locator('#generateExport').click();await page.waitForFunction(()=>!document.querySelector('#generateExport').disabled);assert.equal(await page.locator('#confirmDialog[open]').count(),0);assert.equal(await page.evaluate(()=>window.__testState.receipts.some(r=>r.archivedAt)),false);
  await page.evaluate(()=>{window.__cancelExport=false;window.__failExport=true;});await page.locator('#generateExport').click();await page.waitForFunction(()=>!document.querySelector('#generateExport').disabled);assert.equal(await page.locator('#confirmDialog[open]').count(),0);assert.equal(await page.evaluate(()=>window.__testState.receipts.some(r=>r.archivedAt)),false);
  await page.evaluate(()=>window.__failExport=false);await page.locator('#generateExport').click();await page.locator('#confirmDialog[open]').waitFor();assert.match(await page.locator('#confirmText').innerText(),/归档标记/);await page.locator('#confirmYes').click();await page.waitForSelector('.success-box');
  const exported=await page.evaluate(()=>window.__exports.at(-1));assert.equal(exported.from,'2026-10-01');assert.equal(exported.to,'2026-10-31');
  assert.match(await page.locator('.success-box').innerText(),/2026-10-01至2026-10-31_出差餐补报账_发票合集\.pdf/);assert.match(await page.locator('.success-box').innerText(),/_明细汇总\.xlsx/);
  await page.evaluate(()=>{window.__testState.receipts[0].amountMinor=10000;window.__testState.receipts[1].amountMinor=14000;});
  await page.locator('nav [data-tab=calendar]').click();await page.locator('#markRange').click();await page.locator('#markFrom').fill('2026-10-09');await page.locator('#markTo').fill('2026-10-13');await page.locator('#markType').selectOption('business');await page.locator('#markForm button[type=submit]').click();
  assert.match(await page.locator('.trip-budget.under').innerText(),/£250\.00/);assert.match(await page.locator('.budget-reminder').innerText(),/还有 £10\.00 额度未使用/);
  await page.locator('[data-open=meal-test]').click();assert.match(await page.locator('#editorBudget .budget-reminder').innerText(),/还有 £10\.00 额度未使用/);await page.locator('#saveReceipt').click();assert.match(await page.locator('#toast').innerText(),/还有 £10\.00 额度未使用/);
  await page.locator('nav [data-tab=export]').click();await page.locator('[data-exportcat="2"]').click();assert.match(await page.locator('.budget-reminder').innerText(),/还有 £10\.00 额度未使用/);assert.equal(await page.locator('#generateExport').isDisabled(),false);
  await page.locator('nav [data-tab=inbox]').click();await page.locator('#editAmount').fill('110.00');assert.match(await page.locator('#editorBudget .trip-budget.full').innerText(),/额度已用满/);await page.locator('#saveReceipt').click();assert.match(await page.locator('#toast').innerText(),/额度已用满/);
  await page.locator('nav [data-tab=archive]').click();assert.equal(await page.locator('[data-trash]').count(),2);
  await page.locator('[data-trash=meal-test]').click();await page.locator('#confirmYes').click();await page.locator('[data-recover=meal-test]').waitFor();await page.locator('nav [data-tab=export]').click();await page.locator('#generateExport').click();await page.locator('#confirmNo').click();assert.deepEqual(await page.evaluate(()=>window.__exports.at(-1).ids),['other-meal']);
  await page.locator('nav [data-tab=inbox]').click();assert.equal(await page.locator('[data-row=meal-test]').count(),0);assert.equal(await page.locator('[data-row=other-meal] .archived').count(),1);
  await page.locator('nav [data-tab=archive]').click();await page.locator('[data-recover=meal-test]').click();await page.locator('[data-trash=meal-test]').waitFor();await page.locator('[data-unarchive=meal-test]').click();await page.locator('[data-trash=meal-test]').waitFor({state:'detached'});
  await page.locator('nav [data-tab=inbox]').click();assert.equal(await page.locator('[data-row=meal-test]').count(),1);assert.equal(await page.locator('[data-row=meal-test] .archived').count(),0);
  await page.evaluate(()=>{const r=(id,date,amountMinor,extra={})=>({id,date,amountMinor,filename:id+'.png',mime:'image/png',size:100,category:'市内交通（地铁）',merchant:'TfL',location:'London',note:'',ocrText:'',warnings:[],confirmed:true,status:'confirmed',...extra});window.__testState.receipts=[r('city-a','2026-10-09',11000),r('city-b','2026-10-10',4000,{archivedAt:1}),r('city-next','2026-11-01',20000)];});
  await page.locator('nav [data-tab=calendar]').click();await page.locator('#markRange').click();await page.locator('#markForm button[type=submit]').click();assert.match(await page.locator('.city-budget.full').innerText(),/£150\.00/);
  await page.locator('[data-open=city-a]').click();await page.locator('#editAmount').fill('110.01');assert.match(await page.locator('#editorBudget .city-budget.over').innerText(),/超出 £0\.01/);await page.locator('#saveReceipt').click();assert.match(await page.locator('#toast').innerText(),/本月市内交通超出 £0\.01/);
  await page.locator('nav [data-tab=export]').click();await page.locator('[data-exportcat="0"]').click();assert.equal(await page.locator('.city-budget').count(),2);assert.match(await page.locator('.city-budget').nth(1).innerText(),/超出 £50\.00/);assert.match(await page.locator('.export-name-hint').innerText(),/2026年10月至11月_市内交通报账/);
  await page.locator('#exportFrom').fill('2026-10-09');await page.locator('#exportFrom').dispatchEvent('change');await page.locator('#exportTo').fill('2026-10-09');await page.locator('#exportTo').dispatchEvent('change');assert.equal(await page.locator('[data-exportid]').count(),1);assert.match(await page.locator('.city-budget.over').innerText(),/£150\.01/);assert.match(await page.locator('.export-name-hint').innerText(),/2026年10月_市内交通报账/);
  await page.locator('#generateExport').click();await page.locator('#confirmNo').click();await page.locator('.success-box').waitFor();assert.match(await page.locator('.success-box').innerText(),/2026年10月_市内交通报账_发票合集\.pdf/);assert.equal((await page.evaluate(()=>window.__exports.at(-1).ids)).length,1);
  if(process.env.BAOZHANG_UI_SCREENSHOT){await page.locator('nav [data-tab=calendar]').click();await page.screenshot({path:process.env.BAOZHANG_UI_SCREENSHOT});}
  assert.deepEqual(errors,[]);console.log('Desktop browser UI PASS: date candidates, meal merchants, custom edits, confirmation and export filenames (simulated bridge).');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
