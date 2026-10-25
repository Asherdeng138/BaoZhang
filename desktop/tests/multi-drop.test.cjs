const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'baozhang-multi-drop-'));let app,page;
 const packaged=process.env.BAOZHANG_PACKAGED==='1',errors=[];
 try{
  app=await electron.launch({...(packaged?{executablePath:path.join(root,'release/win-unpacked/随手报账.exe'),args:[]}:{args:[root]}),env:{...process.env,BAOZHANG_TEST_MODE:'1',BAOZHANG_TEST_DATA:path.join(temp,'data')}});
  page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('body[data-ready=true]');
  await page.evaluate(()=>{
   window.__multiBytes={};
   window.__testDrop=(labels,selector='#dropZone')=>{
    const dt=new DataTransfer();
    for(const label of labels){const c=document.createElement('canvas');c.width=240;c.height=360;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,240,360);x.fillStyle='black';x.font='24px sans-serif';x.fillText('TEST '+label,10,60);const bytes=Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]),v=>v.charCodeAt(0));window.__multiBytes[label]=Array.from(bytes);dt.items.add(new File([bytes],'微信图片.png',{type:'image/png',lastModified:0}));}
    document.querySelector(selector).dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
   };
  });
  // Multiple consecutive gestures, including rapidly queued drops, must append.
  await page.evaluate(()=>window.__testDrop(['A'],'header'));
  await page.locator('#importDialog[open]').waitFor();await page.locator('[data-importcat="2"]').click();
  await page.evaluate(()=>{window.__testDrop(['B']);window.__testDrop(['C']);});
  await page.waitForFunction(()=>document.querySelector('#pendingFileCount').textContent==='待导入 3 张');
  assert.equal(await page.locator('#pendingFileList li').count(),3);assert.equal(await page.locator('[data-importcat="2"].active').count(),1);
  assert.match(await page.locator('#chooseFiles').innerText(),/导入这 3/);
  // Removing just one staged file must leave the other two intact.
  await page.locator('[data-removeimport="1"]').click();assert.equal(await page.locator('#pendingFileList li').count(),2);
  await page.evaluate(()=>window.__testDrop(['B']));await page.waitForFunction(()=>document.querySelector('#pendingFileList').children.length===3);
  // An over-limit gesture preserves all files already received.
  await page.evaluate(()=>window.__testDrop(Array.from({length:98},(_,i)=>'OVER-'+i)));
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('每批最多 100 张'));
  assert.equal(await page.locator('#pendingFileList li').count(),3);
  await fs.mkdir(path.join(root,'verification'),{recursive:true});await page.screenshot({path:path.join(root,'verification/multi-drop-'+(packaged?'packaged':'source')+'.png')});
  await page.locator('#chooseFiles').click();await page.waitForFunction(()=>!document.querySelector('#importDialog').open);
  let state=await page.evaluate(()=>Desktop.list());assert.equal(state.receipts.length,3);assert.equal(await page.locator('.list-row input[type=checkbox]:checked').count(),3);
  const originals=[];for(const r of state.receipts){assert.equal(r.category,'出差餐补');assert.equal(r.filename,'微信图片.png');originals.push(Array.from((await page.evaluate(id=>Desktop.read(id),r.id)).bytes));}
  const expected=await page.evaluate(()=>['A','B','C'].map(k=>window.__multiBytes[k]));assert.deepEqual(originals.map(x=>JSON.stringify(x)).sort(),expected.map(x=>JSON.stringify(x)).sort());
  // Clear and cancel operate on the staging list, not saved receipts.
  await page.locator('#addBtn').click();await page.evaluate(()=>window.__testDrop(['D','E']));await page.waitForFunction(()=>document.querySelector('#pendingFileList').children.length===2);
  await page.locator('#clearPendingFiles').click();assert.equal(await page.locator('#pendingFiles').isVisible(),false);assert.equal((await page.evaluate(()=>Desktop.list())).receipts.length,3);
  await page.evaluate(()=>window.__testDrop(['D']));await page.waitForFunction(()=>document.querySelector('#pendingFileList').children.length===1);
  await page.locator('#importDialog button[aria-label=关闭]').click();await page.locator('#importDialog').waitFor({state:'hidden'});
  await page.locator('#addBtn').click();assert.equal(await page.locator('#pendingFiles').isVisible(),false);
  // Multiple files in one gesture and exact duplicate skipping still work.
  await page.evaluate(()=>window.__testDrop(['D','E']));await page.waitForFunction(()=>document.querySelector('#pendingFileList').children.length===2);
  await page.locator('#chooseFiles').click();await page.waitForFunction(()=>!document.querySelector('#importDialog').open);assert.equal((await page.evaluate(()=>Desktop.list())).receipts.length,5);
  await page.evaluate(()=>{window.__testDrop(['A'],'header');window.__testDrop(['A']);});await page.waitForFunction(()=>document.querySelector('#pendingFileList').children.length===2);
  await page.locator('#chooseFiles').click();await page.waitForFunction(()=>!document.querySelector('#importDialog').open);assert.equal((await page.evaluate(()=>Desktop.list())).receipts.length,5);assert.match(await page.locator('#toast').innerText(),/2 个重复文件已跳过/);
  await page.reload();await page.waitForSelector('body[data-ready=true]');assert.equal((await page.evaluate(()=>Desktop.list())).receipts.length,5);assert.deepEqual(errors,[]);
  const report={passed:true,packaged,consecutiveDropsAccumulate:true,rapidDropsPreserved:true,sameFilenameDifferentImagesPreserved:true,originalBytesUnchanged:true,chosenCategoryPreserved:true,queuedFilesRemovable:true,clearAndCancelPreserveSavedData:true,overLimitPreservesQueue:true,multiFileSingleDrop:true,duplicateSkipping:true,persistence:true,isolatedTestData:true,actualWeChatGestureTest:false,errors};
  await fs.writeFile(path.join(root,'verification/multi-drop-'+(packaged?'packaged':'source')+'-result.json'),JSON.stringify(report,null,2));
  console.log('MULTI-DROP PASS: consecutive and rapid drops, queue controls, category, original bytes, limits, duplicates and persistence'+(packaged?' (packaged)':' (source)'));
 }catch(e){if(page)await page.screenshot({path:path.join(root,'verification/multi-drop-failure.png')}).catch(()=>{});throw e;}
 finally{if(app)await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('baozhang-multi-drop-'));await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
