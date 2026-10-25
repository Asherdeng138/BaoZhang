package com.asher.baozhang;

import android.graphics.*;
import android.graphics.pdf.PdfDocument;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.util.*;
import java.util.zip.*;

final class ExportService {
    final Documents docs;final File directory;
    ExportService(Documents d,File cache){docs=d;directory=new File(cache,"exports");directory.mkdirs();}
    File[] export(List<JSONObject> receipts,String category,String from,String to) throws Exception {
        if(receipts.isEmpty())throw new IOException("没有选中的发票");
        String base=ExportNames.base(category,from,to);
        int count=0;for(JSONObject r:receipts){JSONArray a=r.getJSONArray("documents");for(int i=0;i<a.length();i++)count+=a.getJSONObject(i).getInt("pages");}
        if(count>200)throw new IOException("一次最多导出200页，请缩短日期范围");
        File folder=new File(directory,UUID.randomUUID().toString());if(!folder.mkdirs())throw new IOException("无法创建导出目录");
        File pdfFile=new File(folder,base+"_发票合集.pdf"),xlsxFile=new File(folder,base+"_明细汇总.xlsx");
        List<XlsxWriter.Row> rows=new ArrayList<>();int page=1;
        PdfDocument output=new PdfDocument();
        try{
            for(JSONObject r:receipts){int first=page;JSONArray attachments=r.getJSONArray("documents");
                for(int i=0;i<attachments.length();i++){
                    JSONObject d=attachments.getJSONObject(i);File f=docs.file(d.getString("name"));if(!f.isFile())throw new IOException("找不到附件，请恢复备份后导出");
                    if(d.getString("mime").equals("application/pdf")){
                        try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(f,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer renderer=new PdfRenderer(fd)){
                            for(int p=0;p<renderer.getPageCount();p++){Bitmap b=Documents.pdfPage(renderer,p,2200);try{addPage(output,b,page++);}finally{b.recycle();}}
                        }
                    }else{CropSpec crop=Documents.crop(d);Bitmap b=Documents.image(f,crop==null?2400:3600);if(b==null)throw new IOException("无法解码发票图片");b=Documents.applyCrop(b,crop);try{addPage(output,b,page++);}finally{b.recycle();}}
                }
                rows.add(new XlsxWriter.Row(r.getString("id"),r.getString("date"),r.getString("category"),"GBP",r.getString("merchant"),r.optString("location"),r.optString("note"),r.getLong("amountMinor"),attachments.length(),first==page-1?String.valueOf(first):first+"–"+(page-1)));
            }
            try(OutputStream out=new FileOutputStream(pdfFile)){output.writeTo(out);}
            XlsxWriter.write(xlsxFile,rows);return new File[]{pdfFile,xlsxFile};
        }catch(Exception e){pdfFile.delete();xlsxFile.delete();folder.delete();throw e;}
        finally{output.close();}
    }
    private void addPage(PdfDocument out,Bitmap b,int index){
        // Flatten to a visible image of each original page. Original files remain unchanged.
        int width=595,height=Math.max(100,Math.round(width*b.getHeight()/(float)b.getWidth()));
        if(height>3000){height=3000;width=Math.max(100,Math.round(height*b.getWidth()/(float)b.getHeight()));}
        PdfDocument.Page page=out.startPage(new PdfDocument.PageInfo.Builder(width,height,index).create());
        try{Canvas canvas=page.getCanvas();canvas.drawColor(Color.WHITE);Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);canvas.drawBitmap(b,null,new RectF(0,0,width,height),paint);}
        finally{out.finishPage(page);}
    }
    File backup(JSONArray receipts,JSONObject days) throws Exception {
        File f=new File(directory,"报账备份_"+System.currentTimeMillis()+".zip");Set<String> names=new HashSet<>();
        try(ZipOutputStream z=new ZipOutputStream(new FileOutputStream(f))){
            z.putNextEntry(new ZipEntry("receipts.json"));z.write(new JSONObject().put("schemaVersion",1).put("receipts",receipts).put("days",days).toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));z.closeEntry();
            for(int j=0;j<receipts.length();j++){JSONArray a=receipts.getJSONObject(j).getJSONArray("documents");for(int i=0;i<a.length();i++){
                String name=a.getJSONObject(i).getString("name");if(!names.add(name))continue;z.putNextEntry(new ZipEntry("documents/"+name));try(InputStream in=new FileInputStream(docs.file(name))){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)z.write(b,0,n);}z.closeEntry();
            }}return f;
        }catch(Exception e){f.delete();throw e;}
    }
}
