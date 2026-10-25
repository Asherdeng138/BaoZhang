const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('DesktopViewer',{
 read:()=>ipcRenderer.invoke('bz:viewerRead'),
 close:()=>ipcRenderer.send('bz:viewerClose')
});
