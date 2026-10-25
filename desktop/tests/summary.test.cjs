// Desktop home summary selectors (simulated Desktop bridge, built ui/app.js): period/category totals and memory.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const d=new Date(),pad=n=>String(n).padStart(2,'0'),thisM=d.getFullYear()+'-'+pad(d.getMonth()+1),prev=new Date(d.getFullYear(),d.getMonth()-1,1),lastM=prev.getFullYear()+'-'+pad(prev.getMonth()+1);
   const r=(id,date,cat,minor,confirmed=true,extra={})=>({id,filename:id+'.png',mime:'image/png',size:1,category:cat,date,amountMinor:minor,merchant:'Shop',location:'',note:'',ocrText:'',warnings:[],confirmed,status:confirmed?'confirmed':'review',...extra});
   const state={version:1,days:{},receipts:[r('a',thisM+'-02','出差餐补',1000),r('b',thisM+'-03','市内交通（地铁）',250),r('c',thisM+'-04','出差餐补',9999,false),r('d',lastM+'-05','出差餐补',700),r('e',thisM+'-06','出差餐补',555,true,{deletedAt:Date.now(),archivedAt:Date.now()})]};
   window.Desktop={list:async()=>structuredClone(state),read:async()=>({bytes:new Uint8Array(),mime:'image/png'})};
  });
  await page.goto(pathToFileURL(path.resolve(__dirname,'../ui/index.html')).href);await page.waitForSelector('#summaryPeriod');
  const num=async()=>(await page.locator('.stat.green .stat-number').innerText()).replace(/\s/g,''),label=()=>page.locator('.stat.green .stat-label').innerText();
  assert.equal(await num(),'£12.50','this month, confirmed only, trash excluded');assert.match(await label(),/^本月（\d{4}年\d{1,2}月） · 全部类别 · 已确认开支$/);
  await page.selectOption('#summaryPeriod','lastMonth');assert.equal(await num(),'£7.00');
  await page.selectOption('#summaryPeriod','all');assert.equal(await num(),'£19.50');
  await page.selectOption('#summaryCategory','市内交通（地铁）');assert.equal(await num(),'£2.50');assert.match(await label(),/市内交通/);
  await page.reload();await page.waitForSelector('#summaryPeriod');assert.equal(await page.inputValue('#summaryPeriod'),'all');assert.equal(await num(),'£2.50');
  assert.equal(errors.length,0,errors.join('\n'));console.log('Desktop home summary PASS: period/category totals, confirmed only, trash excluded, remembered after reload.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
