package com.asher.baozhang;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

final class ReceiptStore extends SQLiteOpenHelper {
    static final Set<String> CATEGORIES=new HashSet<>(Arrays.asList("市内交通（地铁）","市外交通","出差餐补","办公用品","客户招待"));
    static final Set<String> CURRENCIES=new HashSet<>(Arrays.asList("GBP","CNY","EUR","USD","JPY","HKD"));
    ReceiptStore(Context c){super(c,"receipts.db",null,2);}
    @Override public void onCreate(SQLiteDatabase db){
        db.execSQL("CREATE TABLE receipts(id TEXT PRIMARY KEY,date TEXT NOT NULL,amountMinor INTEGER NOT NULL CHECK(amountMinor>0),currency TEXT NOT NULL,category TEXT NOT NULL,merchant TEXT NOT NULL,location TEXT NOT NULL,note TEXT NOT NULL,ocr TEXT NOT NULL,documents TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,archivedAt INTEGER NOT NULL DEFAULT 0,deletedAt INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX receipt_date ON receipts(date)");
        db.execSQL("CREATE TABLE days(date TEXT PRIMARY KEY,type TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db,int a,int b){if(a==1&&b==2){db.execSQL("ALTER TABLE receipts ADD COLUMN archivedAt INTEGER NOT NULL DEFAULT 0");db.execSQL("ALTER TABLE receipts ADD COLUMN deletedAt INTEGER NOT NULL DEFAULT 0");}else throw new IllegalStateException("不支持的数据版本");}
    synchronized JSONArray list() throws Exception {
        JSONArray out=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT * FROM receipts ORDER BY date DESC,createdAt DESC",null)){
            while(c.moveToNext()){
                JSONObject r=new JSONObject();
                for(String k:new String[]{"id","date","currency","category","merchant","location","note","ocr"})r.put(k,c.getString(c.getColumnIndexOrThrow(k)));
                for(String k:new String[]{"amountMinor","createdAt","updatedAt","archivedAt","deletedAt"})r.put(k,c.getLong(c.getColumnIndexOrThrow(k)));
                r.put("documents",new JSONArray(c.getString(c.getColumnIndexOrThrow("documents"))));out.put(r);
            }
        }return out;
    }
    synchronized JSONObject get(String id) throws Exception {JSONArray all=list();for(int i=0;i<all.length();i++)if(all.getJSONObject(i).getString("id").equals(id))return all.getJSONObject(i);throw new IllegalArgumentException("发票不存在");}
    synchronized JSONObject save(JSONObject r) throws Exception {
        String date=r.getString("date");if(!date.matches("\\d{4}-\\d{2}-\\d{2}")||!LocalDate.parse(date).toString().equals(date))throw new IllegalArgumentException("日期格式不正确");
        String amount=r.getString("amount");if(!amount.matches("\\d{1,9}(\\.\\d{1,2})?"))throw new IllegalArgumentException("金额最多两位小数");
        long minor=new BigDecimal(amount).movePointRight(2).longValueExact();if(minor<=0)throw new IllegalArgumentException("金额必须大于 0");
        if(!CATEGORIES.contains(r.getString("category")))throw new IllegalArgumentException("分类无效");
        if(!r.optBoolean("confirmed"))throw new IllegalArgumentException("请先确认发票信息");
        String merchant=r.getString("merchant").trim();if(merchant.isEmpty()||merchant.length()>200)throw new IllegalArgumentException("请填写商家或交通运营方（最多200字）");
        if(r.optString("location").length()>200||r.optString("note").length()>2000)throw new IllegalArgumentException("所在地或备注过长");
        JSONArray docs=r.getJSONArray("documents");if(docs.length()==0||docs.length()>30)throw new IllegalArgumentException("每张发票需要1至30个附件");
        String id=r.optString("id","");long now=System.currentTimeMillis(),created=now,archived=0;
        if(id.isEmpty()){id=r.optString("pendingId",UUID.randomUUID().toString());if(!id.matches("[a-fA-F0-9-]{36}"))throw new IllegalArgumentException("草稿编号无效");JSONArray all=list();for(int i=0;i<all.length();i++){JSONObject old=all.getJSONObject(i);if(id.equals(old.getString("id"))){if(old.optLong("deletedAt")>0)throw new IllegalArgumentException("请先从回收站恢复发票");created=old.getLong("createdAt");archived=old.optLong("archivedAt");break;}}}else {JSONObject old=get(id);if(old.optLong("deletedAt")>0)throw new IllegalArgumentException("请先从回收站恢复发票");created=old.getLong("createdAt");archived=old.optLong("archivedAt");}
        ContentValues cv=new ContentValues();cv.put("id",id);cv.put("date",date);cv.put("amountMinor",minor);cv.put("currency","GBP");cv.put("category",r.getString("category"));cv.put("merchant",merchant);cv.put("location",r.optString("location"));cv.put("note",r.optString("note"));cv.put("ocr",r.optString("ocr"));cv.put("documents",docs.toString());cv.put("createdAt",created);cv.put("updatedAt",now);cv.put("archivedAt",archived);cv.put("deletedAt",0);
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{db.insertWithOnConflict("receipts",null,cv,SQLiteDatabase.CONFLICT_REPLACE);db.setTransactionSuccessful();}finally{db.endTransaction();}
        return get(id);
    }
    static final long RETENTION_MS=30L*24*60*60*1000;
    synchronized void archive(Set<String> ids) throws Exception {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{for(String id:ids){JSONObject r=get(id);if(r.optLong("deletedAt")>0)throw new IllegalArgumentException("发票已在回收站");ContentValues v=new ContentValues();v.put("archivedAt",r.optLong("archivedAt")>0?r.getLong("archivedAt"):System.currentTimeMillis());db.update("receipts",v,"id=?",new String[]{id});}db.setTransactionSuccessful();}finally{db.endTransaction();}
    }
    synchronized void lifecycle(String id,String action) throws Exception {
        JSONObject r=get(id);long now=System.currentTimeMillis(),deleted=r.optLong("deletedAt");ContentValues v=new ContentValues();
        if(action.equals("trash")){if(r.optLong("archivedAt")==0)throw new IllegalArgumentException("只能从归档区移入回收站");v.put("deletedAt",deleted>0?deleted:now);}
        else if(action.equals("recover")){if(deleted==0||now-deleted>=RETENTION_MS)throw new IllegalArgumentException("恢复期限已到，请刷新回收站");v.put("deletedAt",0);}
        else if(action.equals("unarchive")){if(deleted>0)throw new IllegalArgumentException("请先恢复发票");v.put("archivedAt",0);}
        else throw new IllegalArgumentException("操作无效");getWritableDatabase().update("receipts",v,"id=?",new String[]{id});
    }
    synchronized void delete(String id){getWritableDatabase().delete("receipts","id=?",new String[]{id});}
    synchronized JSONObject days() throws Exception {
        JSONObject out=new JSONObject();try(Cursor c=getReadableDatabase().rawQuery("SELECT date,type FROM days",null)){while(c.moveToNext())out.put(c.getString(0),c.getString(1));}return out;
    }
    synchronized void markDays(String from,String to,String type){
        LocalDate a=LocalDate.parse(from),b=LocalDate.parse(to);
        if(b.isBefore(a)||a.plusYears(2).isBefore(b))throw new IllegalArgumentException("日期范围须在两年以内");
        if(!Arrays.asList("business","office","holiday","").contains(type))throw new IllegalArgumentException("日历状态无效");
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{
            for(LocalDate d=a;!d.isAfter(b);d=d.plusDays(1)){
                if(type.isEmpty())db.delete("days","date=?",new String[]{d.toString()});
                else {ContentValues v=new ContentValues();v.put("date",d.toString());v.put("type",type);db.insertWithOnConflict("days",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
            }db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
}
