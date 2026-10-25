// Offline PP-OCRv6 receipt recognition for the Windows app, run in a worker thread so the
// main process stays responsive. Input: raw BGRA/RGBA pixels. Output: text + crop/quality info.
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path');
const ort=require('onnxruntime-web'),R=require('./receipt-ocr.js');
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
const dir=workerData.modelDir;
let enginePromise=null;
function engine(){
  if(!enginePromise)enginePromise=R.createEngine({ort,det:fs.readFileSync(path.join(dir,'det.onnx')),rec:fs.readFileSync(path.join(dir,'rec.onnx')),dict:fs.readFileSync(path.join(dir,'dict.txt'),'utf8')}).catch(e=>{enginePromise=null;throw e;});
  return enginePromise;
}
parentPort.on('message',async({id,width,height,pixels,bgra})=>{
  try{
    const data=new Uint8ClampedArray(pixels.buffer,pixels.byteOffset,pixels.byteLength);
    if(bgra)for(let i=0;i<data.length;i+=4){const b=data[i];data[i]=data[i+2];data[i+2]=b;data[i+3]=255;}
    const r=await R.scanReceipt(await engine(),{data,width,height});
    const warnings=[...r.quality.warnings];
    if(r.crop&&!r.crop.skipped)warnings.unshift('已自动裁剪并矫正发票区域后识别，原件保留不变');
    if(r.rotation)warnings.push('照片方向已自动调整后识别，原件保留不变');
    parentPort.postMessage({id,text:r.text,warnings});
  }catch(e){parentPort.postMessage({id,error:String(e&&e.message||e)});}
});
