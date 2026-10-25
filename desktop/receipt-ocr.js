/*
 * Offline receipt OCR shared by the Android WebView and the Windows Electron app.
 * PP-OCRv6 text detection (DB) + recognition (CTC) running on onnxruntime-web,
 * plus receipt-area detection and perspective correction for automatic cropping.
 * Images are {data: Uint8ClampedArray RGBA, width, height}. No network access.
 */
(function(root){
  'use strict';
  const DET_LIMIT_MIN=736,DET_MAX_SIDE=2560,DET_THRESH=0.2,BOX_THRESH=0.45,UNCLIP=1.4,MAX_CANDIDATES=3000;
  const REC_H=48,REC_W=320,REC_BATCH=6,DROP_SCORE=0.5;
  const MEAN=[0.485,0.456,0.406],STD=[0.229,0.224,0.225];

  // ---------- geometry ----------
  function convexHull(pts){
    if(pts.length<3)return pts.slice();
    pts=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
    const lower=[],upper=[];
    for(const p of pts){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
    for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
    upper.pop();lower.pop();return lower.concat(upper);
  }
  // Minimum-area rectangle around points (rotating calipers over the hull).
  function minAreaRect(pts){
    const hull=convexHull(pts);
    if(hull.length===1)return {center:hull[0],w:0,h:0,angle:0};
    let best=null;
    for(let i=0;i<hull.length;i++){
      const a=hull[i],b=hull[(i+1)%hull.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(!len)continue;
      const ux=dx/len,uy=dy/len;let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
      for(const p of hull){const u=p[0]*ux+p[1]*uy,v=-p[0]*uy+p[1]*ux;if(u<minU)minU=u;if(u>maxU)maxU=u;if(v<minV)minV=v;if(v>maxV)maxV=v;}
      const area=(maxU-minU)*(maxV-minV);
      if(!best||area<best.area){const cu=(minU+maxU)/2,cv=(minV+maxV)/2;best={area,center:[cu*ux-cv*uy,cu*uy+cv*ux],w:maxU-minU,h:maxV-minV,ux,uy};}
    }
    if(!best){const xs=hull.map(p=>p[0]),ys=hull.map(p=>p[1]);return {center:[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2],w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),ux:1,uy:0};}
    return best;
  }
  function rectPoints(r,grow=0){
    const w=r.w/2+grow,h=r.h/2+grow,ux=r.ux??1,uy=r.uy??0,[cx,cy]=r.center;
    return [[-w,-h],[w,-h],[w,h],[-w,h]].map(([u,v])=>[cx+u*ux-v*uy,cy+u*uy+v*ux]);
  }
  // PaddleOCR get_mini_boxes ordering: tl, tr, br, bl.
  function orderMini(points){
    const p=points.slice().sort((a,b)=>a[0]-b[0]);
    const [i1,i4]=p[1][1]>p[0][1]?[0,1]:[1,0],[i2,i3]=p[3][1]>p[2][1]?[2,3]:[3,2];
    return [p[i1],p[i2],p[i3],p[i4]];
  }
  function orderClockwise(pts){
    const s=pts.map(p=>p[0]+p[1]),d=pts.map(p=>p[1]-p[0]);
    const tl=pts[s.indexOf(Math.min(...s))],br=pts[s.indexOf(Math.max(...s))];
    const rest=pts.filter(p=>p!==tl&&p!==br);if(rest.length!==2)return pts;
    const [tr,bl]=rest[0][1]-rest[0][0]<rest[1][1]-rest[1][0]?[rest[0],rest[1]]:[rest[1],rest[0]];
    return [tl,tr,br,bl];
  }
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  // Homography mapping unit-square-like dst rectangle corners to src quad.
  function homography(src,dst){
    // Solve H such that dst -> src (8 unknowns).
    const A=[],B=[];
    for(let i=0;i<4;i++){const [x,y]=dst[i],[u,v]=src[i];
      A.push([x,y,1,0,0,0,-u*x,-u*y]);B.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);B.push(v);}
    const n=8;for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;
      [A[c],A[p]]=[A[p],A[c]];[B[c],B[p]]=[B[p],B[c]];const piv=A[c][c]||1e-12;
      for(let r=0;r<n;r++){if(r===c)continue;const f=A[r][c]/piv;if(!f)continue;for(let k=c;k<n;k++)A[r][k]-=f*A[c][k];B[r]-=f*B[c];}}
    const h=B.map((b,i)=>b/(A[i][i]||1e-12));return [...h,1];
  }
  function sampler(img){
    const {data,width:W,height:H}=img;
    return (x,y,out)=>{
      x=Math.min(Math.max(x,0),W-1);y=Math.min(Math.max(y,0),H-1);
      const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,W-1),y1=Math.min(y0+1,H-1),fx=x-x0,fy=y-y0;
      const i00=(y0*W+x0)*4,i10=(y0*W+x1)*4,i01=(y1*W+x0)*4,i11=(y1*W+x1)*4;
      for(let c=0;c<3;c++)out[c]=(data[i00+c]*(1-fx)+data[i10+c]*fx)*(1-fy)+(data[i01+c]*(1-fx)+data[i11+c]*fx)*fy;
    };
  }
  // Warp quad [tl,tr,br,bl] of img into an upright W x H RGBA image.
  function warpQuad(img,quad,W,H){
    W=Math.max(1,Math.round(W));H=Math.max(1,Math.round(H));
    const h=homography(quad,[[0,0],[W-1,0],[W-1,H-1],[0,H-1]]),s=sampler(img),out=new Uint8ClampedArray(W*H*4),px=[0,0,0];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const z=h[6]*x+h[7]*y+h[8];s((h[0]*x+h[1]*y+h[2])/z,(h[3]*x+h[4]*y+h[5])/z,px);const i=(y*W+x)*4;out[i]=px[0];out[i+1]=px[1];out[i+2]=px[2];out[i+3]=255;}
    return {data:out,width:W,height:H};
  }
  function quadSize(q){return {w:Math.max(dist(q[0],q[1]),dist(q[3],q[2])),h:Math.max(dist(q[0],q[3]),dist(q[1],q[2]))};}

  // ---------- detection ----------
  function detInput(img){
    const {width:w,height:h}=img;let ratio=1;
    if(Math.min(w,h)<DET_LIMIT_MIN)ratio=DET_LIMIT_MIN/Math.min(w,h);
    if(Math.max(w,h)*ratio>DET_MAX_SIDE)ratio=DET_MAX_SIDE/Math.max(w,h);
    const rw=Math.max(32,Math.round(w*ratio/32)*32),rh=Math.max(32,Math.round(h*ratio/32)*32);
    const t=new Float32Array(3*rw*rh),s=sampler(img),px=[0,0,0],sx=w/rw,sy=h/rh,plane=rw*rh;
    for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){s((x+0.5)*sx-0.5,(y+0.5)*sy-0.5,px);const i=y*rw+x;
      // Model expects BGR channel order.
      t[i]=(px[2]/255-MEAN[0])/STD[0];t[plane+i]=(px[1]/255-MEAN[1])/STD[1];t[2*plane+i]=(px[0]/255-MEAN[2])/STD[2];}
    return {tensor:t,rw,rh};
  }
  function boxesFromMap(prob,mw,mh,dw,dh){
    const n=mw*mh,label=new Int32Array(n),boxes=[];let next=0;const stack=new Int32Array(n);
    for(let start=0;start<n&&next<MAX_CANDIDATES;start++){
      if(label[start]||prob[start]<=DET_THRESH)continue;
      next++;let sp=0;stack[sp++]=start;label[start]=next;const rows=new Map();
      while(sp){const p=stack[--sp],x=p%mw,y=(p-x)/mw;const r=rows.get(y);if(r){if(x<r[0])r[0]=x;if(x>r[1])r[1]=x;}else rows.set(y,[x,x]);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=mw||ny>=mh)continue;const q=ny*mw+nx;if(!label[q]&&prob[q]>DET_THRESH){label[q]=next;stack[sp++]=q;}}}
      const pts=[];for(const [y,[a,b]] of rows){pts.push([a,y]);if(b!==a)pts.push([b,y]);}
      const r=minAreaRect(pts);if(Math.min(r.w,r.h)<3)continue;
      const quad=rectPoints(r);
      // Mean probability inside the box ("fast" score).
      const xs=quad.map(p=>p[0]),ys=quad.map(p=>p[1]),x0=Math.max(0,Math.floor(Math.min(...xs))),x1=Math.min(mw-1,Math.ceil(Math.max(...xs))),y0=Math.max(0,Math.floor(Math.min(...ys))),y1=Math.min(mh-1,Math.ceil(Math.max(...ys)));
      let sum=0,cnt=0;const inside=(px,py)=>{for(let i=0;i<4;i++){const a=quad[i],b=quad[(i+1)%4];if((b[0]-a[0])*(py-a[1])-(b[1]-a[1])*(px-a[0])<-1e-6)return false;}return true;};
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(inside(x,y)){sum+=prob[y*mw+x];cnt++;}
      const score=cnt?sum/cnt:0;if(score<BOX_THRESH)continue;
      const d=r.w*r.h*UNCLIP/(2*(r.w+r.h)),grown={...r,w:r.w+2*d,h:r.h+2*d};if(Math.min(grown.w,grown.h)<5)continue;
      const box=orderMini(rectPoints(grown)).map(([x,y])=>[Math.min(dw,Math.max(0,Math.round(x/mw*dw))),Math.min(dh,Math.max(0,Math.round(y/mh*dh)))]);
      const o=orderClockwise(box);if(dist(o[0],o[1])<=3||dist(o[0],o[3])<=3)continue;
      boxes.push({points:o,score});
    }
    // Reading order: top to bottom, then left to right within ~10px.
    boxes.sort((a,b)=>a.points[0][1]-b.points[0][1]||a.points[0][0]-b.points[0][0]);
    for(let i=0;i<boxes.length-1;i++)for(let j=i;j>=0;j--){if(Math.abs(boxes[j+1].points[0][1]-boxes[j].points[0][1])<10&&boxes[j+1].points[0][0]<boxes[j].points[0][0]){[boxes[j],boxes[j+1]]=[boxes[j+1],boxes[j]];}else break;}
    return boxes;
  }

  // ---------- recognition ----------
  function recCrops(img,boxes){
    return boxes.map(b=>{const q=b.points;let {w,h}=quadSize(q);w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
      // Tall crops are vertical text: rotate like PaddleOCR (np.rot90).
      const rotate=h/w>=1.5;return {box:b,q,w:rotate?h:w,h:rotate?w:h,rotate};});
  }
  function recTensor(img,crops,imgW){
    const t=new Float32Array(crops.length*3*REC_H*imgW),s=sampler(img),px=[0,0,0],plane=REC_H*imgW;
    crops.forEach((c,n)=>{
      const rw=Math.min(imgW,Math.ceil(REC_H*c.w/c.h));
      // Map target (u,v) -> crop rectangle -> source through the homography.
      const W0=c.rotate?c.h:c.w,H0=c.rotate?c.w:c.h,hm=homography(c.q,[[0,0],[W0,0],[W0,H0],[0,H0]]);
      const base=n*3*plane;
      for(let v=0;v<REC_H;v++)for(let u=0;u<imgW;u++){
        const i=v*imgW+u;if(u>=rw){continue;}
        let cx=(u+0.5)*c.w/rw-0.5,cy=(v+0.5)*c.h/REC_H-0.5;
        // np.rot90 (counter-clockwise): rotated (cx,cy) comes from crop (W0-1-cy, cx).
        if(c.rotate){const ox=W0-1-cy,oy=cx;cx=ox;cy=oy;}
        const z=hm[6]*cx+hm[7]*cy+hm[8];s((hm[0]*cx+hm[1]*cy+hm[2])/z,(hm[3]*cx+hm[4]*cy+hm[5])/z,px);
        t[base+i]=(px[2]/255-0.5)/0.5;t[base+plane+i]=(px[1]/255-0.5)/0.5;t[base+2*plane+i]=(px[0]/255-0.5)/0.5;
      }
    });
    return t;
  }
  function ctcDecode(out,dims,chars){
    const [N,T,C]=dims,res=[];
    for(let n=0;n<N;n++){let text='',conf=0,k=0,prev=-1;
      for(let t=0;t<T;t++){const off=(n*T+t)*C;let best=0,bv=-Infinity;for(let c=0;c<C;c++){const v=out[off+c];if(v>bv){bv=v;best=c;}}
        if(best!==0&&best!==prev){text+=chars[best]??'';conf+=bv;k++;}prev=best;}
      res.push({text,score:k?conf/k:0});}
    return res;
  }
  function joinRows(lines){
    const items=lines.map(l=>{const ys=l.points.map(p=>p[1]),xs=l.points.map(p=>p[0]);return {top:Math.min(...ys),bottom:Math.max(...ys),left:Math.min(...xs),text:l.text};})
      .sort((a,b)=>(a.top+a.bottom)/2-(b.top+b.bottom)/2),rows=[];
    for(const it of items){const c=(it.top+it.bottom)/2,h=it.bottom-it.top,last=rows[rows.length-1];
      if(last&&Math.abs(c-last.c)<Math.max(h,last.h)*0.5){last.items.push(it);last.c=(last.c*(last.items.length-1)+c)/last.items.length;}
      else rows.push({c,h,items:[it]});}
    return rows.map(r=>r.items.sort((a,b)=>a.left-b.left).map(i=>i.text).join(' ')).join('\n');
  }

  // ---------- receipt area (automatic crop) ----------
  // The receipt is where the text is: the rotated rectangle around all text
  // boxes, with a margin. Text-based bounds keep the bottom total of long
  // receipts and ignore plain table/background areas.
  // Push each side of the quad outwards while the strip under it still looks like receipt
  // paper (similar brightness, little colour); stops at the table edge or the photo border.
  function expandToPaper(img,quad){
    const {data,width:W,height:H}=img,px=(x,y)=>{x=Math.min(W-1,Math.max(0,Math.round(x)));y=Math.min(H-1,Math.max(0,Math.round(y)));const i=(y*W+x)*4;return [data[i],data[i+1],data[i+2]];};
    const gray=c=>0.299*c[0]+0.587*c[1]+0.114*c[2],chroma=c=>Math.max(...c)-Math.min(...c);
    // Paper colour: bright part of the area just inside the text region.
    const cx=quad.reduce((s,p)=>s+p[0],0)/4,cy=quad.reduce((s,p)=>s+p[1],0)/4,samples=[];
    for(let i=0;i<4;i++){const a=quad[i],b=quad[(i+1)%4];for(let t=0.1;t<=0.9;t+=0.05){const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;samples.push(px(x+(cx-x)*0.04,y+(cy-y)*0.04));}}
    const g=samples.map(gray).sort((a,b)=>a-b),paper=g[Math.floor(g.length*0.7)],paperChroma=samples.map(chroma).sort((a,b)=>a-b)[Math.floor(samples.length/2)];
    const diag=Math.hypot(W,H),step=diag*0.004,maxSteps=Math.round(0.07*diag/step),q=quad.map(p=>p.slice());
    const paperLike=c=>Math.abs(gray(c)-paper)<38&&chroma(c)<paperChroma+40;
    for(let side=0;side<4;side++){
      const a=q[side],b=q[(side+1)%4],ex=b[0]-a[0],ey=b[1]-a[1],len=Math.hypot(ex,ey)||1;let nx=ey/len,ny=-ex/len;
      // Normal pointing away from the centre.
      const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;if((mx+nx-cx)**2+(my+ny-cy)**2<(mx-cx)**2+(my-cy)**2){nx=-nx;ny=-ny;}
      let good=0;
      for(let k=1;k<=maxSteps;k++){const d=k*step;let ok=0,n=0,out=false;
        for(let t=0.08;t<=0.92;t+=0.04){const x=a[0]+ex*t+nx*d,y=a[1]+ey*t+ny*d;if(x<0||y<0||x>=W||y>=H){out=true;break;}n++;if(paperLike(px(x,y)))ok++;}
        if(out||!n||ok/n<0.6)break;good=d;}
      const m=good+step;a[0]+=nx*m;a[1]+=ny*m;b[0]+=nx*m;b[1]+=ny*m;
    }
    return q.map(([x,y])=>[Math.min(W-1,Math.max(0,x)),Math.min(H-1,Math.max(0,y))]);
  }
  function receiptQuad(boxes,width,height,img){
    if(!boxes.length)return null;
    const heights=boxes.map(b=>Math.min(dist(b.points[0],b.points[3]),dist(b.points[1],b.points[2]))).sort((a,b)=>a-b);
    const lineH=heights[Math.floor(heights.length/2)]||10;
    // Ignore isolated specks far from the rest (e.g. text on the table).
    const centers=boxes.map(b=>[b.points.reduce((s,p)=>s+p[0],0)/4,b.points.reduce((s,p)=>s+p[1],0)/4]);
    const keep=boxes.filter((b,i)=>{let near=0;for(let j=0;j<boxes.length;j++)if(j!==i&&dist(centers[i],centers[j])<lineH*12)near++;return near>=1||boxes.length<4;});
    const pts=[];for(const b of keep.length>=Math.max(2,boxes.length*0.6)?keep:boxes)pts.push(...b.points);
    const r=minAreaRect(pts);
    // Keep the receipt upright: rectangle axes aligned with the closest image axis.
    let quad=orderClockwise(rectPoints(r,lineH*1.2));
    quad=quad.map(([x,y])=>[Math.min(width-1,Math.max(0,x)),Math.min(height-1,Math.max(0,y))]);
    const area=polyArea(quad)/(width*height),touches=quad.some(([x,y])=>x<=1||y<=1||x>=width-2||y>=height-2);
    return {quad,areaRatio:area,touchesEdge:touches,lineHeight:lineH,textBoxes:boxes.length};
  }
  function polyArea(q){let a=0;for(let i=0;i<q.length;i++){const p=q[i],n=q[(i+1)%q.length];a+=p[0]*n[1]-n[0]*p[1];}return Math.abs(a)/2;}
  // Image quality hints for the user (blur / dark / glare / small text).
  function quality(img,info){
    const {data,width:W,height:H}=img,step=Math.max(1,Math.floor(Math.sqrt(W*H/250000)));let sum=0,n=0,bright=0,lap=0,ln=0;
    const g=(x,y)=>{const i=(y*W+x)*4;return 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];};
    for(let y=step;y<H-step;y+=step)for(let x=step;x<W-step;x+=step){const v=g(x,y);sum+=v;n++;if(v>250)bright++;const l=4*v-g(x-step,y)-g(x+step,y)-g(x,y-step)-g(x,y+step);lap+=l*l;ln++;}
    const mean=sum/n,sharp=lap/ln,warnings=[];
    if(mean<70)warnings.push('照片偏暗，建议在光线充足处重拍');
    if(bright/n>0.12)warnings.push('照片有反光或过曝区域，金额可能识别不全');
    if(sharp<60)warnings.push('照片可能模糊，建议对焦后重拍');
    if(info&&info.touchesEdge)warnings.push('发票可能没有拍完整（贴到照片边缘），请确认底部金额在画面内');
    if(info&&info.lineHeight&&info.lineHeight<12)warnings.push('文字较小，建议靠近一些拍摄');
    return {mean,sharpness:sharp,warnings};
  }

  // ---------- engine ----------
  async function createEngine({ort,det,rec,dict,options}){
    const opts={executionProviders:['wasm'],graphOptimizationLevel:'all',...(options||{})};
    const detS=await ort.InferenceSession.create(det,opts),recS=await ort.InferenceSession.create(rec,opts);
    const chars=['blank',...(typeof dict==='string'?dict.split(/\r?\n/).filter((l,i,a)=>!(i===a.length-1&&l==='')):dict),' '];
    async function detect(img){
      const {tensor,rw,rh}=detInput(img);
      const out=await detS.run({[detS.inputNames[0]]:new ort.Tensor('float32',tensor,[1,3,rh,rw])});
      const m=out[detS.outputNames[0]];return boxesFromMap(m.data,m.dims[3],m.dims[2],img.width,img.height);
    }
    async function recognizeBoxes(img,boxes){
      const crops=recCrops(img,boxes),order=crops.map((c,i)=>i).sort((a,b)=>crops[a].w/crops[a].h-crops[b].w/crops[b].h),results=new Array(crops.length);
      for(let s=0;s<order.length;s+=REC_BATCH){
        const idx=order.slice(s,s+REC_BATCH),batch=idx.map(i=>crops[i]);
        const ratio=Math.max(REC_W/REC_H,...batch.map(c=>c.w/c.h)),imgW=Math.round(REC_H*ratio);
        const out=await recS.run({[recS.inputNames[0]]:new ort.Tensor('float32',recTensor(img,batch,imgW),[batch.length,3,REC_H,imgW])});
        const o=out[recS.outputNames[0]];ctcDecode(o.data,o.dims,chars).forEach((r,k)=>{results[idx[k]]=r;});
      }
      return boxes.map((b,i)=>({points:b.points,text:results[i].text,score:results[i].score})).filter(l=>l.score>=DROP_SCORE&&l.text.trim());
    }
    async function recognize(img){const boxes=await detect(img);const lines=await recognizeBoxes(img,boxes);return {lines,text:joinRows(lines),boxes};}
    return {detect,recognize,recognizeBoxes,release:async()=>{await detS.release?.();await recS.release?.();}};
  }
  // Downscale an image (for faster detection of the receipt area).
  function scaleImage(img,maxSide){
    const s=Math.min(1,maxSide/Math.max(img.width,img.height));if(s===1)return img;
    const W=Math.max(1,Math.round(img.width*s)),H=Math.max(1,Math.round(img.height*s)),out=new Uint8ClampedArray(W*H*4),smp=sampler(img),px=[0,0,0];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){smp((x+0.5)/s-0.5,(y+0.5)/s-0.5,px);const i=(y*W+x)*4;out[i]=px[0];out[i+1]=px[1];out[i+2]=px[2];out[i+3]=255;}
    return {data:out,width:W,height:H};
  }
  function rotate(img,deg){
    if(!deg)return img;const W=deg===180?img.width:img.height,H=deg===180?img.height:img.width,out=new Uint8ClampedArray(W*H*4),src=img.data;
    for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){let nx,ny;if(deg===90){nx=img.height-1-y;ny=x;}else if(deg===180){nx=img.width-1-x;ny=img.height-1-y;}else{nx=y;ny=img.width-1-x;}
      const a=(y*img.width+x)*4,b=(ny*W+nx)*4;out[b]=src[a];out[b+1]=src[a+1];out[b+2]=src[a+2];out[b+3]=255;}
    return {data:out,width:W,height:H};
  }
  // Full scan: find receipt area on a reduced copy, correct perspective, OCR the corrected image.
  async function scanReceipt(engine,img,{crop=true,quad=null}={}){
    let info=null,work=img;
    if(crop){
      if(!quad){const small=scaleImage(img,1280),k=img.width/small.width;const boxes=await engine.detect(small);info=receiptQuad(boxes,small.width,small.height,small);
        if(info){info.quad=info.quad.map(([x,y])=>[x*k,y*k]);info.lineHeight*=k;}}
      else info={quad,areaRatio:polyArea(quad)/(img.width*img.height),touchesEdge:false};
      // Only crop when the text region is clearly smaller than the photo.
      if(info&&info.areaRatio<0.9){const {w,h}=quadSize(info.quad);work=warpQuad(img,info.quad,w,h);}
      else if(info)info.skipped=true;
    }
    let result=await engine.recognize(work),rotation=0;
    // Sideways or upside-down photos: try the other orientations and keep the most confident reading.
    const tall=result.boxes.filter(b=>dist(b.points[0],b.points[3])>1.5*dist(b.points[0],b.points[1])).length;
    const conf=r=>r.lines.length?r.lines.reduce((s,l)=>s+l.score,0)/r.lines.length*Math.min(1,r.lines.length/8):0;
    const tries=tall>result.boxes.length*0.5?[90,270]:conf(result)<0.8?[180]:[];
    for(const deg of tries){const turned=rotate(work,deg),r=await engine.recognize(turned);if(conf(r)>conf(result)+0.03){result=r;rotation=deg;work=turned;}}
    return {...result,crop:info,rotation,quality:quality(img,info),image:work};
  }
  const api={rotate,createEngine,scanReceipt,receiptQuad,warpQuad,quadSize,scaleImage,quality,joinRows,minAreaRect,homography,polyArea,orderClockwise};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReceiptOCR=api;
})(typeof window!=='undefined'?window:globalThis);
