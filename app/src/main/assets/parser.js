(function(root){
  'use strict';
  const CATEGORIES=['市内交通（地铁）','市外交通','出差餐补','办公用品','客户招待'];
  function iso(y,m,d){
    y=Number(y);m=Number(m);d=Number(d);if(y<100)y+=2000;
    if(y<2000||y>2099||m<1||m>12||d<1||d>31)return '';
    const dt=new Date(Date.UTC(y,m-1,d));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
  }
  function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&iso(...s.split('-'))===s;}
  function minor(s){
    const v=String(s).trim();if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(v))throw Error('金额须为非负数，最多两位小数');
    const [a,b='']=v.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(n<=0)throw Error('金额须大于 0');return n;
  }
  function money(n){return (Number(n)/100).toFixed(2);}
  function parse(text){
    text=String(text||'').replace(/\r/g,'');const dates=[],warnings=[];
    let match;
    const addDate=(date)=>{if(date&&!dates.includes(date))dates.push(date);};
    const yearFirst=/(\b20\d{2})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})(?:日|\b)/g;
    while((match=yearFirst.exec(text)))addDate(iso(match[1],match[2],match[3]));
    const dayFirst=/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})(?!\d)/g;
    while((match=dayFirst.exec(text))){addDate(iso(match[3],match[2],match[1]));if(Number(match[1])<=12&&Number(match[2])<=12&&match[1]!==match[2])warnings.push('数字日期按英国日/月/年理解，请核对');}
    const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const named=/(\d{1,2})\s*[- /]?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*[- ,/]?\s*(20\d{2}|\d{2})\b/gi;
    while((match=named.exec(text)))addDate(iso(match[3],months[match[2].slice(0,3).toLowerCase()],match[1]));
    const namedUS=/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})/gi;
    while((match=namedUS.exec(text)))addDate(iso(match[3],months[match[1].slice(0,3).toLowerCase()],match[2]));
    const lines=text.split('\n').map(s=>s.trim()).filter(Boolean),candidates=[];
    const total=/grand\s*total|total\s*(?:due|paid|amount|incl)|amount\s*(?:due|paid)|balance\s*due|价税合计|实付|应付|合计|(?<!sub)\btotal\b/i;
    const exclude=/sub\s*total|subtotal|小计|tax|\bvat\b|税额|税率|change|找零|cash\s*(?:tendered|received)|tendered|找赎|discount|折扣|saving|优惠/i;
    const moneyRegex=/(?<![\d.])(?:[£€¥￥$]\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}|\d+,\d{2})(?!\d)/g;
    function values(line){const out=[];let mm;moneyRegex.lastIndex=0;while((mm=moneyRegex.exec(line))){let value=mm[1];value=/,\d{2}$/.test(value)&&!value.includes('.')?value.replace(',','.'):value.replace(/,/g,'');try{minor(value);out.push(value);}catch(_){}}return out;}
    lines.forEach((line,i)=>{
      let score=total.test(line)?100:10;
      if(/grand\s*total|实付|价税合计|amount\s*paid/i.test(line))score+=30;
      if(exclude.test(line)&&!/total.*(?:incl|including)|价税合计/i.test(line))score-=180;
      let vs=values(line);
      if(!vs.length&&score>=100&&lines[i+1]&&!exclude.test(lines[i+1]))vs=values(lines[i+1]);
      if(!vs.length&&score>=100){const int=line.match(/(?:[£€¥￥$]|合计|实付|应付|total|due|paid)\s*[:：]?\s*(\d{1,7})(?![\d:.])/i);if(int&&Number(int[1])>0)vs=[int[1]+'.00'];}
      vs.forEach((v,j)=>candidates.push({value:v,score:score+j,source:line.slice(0,120)}));
    });
    candidates.sort((a,b)=>b.score-a.score||minor(b.value)-minor(a.value));
    const eligible=candidates.filter(c=>c.score>0),top=eligible[0];
    const amounts=[...new Set(eligible.map(c=>c.value))].slice(0,8);
    if(!top)warnings.push('未识别出金额，请手动填写');
    else if(top.score<100)warnings.push('未找到明确的总额字段，金额为候选值，请核对');
    else if(eligible.some(c=>c.score>=100&&c.value!==top.value))warnings.push('出现多个合计金额，请核对实际付款总额');
    if(!dates.length)warnings.push('未识别出完整日期，请手动填写');
    if(dates.length>1)warnings.push('出现多个日期，请选择费用发生日期');
    const merchant=lines.slice(0,6).find(l=>/[A-Za-z\u4e00-\u9fff]{2}/.test(l)&&!/^.*(?:receipt|invoice|发票|收据|tax|vat|date|total|welcome|thank you|电子普通|统一发票).*$/i.test(l)&&l.length<90)||'';
    warnings.push('商家名称为候选结果，请核对；所在地需手动填写');
    return {date:dates[0]||'',amount:top?top.value:'',merchant,dates,amounts,warnings:[...new Set(warnings)]};
  }
  function filter(rows,{from='',to='',category='all',search=''}={}){
    const q=search.trim().toLowerCase();return rows.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)&&(category==='all'||r.category===category)&&(!q||`${r.merchant} ${r.location||''} ${r.note||''}`.toLowerCase().includes(q))).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  }
  function totals(rows){const out={};rows.forEach(r=>{out[r.currency]=(out[r.currency]||0)+Number(r.amountMinor);});return out;}
  const api={CATEGORIES,iso,validDate,minor,money,parse,filter,totals};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReceiptParser=api;
})(typeof window!=='undefined'?window:globalThis);
