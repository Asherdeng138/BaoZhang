const {app,BrowserWindow,ipcMain,dialog,shell,nativeImage,session,clipboard}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {createWorker}=require('tesseract.js'),{Store}=require('./service.cjs');
let win,store,workerPromise,ppWorker=null,ppSeq=0,ppJobs=new Map(),lastExport='',lastExportIds=[],queue=Promise.resolve(),previewWin,previewReceiptId='';
const testing=process.env.BAOZHANG_TEST_MODE==='1';
if(testing&&process.env.BAOZHANG_TEST_DATA)app.setPath('userData',process.env.BAOZHANG_TEST_DATA);
const allowedURL=pathToFileURL(path.join(__dirname,'ui','index.html')).href;
const viewerURL=pathToFileURL(path.join(__dirname,'ui','viewer.html')).href;
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
app.whenReady().then(async()=>{
 store=await new Store(path.join(app.getPath('userData'),'data')).init();
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(false));
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>callback({cancel:true}));
 const handler=(name,fn,serial=true)=>ipcMain.handle('bz:'+name,(event,...args)=>{
  if(event.sender!==win.webContents||event.senderFrame.url!==allowedURL)throw Error('请求来源无效');
  const run=()=>fn(...args);if(!serial)return run();const task=queue.then(run,run);queue=task.catch(()=>{});return task;
 });
 const choose=async(options)=>testing?{canceled:false,filePaths:options.properties?.includes('openDirectory')?[process.env.BAOZHANG_TEST_OUTPUT]:JSON.parse(process.env.BAOZHANG_TEST_FILES||'[]')}:dialog.showOpenDialog(win,options);
 handler('list',async()=>{try{await store.purgeExpired();}catch(e){console.error("回收站清理失败，将重试：",e.message);}return store.list();});
 handler('archiveExport',async()=>{if(!lastExportIds.length)throw Error('请先成功导出发票');const result=await store.archive(lastExportIds);lastExportIds=[];return result;});
 handler('trash',ids=>store.trash(ids));handler('recover',ids=>store.recover(ids));handler('unarchive',ids=>store.unarchive(ids));
 handler('choose',async category=>{const result=await choose({title:'选择发票，可多选',properties:['openFile','multiSelections'],filters:[{name:'发票图片或 PDF',extensions:['jpg','jpeg','png','webp','pdf']}]});return result.canceled?null:store.importFiles(result.filePaths,category);});
 handler('import',(files,category)=>store.importFiles(files,category));
 handler('importData',(sources,category)=>store.importSources(sources,category));
 handler('paste',async category=>{const items=await clipboard.read();for(const item of items){const type=['image/png','image/jpeg','image/webp'].find(t=>item.types.includes(t));if(!type)continue;const blob=await item.getType(type);if(!blob.size||blob.size>50*1024*1024)throw Error('剪贴板图片为空或超过 50 MB');const ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[type];return store.importSources([{name:'微信图片-'+Date.now()+ext,bytes:new Uint8Array(await blob.arrayBuffer())}],category);}throw Error('剪贴板中没有图片。请先在微信中复制图片，再点击粘贴图片。');});
 handler('read',id=>store.read(id));
 handler('preview',async id=>{
  const receipt=store.get(id);if(receipt.deletedAt)throw Error('请先恢复发票再查看原件');
  if(previewWin&&!previewWin.isDestroyed()){if(previewReceiptId!==id){previewReceiptId=id;await previewWin.loadURL(viewerURL);}previewWin.show();previewWin.focus();return true;}
  previewReceiptId=id;previewWin=new BrowserWindow({parent:win,modal:false,width:760,height:880,minWidth:470,minHeight:420,title:'发票原件 · '+receipt.filename,backgroundColor:'#e8ece7',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'viewer-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  previewWin.webContents.setWindowOpenHandler(()=>({action:'deny'}));previewWin.webContents.on('will-navigate',(event,url)=>{if(url!==viewerURL)event.preventDefault();});previewWin.on('closed',()=>{previewWin=null;previewReceiptId='';});await previewWin.loadURL(viewerURL);return true;
 });
 const validViewer=event=>previewWin&&!previewWin.isDestroyed()&&event.sender===previewWin.webContents&&event.senderFrame.url===viewerURL;
 ipcMain.handle('bz:viewerRead',event=>{if(!validViewer(event))throw Error('预览请求来源无效');return store.read(previewReceiptId);});
 ipcMain.on('bz:viewerClose',event=>{if(validViewer(event))previewWin.close();});
 handler('save',(id,fields)=>store.save(id,fields));
 handler('recognized',(id,result)=>store.recognized(id,result));
 handler('remove',ids=>store.remove(ids));
 handler('mark',(from,to,type)=>store.mark(from,to,type));
 // PP-OCRv6 (automatic crop + recognition) in a worker thread; Tesseract stays as the fallback.
 const ppocr=bytes=>new Promise((resolve,reject)=>{
  const image=nativeImage.createFromBuffer(Buffer.from(bytes));if(image.isEmpty())return reject(Error('图片格式无法识别'));
  const size=image.getSize(),scale=Math.min(1,3200/Math.max(size.width,size.height)),img=scale<1?image.resize({width:Math.max(1,Math.round(size.width*scale)),quality:'best'}):image,s=img.getSize();
  if(!ppWorker){const {Worker}=require('node:worker_threads');ppWorker=new Worker(path.join(__dirname,'ocr-worker.cjs'),{workerData:{modelDir:path.join(__dirname,'models','ppocr')}});
   ppWorker.on('message',m=>{const job=ppJobs.get(m.id);if(!job)return;ppJobs.delete(m.id);clearTimeout(job.timer);m.error?job.reject(Error(m.error)):job.resolve(m);});
   ppWorker.on('error',e=>{console.error('PP-OCR 线程错误：',e);for(const job of ppJobs.values())job.reject(e);ppJobs.clear();ppWorker=null;});
   ppWorker.on('exit',()=>{ppWorker=null;});}
  const id=++ppSeq,timer=setTimeout(()=>{ppJobs.delete(id);reject(Error('识别超时'));},180000);ppJobs.set(id,{resolve,reject,timer});
  ppWorker.postMessage({id,width:s.width,height:s.height,pixels:img.toBitmap(),bgra:true});
 });
 let ocrQueue=Promise.resolve();
 handler('ocr',bytes=>{const run=async()=>{
  if(!bytes||bytes.byteLength>50*1024*1024)throw Error('识别图片体积超限');
  if(process.env.BAOZHANG_OCR_ENGINE!=='tesseract'){try{const r=await ppocr(bytes);if(r.text&&r.text.trim())return {engine:'ppocr',text:r.text,warnings:r.warnings||[]};}catch(e){console.error('PP-OCR 识别失败，改用 Tesseract：',e.message);}}
  if(!workerPromise)workerPromise=(async()=>{
   const workerPath=require.resolve('tesseract.js/src/worker-script/node/index.js');
   await Promise.all([workerPath,path.join(__dirname,'models','eng.traineddata'),path.join(__dirname,'models','chi_sim.traineddata')].map(file=>fs.access(file)));
   return createWorker(['eng','chi_sim'],1,{langPath:path.join(__dirname,'models'),gzip:false,cachePath:path.join(app.getPath('userData'),'ocr-cache'),workerPath});
  })().catch(e=>{workerPromise=null;console.error('OCR 引擎启动失败：',e);throw Error('[OCR_RUNTIME_UNAVAILABLE] 本地识别引擎无法启动，请关闭所有报账窗口并重新打开新版后重试。原件已保留。');});
  const worker=await workerPromise;const result=await worker.recognize(Buffer.from(bytes));return result.data.text;
 };const task=ocrQueue.then(run,run);ocrQueue=task.catch(()=>{});return task;},false);
 handler('export',async q=>{lastExportIds=[];store.exportRows(q);const dest=await choose({title:'选择导出文件夹',properties:['openDirectory','createDirectory']});if(dest.canceled)return null;const result=await store.export(q,dest.filePaths[0],bytes=>{const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw Error('图片格式无法导出');return image.toPNG();});lastExport=result.folder;lastExportIds=result.receiptIds;return result;});
 handler('openExport',async()=>{if(lastExport&&!testing)await shell.openPath(lastExport);});
 handler('backup',async()=>{const result=await dialog.showSaveDialog(win,{title:'备份全部发票和日历',defaultPath:'BaoZhang-Backup-'+new Date().toISOString().slice(0,10)+'.zip',filters:[{name:'报账备份',extensions:['zip']}]});if(result.canceled)return null;return store.backup(result.filePath);});
 handler('restore',async()=>{const result=await dialog.showOpenDialog(win,{title:'恢复电脑版备份（合并，不覆盖已有票据）',properties:['openFile'],filters:[{name:'报账备份',extensions:['zip']}]});if(result.canceled)return null;return store.restore(result.filePaths[0]);});
 win=new BrowserWindow({width:1440,height:940,minWidth:1050,minHeight:720,title:'随手报账 · 电脑版',backgroundColor:'#f5f6f1',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(url!==allowedURL)event.preventDefault();});
 win.webContents.on('will-prevent-unload',event=>{const choice=testing?0:dialog.showMessageBoxSync(win,{type:'question',buttons:['返回保存','退出并放弃未保存修改'],defaultId:0,cancelId:0,title:'还有未完成的操作',message:'当前有未保存的修改或正在识别的票据。',detail:'已保存的票据和原件会保留。退出会停止正在进行的识别。'});if(choice===1)event.preventDefault();});
 win.on('closed',()=>{if(previewWin&&!previewWin.isDestroyed())previewWin.close();if(workerPromise)workerPromise.then(w=>w.terminate()).catch(()=>{});if(ppWorker)ppWorker.terminate().catch(()=>{});});await win.loadURL(allowedURL);
 const maintenance=setInterval(()=>{queue=queue.then(()=>store.purgeExpired()).catch(e=>console.error('回收站清理失败',e.message));},60000);maintenance.unref();win.on('closed',()=>clearInterval(maintenance));
}).catch(e=>{dialog.showErrorBox('随手报账启动失败',e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
}
