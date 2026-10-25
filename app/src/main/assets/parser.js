(function(root){
  'use strict';
  const CATEGORIES=['市内交通（地铁）','市外交通','出差餐补','办公用品','客户招待'];
  const MEAL_MERCHANTS=['Tesco','麦当劳',"Sainsbury's",'ASDA','Costco'];
  function exportNames(category,from,to){
    if(!CATEGORIES.includes(category)||!validDate(from)||!validDate(to)||to<from)throw Error('请选择费用种类和有效日期范围');
    const monthLabel=date=>`${date.slice(0,4)}年${Number(date.slice(5,7))}月`;
    const cityPeriod=monthLabel(from)+(from.slice(0,7)===to.slice(0,7)?'':
      '至'+(from.slice(0,4)===to.slice(0,4)?`${Number(to.slice(5,7))}月`:monthLabel(to)));
    const base=category===CATEGORIES[0]?`${cityPeriod}_市内交通报账`:`${from}至${to}_${category}报账`;
    return {base,pdf:base+'_发票合集.pdf',xlsx:base+'_明细汇总.xlsx'};
  }
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
  function receiptDates(text,opts={}){
    const warnings=[],found=[],moneyLines=[],digits=s=>String(s).replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');
    const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const number='[0-9OoIl|]{1,2}',year='(?:[0-9OoIl|]{4}|[0-9OoIl|]{2})';
    const monthName='(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|[O0]ct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
    const start='(?<![A-Za-z0-9])',end='(?=$|[^A-Za-z0-9]|T[0-9])';
    const dateLabel='(?:transaction\\s*date|purchase\\s*date|payment\\s*date|receipt\\s*date|invoice\\s*date|date|消费日期|交易日期|付款日期|开票日期|日期)';
    const expense=/transaction\s*date|purchase\s*date|payment\s*date|paid\s*on|purchased\s*on|消费日期|交易日期|付款日期|费用日期/i;
    const nonExpense=/expiry|expires?|expiration|valid\s*(?:until|to|through)|\buntil\b|use\s*by|best\s*before|return\s*by|due\s*date|payment\s*due|date\s*of\s*birth|到期|有效期|截止|保质期|出生日期/i;
    const labels=/transaction\s*date|purchase\s*date|payment\s*date|receipt\s*date|invoice\s*date|issue\s*date|issued\s*on|paid\s*on|purchased\s*on|date|消费日期|交易日期|付款日期|费用日期|开票日期|日期/i;
    const rawLines=String(text).split('\n');
    rawLines.forEach((raw,lineIndex)=>{
      const line=raw.normalize('NFKC').replace(/[‐‑‒–—−]/g,'-').trim(),matches=[],spans=[];
      function scan(pattern,parts){
        let match;while((match=pattern.exec(line))){
          if(!/[0-9]/.test(match[0]))continue;
          spans.push({index:match.index,end:match.index+match[0].length});
          const p=parts(match),numericYear=digits(p.y);
          if(numericYear.length===2&&/^\s*:\d/.test(line.slice(match.index+match[0].length)))continue;
          // OCR reads the leading 0 of a month as 8 or 9 ("20/97/2026").
          if(!p.named&&/^[89][1-9]$/.test(digits(p.m))){p.m='0'+digits(p.m)[1];p.monthRepair=true;}
          if(numericYear.length===4&&(Number(numericYear)<2000||Number(numericYear)>2099))continue;
          const value=iso(numericYear,digits(p.m),digits(p.d));
          if(!value)continue;
          matches.push({date:value,index:match.index,end:match.index+match[0].length,year:p.y,
            corrected:/[OoIl|]/.test(p.y+p.d+(p.named?'':p.m))||!!p.monthRepair,
            ambiguous:!p.named&&Number(digits(p.d))<=12&&Number(digits(p.m))<=12&&digits(p.d)!==digits(p.m)&&!p.yearFirst,
            label:p.label||'',source:raw.trim().slice(0,180),lineIndex});
        }
      }
      scan(new RegExp(start+'([0-9OoIl|]{4})\\s*(?:年|[-/.])\\s*('+number+')\\s*(?:月|[-/.])\\s*('+number+')(?:日)?'+end,'g'),m=>({y:m[1],m:m[2],d:m[3],yearFirst:true}));
      scan(new RegExp(start+'('+number+')\\s*[-/.]\\s*('+number+')\\s*[-/.,]\\s*[,\'’]?\\s*('+year+')'+end,'g'),m=>({y:m[3],m:m[2],d:m[1]}));
      scan(new RegExp(start+'('+number+')(?:st|nd|rd|th)?\\s*[- /]?\\s*('+monthName+')[.’\'`]?\\s*[- ,/]?\\s*('+year+')'+end,'gi'),m=>({y:m[3],m:String(months[m[2].replace(/^0/,'O').slice(0,3).toLowerCase()]),d:m[1],named:true,monthRepair:/^0/.test(m[2])}));
      scan(new RegExp(start+'('+monthName+')\\.?\\s+('+number+')(?:st|nd|rd|th)?\\s*,?\\s*('+year+')'+end,'gi'),m=>({y:m[3],m:String(months[m[1].replace(/^0/,'O').slice(0,3).toLowerCase()]),d:m[2],named:true,monthRepair:/^0/.test(m[1])}));
      scan(new RegExp(start+'([0-9]{2})('+monthName+')([0-9]{2})'+end,'gi'),m=>({y:m[3],m:String(months[m[2].replace(/^0/,'O').slice(0,3).toLowerCase()]),d:m[1],named:true}));
      // Whitespace-only numeric dates need a full year, or an explicit date label.
      scan(new RegExp(start+'('+number+')\\s+('+number+')\\s+([0-9OoIl|]{4})'+end,'g'),m=>({y:m[3],m:m[2],d:m[1]}));
      scan(new RegExp(start+'([0-9OoIl|]{4})\\s+('+number+')\\s+('+number+')'+end,'g'),m=>({y:m[1],m:m[2],d:m[3],yearFirst:true}));
      scan(new RegExp('('+dateLabel+')\\s*[:：]?\\s*('+number+')\\s+('+number+')\\s+('+year+')'+end,'gi'),m=>({label:m[1],y:m[4],m:m[3],d:m[2]}));
      // Compact numbers can also be invoice/card IDs: require an explicit date label.
      scan(new RegExp('('+dateLabel+')\\s*[:：]?\\s*([0-9]{8}|[0-9]{6})'+end,'gi'),m=>{
        const token=m[2];return token.length===8&&token.startsWith('20')?{label:m[1],y:token.slice(0,4),m:token.slice(4,6),d:token.slice(6),yearFirst:true}:{label:m[1],d:token.slice(0,2),m:token.slice(2,4),y:token.slice(4)};
      });
      matches.sort((a,b)=>a.index-b.index||b.end-a.end);let previousEnd=0;
      for(const candidate of matches){
        if(candidate.index<previousEnd)continue;
        // A split "Transaction date" label is allowed, but do not borrow a label
        // from a previous line containing another date or unrelated text.
        let context=line.slice(previousEnd,candidate.index)+' '+candidate.label;
        if(candidate.index===0&&lineIndex>0){const prev=rawLines[lineIndex-1].trim();if(/^(?:transaction\s*date|purchase\s*date|payment\s*date|receipt\s*date|invoice\s*date|date|消费日期|交易日期|付款日期|开票日期|日期|expiry|valid\s*until|due\s*date)\s*[:：]?$/i.test(prev))context=prev;}
        candidate.eligible=!nonExpense.test(context);
        candidate.kind=candidate.eligible?(expense.test(context)?'消费/交易日期':labels.test(context)?'小票日期':'日期候选'):'到期等非消费日期';
        candidate.score=candidate.eligible?(expense.test(context)?140:labels.test(context)?100:40)+(/\b\d{1,2}:\d{2}\b/.test(line)?20:0):-100;
        found.push(candidate);previousEnd=candidate.end;
      }
      // A dot-separated date must not become a price (09.10.26 -> £9.10).
      let moneyLine=line;for(const span of spans.sort((a,b)=>b.index-a.index))moneyLine=moneyLine.slice(0,span.index)+' '.repeat(span.end-span.index)+moneyLine.slice(span.end);
      if(raw.trim())moneyLines.push(moneyLine);
    });
    const today=opts.today||new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),thisYear=Number(today.slice(0,4));
    const later=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),oneDigit=(a,b)=>a.length===b.length&&[...a].filter((c,i)=>c!==b[i]).length===1;
    for(const c of [...found]){
      if(!c.eligible)continue;const y=c.date.slice(0,4);
      if(c.date<=later(today,365)&&Number(y)>=thisYear-3)continue;
      c.score-=60;c.kind='年份可疑';
      for(const target of [thisYear,thisYear-1]){const fixed=target+c.date.slice(4);
        if(oneDigit(y,String(target))&&validDate(fixed)&&fixed<=later(today,1))found.push({...c,date:fixed,score:c.score+(target===thisYear?50:40),corrected:true,kind:'日期候选（已修正年份）'});}
    }
    const ranked=found.sort((a,b)=>b.score-a.score||Number(a.corrected)-Number(b.corrected)||a.lineIndex-b.lineIndex||a.index-b.index),unique=[];
    for(const item of ranked)if(!unique.some(c=>c.date===item.date))unique.push(item);
    const eligible=unique.filter(c=>c.eligible),best=eligible[0],conflict=best&&eligible.some(c=>c.score===best.score&&c.date!==best.date);
    if(ranked.some(c=>c.corrected))warnings.push('日期中的疑似 OCR 识别错误已修正，请核对原件');
    if(ranked.some(c=>c.year.length===2))warnings.push('小票两位年份按 20xx 理解，请核对年份');
    if(ranked.some(c=>c.ambiguous))warnings.push('数字日期按英国日/月/年理解，请核对');
    if(!best)warnings.push(unique.length?'只识别到到期等非消费日期，请手动填写费用日期':'未识别出完整日期，请手动填写');
    if(unique.length>1)warnings.push(conflict?'出现多个日期且无法确定费用日期，请点击候选或手动选择':'出现多个日期，请核对消费/交易日期，勿选优惠到期日');
    // Dates with a suspicious or repaired year stay as candidates for the user to pick.
    const autoFill=best&&!conflict&&best.score>0&&!/年份/.test(best.kind);
    if(best&&!autoFill&&!conflict&&/年份/.test(best.kind))warnings.push('日期年份可能识别有误，请点击候选或手动填写');
    return {date:autoFill?best.date:'',dates:unique.map(c=>c.date),dateCandidates:unique.map(({date,source,kind,eligible,corrected})=>({date,source,kind,eligible,corrected})),warnings,moneyLines};
  }
  // ---- Merchant: brand dictionary, web domain, company suffix, then a clean header line ----
  const BRANDS=[
    ['Tesco',['tesco','tescoexpress','tescoextra']],['麦当劳',['mcdonalds','mcdonald','mcdfoodforthought','麦当劳']],["Sainsbury's",['sainsburys','sainsbury']],
    ['ASDA',['asda','asdastores']],['Costco',['costco','costcowholesale']],['Marks & Spencer',['marksspencer','marksandspencer']],
    ['Waitrose',['waitrose']],['Morrisons',['morrisons']],['Aldi',['aldi']],['Lidl',['lidl']],['Co-op',['coop','cooperative']],
    ['Iceland',['icelandfoods']],['Budgens',['budgens']],['Boots',['bootsuk','bootsthechemist','boots*']],['Superdrug',['superdrug']],['WHSmith',['whsmith']],
    ['Pret A Manger',['pretamanger','pretamange']],['Greggs',['greggs']],['Costa Coffee',['costacoffee','costa*']],['Starbucks',['starbucks']],
    ['Caffè Nero',['caffenero','caffènero','cafenero']],['Esquires Coffee',['esquires']],['Leon',['leonrestaurants','leon*']],['Itsu',['itsu*']],
    ['Wasabi',['wasabi*']],['Burger King',['burgerking']],['KFC',['kfc','kentuckyfried']],['Popeyes',['popeyes']],['Five Guys',['fiveguys']],
    ["Nando's",['nandos']],['Wagamama',['wagamama']],['Pizza Express',['pizzaexpress']],['Prezzo',['prezzo']],['Honest Burgers',['honestburgers']],
    ['Slim Chickens',['slimchickens']],['Subway',['subway*']],['Tim Hortons',['timhortons']],['Taco Bell',['tacobell']],["Domino's",['dominos']],
    ['Pizza Hut',['pizzahut']],['Wetherspoon',['wetherspoon','jdwetherspoon']],['Shell',['shellretail']],['Esso',['esso*']],
    ['B&Q',['bandq','diy.com','bq']],['Screwfix',['screwfix']],['Argos',['argos']],['IKEA',['ikea']],['Primark',['primark']],
    ['Transport for London',['transportforlondon','transporttransport','forlondonforlondon','tfl']],['Trainline',['trainline']],['GWR',['greatwesternrailway','gwr']],
    ['South Western Railway',['southwesternrailway']],['Avanti West Coast',['avantiwestcoast']],['LNER',['lner']],
    ['Uber',['uber*']],['Bolt',['boltservices']],['Heathrow',['heathrow']],['NCP',['ncp']],['RingGo',['ringgo']],['PayByPhone',['paybyphone']],
    ['JustPark',['justpark']],['YourParkingSpace',['yourparkingspace']],["Gail's",['gailsbakery']],['Joe & The Juice',['joeandthejuice','joethejuice']],
    ['Premier Inn',['premierinn']],['Travelodge',['travelodge']],['Kineya',['kineya']],['Three Uncles',['threeuncles']],['Pho',['phot2*']],['Seesam Empire',['seesamempire','seesam']],['Kokoro',['kokoro']],['Poppins',['poppins']],['Prezzo Italian',['pfitalian']],['Wenzels',['wenzels']]
  ];
  const squash=s=>String(s).toLowerCase().replace(/(?<=[a-z])0|0(?=[a-z])/g,'o').normalize('NFKC').replace(/&/g,'and').replace(/[’'`]/g,'').replace(/[^a-z0-9\u4e00-\u9fff.]+/g,'');
  function editDistance1(a,b){if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}return edits+(a.length-i)+(b.length-j)<=1;}
  // Keys ending in "*" are ordinary words (costa, wasabi, esso...) and only count in the receipt header.
  function brandIn(line,inHeader){
    const lower=String(line).toLowerCase().replace(/(?<=[a-z])0|0(?=[a-z])/g,'o');
    const flat=squash(line),words=lower.replace(/[^a-z]+/g,' ').split(' ').filter(w=>w.length>=5);
    for(const [name,rawKeys] of BRANDS)for(const raw of rawKeys){
      // Ordinary-word brands must also stand alone: a short line without prices.
      if(raw.endsWith('*')&&(!inHeader||/\d[.,]\d{2}/.test(line)||String(line).trim().split(/\s+/).length>4))continue;const key=raw.replace('*','');
      // Short keys must be whole words to avoid matching inside other words.
      if(key.length<=4){if(new RegExp('(^|[^a-z])'+key.replace('.','\\.')+'([^a-z]|$)','i').test(lower.replace(/[’'`]/g,'').replace(/&/g,'and')))return name;continue;}
      if(flat.includes(key))return name;
      if(key.length>=6&&/^[a-z]+$/.test(key)&&words.some(w=>editDistance1(w,key)))return name;
    }
    return '';
  }
  const PLACE=/^(?:[A-Za-z]{0,3}\s)?(?:farnborough|hampshire|camberley|surrey|berkshire|windsor|middlesex|hayes|staines|uxbridge|ealing|london|kingston(?:\s*upon\s*thames)?|queensmead|kingsmead|united\s*kingdom|england|uk|gb)(?:\s+[A-Za-z]{1,3})*\.?$|shopping\s*cent|\bunit\b|\broad\b|\bstreet\b|town\s*centre|\bdine\s*in\b|\bitem\b|\bprice\b|restart|mastercard|contactless|transferable|not\s*for\s*travel/i;
  function cleanHeader(line){
    const s=line.replace(/[^A-Za-z\u4e00-\u9fff&' .-]/g,' ').replace(/\s+/g,' ').trim();
    const letters=(line.match(/[A-Za-z\u4e00-\u9fff]/g)||[]).length,words=s.split(' ').filter(w=>/^[A-Za-z&'.-]{3,}$/.test(w)&&/[aeiouy]/i.test(w));
    if(letters<4||letters/line.replace(/\s/g,'').length<0.75||!words.length||s.split(' ').length>6)return '';
    if(PLACE.test(s))return '';
    if(/receipt|invoice|发票|收据|\btax\b|\bvat\b|\bdate\b|\btotal\b|welcome|thank|order|table|server|cashier|tel\b|phone|store\s*no|www|http|street|road|\blane\b|\bavenue\b|london|customer|copy|merchant|terminal|location|purchase|parking|general|take\s*away|eat\s*in|survey|feedback/i.test(s))return '';
    return s;
  }
  function merchantCandidates(lines){
    const found=[],add=(name,score,why)=>{if(name&&!found.some(f=>f.name.toLowerCase()===name.toLowerCase()))found.push({name,score,why});};
    const totalAt=lines.findIndex(l=>/\btotal\b|合计|实付/i.test(l)),hits=new Map();
    lines.forEach((line,i)=>{if(/www\.|https?:|visit|thank|clubcard|nectar|saving|优惠/i.test(line))return;const b=brandIn(line,i<10);if(b){const h=hits.get(b)||{first:i,count:0,beforeTotal:totalAt<0||i<totalAt};h.count++;hits.set(b,h);}});
    // A brand seen only below the total (adverts, other shops) ranks under a clean header line.
    for(const [b,h] of hits)add(b,h.beforeTotal||h.count>1?100-Math.min(h.first,40)+Math.min(h.count-1,4)*5:32,'品牌');
    lines.forEach((line,i)=>{const m=line.toLowerCase().match(/(?:www\.|@)?([a-z0-9-]{3,})\.(?:co\.uk|com|uk|org\.uk|net)\b/);
      if(m&&!/^(gov|google|facebook|instagram|tripadvisor|justeat|deliveroo|ubereats|survey|feedback|mail|gmail|outlook|hotmail|tellus|vatreg|receipt|order|survey|foodforthought|myopinion|paypal|apple|microsoft|amazon|visa|mastercard)/.test(m[1]))add(m[1].replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),totalAt>=0&&i>totalAt?29:70-Math.min(i,30)/2,'网址');});
    lines.slice(0,25).forEach((line,i)=>{const m=line.match(/([A-Z][A-Za-z&'.\- ]{2,40}?)\s+(?:Ltd|LTD|Limited|LIMITED|PLC|plc)\b/);if(m&&cleanHeader(m[1]))add(m[1].trim()+' Ltd',60-i,'公司名');});
    let header=lines.slice(0,10);const body=header.findIndex(l=>/(?<![\d.])\d+[.,]\d{2}(?!\d)|\btotal\b/i.test(l));if(body>=0)header=header.slice(0,body);
    header.forEach((line,i)=>{const c=cleanHeader(line);if(c)add(c,40-i*3,'抬头');});
    return found.sort((a,b)=>b.score-a.score);
  }
  function merchantFrom(lines){const c=merchantCandidates(lines);return c.length&&c[0].score>=30?c[0].name:'';}
  // ---- Amount: classify lines, vote across total/payment lines, cross-check arithmetic ----
  const HEADER=/\b(qty|quantity|description|item)\b.*\b(price|total|amount)\b|\bprice\b.*\btotal\b/i;
  const SUBTOTAL=/sub\s*-?\s*t[a-z]{2,4}[l1\]|]|小计/i;
  const NEGATIVE=/sub\s*-?\s*t[a-z]{2,4}[l1\]|]|小计|\bvat\b|\btax(?:able)?\b|\bnet\b|zero\s*rated|税|change(?:\s*due)?|找零|找赎|tendered|tenderad|\bcash\b|saving|discount|promotion|\boffer|coupon|voucher|clubcard|nectar|优惠|折扣|\bpoints\b|\bitems?\b|quantity|\btip\b|gratuity|service\s*charge|deposit|balance\s*(?:b\/?f|brought|remaining)|\beach\b|@/i;
  const TOTAL=/grand\s*total|\btotal\b|\btot\s*al\b|amount\s*(?:due|paid|payable)|b\s?a\s?l\s?a\s?n\s?c\s?e\s*(?:due|to\s*pay)?\b|to\s*pay\b|a?m[o0]unt\s*[:;]|^\s*amount\b|价税合计|实付|应付|合计|总\s*金\s*额|总\s*计|总\s*额/i;
  const PAYMENT=/pay[a-z]{2,4}t\b|\b(?:card|visa|master\s*card|mastercard|amex|american\s*express|maestro|debit|credit|contactless|apple\s*pay|google\s*pay|chip|payment|paid|charged|auth(?:orised|orized)?|sale|received|purchase)\b/i;
  const MONEY=/(?<![\d.])([£€¥￥$¢]\s*)?((?:\d{1,3}(?:,\d{3})+|\d{1,6})\s?\.\s?\d{2}|\d{1,6},\d{2})(?![\d])/g;
  function moneyValues(line){
    const out=[];let m;MONEY.lastIndex=0;
    while((m=MONEY.exec(line))){
      if(/[-−]\s*[£€¥￥$¢]?\s*$/.test(line.slice(0,m.index)))continue;
      let v=m[2].replace(/\s/g,'');v=/,\d{2}$/.test(v)&&!v.includes('.')?v.replace(',','.'):v.replace(/,/g,'');
      try{minor(v);out.push({value:v,symbol:!!m[1]});}catch(_){}
    }
    return out;
  }
  function amountCandidates(lines,moneyLines,warnings){
    const pool=new Map(),subtotals=[],savings=[],tenders=[],totals=[];
    const add=(value,base,kind,source,repaired)=>{const k=minor(value);const c=pool.get(k)||{value:money(k),score:-999,kinds:new Set(),hits:0,source,repaired:false};if(kind!=='other')c.strong=(c.strong||0)+1;
      if(base>c.score){c.score=base;c.source=source;c.repaired=!!repaired;}c.kinds.add(kind);c.hits++;pool.set(k,c);};
    let totalOrder=0;
    lines.forEach((line,i)=>{
      // OCR often reads "£1" as "£]" or "£|".
      let amountLine=(moneyLines[i]||line).replace(/([£€])\s*[\]|lI!]\s*(?=\d[.,]\s?\d{2})/g,'$11');
      if(TOTAL.test(line)||PAYMENT.test(line))amountLine=amountLine.replace(/(?<![\w.])([£€¥￥$]?\s*[0-9OoIl|]{1,9}\s*[.,]\s*[0-9OoIl|]{2})(?![\w.])/g,token=>{
        if(!/\d/.test(token))return token;const fixed=token.replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').replace(/\s*([.,])\s*/g,'$1');
        if(fixed!==token)warnings.push('总额中的疑似 OCR 字符或小数空格已修正，请对照原件核对');return fixed;});
      let vals=moneyValues(amountLine);
      const header=HEADER.test(line)&&!/total\s*(?:to\s*pay|due|paid|amount)/i.test(line);
      const negative=NEGATIVE.test(line.replace(/\b(?:card|visa|amex|debit|credit)\s+tendered/i,'card paid'))&&!/total\s*(?:incl|including)|价税合计/i.test(line)&&!/^\s*(?:total|amount)\s*(?:to\s*pay|due|paid)\b/i.test(line);
      const isTotal=!header&&!negative&&TOTAL.test(line),isPayment=!header&&!negative&&!isTotal&&(PAYMENT.test(line)||/\d[.,]\s?\d{2}\s*GBP\b|\bGBP\s*\d/i.test(line)&&(/a?m[o0]unt|charge|paid|\bfee|tarif/i.test(line)||/^\W*(?:GBP)?\s*\d+[.,]\s?\d{2}\s*(?:GBP)?\W*$/i.test(line)))&&!/card\s*(?:number|no\b)|xxxx|\*{4}/i.test(line.replace(/\d[.,]\d{2}.*/,''));
      // Split payments (cash + card, voucher + card) are collected to check against totals.
      if(/\bcash\b|voucher|coupon|gift\s*card|现金|券|\bcard\b|visa|master|amex|american\s*express|debit|contactless/i.test(line)&&!/change|找零|tendered|card\s*(?:number|no\b)/i.test(line))moneyValues(amountLine).forEach(v=>tenders.push(minor(v.value)));
      if(SUBTOTAL.test(line))vals.forEach(v=>subtotals.push(minor(v.value)));
      if(/saving|discount|promotion|优惠|折扣/i.test(line)){const m=line.match(/-\s*[£€$]?\s*(\d+[.,]\d{2})/);if(m)savings.push(minor(m[1].replace(',','.')));}
      // A label alone on its line: take a bare amount from the next line only.
      if(!vals.length&&(isTotal||isPayment)&&moneyLines[i+1]&&/^[^A-Za-z]*\d+[.,]\s?\d{2}[^A-Za-z]*$/.test(moneyLines[i+1]))vals=moneyValues(moneyLines[i+1]);
      // "Total Operator Charges" style lines are partial totals; a bare "Total £x" is the final one.
      const partial=/\btotal\s+(?!to\b|due\b|paid\b|amount\b|incl)[a-z]{3,}\s+(?:[a-z]+\s+)?(?:charges?|items?|fees?|cost)\b/i.test(line);
      const base=isTotal?(partial?92:/grand\s*total|total\s*(?:to\s*pay|due|paid|amount)|amount\s*(?:due|paid)|balance\s*due|实付|价税合计|^\W*total\s*[:：]?\s*[£€$]?\s*\d/i.test(line)?110:100):isPayment?90:negative||header?-1:5;
      if(base<0)return;
      vals.forEach((v,j)=>{
        const kind=isTotal?'total':isPayment?'payment':'other',last=j===vals.length-1;
        add(v.value,base-(last?0:35)+(isTotal?Math.min(totalOrder,3)*4:0),kind,line.slice(0,120));
        // OCR often reads "£" as 8, 2, 6 or E: offer the value without that leading digit.
        if((isTotal||isPayment)&&!v.symbol&&/^[25689]\d+\.\d{2}$/.test(v.value)&&minor(v.value)>=1000&&/[1-9]/.test(v.value.slice(1).split('.')[0]+v.value.slice(-2)))add(v.value.slice(1),base-45,kind,line.slice(0,120),true);
      });
      if(isTotal&&vals.length){totalOrder++;totals.push(minor(vals[vals.length-1].value));}
    });
    const saved=savings.reduce((a,b)=>a+b,0);
    for(const [k,c] of [...pool]){
      // A repaired value is only kept when another line shows the same amount.
      if(c.repaired&&(c.strong||0)<2){pool.delete(k);continue;}
      if(c.kinds.has('total')&&c.kinds.has('payment'))c.score+=45;
      else if((c.strong||0)>1&&c.score>=90)c.score+=15;
      if(saved>0&&(subtotals.some(s=>s-saved===k)||totals.some(t=>t-saved===k))){c.score+=35;c.support=true;}
      else if(c.score>=90&&subtotals.includes(k)){c.score+=20;c.support=true;}
      if(c.kinds.has('total')&&tenders.some((a,i)=>tenders.some((b,j)=>j>i&&a!==k&&b!==k&&a+b===k))){c.score+=60;c.support=true;}
    }
    const ranked=[...pool.values()].filter(c=>c.score>0).sort((a,b)=>b.score-a.score||minor(b.value)-minor(a.value));
    if(ranked.some(c=>c.repaired&&c===ranked[0]))warnings.push('总额前疑似把 £ 识别成数字，已给出修正候选，请核对原件');
    return ranked;
  }
  function parse(text,opts={}){
    // Some OCR engines glue the year to the time ("Jul202613:03", "20/07/202610:17AM").
    text=String(text||'').replace(/\r/g,'').replace(/((?:19|20)\d{2})(?=\d{1,2}:\d{2})/g,'$1 ');const dateResult=receiptDates(text,opts),dates=dateResult.dates,warnings=[...dateResult.warnings];
    const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
    const ranked=amountCandidates(lines,dateResult.moneyLines,warnings),top=ranked[0],second=ranked[1];
    // Fill automatically only when the best value is a labelled total/payment and clearly ahead.
    // A lone total that disagrees with a lone card payment is ambiguous (one of them is misread).
    const uncorroborated=c=>c&&(c.strong||0)<=1&&!c.support;
    const clash=top&&second&&second.score>=90&&uncorroborated(top)&&uncorroborated(second)&&[...top.kinds][0]!==[...second.kinds][0];
    const confident=top&&top.score>=90&&!clash&&(!second||second.score<90||top.score-second.score>=20);
    const amounts=ranked.slice(0,8).map(c=>c.value);
    if(!top)warnings.push('未识别出金额，请手动填写');
    else if(!confident)warnings.push(top.score>=90?'出现多个合计金额，请点击候选或手动填写实际付款总额':'未找到明确的总额字段，请点击候选或手动填写');
    const merchants=merchantCandidates(lines),merchant=merchants.length&&merchants[0].score>=30?merchants[0].name:'';
    warnings.push(merchant?'商家名称为候选结果，请核对；所在地需手动填写':'未能可靠识别商家，请点击候选或手动填写');
    return {date:dateResult.date,amount:confident?top.value:'',merchant,dates,dateCandidates:dateResult.dateCandidates,amounts,merchants:merchants.slice(0,4).map(m=>m.name),warnings:[...new Set(warnings)]};
  }
  function filter(rows,{from='',to='',category='all',search=''}={}){
    const q=search.trim().toLowerCase();return rows.filter(r=>!r.deletedAt&&(!from||r.date>=from)&&(!to||r.date<=to)&&(category==='all'||r.category===category)&&(!q||`${r.merchant} ${r.location||''} ${r.note||''}`.toLowerCase().includes(q))).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  }
  function totals(rows){const out={};rows.forEach(r=>{out[r.currency]=(out[r.currency]||0)+Number(r.amountMinor);});return out;}
  const MEAL_DAILY_LIMIT_MINOR=5000;
  const CITY_MONTHLY_LIMIT_MINOR=15000;
  function monthlyTransportBudgets(rows){
    const months=new Map();
    for(const r of rows||[]){
      const confirmed=r.confirmed===true||(r.confirmed===undefined&&Array.isArray(r.documents));
      if(r.deletedAt||!confirmed||r.category!==CATEGORIES[0]||!validDate(r.date)||!Number.isSafeInteger(r.amountMinor)||r.amountMinor<=0)continue;
      const month=r.date.slice(0,7),t=months.get(month)||{month,totalMinor:0,receiptIds:[]};
      t.totalMinor+=r.amountMinor;t.receiptIds.push(r.id);months.set(month,t);
    }
    return [...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(t=>({...t,limitMinor:CITY_MONTHLY_LIMIT_MINOR,remainingMinor:Math.max(0,CITY_MONTHLY_LIMIT_MINOR-t.totalMinor),overMinor:Math.max(0,t.totalMinor-CITY_MONTHLY_LIMIT_MINOR)}));
  }
  function tripBudgets(rows,days){
    const dates=Object.keys(days||{}).filter(d=>days[d]==='business'&&validDate(d)).sort(),trips=[];
    for(const date of dates){
      const last=trips.at(-1);
      if(last&&Date.parse(date+'T00:00:00Z')-Date.parse(last.to+'T00:00:00Z')===86400000){last.to=date;last.days++;}
      else trips.push({from:date,to:date,days:1,totalMinor:0,receiptIds:[]});
    }
    for(const r of rows||[]){
      const confirmed=r.confirmed===true||(r.confirmed===undefined&&Array.isArray(r.documents));
      if(r.deletedAt||!confirmed||r.category!==CATEGORIES[2]||!validDate(r.date)||!Number.isSafeInteger(r.amountMinor)||r.amountMinor<=0)continue;
      const trip=trips.find(t=>r.date>=t.from&&r.date<=t.to);
      if(trip){trip.totalMinor+=r.amountMinor;trip.receiptIds.push(r.id);}
    }
    return trips.map(t=>({...t,limitMinor:t.days*MEAL_DAILY_LIMIT_MINOR,remainingMinor:Math.max(0,t.days*MEAL_DAILY_LIMIT_MINOR-t.totalMinor),overMinor:Math.max(0,t.totalMinor-t.days*MEAL_DAILY_LIMIT_MINOR)}));
  }
  function receiptDuplicates(draft,rows){
    const hashes=new Set();let repeatedAttachments=0;
    const documents=Array.isArray(draft.documents)?draft.documents:[];
    for(const d of documents){if(!/^[a-f0-9]{64}$/i.test(d.sha256||''))continue;if(hashes.has(d.sha256))repeatedAttachments++;hashes.add(d.sha256);}
    let amountMinor=null;try{amountMinor=draft.amount!==undefined?minor(draft.amount):draft.amountMinor;}catch(_){}
    const normalize=s=>{s=String(s||'').normalize('NFKC').trim();return (merchantFrom([s])||s).toLowerCase().replace(/[\s'’._-]/g,'');};
    const merchant=normalize(draft.merchant);
    const matches=[];
    for(const r of rows||[]){
      if(draft.id&&r.id===draft.id)continue;
      const other=Array.isArray(r.documents)?r.documents:[],sameFile=other.some(d=>hashes.has(d.sha256))||(r.sha256&&hashes.has(r.sha256));
      const sameFields=validDate(draft.date)&&draft.date===r.date&&Number.isSafeInteger(amountMinor)&&amountMinor>0&&amountMinor===r.amountMinor&&merchant&&merchant===normalize(r.merchant);
      if(sameFile||sameFields)matches.push({id:r.id,date:r.date,merchant:r.merchant,category:r.category,amountMinor:r.amountMinor,kind:sameFile?'file':'fields'});
    }
    return {matches,repeatedAttachments};
  }
  // Home-screen summary: which period and category the headline total covers.
  const SUMMARY_PERIODS=[['thisMonth','本月'],['lastMonth','上月'],['calendarMonth','日历所选月份'],['thisYear','今年'],['all','全部时间']];
  function summaryRange(period,today,viewMonth){
    const pad=n=>String(n).padStart(2,'0'),end=(y,m)=>`${y}-${pad(m)}-${pad(new Date(Date.UTC(y,m,0)).getUTCDate())}`;
    const t=validDate(today)?today:new Date().toISOString().slice(0,10),y=Number(t.slice(0,4)),m=Number(t.slice(5,7));
    if(period==='lastMonth'){const ly=m===1?y-1:y,lm=m===1?12:m-1;return {period,from:`${ly}-${pad(lm)}-01`,to:end(ly,lm),label:`上月（${ly}年${lm}月）`};}
    if(period==='calendarMonth'&&/^\d{4}-\d{2}$/.test(viewMonth||'')){const vy=Number(viewMonth.slice(0,4)),vm=Number(viewMonth.slice(5));return {period,from:viewMonth+'-01',to:end(vy,vm),label:`${vy}年${vm}月（日历所选）`};}
    if(period==='thisYear')return {period,from:`${y}-01-01`,to:`${y}-12-31`,label:`今年（${y}年）`};
    if(period==='all')return {period,from:'',to:'',label:'全部时间'};
    return {period:'thisMonth',from:`${y}-${pad(m)}-01`,to:end(y,m),label:`本月（${y}年${m}月）`};
  }
  function summarize(rows,{period='thisMonth',category='all',today='',viewMonth=''}={}){
    const r=summaryRange(period,today,viewMonth),cat=category==='all'||CATEGORIES.includes(category)?category:'all';
    const list=(rows||[]).filter(x=>!x.deletedAt&&validDate(x.date||'')&&(!r.from||x.date>=r.from)&&(!r.to||x.date<=r.to)&&(cat==='all'||x.category===cat)&&Number.isSafeInteger(x.amountMinor)&&x.amountMinor>0);
    return {...r,category:cat,categoryLabel:cat==='all'?'全部类别':cat,count:list.length,totalMinor:list.reduce((n,x)=>n+x.amountMinor,0)};
  }
  const api={SUMMARY_PERIODS,summaryRange,summarize,CATEGORIES,MEAL_MERCHANTS,MEAL_DAILY_LIMIT_MINOR,CITY_MONTHLY_LIMIT_MINOR,monthlyTransportBudgets,tripBudgets,receiptDuplicates,exportNames,iso,validDate,minor,money,parse,filter,totals};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReceiptParser=api;
})(typeof window!=='undefined'?window:globalThis);
