const {contextBridge,ipcRenderer,webUtils}=require('electron');
const call=(name,...args)=>ipcRenderer.invoke('bz:'+name,...args);
contextBridge.exposeInMainWorld('Desktop',{
list:()=>call('list'),choose:category=>call('choose',category),
drop:async(files,category)=>{const sources=[];if(!files.length||files.length>100)throw Error('每批可导入 1–100 个文件');for(const f of Array.from(files)){let path='';try{path=webUtils.getPathForFile(f);}catch(_){}if(path){sources.push(path);continue;}if(!f.size||f.size>50*1024*1024)throw Error('文件为空或超过 50 MB');const ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','application/pdf':'.pdf'}[f.type];const name=/\.(png|jpe?g|webp|pdf)$/i.test(f.name)?f.name:'微信图片-'+Date.now()+(ext||'.png');sources.push({name,bytes:new Uint8Array(await f.arrayBuffer())});}return call('importData',sources,category);},
paste:category=>call('paste',category),
read:id=>call('read',id),save:(id,fields)=>call('save',id,fields),
preview:id=>call('preview',id),
recognized:(id,result)=>call('recognized',id,result),ocr:bytes=>call('ocr',bytes),
archiveExport:()=>call('archiveExport'),trash:ids=>call('trash',ids),recover:ids=>call('recover',ids),unarchive:ids=>call('unarchive',ids),
remove:ids=>call('remove',ids),mark:(from,to,type)=>call('mark',from,to,type),
export:q=>call('export',q),openExport:()=>call('openExport'),
backup:()=>call('backup'),restore:()=>call('restore')
});
