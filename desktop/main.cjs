const {app,BrowserWindow,ipcMain,dialog,shell,nativeImage,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {createWorker}=require('tesseract.js'),{Store}=require('./service.cjs');
let win,store,workerPromise,lastExport='',queue=Promise.resolve();
const testing=process.env.BAOZHANG_TEST_MODE==='1';
if(testing&&process.env.BAOZHANG_TEST_DATA)app.setPath('userData',process.env.BAOZHANG_TEST_DATA);
const allowedURL=pathToFileURL(path.join(__dirname,'ui','index.html')).href;
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
 handler('list',()=>store.list());
 handler('choose',async category=>{const result=await choose({title:'选择发票，可多选',properties:['openFile','multiSelections'],filters:[{name:'发票图片或 PDF',extensions:['jpg','jpeg','png','webp','pdf']}]});return result.canceled?null:store.importFiles(result.filePaths,category);});
 handler('import',(files,category)=>store.importFiles(files,category));
 handler('read',id=>store.read(id));
 handler('save',(id,fields)=>store.save(id,fields));
 handler('recognized',(id,result)=>store.recognized(id,result));
 handler('remove',ids=>store.remove(ids));
 handler('mark',(from,to,type)=>store.mark(from,to,type));
 let ocrQueue=Promise.resolve();
 handler('ocr',bytes=>{const run=async()=>{
  if(!bytes||bytes.byteLength>50*1024*1024)throw Error('识别图片体积超限');
  if(!workerPromise)workerPromise=createWorker(['eng','chi_sim'],1,{langPath:path.join(__dirname,'models'),gzip:false,cachePath:path.join(app.getPath('userData'),'ocr-cache'),workerPath:require.resolve('tesseract.js/src/worker-script/node/index.js')}).catch(e=>{workerPromise=null;throw e;});
  const worker=await workerPromise;const result=await worker.recognize(Buffer.from(bytes));return result.data.text;
 };const task=ocrQueue.then(run,run);ocrQueue=task.catch(()=>{});return task;},false);
 handler('export',async q=>{store.exportRows(q);const dest=await choose({title:'选择导出文件夹',properties:['openDirectory','createDirectory']});if(dest.canceled)return null;const result=await store.export(q,dest.filePaths[0],bytes=>{const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw Error('图片格式无法导出');return image.toPNG();});lastExport=result.folder;return result;});
 handler('openExport',async()=>{if(lastExport&&!testing)await shell.openPath(lastExport);});
 handler('backup',async()=>{const result=await dialog.showSaveDialog(win,{title:'备份全部发票和日历',defaultPath:'BaoZhang-Backup-'+new Date().toISOString().slice(0,10)+'.zip',filters:[{name:'报账备份',extensions:['zip']}]});if(result.canceled)return null;return store.backup(result.filePath);});
 handler('restore',async()=>{const result=await dialog.showOpenDialog(win,{title:'恢复电脑版备份（合并，不覆盖已有票据）',properties:['openFile'],filters:[{name:'报账备份',extensions:['zip']}]});if(result.canceled)return null;return store.restore(result.filePaths[0]);});
 win=new BrowserWindow({width:1440,height:940,minWidth:1050,minHeight:720,title:'随手报账 · 电脑版',backgroundColor:'#f5f6f1',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(url!==allowedURL)event.preventDefault();});
 win.on('close',()=>{if(workerPromise)workerPromise.then(w=>w.terminate()).catch(()=>{});});await win.loadURL(allowedURL);
}).catch(e=>{dialog.showErrorBox('随手报账启动失败',e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
}
