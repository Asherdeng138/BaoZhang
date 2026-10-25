const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../app/src/main/assets/parser.js');
test('UK total is chosen instead of subtotal, VAT, cash tendered, change',()=>{
 const r=P.parse('TESCO\nLondon\n09/10/2026\nSubtotal 10.67\nVAT 2.13\nTOTAL £12.80\nCash tendered 20.00\nChange 7.20');
 assert.equal(r.date,'2026-10-09');assert.equal(r.amount,'12.80');assert.equal(r.merchant,'Tesco');
});
test('ambiguous UK numeric date is flagged',()=>{const r=P.parse('Shop\n04/05/2026\nTOTAL £9.00');assert.equal(r.date,'2026-05-04');assert.ok(r.warnings.some(w=>w.includes('英国')));});
test('English month name and split-line total',()=>{const r=P.parse('Great Western Railway\n9 Oct 2026\nAmount paid\n£32.40');assert.equal(r.date,'2026-10-09');assert.equal(r.amount,'32.40');});
test('Chinese date and total',()=>{const r=P.parse('测试餐厅\n2026年10月9日\n小计 10.00\n实付 £12.80');assert.equal(r.date,'2026-10-09');assert.equal(r.amount,'12.80');});
test('ISO date and thousand separators',()=>{const r=P.parse('Office Shop\n2026-10-09\nGRAND TOTAL £1,234.56');assert.equal(r.date,'2026-10-09');assert.equal(r.amount,'1234.56');});
test('missing date does not become today',()=>{const r=P.parse('Shop\nTOTAL £10.00');assert.equal(r.date,'');});
test('invalid leap dates are not silently normalized',()=>{assert.equal(P.validDate('2025-02-29'),false);assert.equal(P.validDate('2024-02-29'),true);assert.equal(P.parse('Shop\n31/04/2026\nTOTAL £9.00').date,'');});
test('decimal comma is normalized',()=>{assert.equal(P.parse('Shop\nTOTAL £12,80').amount,'12.80');});
test('duplicate totals require review',()=>{assert.ok(P.parse('Grand Total £30.00\nAmount paid £20.00').warnings.some(w=>w.includes('多个合计')));});
test('amounts use exact pence and reject partial or invalid input',()=>{assert.equal(P.minor('0.29'),29);assert.equal(P.minor('15.9'),1590);for(const s of ['-1','1.234','2abc','0','1,200.00','NaN'])assert.throws(()=>P.minor(s));});
test('category then inclusive dates excludes other categories and nearby dates',()=>{
 const rows=[{id:'1',date:'2026-10-01',category:P.CATEGORIES[0]},{id:'2',date:'2026-10-09',category:P.CATEGORIES[0]},{id:'3',date:'2026-10-09',category:P.CATEGORIES[1]},{id:'4',date:'2026-10-10',category:P.CATEGORIES[0]}];
 assert.deepEqual(P.filter(rows,{category:P.CATEGORIES[0],from:'2026-10-01',to:'2026-10-09'}).map(r=>r.id),['1','2']);
});
test('merchant and note search',()=>{const rows=[{id:'1',date:'2026-10-01',category:P.CATEGORIES[0],merchant:'TfL',location:'London',note:'Hanger Lane'}];assert.equal(P.filter(rows,{search:'hanger'}).length,1);});
test('meal merchant names survive header noise and common OCR brand variants',()=>{
 for(const [raw,expected] of [['TESC0','Tesco'],["Mc Donald’s",'麦当劳'],['MCD0NALDS','麦当劳'],['SAINSBURYS',"Sainsbury's"],['ASDA','ASDA'],['COSTC0 WHOLESALE','Costco']]){
  const r=P.parse('RECEIPT\nVAT INVOICE\nDate\nStore No 20\nTel 020 1234\nWelcome\n'+raw+'\nTOTAL £12.80');assert.equal(r.merchant,expected);
 }
 assert.equal(P.parse('ASDA\nTesco product 2.00\nTOTAL £2.00').merchant,'ASDA');
 assert.equal(P.parse('Independent Cafe\nTOTAL £5.00\nVisit www.tesco.com').merchant,'Independent Cafe');
 assert.equal(P.parse('Independent Cafe\nTOTAL £5.00\nASDA').merchant,'Independent Cafe');
});
test('amount extraction excludes total savings and tax, handles split total and OCR characters',()=>{
 assert.equal(P.parse('ASDA\nTOTAL SAVINGS £30.00\nTOTAL VAT £2.13\nTOTAL TO PAY\n£12.80\nCARD £12.80').amount,'12.80');
 const r=P.parse('McDonalds\nTOTAL £I2.8O');assert.equal(r.amount,'12.80');assert.ok(r.warnings.some(w=>w.includes('OCR')));
 assert.equal(P.parse('Tesco\nTOTAL 12 . 80').amount,'12.80');
 assert.equal(P.parse('Shop\nTOTAL -£12.80').amount,'');
 assert.equal(P.parse('Shop\nTOTAL £20.00\nCARD £10.00\nCASH £10.00').amount,'20.00');
});
test('export filenames describe the chosen range, category and document type',()=>{
 assert.deepEqual(P.exportNames(P.CATEGORIES[2],'2026-09-30','2026-10-10'),{base:'2026-09-30至2026-10-10_出差餐补报账',pdf:'2026-09-30至2026-10-10_出差餐补报账_发票合集.pdf',xlsx:'2026-09-30至2026-10-10_出差餐补报账_明细汇总.xlsx'});
 assert.equal(P.exportNames(P.CATEGORIES[0],'2026-10-10','2026-10-10').pdf,'2026年10月_市内交通报账_发票合集.pdf');
 assert.equal(P.exportNames(P.CATEGORIES[0],'2026-01-02','2026-01-28').xlsx,'2026年1月_市内交通报账_明细汇总.xlsx');
 assert.equal(P.exportNames(P.CATEGORIES[0],'2026-10-10','2026-11-20').base,'2026年10月至11月_市内交通报账');
 assert.equal(P.exportNames(P.CATEGORIES[0],'2026-12-10','2027-01-20').base,'2026年12月至2027年1月_市内交通报账');
 for(const args of [['../x','2026-10-01','2026-10-10'],[P.CATEGORIES[0],'2026-02-30','2026-10-10'],[P.CATEGORIES[0],'2026-10-11','2026-10-10']])assert.throws(()=>P.exportNames(...args));
});
test('receipt dates support spaces, short years, ordinal days, Sept and full-width text',()=>{
 for(const [text,date] of [
  ['09 / 10 / 2026 18:35','2026-10-09'],['09-10-26','2026-10-09'],['Date: 9 10 26','2026-10-09'],
  ['09 10 2026','2026-10-09'],['2026 10 09','2026-10-09'],['9th Oct. 2026','2026-10-09'],
  ['Oct. 9th, 2026','2026-10-09'],['09 Sept 26','2026-09-09'],['０９／１０／２０２６','2026-10-09'],
  ['2026-10-09T18:35:00','2026-10-09'],['Date: 09102026','2026-10-09'],['Date: 20261009','2026-10-09']
 ])assert.equal(P.parse('Tesco\n'+text+'\nTOTAL £12.80').date,date,text);
 assert.ok(P.parse('09/10/26').warnings.some(w=>w.includes('20xx')));
});
test('receipt dates repair only date-like OCR tokens and preserve source for review',()=>{
 const r=P.parse('ASDA\nDate: O9 / IO / 2O26\nTOTAL £5.00');assert.equal(r.date,'2026-10-09');assert.ok(r.warnings.some(w=>w.includes('OCR')));
 assert.equal(r.dateCandidates[0].source,'Date: O9 / IO / 2O26');
 assert.equal(P.parse('09 0ct 2026').date,'2026-10-09');
 for(const text of ['Phone 02012345678','Invoice No 09102026','09/10','9 October','31/04/2026','29/02/2025','O0/IO/2O26','09/10/0009','9 October 0099','09/10/2100'])assert.equal(P.parse(text).date,'',text);
 assert.equal(P.parse('29/02/2024').date,'2024-02-29');
});
test('transaction dates outrank expiry and invoice dates independent of date format order',()=>{
 const r=P.parse('Coupon expiry: 2026-12-31\nInvoice date: 08/10/2026\nTransaction date: 09/10/2026');
 assert.equal(r.date,'2026-10-09');assert.equal(r.dateCandidates.find(c=>c.date==='2026-12-31').eligible,false);
 assert.equal(P.parse('Valid until 31/12/2026').date,'');
 assert.equal(P.parse('Expiry\n31/12/2026\nTransaction date\n09/10/2026').date,'2026-10-09');
 assert.equal(P.parse('Valid until 31/12/2026; Transaction date 09/10/2026').date,'2026-10-09');
});
test('equally plausible different dates require a choice rather than silently picking a format',()=>{
 const r=P.parse('09/10/2026\n2026-10-08');assert.equal(r.date,'');assert.deepEqual(new Set(r.dates),new Set(['2026-10-09','2026-10-08']));assert.ok(r.warnings.some(w=>w.includes('无法确定')));
 assert.equal(P.parse('Date 09/10/2026\n09 Oct 2026').date,'2026-10-09');
});
test('dot-separated dates cannot be mistaken for amounts, even on the same line as a total',()=>{
 for(const text of ['Receipt date 09.10.26','Date: 31.04.2026','09.10.2026'])assert.equal(P.parse(text).amount,'',text);
 assert.equal(P.parse('TOTAL £12.80 Date: 09.10.26').amount,'12.80');
 assert.equal(P.parse('Date: 09.10.26 TOTAL £12.80').amount,'12.80');
});
test('meal budgets pool continuous business days and ignore other categories or pending receipts',()=>{
 const days={'2026-10-09':'business','2026-10-10':'business','2026-10-11':'business'},rows=[
  {id:'1',date:'2026-10-09',category:P.CATEGORIES[2],amountMinor:8000,confirmed:true},
  {id:'2',date:'2026-10-10',category:P.CATEGORIES[2],amountMinor:4000,confirmed:true},
  {id:'3',date:'2026-10-11',category:P.CATEGORIES[2],amountMinor:3000,documents:[]},
  {id:'4',date:'2026-10-10',category:P.CATEGORIES[0],amountMinor:99999,confirmed:true},
  {id:'5',date:'2026-10-10',category:P.CATEGORIES[2],amountMinor:99999,confirmed:false}
 ];
 const [t]=P.tripBudgets(rows,days);assert.equal(t.days,3);assert.equal(t.limitMinor,15000);assert.equal(t.totalMinor,15000);assert.equal(t.overMinor,0);
 rows.push({id:'6',date:'2026-10-11',category:P.CATEGORIES[2],amountMinor:1,confirmed:true});assert.equal(P.tripBudgets(rows,days)[0].overMinor,1);
});
test('office, holiday and unmarked gaps separate trips; cross-month/year and leap days remain continuous',()=>{
 const days={'2026-09-30':'business','2026-10-01':'business','2026-10-02':'office','2026-10-03':'business','2026-10-04':'holiday','2026-10-05':'business','2026-10-07':'business','bad':'business'};
 assert.deepEqual(P.tripBudgets([],days).map(t=>[t.from,t.to,t.days]),[['2026-09-30','2026-10-01',2],['2026-10-03','2026-10-03',1],['2026-10-05','2026-10-05',1],['2026-10-07','2026-10-07',1]]);
 assert.equal(P.tripBudgets([],{'2026-12-31':'business','2027-01-01':'business'})[0].limitMinor,10000);
 assert.equal(P.tripBudgets([],{'2024-02-28':'business','2024-02-29':'business','2024-03-01':'business'})[0].days,3);
 assert.deepEqual(P.tripBudgets([],{}),[]);
});
test('duplicate hints distinguish identical original files from matching fields and ignore the edited record',()=>{
 const hash='a'.repeat(64),saved=[{id:'old',date:'2026-10-09',merchant:'Costco',category:P.CATEGORIES[2],amountMinor:1280,documents:[{sha256:hash}]}];
 const draft={date:'2026-10-09',merchant:'COSTCO',amount:'12.80',documents:[{sha256:'b'.repeat(64)}]};
 assert.equal(P.receiptDuplicates(draft,saved).matches[0].kind,'fields');
 assert.equal(P.receiptDuplicates({...draft,date:'2026-10-10',documents:[{sha256:hash}]},saved).matches[0].kind,'file');
 assert.deepEqual(P.receiptDuplicates({...draft,id:'old'},saved).matches,[]);
 assert.deepEqual(P.receiptDuplicates({...draft,amount:'12.81'},saved).matches,[]);
 assert.deepEqual(P.receiptDuplicates({...draft,date:''},saved).matches,[]);
 assert.equal(P.receiptDuplicates({...draft,documents:[{sha256:hash},{sha256:hash}]},[]).repeatedAttachments,1);
});

