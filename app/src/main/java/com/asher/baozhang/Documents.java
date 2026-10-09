package com.asher.baozhang;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import androidx.exifinterface.media.ExifInterface;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import org.json.JSONObject;
import java.io.*;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

final class Documents {
    static final long MAX_BYTES=50L*1024*1024;
    final Context context;final File dir;
    Documents(Context c){context=c;dir=new File(c.getFilesDir(),"documents");dir.mkdirs();}
    File file(String name) throws IOException {
        if(!name.matches("[a-zA-Z0-9._-]{1,100}")||name.contains(".."))throw new IOException("附件路径无效");
        File f=new File(dir,name);if(!f.getCanonicalFile().getParentFile().equals(dir.getCanonicalFile()))throw new IOException("附件路径无效");return f;
    }
    File captureFile() throws IOException {return file(UUID.randomUUID()+".jpg");}
    JSONObject describe(File f,String mime) throws Exception {
        if(!f.isFile()||f.length()==0||f.length()>MAX_BYTES)throw new IOException("附件为空或超过 50 MB");
        int pages=1;
        if(mime.equals("application/pdf")){
            try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(f,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer pdf=new PdfRenderer(fd)){
                pages=pdf.getPageCount();if(pages<1||pages>200)throw new IOException("PDF 需有 1 至 200 页");
            }
        }else{Bitmap test=image(f,100);if(test==null)throw new IOException("不支持此图片格式，请使用 JPG 或 PNG");test.recycle();}
        MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(f)){byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)digest.update(buf,0,n);}
        StringBuilder hash=new StringBuilder();for(byte b:digest.digest())hash.append(String.format("%02x",b&255));
        return new JSONObject().put("name",f.getName()).put("mime",mime).put("pages",pages).put("sha256",hash.toString()).put("size",f.length());
    }
    JSONObject importUri(Uri uri) throws Exception {
        String mime=context.getContentResolver().getType(uri);if(mime==null)mime="";
        String extension;
        if(mime.equals("application/pdf"))extension=".pdf";
        else if(mime.startsWith("image/"))extension=mime.equals("image/png")?".png":".jpg";
        else throw new IOException("请选择图片或 PDF");
        File f=file(UUID.randomUUID()+extension);
        try(InputStream in=context.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(f)){
            if(in==null)throw new IOException("无法读取附件");byte[] b=new byte[65536];long total=0;int n;
            while((n=in.read(b))!=-1){total+=n;if(total>MAX_BYTES)throw new IOException("附件超过 50 MB");out.write(b,0,n);}
        }catch(Exception e){f.delete();throw e;}
        try{return describe(f,mime);}catch(Exception e){f.delete();throw e;}
    }
    static Bitmap image(File f,int max) throws IOException {
        BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeFile(f.getAbsolutePath(),bounds);
        if(bounds.outWidth<=0||bounds.outHeight<=0)return null;
        BitmapFactory.Options opt=new BitmapFactory.Options();opt.inSampleSize=1;
        while(Math.max(bounds.outWidth,bounds.outHeight)/opt.inSampleSize>max*2)opt.inSampleSize*=2;
        Bitmap raw=BitmapFactory.decodeFile(f.getAbsolutePath(),opt);if(raw==null)return null;
        Matrix matrix=new Matrix();
        try{ExifInterface exif=new ExifInterface(f);int orientation=exif.getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);
            switch(orientation){case 2:matrix.setScale(-1,1);break;case 3:matrix.setRotate(180);break;case 4:matrix.setScale(1,-1);break;case 5:matrix.setRotate(90);matrix.postScale(-1,1);break;case 6:matrix.setRotate(90);break;case 7:matrix.setRotate(270);matrix.postScale(-1,1);break;case 8:matrix.setRotate(270);break;default:break;}
        }catch(IOException ignored){}
        Bitmap rotated=Bitmap.createBitmap(raw,0,0,raw.getWidth(),raw.getHeight(),matrix,true);if(rotated!=raw)raw.recycle();
        int longSide=Math.max(rotated.getWidth(),rotated.getHeight());if(longSide>max){float ratio=max/(float)longSide;Bitmap scaled=Bitmap.createScaledBitmap(rotated,Math.max(1,Math.round(rotated.getWidth()*ratio)),Math.max(1,Math.round(rotated.getHeight()*ratio)),true);if(scaled!=rotated)rotated.recycle();return scaled;}return rotated;
    }
    static Bitmap pdfPage(PdfRenderer pdf,int index,int max){
        try(PdfRenderer.Page p=pdf.openPage(index)){
            float scale=max/(float)Math.max(p.getWidth(),p.getHeight());Bitmap b=Bitmap.createBitmap(Math.max(1,Math.round(p.getWidth()*scale)),Math.max(1,Math.round(p.getHeight()*scale)),Bitmap.Config.ARGB_8888);
            b.eraseColor(Color.WHITE);p.render(b,null,null,PdfRenderer.Page.RENDER_MODE_FOR_PRINT);return b;
        }
    }
    Bitmap preview(JSONObject d) throws Exception {
        File f=file(d.getString("name"));if(d.getString("mime").equals("application/pdf")){try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(f,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer pdf=new PdfRenderer(fd)){return pdfPage(pdf,0,1800);}}return image(f,1800);
    }
    String ocr(JSONObject d) throws Exception {
        // Parse one invoice per entry. For a multi-page invoice, the first 3 pages are OCRed.
        try(TextRecognizer latin=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);TextRecognizer chinese=TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build())){
            StringBuilder out=new StringBuilder();File f=file(d.getString("name"));
            if(d.getString("mime").equals("application/pdf")){
                try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(f,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer pdf=new PdfRenderer(fd)){
                    for(int i=0;i<Math.min(3,pdf.getPageCount());i++){Bitmap b=pdfPage(pdf,i,2200);try{out.append(recognize(b,latin,chinese)).append('\n');}finally{b.recycle();}}
                }
            }else{Bitmap b=image(f,2400);if(b==null)throw new IOException("图片解码失败");try{out.append(recognize(b,latin,chinese));}finally{b.recycle();}}
            return out.toString();
        }
    }
    private static String recognize(Bitmap b,TextRecognizer latin,TextRecognizer chinese) throws Exception {
        InputImage input=InputImage.fromBitmap(b,0);String a=Tasks.await(latin.process(input),45,TimeUnit.SECONDS).getText();
        String c=Tasks.await(chinese.process(input),45,TimeUnit.SECONDS).getText();
        // Preserve Latin layout for UK receipts; use Chinese layout when Han characters are present.
        return c.matches("(?s).*[\\u4e00-\\u9fff].*")?c:a;
    }
    void remove(String name){try{file(name).delete();}catch(IOException ignored){}}
}
