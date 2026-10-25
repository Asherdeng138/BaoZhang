// Executes the SQL copied directly from ReceiptStore.java, not Android Java/bridge code.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/java/com/asher/baozhang/ReceiptStore.java'),'utf8');
const table=source.match(/db\.execSQL\("(CREATE TABLE receipts[^"\n]+)"\)/)[1];
test('Android v1 upgrade adds archive/trash columns without changing existing receipts',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec(table.replace(',archivedAt INTEGER NOT NULL DEFAULT 0,deletedAt INTEGER NOT NULL DEFAULT 0',''));
  db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('original','2026-10-10',24000,'GBP','出差餐补','Costco','London','original note','original OCR','[{"name":"original.jpg"}]',1000,2000);
  const previous=db.prepare('SELECT * FROM receipts').get();
  const upgrades=[...source.matchAll(/db\.execSQL\("(ALTER TABLE receipts[^"\n]+)"\)/g)].map(m=>m[1]);assert.equal(upgrades.length,2);
  for(const sql of upgrades)db.exec(sql);
  const row=db.prepare('SELECT * FROM receipts').get();assert.equal(row.archivedAt,0);assert.equal(row.deletedAt,0);
  delete row.archivedAt;delete row.deletedAt;assert.deepEqual(row,previous);
 }finally{db.close();}
});
test('new Android databases have the same additive columns and defaults as upgraded databases',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec(table);const columns=db.prepare('PRAGMA table_info(receipts)').all();for(const name of ['archivedAt','deletedAt']){const column=columns.find(c=>c.name===name);assert.equal(column.type,'INTEGER');assert.equal(column.notnull,1);assert.equal(column.dflt_value,'0');}}finally{db.close();}
});
