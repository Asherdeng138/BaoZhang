const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../app/src/main/assets/parser.js');
test('UK total is chosen instead of subtotal, VAT, cash tendered, change',()=>{
 const r=P.parse('TESCO\nLondon\n09/10/2026\nSubtotal 10.67\nVAT 2.13\nTOTAL £12.80\nCash tendered 20.00\nChange 7.20');
 assert.equal(r.date,'2026-10-09');assert.equal(r.amount,'12.80');assert.equal(r.merchant,'TESCO');
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
