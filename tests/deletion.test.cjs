const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 try {
  const page=await browser.newPage({viewport:{width:360,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app/src/main/assets/index.html')).href);
  await page.locator('#addReceipt').click();await page.locator('[data-choose="3"]').click();await page.locator('#importNew').click();
  const remove=page.locator('[data-remove]');const box=await remove.boundingBox();
  assert.ok(box.width>=48&&box.height>=48,'Removal has a 48px touch target');
  await page.locator('#editNote').fill('Keep manual changes');
  page.once('dialog',d=>d.dismiss());await remove.click();assert.equal(await remove.count(),1,'Cancel keeps image');
  page.once('dialog',d=>d.accept());await remove.click();assert.equal(await remove.count(),0,'Confirm removes image');
  assert.equal(await page.locator('#editNote').inputValue(),'Keep manual changes');
  await page.locator('#appendFile').click();assert.equal(await remove.count(),1,'Can import after removing last image');
  await page.locator('#editConfirmed').check();await page.locator('#saveReceipt').click();
  await page.locator('[data-tab="receipts"]').click();
  const count=await page.locator('[data-receipt]').count();await page.locator('[data-receipt]').first().click();
  page.once('dialog',d=>d.dismiss());await page.locator('[data-delete]').click();assert.equal(await page.locator('[data-delete]').count(),1);
  page.once('dialog',d=>d.accept());await page.locator('[data-delete]').click();assert.equal(await page.locator('[data-receipt]').count(),count-1);
  await page.reload();await page.locator('[data-tab="receipts"]').click();assert.equal(await page.locator('[data-receipt]').count(),count-1,'Deletion persists');
  for(const width of [320,360,412]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  assert.deepEqual(errors,[]);console.log('PASS: cancel/confirm attachment removal, re-import, manual edits preserved, cancel/confirm receipt deletion, persistence, 320/360/412px layout. Browser demo bridge only; native verification pending.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
