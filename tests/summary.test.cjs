// Home summary selectors on the Android UI (demo data): period/category change the headline total and are remembered.
const path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch();try{const p=await b.newPage({viewport:{width:360,height:800}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app/src/main/assets/index.html')).href);await p.waitForSelector('#summaryPeriod');
 const read=()=>p.evaluate(()=>({eyebrow:document.querySelector('.hero .eyebrow').textContent,total:document.querySelector('.hero h1').textContent,badge:document.querySelector('.hero-badge').textContent,
   expect:(()=>{const v=JSON.parse(localStorage.getItem('bz-summary')||'{}');const s=ReceiptParser.summarize(S.receipts,{period:v.period||'thisMonth',category:v.category||'all',today:today(),viewMonth:S.month});return '£'+ReceiptParser.money(s.totalMinor).replace(/\B(?=(\d{3})+(?!\d))/g,',');})()}));
 let r=await read();assert.match(r.eyebrow,/^本月（\d{4}年\d{1,2}月） · 全部类别$/);assert.equal(r.total,r.expect);console.log('default',JSON.stringify(r));
 for(const v of ['lastMonth','thisYear','all','calendarMonth']){await p.selectOption('#summaryPeriod',v);r=await read();assert.equal(r.total,r.expect,v);console.log(v,r.eyebrow,r.total,r.badge);}
 await p.selectOption('#summaryCategory',{index:3});r=await read();assert.match(r.eyebrow,/出差餐补/);assert.equal(r.total,r.expect);console.log('category',r.eyebrow,r.total);
 await p.reload();await p.waitForSelector('#summaryPeriod');assert.equal(await p.inputValue('#summaryPeriod'),'calendarMonth');assert.equal(await p.inputValue('#summaryCategory'),'出差餐补');
 await p.screenshot({path:path.resolve(__dirname,'../verification/home-summary-360.png')});
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS home summary: period/category selection, totals, remembered after reload, 360px');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
