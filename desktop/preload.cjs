const {contextBridge,ipcRenderer,webUtils}=require('electron');
const call=(name,...args)=>ipcRenderer.invoke('bz:'+name,...args);
contextBridge.exposeInMainWorld('Desktop',{
list:()=>call('list'),choose:category=>call('choose',category),
drop:(files,category)=>call('import',Array.from(files).map(f=>webUtils.getPathForFile(f)),category),
read:id=>call('read',id),save:(id,fields)=>call('save',id,fields),
recognized:(id,result)=>call('recognized',id,result),ocr:bytes=>call('ocr',bytes),
remove:ids=>call('remove',ids),mark:(from,to,type)=>call('mark',from,to,type),
export:q=>call('export',q),openExport:()=>call('openExport'),
backup:()=>call('backup'),restore:()=>call('restore')
});