'use strict';
/*
 * Smart scan for the Android WebView: automatic crop + PP-OCRv6 recognition on top of
 * the original ML Kit result. Everything runs on the phone; the original photo is never
 * changed (only crop corners are stored with the attachment).
 * Uses globals from app.js: S, P, $, esc, call, toast, showEditor, persistFields.
 */
const SmartScan=(()=>{
  let enginePromise=null,running=0;
  const FIELDS=['date','amount','merchant'];
  function engine(){
    if(!enginePromise)enginePromise=(async()=>{
      if(typeof ort==='undefined'||typeof ReceiptOCR==='undefined'||typeof WebAssembly==='undefined')throw Error('ocr-unavailable');
      ort.env.wasm.wasmPaths='/assets/ocr/';ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
      const get=async(u,type)=>{const r=await fetch(u);if(!r.ok)throw Error('missing '+u);return type==='text'?r.text():new Uint8Array(await r.arrayBuffer());};
      const [det,rec,dict]=await Promise.all([get('/assets/ocr/det.onnx'),get('/assets/ocr/rec.onnx'),get('/assets/ocr/dict.txt','text')]);
      return ReceiptOCR.createEngine({ort,det,rec,dict});
    })().catch(e=>{enginePromise=null;throw e;});
    return enginePromise;
  }
  function loadImage(url){
    return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d');x.drawImage(im,0,0);
      resolve({data:x.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height});};im.onerror=()=>reject(Error('图片无法读取'));im.src=url;});
  }
  function rotateImage(img,deg){
    deg=((deg%360)+360)%360;if(!deg)return img;
    const W=deg===180?img.width:img.height,H=deg===180?img.height:img.width,out=new Uint8ClampedArray(W*H*4);
    for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){let nx,ny;if(deg===90){nx=img.height-1-y;ny=x;}else if(deg===180){nx=img.width-1-x;ny=img.height-1-y;}else{nx=y;ny=img.width-1-x;}
      const s=(y*img.width+x)*4,d=(ny*W+nx)*4;out[d]=img.data[s];out[d+1]=img.data[s+1];out[d+2]=img.data[s+2];out[d+3]=255;}
    return {data:out,width:W,height:H};
  }
  const rawUrl=name=>'/preview/'+encodeURIComponent(name)+'?raw=1&v='+Date.now();
  const isImage=d=>d&&String(d.mime||'').startsWith('image/');
  // Combine the new engine (primary) with the ML Kit result: fill a field only when they
  // agree or the other engine has nothing that contradicts it; otherwise leave it for the user.
  function merge(nw,old){
    const same=(k,a,b)=>k==='merchant'?String(a).toLowerCase().replace(/[^a-z0-9一-鿿]/g,'')===String(b).toLowerCase().replace(/[^a-z0-9一-鿿]/g,''):a===b;
    const list=(p,k)=>k==='date'?(p.dates||[]):k==='amount'?(p.amounts||[]):(p.merchants||[p.merchant].filter(Boolean));
    const out={};
    for(const k of FIELDS){const a=nw[k],b=old&&old[k];
      if(a&&b&&!same(k,a,b)&&!list(nw,k).slice(0,3).some(c=>same(k,c,b))){out[k]='';(out.conflicts=out.conflicts||[]).push(k);}
      else if(a)out[k]=a;
      else if(b&&list(nw,k).slice(0,3).some(c=>same(k,c,b)))out[k]=b;
      else out[k]='';}
    const uniq=a=>[...new Set(a.filter(Boolean))];
    out.amounts=uniq([...(nw.amounts||[]),...((old&&old.amounts)||[])]).slice(0,8);
    out.dates=uniq([...(nw.dates||[]),...((old&&old.dates)||[])]);
    const seen=new Set();out.dateCandidates=[...(nw.dateCandidates||[]),...((old&&old.dateCandidates)||[])].filter(c=>!seen.has(c.date)&&seen.add(c.date));
    out.merchants=uniq([...(nw.merchants||[]),...((old&&old.merchant)?[old.merchant]:[])]).slice(0,5);
    const label={date:'日期',amount:'金额',merchant:'商家'};
    out.warnings=uniq([...(out.conflicts||[]).map(k=>'两种识别结果的'+label[k]+'不一致，已留空，请点击候选或对照原件填写'),...(nw.warnings||[])]);
    return out;
  }
  function draftKey(){return S.draft?(S.draft.id||S.draft.pendingId||'')+'|'+(S.draft.documents[0]?.name||''):'';}
  function setStatus(text){const el=$('smartScanStatus');if(el){el.textContent=text||'';el.classList.toggle('hidden',!text);}}
  async function run(index=0,quad=null,rotate=null){
    const d=S.draft?.documents?.[index];if(!isImage(d))return;
    const key=draftKey(),token=++running;S.smartScanning=true;setStatus('正在自动裁剪并精细识别（约 10–30 秒），可以先核对其他内容…');
    try{
      const eng=await engine();let img=await loadImage(rawUrl(d.name));
      const crop=quad?{quad:quad.map(([x,y])=>[x*img.width,y*img.height])}:(d.crop&&d.crop.quad&&!d.crop.auto?{quad:d.crop.quad.map(([x,y])=>[x*img.width,y*img.height])}:null);
      let r=await ReceiptOCR.scanReceipt(eng,img,{crop:true,quad:crop&&crop.quad});
      const rot=rotate??(d.crop?.rotate||0);
      if(rot)r={...r,...await eng.recognize(rotateImage(r.image,rot))};
      if(token!==running||key!==draftKey())return;
      const cropOut=r.crop&&!r.crop.skipped?{quad:r.crop.quad.map(([x,y])=>[+(x/img.width).toFixed(5),+(y/img.height).toFixed(5)]),rotate:rot,auto:!quad}:(rot?{quad:[[0,0],[1,0],[1,1],[0,1]],rotate:rot,auto:!quad}:null);
      call('setCrop',index,JSON.stringify(cropOut));d.crop=cropOut||undefined;
      // Without an edit history (restored draft) every filled field counts as the user's.
      const fresh=P.parse(r.text),old=S.mlkitParsed||null,merged=merge(fresh,old),edited=S.userEdited||Object.fromEntries(FIELDS.map(k=>[k,!!S.draft[k]]));
      for(const k of FIELDS)if(!edited[k])S.draft[k]=merged[k]||'';
      S.draft.ocr=r.text;S.parsed={...fresh,...merged};
      S.warnings=[...new Set([...(r.quality?.warnings||[]),...merged.warnings,...(S.extraWarnings||[])])];
      if(cropOut)S.warnings.unshift(cropOut.auto?'已自动裁剪发票区域；如裁剪不准，请点击“调整裁剪”。原图已保留。':'已按调整后的裁剪重新识别。原图已保留。');
      showEditor();persistFields();call('updateDraft',JSON.stringify({ocr:r.text}));
    }catch(e){
      if(token===running)setStatus('');
      if(String(e.message)!=='ocr-unavailable')toast('精细识别未完成，已保留原识别结果：'+(e.message||e));
    }finally{if(token===running){S.smartScanning=false;setStatus('');}}
  }
  // ---------- crop editor ----------
  function edit(index){
    const d=S.draft?.documents?.[index];if(!isImage(d))return;
    const box=document.createElement('div');box.id='cropEditor';box.className='crop-editor';
    box.innerHTML='<div class="crop-head"><strong>调整裁剪</strong><span>拖动四个角对准发票边缘，确保底部金额在框内</span></div><div class="crop-stage" id="cropStage"><canvas id="cropCanvas"></canvas>'+[0,1,2,3].map(i=>'<button class="crop-handle" data-h="'+i+'" aria-label="裁剪角'+(i+1)+'"></button>').join('')+'</div><div class="crop-actions"><button class="secondary" id="cropAuto">自动识别边缘</button><button class="secondary" id="cropRotate">旋转 90°</button><button class="secondary" id="cropReset">恢复原图</button></div><div class="crop-actions"><button class="secondary" id="cropCancel">取消</button><button class="primary" id="cropApply">确定并重新识别</button></div>';
    document.body.appendChild(box);
    const canvas=$('cropCanvas'),stage=$('cropStage'),ctx=canvas.getContext('2d'),im=new Image();
    let quad=d.crop?.quad?d.crop.quad.map(p=>p.slice()):[[0.04,0.04],[0.96,0.04],[0.96,0.96],[0.04,0.96]],rotate=d.crop?.rotate||0,scale=1,ox=0,oy=0;
    function layout(){const W=stage.clientWidth,H=stage.clientHeight;scale=Math.min(W/im.naturalWidth,H/im.naturalHeight);canvas.width=Math.round(im.naturalWidth*scale);canvas.height=Math.round(im.naturalHeight*scale);ox=(W-canvas.width)/2;oy=(H-canvas.height)/2;canvas.style.left=ox+'px';canvas.style.top=oy+'px';draw();}
    function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);
      ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);const pts=quad.map(([x,y])=>[x*canvas.width,y*canvas.height]);ctx.moveTo(pts[0][0],pts[0][1]);for(let i=3;i>=1;i--)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fill('evenodd');
      ctx.strokeStyle='#2fbf8f';ctx.lineWidth=3;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.stroke();
      box.querySelectorAll('.crop-handle').forEach((h,i)=>{h.style.left=(ox+pts[i][0])+'px';h.style.top=(oy+pts[i][1])+'px';});
      $('cropRotate').textContent='旋转 90°'+(rotate?'（当前 '+rotate+'°）':'');}
    let drag=-1;
    box.querySelectorAll('.crop-handle').forEach(h=>h.addEventListener('pointerdown',e=>{drag=+h.dataset.h;h.setPointerCapture(e.pointerId);e.preventDefault();}));
    box.addEventListener('pointermove',e=>{if(drag<0)return;const r=canvas.getBoundingClientRect();quad[drag]=[Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))];draw();});
    box.addEventListener('pointerup',()=>{drag=-1;});box.addEventListener('pointercancel',()=>{drag=-1;});
    const close=()=>{window.removeEventListener('resize',layout);box.remove();};
    $('cropCancel').onclick=close;
    $('cropReset').onclick=()=>{quad=[[0,0],[1,0],[1,1],[0,1]];rotate=0;draw();};
    $('cropRotate').onclick=()=>{rotate=(rotate+90)%360;draw();};
    $('cropAuto').onclick=async()=>{const b=$('cropAuto');b.disabled=true;b.textContent='正在识别边缘…';
      try{const eng=await engine(),img=await loadImage(rawUrl(d.name)),small=ReceiptOCR.scaleImage(img,1280),info=ReceiptOCR.receiptQuad(await eng.detect(small),small.width,small.height,small);
        if(info)quad=info.quad.map(([x,y])=>[x/small.width,y/small.height]);else toast('没有找到文字区域，请手动拖动四个角');draw();}
      catch(e){toast('自动识别边缘失败，请手动调整');}finally{b.disabled=false;b.textContent='自动识别边缘';}};
    $('cropApply').onclick=()=>{
      const area=ReceiptOCR.polyArea(quad);if(area<0.02){toast('裁剪区域太小，请拖动四个角包住整张发票');return;}
      const full=quad.every(([x,y],i)=>Math.abs(x-[0,1,1,0][i])<0.005&&Math.abs(y-[0,0,1,1][i])<0.005);
      close();run(index,full&&!rotate?[[0,0],[1,0],[1,1],[0,1]]:quad,rotate);
    };
    im.onload=layout;im.src=rawUrl(d.name);window.addEventListener('resize',layout);
  }
  // Remember which fields the user changed by hand so recognition never overwrites them.
  document.addEventListener('input',e=>{const map={editDate:'date',editAmount:'amount',editMerchant:'merchant'};const k=map[e.target.id];if(k){S.userEdited=S.userEdited||{};S.userEdited[k]=true;}},true);
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.amountcandidate||b.dataset.datecandidate||b.dataset.merchantcandidate||b.dataset.mealmerchant){S.userEdited=S.userEdited||{};S.userEdited[b.dataset.amountcandidate?'amount':b.dataset.datecandidate?'date':'merchant']=true;}
    if(b.dataset.merchantcandidate){const i=$('editMerchant');if(i){i.value=b.dataset.merchantcandidate;const c=$('editConfirmed');if(c)c.checked=false;persistFields();}}
    if(b.dataset.crop!==undefined){e.stopPropagation();edit(+b.dataset.crop);}
  },true);
  function reset(){running++;S.userEdited={};S.mlkitParsed=null;S.extraWarnings=[];S.smartScanning=false;}
  return {run,edit,merge,reset,engine,isImage};
})();
