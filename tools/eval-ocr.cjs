// Offline field-extraction benchmark (no OCR engine needed: it reads cached OCR text).
// Usage: node tools/eval-ocr.cjs <parser.js> <ocrTextDir> <gt.json> [details.json]
// gt.json: {"<file>": {"date":"YYYY-MM-DD","merchant":"...","total":<pence>,"cat":"..."}}; dims.json beside it is optional.
// Keep real receipts, gt.json and OCR text OUTSIDE the project folder (private data).
const fs=require('fs'),path=require('path');
const P=require(path.resolve(process.argv[2])),dir=process.argv[3],gt=require(path.resolve(process.argv[4]||'gt.json')),dims=fs.existsSync(path.join(path.dirname(path.resolve(process.argv[4]||'gt.json')),'dims.json'))?require(path.join(path.dirname(path.resolve(process.argv[4]||'gt.json')),'dims.json')):{};
const STOP=/\b(ltd|limited|stores?|uk|plc|the|and|co|company|restaurant|cafe|coffee|wholesale|express|farnborough|south|mimms|camberley|uxbridge|staines|charge|team|priority|pick|up)\b/g;
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[’'`]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9一-鿿 ]+/g,' ').replace(/麦当劳/g,'mcdonalds').replace(/\bmc\s*donalds?\b/g,'mcdonalds').replace(/\bmarks\s*(and\s*)?spencer\b|\bm\s*s\b/g,'marksspencer').replace(/\btfl\b/g,'transport for london').replace(/\bb\s*q\b/g,'bq').replace(/\s+/g,' ').trim();
const core=s=>norm(s).replace(STOP,' ').replace(/\s+/g,' ').trim();
function merchantOK(got,want){const a=core(got),b=core(want);if(!a||!b)return false;if(a===b||a.includes(b)||b.includes(a))return true;const wa=a.split(' '),wb=b.split(' ');return wa[0].length>=3&&wa[0]===wb[0];}
const rows=[];for(const f of Object.keys(gt).sort()){const t=path.join(dir,f+'.txt');if(!fs.existsSync(t))continue;const g=gt[f];if(!g.total)continue;
 const r=P.parse(fs.readFileSync(t,'utf8'));const minor=r.amount?Math.round(Number(r.amount)*100):null;
 const d=dims[f]||{},tags=[f.endsWith('.pdf')?'pdf':'photo',d.h&&d.h/d.w>2.3?'long':'normal',/Transport|12/.test(g.cat)?'transport':'other'];
 const unknownMerchant=/untitled|unknown/i.test(g.merchant);
 rows.push({f,tags,date:{got:r.date,want:g.date,ok:r.date===g.date},amount:{got:minor,want:g.total,ok:minor===g.total,inCands:(r.amounts||[]).some(a=>Math.round(Number(a)*100)===g.total)},
  merchant:{got:r.merchant,want:g.merchant,ok:unknownMerchant?null:merchantOK(r.merchant,g.merchant),inCands:(r.merchants||[r.merchant]).some(m=>merchantOK(m,g.merchant))},dateInCands:(r.dates||[]).includes(g.date)});}
function stat(sub,label){const n=sub.length,pct=x=>(100*x/n).toFixed(1)+'%';const k=key=>{const ok=sub.filter(r=>r[key].ok===true).length,wrong=sub.filter(r=>r[key].ok===false&&r[key].got).length,empty=sub.filter(r=>!r[key].got).length;return `${pct(ok)} 对 / ${pct(wrong)} 错填 / ${pct(empty)} 空`;};
 const all=sub.filter(r=>r.date.ok&&r.amount.ok&&r.merchant.ok!==false).length;
 console.log(`${label.padEnd(10)} n=${String(n).padStart(3)} | 日期 ${k('date')} | 金额 ${k('amount')} | 商家 ${k('merchant')} | 三项全对 ${pct(all)} | 正确金额在候选中 ${pct(sub.filter(r=>r.amount.inCands).length)}`);}
stat(rows,'全部');for(const t of ['photo','pdf','long','normal','transport','other'])stat(rows.filter(r=>r.tags.includes(t)),t);
if(process.argv[5])fs.writeFileSync(process.argv[5],JSON.stringify(rows,null,1));
