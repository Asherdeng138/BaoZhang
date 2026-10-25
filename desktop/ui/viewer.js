export function createReceiptViewer({read,loadPDF,drawPDF,closeWindow}){
 const q=id=>document.getElementById(id),dialog=q('receiptViewer'),canvas=q('viewerCanvas'),surface=q('viewerSurface');
 let state=null,token=0,pageToken=0,previousFocus=null;
 function cleanup(){token++;pageToken++;if(state?.pdf)state.pdf.destroy().catch(()=>{});state?.bitmap?.close();state=null;canvas.width=canvas.height=1;canvas.hidden=true;q('viewerMessage').textContent='';if(previousFocus?.isConnected)previousFocus.focus();}
 function close(){if(closeWindow){closeWindow();return;}if(dialog.open)dialog.close();else cleanup();}
 function controls(){const ready=!!state?.image&&!state.loading;q('viewerRotateLeft').disabled=q('viewerRotateRight').disabled=q('viewerFit').disabled=!ready;q('viewerZoomIn').disabled=!ready||state.zoom>=5;q('viewerZoomOut').disabled=!ready||state.zoom<=.5;q('viewerPrev').disabled=!ready||state.page<=1;q('viewerNext').disabled=!ready||state.page>=state.pages;q('viewerPage').textContent=state?state.page+' / '+state.pages:'';q('viewerZoom').textContent=state?Math.round(state.zoom*100)+'%':'';}
 function draw(){if(!state?.image||!dialog.open)return;const image=state.image,quarter=state.rotation%180!==0;canvas.width=quarter?image.height:image.width;canvas.height=quarter?image.width:image.height;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(state.rotation*Math.PI/180);ctx.drawImage(image,-image.width/2,-image.height/2);const fit=Math.min((surface.clientWidth-32)/canvas.width,(surface.clientHeight-32)/canvas.height);canvas.style.width=Math.max(1,canvas.width*fit*state.zoom)+'px';canvas.style.height=Math.max(1,canvas.height*fit*state.zoom)+'px';canvas.hidden=false;controls();}
 async function page(n){const current=state,mine=++pageToken;current.loading=true;controls();q('viewerMessage').textContent='正在加载…';try{const image=await drawPDF(current.pdf,n,3200);if(state!==current||mine!==pageToken)return;current.page=n;current.image=image;current.zoom=1;current.loading=false;q('viewerMessage').textContent='';surface.scrollTop=surface.scrollLeft=0;draw();}catch(e){if(state===current&&mine===pageToken){current.loading=false;q('viewerMessage').textContent='此页暂时无法显示：'+e.message;controls();}}}
 async function open(id){if(dialog.open)close();cleanup();const mine=++token;previousFocus=document.activeElement;state={page:1,pages:1,rotation:0,zoom:1,image:null,loading:true};q('viewerTitle').textContent='发票原件';q('viewerMessage').textContent='正在加载…';canvas.hidden=true;controls();dialog.showModal();q('viewerClose').focus();
  try{const source=await read(id);if(mine!==token)return;q('viewerTitle').textContent=source.filename||'发票原件';
   if(source.mime==='application/pdf'){const pdf=await loadPDF(source.bytes);if(mine!==token){await pdf.destroy();return;}state.pdf=pdf;state.pages=pdf.numPages;await page(1);}
   else{const bitmap=await createImageBitmap(new Blob([source.bytes],{type:source.mime}));if(mine!==token){bitmap.close();return;}state.bitmap=bitmap;state.image=bitmap;state.loading=false;q('viewerMessage').textContent='';surface.scrollTop=surface.scrollLeft=0;draw();}
  }catch(e){if(mine===token){state.loading=false;q('viewerMessage').textContent='原件暂时无法显示：'+e.message;controls();}}
 }
 q('viewerClose').onclick=close;dialog.addEventListener('close',()=>{if(!dialog.open)cleanup();});
 dialog.addEventListener('cancel',e=>{if(closeWindow){e.preventDefault();closeWindow();}});window.addEventListener('beforeunload',cleanup);
 q('viewerRotateLeft').onclick=()=>{state.rotation=(state.rotation+270)%360;draw();};q('viewerRotateRight').onclick=()=>{state.rotation=(state.rotation+90)%360;draw();};
 q('viewerZoomIn').onclick=()=>{state.zoom=Math.min(5,state.zoom+.25);draw();};q('viewerZoomOut').onclick=()=>{state.zoom=Math.max(.5,state.zoom-.25);draw();};q('viewerFit').onclick=()=>{state.zoom=1;surface.scrollTop=surface.scrollLeft=0;draw();};
 q('viewerPrev').onclick=()=>page(state.page-1);q('viewerNext').onclick=()=>page(state.page+1);window.addEventListener('resize',draw);
 return {open,close};
}