test('city transport budgets use separate natural months, include archived receipts and exclude pending/trash or other categories',()=>{
 const row=(id,date,amountMinor,extra={})=>({id,date,amountMinor,category:P.CATEGORIES[0],confirmed:true,...extra});
 const rows=[row('a','2026-10-01',10000),row('b','2026-10-31',5100,{archivedAt:1}),row('c','2026-11-01',20000),row('pending','2026-10-01',5000,{confirmed:false}),row('trash','2026-10-01',5000,{archivedAt:1,deletedAt:2}),row('meal','2026-10-01',5000,{category:P.CATEGORIES[2]}),row('invalid','2026-02-30',5000),row('negative','2026-10-01',-1)];
 const [oct,nov]=P.monthlyTransportBudgets(rows);assert.equal(oct.month,'2026-10');assert.equal(oct.limitMinor,15000);assert.equal(oct.totalMinor,15100);assert.equal(oct.overMinor,100);assert.equal(nov.overMinor,5000);assert.deepEqual(oct.receiptIds,['a','b']);
 const exact=P.monthlyTransportBudgets([row('exact','2026-12-31',15000),row('next','2027-01-01',14999)]);assert.equal(exact[0].overMinor,0);assert.equal(exact[0].remainingMinor,0);assert.equal(exact[1].remainingMinor,1);
 assert.equal(P.monthlyTransportBudgets([{id:'android',date:'2026-10-10',category:P.CATEGORIES[0],amountMinor:10,documents:[]}])[0].totalMinor,10);assert.deepEqual(P.monthlyTransportBudgets([]),[]);
});
// 2026-10-13: field-extraction regressions found on a real receipt set (texts below are synthetic).
test('amount: item header with "Total" column never takes the next item price',()=>{
 const r=P.parse('Cafe\nQty Name Price Total\n1 Still Water 2.20 2.20\n1 Wrap 11.45 11.45\nTotal To Pay £ 13.65\nCard £13.65');
 assert.equal(r.amount,'13.65');
});
test('amount: "£" misread as a digit is repaired only when another line confirms it',()=>{
 assert.equal(P.parse('Tesco\nSubtotal: £63.86\nSavings: -£10.83\nTOTAL: 853.03\nCard £53.03').amount,'53.03');
 assert.equal(P.parse('Shop\nTOTAL: 853.03').amount,'853.03');
});
test('amount: OCR-misspelt subtotal/payment labels and split cash + card payments',()=>{
 assert.equal(P.parse('Popeyes\nSubtctal £23.37\nPaymarit £23.37\nChange Due £0.00').amount,'23.37');
 assert.equal(P.parse('ASDA\nTOTAL: £17.26\nCASH £9.27\nCARD £7.99\nTOTAL: GBP7.99').amount,'17.26');
});
test('amount: a lone total that disagrees with a lone card payment is left for the user',()=>{
 const r=P.parse('Hotel Bar\nTotal Amount 3.05\nMASTERCARD 3.75');
 assert.equal(r.amount,'');assert.deepEqual(r.amounts.slice(0,2).sort(),['3.05','3.75']);
 assert.ok(r.warnings.some(w=>w.includes('多个合计')));
});
test('amount: partial "Total ... Charges" lines lose to the final bare Total',()=>{
 assert.equal(P.parse('RingGo\nTotal Operator Charges £3.67 £0.73 £4.40\nTotal RingGo Charges £0.41 £0.09 £0.50\nTotal £4.08 £0.82 £4.90').amount,'4.90');
});
test('date: apostrophe after month, time-like two digit years and implausible OCR years',()=>{
 assert.equal(P.parse('Starbucks\n10 Aug’ 26 10:08 AM\nTotal £5.85').date,'2026-08-10');
 const parking=P.parse('Car park\npaid until: 12 Aug 12:39\n12/08/2026 11:56:39\nTotal £0.50');
 assert.equal(parking.date,'2026-08-12');assert.ok(!parking.dates.includes('2012-08-12'));
 const year=P.parse('Cafe\nDate, 13/08/2028\nTotal £5.00',{today:'2026-10-13'});
 assert.equal(year.date,'');assert.equal(year.dates[0],'2026-08-13');assert.ok(year.warnings.some(w=>w.includes('OCR')));
 assert.equal(P.parse('Greggs\nTransaction Time: 20/97/2026 10:17 AM\nTotal £7.45',{today:'2026-10-13'}).date,'2026-07-20');
});
test('merchant: brand words in items or place names are not the shop name',()=>{
 assert.equal(P.parse('Asia Oriental\nQueensmead\nFarnborough\n1 Salmon wasabi roll 4.50\nTotal £4.50').merchant,'Asia Oriental');
 assert.equal(P.parse('Farnborough\nHampshire\nTotal £4.50').merchant,'');
 assert.equal(P.parse('xx\nVAT No 123\nkineya.co.uk\nTotal £17.75').merchant,'Kineya');
});
test('parse never throws on OCR noise such as "TOTAL 80.00" or "Card 0.00"',()=>{
 for(const t of ['TOTAL 80.00\nCard 0.00','Total 20.00 Card 2.00 0.00','TOTAL: 800.00\nVISA 00.00','Total £0.00'])assert.doesNotThrow(()=>P.parse(t));
});
test('date: year glued to the time by OCR and a 2-digit year followed by a time',()=>{
 assert.equal(P.parse('Shop\nTransactionTime:20/07/202610:17AM\nTotal £1.00').date,'2026-07-20');
 assert.equal(P.parse('Shop\nAlexa 08 Jul202613:03\nTotal £1.00').date,'2026-07-08');
 assert.equal(P.parse('Shop\nCUSTOMER RECEIPT 13-07-26.15:46\nTotal £1.00').date,'2026-07-13');
});
test('home summary: chosen period and category, trash and invalid rows excluded',()=>{
 const rows=[{date:'2026-10-02',category:P.CATEGORIES[2],amountMinor:1000},{date:'2026-10-31',category:P.CATEGORIES[0],amountMinor:250},
  {date:'2026-09-30',category:P.CATEGORIES[2],amountMinor:700},{date:'2025-12-31',category:P.CATEGORIES[2],amountMinor:5},
  {date:'2026-10-05',category:P.CATEGORIES[2],amountMinor:999,deletedAt:1},{date:'',category:P.CATEGORIES[2],amountMinor:3},{date:'2026-10-06',category:P.CATEGORIES[2],amountMinor:null}];
 const o={today:'2026-10-17'};
 assert.deepEqual([P.summarize(rows,o).totalMinor,P.summarize(rows,o).count,P.summarize(rows,o).label],[1250,2,'本月（2026年10月）']);
 assert.equal(P.summarize(rows,{...o,category:P.CATEGORIES[2]}).totalMinor,1000);
 assert.equal(P.summarize(rows,{...o,period:'lastMonth'}).totalMinor,700);
 assert.equal(P.summarize(rows,{...o,period:'thisYear'}).totalMinor,1950);
 assert.equal(P.summarize(rows,{...o,period:'all'}).totalMinor,1955);
 assert.equal(P.summarize(rows,{...o,period:'calendarMonth',viewMonth:'2025-12'}).totalMinor,5);
 assert.equal(P.summarize(rows,{today:'2026-01-15',period:'lastMonth'}).label,'上月（2025年12月）');
 assert.equal(P.summarize(rows,{...o,category:'bogus'}).categoryLabel,'全部类别');
});
