// Android and Windows ship separate copies of the receipt parser; they must stay identical.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('Android parser.js and desktop parser.cjs are identical',()=>{
 const root=path.resolve(__dirname,'..');
 assert.equal(fs.readFileSync(path.join(root,'app/src/main/assets/parser.js'),'utf8'),fs.readFileSync(path.join(root,'desktop/parser.cjs'),'utf8'),'Copy app/src/main/assets/parser.js to desktop/parser.cjs');
});
test('Android and desktop receipt-ocr.js engine copies are identical',()=>{
 const root=path.resolve(__dirname,'..');
 assert.equal(fs.readFileSync(path.join(root,'app/src/main/assets/receipt-ocr.js'),'utf8'),fs.readFileSync(path.join(root,'desktop/receipt-ocr.js'),'utf8'),'Copy app/src/main/assets/receipt-ocr.js to desktop/receipt-ocr.js');
});
