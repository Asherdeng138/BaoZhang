package com.asher.baozhang;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.*;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.view.*;
import android.webkit.*;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;
import org.json.*;
import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private WebView web;private ReceiptStore store;private Documents docs;private ExportService exports;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private JSONObject draft;private File[] lastExport;private String captureName="";
    private static final int CAMERA=100,IMPORT=101,FOLDER=102;
    private static final String ORIGIN="https://appassets.androidplatform.net";
    @Override public void onCreate(Bundle state){
        super.onCreate(state);store=new ReceiptStore(this);docs=new Documents(this);exports=new ExportService(docs,getCacheDir());
        loadDraft();captureName=getPreferences(0).getString("captureName","");
        web=new WebView(this);setContentView(web);
        ViewCompat.setOnApplyWindowInsetsListener(web,(v,w)->{Insets i=w.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);return w;});
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setBlockNetworkLoads(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri u=request.getUrl();if(!ORIGIN.equals(u.getScheme()+"://"+u.getAuthority()))return empty();
                if(u.getPath()!=null&&u.getPath().startsWith("/preview/")){
                    try{String name=u.getLastPathSegment();JSONObject d=docs.describe(docs.file(name),name.endsWith(".pdf")?"application/pdf":"image/jpeg");Bitmap b=docs.preview(d);ByteArrayOutputStream out=new ByteArrayOutputStream();try{b.compress(Bitmap.CompressFormat.JPEG,85,out);}finally{b.recycle();}return new WebResourceResponse("image/jpeg",null,new ByteArrayInputStream(out.toByteArray()));}catch(Exception e){return empty();}
                }
                WebResourceResponse r=loader.shouldInterceptRequest(u);return r==null?empty():r;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){return true;}
        });
        web.addJavascriptInterface(new Bridge(),"Native");web.loadUrl(ORIGIN+"/assets/index.html");
        if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->handleBack());
    }
    private WebResourceResponse empty(){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    private void emit(String type,Object value){if(web==null||isFinishing())return;String payload;try{payload=new JSONObject().put("type",type).put("data",value==null?JSONObject.NULL:value).toString();}catch(JSONException e){return;}String json=payload;runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.onNative("+json+")",null);});}
    private void failure(Exception e){try{emit("error",new JSONObject().put("message",e.getMessage()==null?"操作失败，请重试":e.getMessage()).put("draft",draft==null?JSONObject.NULL:draft));}catch(JSONException ignored){}}
    private void submit(Checked action){worker.submit(()->{try{action.run();}catch(Exception e){failure(e);}catch(OutOfMemoryError e){failure(new IOException("图片或导出批次过大，请缩小图片或分批导出"));}});}
    private interface Checked {void run() throws Exception;}
    private void data() throws Exception {emit("data",new JSONObject().put("receipts",store.list()).put("days",store.days()).put("draft",draft==null?JSONObject.NULL:draft));}
    private File draftFile(){return new File(getFilesDir(),"draft.json");}
    private synchronized void persistDraft() throws IOException {
        if(draft==null){draftFile().delete();return;}
        File tmp=new File(getFilesDir(),"draft.tmp");try(FileOutputStream o=new FileOutputStream(tmp)){o.write(draft.toString().getBytes(StandardCharsets.UTF_8));o.getFD().sync();}
        if(!tmp.renameTo(draftFile()))throw new IOException("无法保存草稿");
    }
    private void loadDraft(){try(InputStream in=new FileInputStream(draftFile());ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);draft=new JSONObject(out.toString("UTF-8"));}catch(Exception ignored){draft=null;}}
    private void initDraft(String category,boolean append) throws Exception {
        if(!ReceiptStore.CATEGORIES.contains(category))throw new IOException("请先选择费用种类");
        if(append){if(draft==null)throw new IOException("没有待编辑的发票");}
        else {if(draft!=null)throw new IOException("请先保存或放弃当前草稿");draft=new JSONObject().put("category",category).put("documents",new JSONArray()).put("ocr","").put("date","").put("amount","").put("merchant","").put("location","").put("note","");}
        persistDraft();
    }
    private void setCaptureName(String name){captureName=name;getPreferences(0).edit().putString("captureName",name).apply();}
    private void launchCamera(){
        try{File f=docs.captureFile();setCaptureName(f.getName());Uri uri=FileProvider.getUriForFile(this,getPackageName()+".files",f);Intent i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);i.putExtra(MediaStore.EXTRA_OUTPUT,uri);i.setClipData(ClipData.newRawUri("invoice",uri));i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);startActivityForResult(i,CAMERA);}catch(Exception e){if(!captureName.isEmpty())docs.remove(captureName);setCaptureName("");failure(new IOException("无法启动相机，请使用导入图片"));}
    }
    private void launchImport(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("*/*");i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/*","application/pdf"});i.addCategory(Intent.CATEGORY_OPENABLE);try{startActivityForResult(i,IMPORT);}catch(ActivityNotFoundException e){failure(new IOException("手机没有可用的文件选择器"));}}
    private void attach(JSONObject d) throws Exception {
        if(draft==null){docs.remove(d.getString("name"));throw new IOException("草稿已关闭，请重新导入");}
        JSONArray a=draft.getJSONArray("documents");if(a.length()>=30){docs.remove(d.getString("name"));throw new IOException("每张发票最多30个附件");}
        boolean duplicate=false;JSONArray saved=store.list();for(int j=0;j<saved.length();j++){JSONArray other=saved.getJSONObject(j).getJSONArray("documents");for(int k=0;k<other.length();k++)if(other.getJSONObject(k).optString("sha256").equals(d.optString("sha256")))duplicate=true;}
        for(int k=0;k<a.length();k++)if(a.getJSONObject(k).optString("sha256").equals(d.optString("sha256")))duplicate=true;
        a.put(d);persistDraft();emit("busy","正在识别发票文字…");
        String text="",message="";try{text=docs.ocr(d);}catch(Exception e){message="自动识别失败，原件已保留，请手动填写信息。";}
        boolean first=a.length()==1;draft.put("ocr",draft.optString("ocr")+(first?"":"\n")+text);persistDraft();
        emit("scan",new JSONObject().put("draft",draft).put("text",text).put("first",first).put("duplicate",duplicate).put("message",message));
    }
    private void keepFields(JSONObject fields) throws Exception {
        if(draft==null)throw new IOException("没有草稿");
        for(String key:new String[]{"date","amount","merchant","location","category","note"})if(fields.has(key))draft.put(key,fields.getString(key));
        persistDraft();
    }
    private boolean referenced(String name) throws Exception {JSONArray all=store.list();for(int i=0;i<all.length();i++){JSONArray a=all.getJSONObject(i).getJSONArray("documents");for(int j=0;j<a.length();j++)if(name.equals(a.getJSONObject(j).getString("name")))return true;}return false;}
    private void discard() throws Exception {if(draft!=null){JSONArray a=draft.getJSONArray("documents");for(int i=0;i<a.length();i++){String n=a.getJSONObject(i).getString("name");if(!referenced(n))docs.remove(n);}}draft=null;persistDraft();data();}
    private void openDocument(JSONObject d){try{Intent i=new Intent(Intent.ACTION_VIEW);Uri u=FileProvider.getUriForFile(this,getPackageName()+".files",docs.file(d.getString("name")));i.setDataAndType(u,d.getString("mime"));i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(i);}catch(Exception e){failure(new IOException("无法打开原件，请安装 PDF 或图片查看器"));}}
    private void share(File[] files){try{ArrayList<Uri> uris=new ArrayList<>();for(File f:files)uris.add(FileProvider.getUriForFile(this,getPackageName()+".files",f));Intent i=new Intent(Intent.ACTION_SEND_MULTIPLE);i.setType("*/*");i.putParcelableArrayListExtra(Intent.EXTRA_STREAM,uris);ClipData clip=ClipData.newRawUri("报账文件",uris.get(0));for(int j=1;j<uris.size();j++)clip.addItem(new ClipData.Item(uris.get(j)));i.setClipData(clip);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(Intent.createChooser(i,"分享报账文件"));}catch(Exception e){failure(new IOException("无法打开分享界面，请使用保存到文件夹"));}}
    private void saveToFolder(Uri tree) throws Exception {
        if(lastExport==null)throw new IOException("导出文件已经失效，请重新生成");
        Uri root=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));List<String> done=new ArrayList<>();
        for(File f:lastExport){String mime=f.getName().endsWith(".pdf")?"application/pdf":f.getName().endsWith(".zip")?"application/zip":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";Uri created=null;
            try{created=DocumentsContract.createDocument(getContentResolver(),root,mime,f.getName());if(created==null)throw new IOException("无法创建文件");try(InputStream in=new FileInputStream(f);OutputStream out=getContentResolver().openOutputStream(created)){if(out==null)throw new IOException("无法写入文件夹");byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}done.add(f.getName());}
            catch(Exception e){if(created!=null)try{DocumentsContract.deleteDocument(getContentResolver(),created);}catch(Exception ignored){}throw new IOException(done.isEmpty()?"保存失败，请选择可写入的文件夹":"部分文件已保存："+String.join("、",done)+"；其余失败，请重新保存");}
        }emit("savedFiles",new JSONArray(done));
    }
    @Override protected void onActivityResult(int request,int result,Intent intent){super.onActivityResult(request,result,intent);
        if(request==CAMERA){String name=captureName;setCaptureName("");if(result==RESULT_OK&&!name.isEmpty())submit(()->{try{attach(docs.describe(docs.file(name),"image/jpeg"));}catch(Exception e){if(draft==null||!draft.toString().contains(name))docs.remove(name);throw e;}});else{if(!name.isEmpty())docs.remove(name);emit("cancel",null);} }
        else if(request==IMPORT){if(result==RESULT_OK&&intent!=null&&intent.getData()!=null){Uri u=intent.getData();submit(()->attach(docs.importUri(u)));}else emit("cancel",null);}
        else if(request==FOLDER){if(result==RESULT_OK&&intent!=null&&intent.getData()!=null){Uri u=intent.getData();emit("busy","正在保存文件…");submit(()->saveToFolder(u));}else emit("cancel",null);}
    }
    private void handleBack(){if(web!=null)web.evaluateJavascript("window.handleBack()",null);}
    // Android 13+ uses the OnBackInvokedDispatcher registered in onCreate.
    // This override is only the Android 8-12 compatibility path.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed(){handleBack();}
    @Override protected void onDestroy(){super.onDestroy();worker.shutdown();if(web!=null){web.removeJavascriptInterface("Native");web.destroy();web=null;}}
    final class Bridge {
        @JavascriptInterface public void ready(){submit(()->data());}
        @JavascriptInterface public void capture(String category,boolean append){submit(()->{initDraft(category,append);runOnUiThread(()->launchCamera());});}
        @JavascriptInterface public void importFile(String category,boolean append){submit(()->{initDraft(category,append);runOnUiThread(()->launchImport());});}
        @JavascriptInterface public void updateDraft(String json){submit(()->keepFields(new JSONObject(json)));}
        @JavascriptInterface public void save(String json){submit(()->{JSONObject f=new JSONObject(json);keepFields(f);draft.put("confirmed",f.optBoolean("confirmed"));for(int i=0;i<draft.getJSONArray("documents").length();i++){JSONObject d=draft.getJSONArray("documents").getJSONObject(i);if(!docs.file(d.getString("name")).isFile())throw new IOException("附件缺失");}store.save(draft);draft=null;persistDraft();data();emit("toast","发票已保存");});}
        @JavascriptInterface public void edit(String id){submit(()->{if(draft!=null)throw new IOException("请先处理当前草稿");draft=store.get(id);draft.put("amount",BigDecimal.valueOf(draft.getLong("amountMinor"),2).toPlainString());persistDraft();emit("draft",draft);});}
        @JavascriptInterface public void discardDraft(){submit(()->discard());}
        @JavascriptInterface public void removeAttachment(int index){submit(()->{if(draft==null)throw new IOException("没有草稿");JSONArray a=draft.getJSONArray("documents");if(index<0||index>=a.length())throw new IOException("附件无效");String name=a.getJSONObject(index).getString("name");a.remove(index);persistDraft();if(!referenced(name))docs.remove(name);emit("draft",draft);});}
        @JavascriptInterface public void delete(String id){submit(()->{JSONObject r=store.get(id);if(draft!=null&&id.equals(draft.optString("id")))discard();store.delete(id);JSONArray a=r.getJSONArray("documents");for(int i=0;i<a.length();i++){String n=a.getJSONObject(i).getString("name");if(!referenced(n))docs.remove(n);}data();emit("toast","发票已删除");});}
        @JavascriptInterface public void markDays(String from,String to,String type){submit(()->{store.markDays(from,to,type);data();emit("toast","日历状态已更新");});}
        @JavascriptInterface public void open(String receiptId,int index){submit(()->{JSONArray a=receiptId.equals("draft")?draft.getJSONArray("documents"):store.get(receiptId).getJSONArray("documents");JSONObject d=a.getJSONObject(index);runOnUiThread(()->openDocument(d));});}
        @JavascriptInterface public void export(String json){submit(()->{JSONObject q=new JSONObject(json);String category=q.getString("category"),from=q.getString("from"),to=q.getString("to");if(!ReceiptStore.CATEGORIES.contains(category)||!from.matches("\\d{4}-\\d{2}-\\d{2}")||!to.matches("\\d{4}-\\d{2}-\\d{2}")||java.time.LocalDate.parse(to).isBefore(java.time.LocalDate.parse(from)))throw new IOException("请选择费用种类和有效日期范围");java.time.LocalDate.parse(from);JSONArray ids=q.getJSONArray("ids");Set<String> selected=new HashSet<>();for(int i=0;i<ids.length();i++)selected.add(ids.getString(i));List<JSONObject> rows=new ArrayList<>();for(String id:selected){JSONObject r=store.get(id);if(!r.getString("category").equals(category)||r.getString("date").compareTo(from)<0||r.getString("date").compareTo(to)>0)throw new IOException("选中发票与分类或日期范围不符");rows.add(r);}rows.sort(Comparator.comparing((JSONObject r)->r.optString("date")).thenComparing(r->r.optString("id")));lastExport=exports.export(rows);JSONArray names=new JSONArray();for(File f:lastExport)names.put(f.getName());emit("exported",names);});}
        @JavascriptInterface public void shareExport(){runOnUiThread(()->{if(lastExport==null)failure(new IOException("请先生成文件"));else share(lastExport);});}
        @JavascriptInterface public void saveExport(){runOnUiThread(()->{if(lastExport==null){failure(new IOException("请先生成文件"));return;}try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivityForResult(i,FOLDER);}catch(Exception e){failure(new IOException("无法选择文件夹，请使用分享"));}});}
        @JavascriptInterface public void backup(){submit(()->{lastExport=new File[]{exports.backup(store.list(),store.days())};JSONArray names=new JSONArray();names.put(lastExport[0].getName());emit("exported",names);});}
        @JavascriptInterface public void quit(){runOnUiThread(()->finish());}
    }
}
