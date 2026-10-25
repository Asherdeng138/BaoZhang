package com.asher.baozhang;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.*;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowCompat;
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
    private JSONObject draft;private File[] lastExport;private Set<String> lastExportIds=new HashSet<>();private String captureName="";
    private final android.os.Handler maintenanceHandler=new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable maintenance=new Runnable(){@Override public void run(){submit(()->{if(purgeExpired())emit("maintenance",new JSONObject().put("receipts",store.list()));});maintenanceHandler.postDelayed(this,60000);}};
    private static final int CAMERA=100,IMPORT=101,FOLDER=102;
    private static final String ORIGIN="https://appassets.androidplatform.net";
    @Override public void onCreate(Bundle state){
        super.onCreate(state);store=new ReceiptStore(this);docs=new Documents(this);exports=new ExportService(docs,getCacheDir());
        loadDraft();captureName=getPreferences(0).getString("captureName","");
        // Inset the native container, not WebView's content: fixed HTML overlays
        // must also stay below status bars and above the keyboard/navigation bar.
        WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        FrameLayout safeArea=new FrameLayout(this);
        safeArea.setBackgroundColor(Color.rgb(246,247,242));
        web=new WebView(this);web.setTag("receipt-web");
        safeArea.addView(web,new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        ViewCompat.setOnApplyWindowInsetsListener(safeArea,(v,w)->{
            int types=WindowInsetsCompat.Type.systemBars()
                    |WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime();
            Insets i=w.getInsets(types);
            v.setPadding(i.left,i.top,i.right,i.bottom);
            // Forward zeroed insets so newer WebViews do not add the spacing twice.
            return new WindowInsetsCompat.Builder(w).setInsets(types,Insets.NONE).build();
        });
        setContentView(safeArea);
        WindowCompat.getInsetsController(getWindow(),safeArea).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(),safeArea).setAppearanceLightNavigationBars(true);
        ViewCompat.requestApplyInsets(safeArea);
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result){
                if(isFinishing()||isDestroyed()){result.cancel();return true;}
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("请确认").setMessage(message)
                        .setPositiveButton("确认",(dialog,which)->result.confirm())
                        .setNegativeButton("取消",(dialog,which)->result.cancel())
                        .setOnCancelListener(dialog->result.cancel())
                        .show();
                return true;
            }
        });
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setBlockNetworkLoads(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri u=request.getUrl();if(!ORIGIN.equals(u.getScheme()+"://"+u.getAuthority()))return empty();
                if(u.getPath()!=null&&u.getPath().startsWith("/preview/")){
                    try{String name=u.getLastPathSegment();JSONObject d=docs.describe(docs.file(name),name.endsWith(".pdf")?"application/pdf":"image/jpeg");JSONObject saved=findDocument(name);if(saved!=null&&saved.optJSONObject("crop")!=null)d.put("crop",saved.getJSONObject("crop"));boolean raw="1".equals(u.getQueryParameter("raw"));String page=u.getQueryParameter("page");Bitmap b=docs.preview(d,page==null?0:Integer.parseInt(page),raw?2400:page==null?1800:2800,raw);ByteArrayOutputStream out=new ByteArrayOutputStream();try{b.compress(Bitmap.CompressFormat.JPEG,85,out);}finally{b.recycle();}return new WebResourceResponse("image/jpeg",null,new ByteArrayInputStream(out.toByteArray()));}catch(Exception e){return empty();}
                }
                if(u.getPath()!=null&&u.getPath().startsWith("/assets/ocr/"))return ocrAsset(u.getPath().substring("/assets/".length()));
                WebResourceResponse r=loader.shouldInterceptRequest(u);return r==null?empty():r;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){return true;}
        });
        web.addJavascriptInterface(new Bridge(),"Native");web.loadUrl(ORIGIN+"/assets/index.html");
        maintenanceHandler.postDelayed(maintenance,60000);
        if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->handleBack());
    }
    /** OCR engine files need exact MIME types (WASM, ES modules) that the asset loader may not know. */
    private WebResourceResponse ocrAsset(String path){
        if(!path.matches("ocr/[A-Za-z0-9._-]+")||path.contains(".."))return empty();
        String mime=path.endsWith(".wasm")?"application/wasm":path.endsWith(".mjs")||path.endsWith(".js")?"text/javascript":path.endsWith(".txt")?"text/plain":"application/octet-stream";
        try{return new WebResourceResponse(mime,mime.startsWith("text/")?"UTF-8":null,getAssets().open(path));}catch(IOException e){return empty();}
    }
    /** The stored attachment entry (draft first, then saved receipts) for a document file name. */
    private JSONObject findDocument(String name){
        try{
            JSONObject current=draft;
            if(current!=null){JSONArray a=current.optJSONArray("documents");if(a!=null)for(int i=0;i<a.length();i++)if(name.equals(a.getJSONObject(i).optString("name")))return a.getJSONObject(i);}
            JSONArray all=store.list();for(int i=0;i<all.length();i++){JSONArray a=all.getJSONObject(i).getJSONArray("documents");for(int j=0;j<a.length();j++)if(name.equals(a.getJSONObject(j).optString("name")))return a.getJSONObject(j);}
        }catch(Exception ignored){}
        return null;
    }
    private WebResourceResponse empty(){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    private void emit(String type,Object value){if(web==null||isFinishing())return;String payload;try{payload=new JSONObject().put("type",type).put("data",value==null?JSONObject.NULL:value).toString();}catch(JSONException e){return;}String json=payload;runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.onNative("+json+")",null);});}
    private void failure(Exception e){try{emit("error",new JSONObject().put("message",e.getMessage()==null?"操作失败，请重试":e.getMessage()).put("draft",draft==null?JSONObject.NULL:draft));}catch(JSONException ignored){}}
    private void submit(Checked action){worker.submit(()->{try{action.run();}catch(Exception e){failure(e);}catch(OutOfMemoryError e){failure(new IOException("图片或导出批次过大，请缩小图片或分批导出"));}});}
    private interface Checked {void run() throws Exception;}
    private void data() throws Exception {emit("data",new JSONObject().put("receipts",store.list()).put("days",store.days()).put("draft",draft==null?JSONObject.NULL:draft));}
    private boolean purgeExpired() throws Exception {
        JSONArray all=store.list();long now=System.currentTimeMillis();Set<String> expired=new HashSet<>();
        for(int i=0;i<all.length();i++){JSONObject r=all.getJSONObject(i);if(r.optLong("deletedAt")>0&&now-r.getLong("deletedAt")>=ReceiptStore.RETENTION_MS)expired.add(r.getString("id"));}
        if(expired.isEmpty())return false;Set<String> keep=new HashSet<>();
        for(int i=0;i<all.length();i++){JSONObject r=all.getJSONObject(i);if(!expired.contains(r.getString("id"))){JSONArray a=r.getJSONArray("documents");for(int j=0;j<a.length();j++)keep.add(a.getJSONObject(j).getString("name"));}}
        if(draft!=null){JSONArray a=draft.getJSONArray("documents");for(int j=0;j<a.length();j++)keep.add(a.getJSONObject(j).getString("name"));JSONArray pending=draft.optJSONArray("batchPending");if(pending!=null)for(int j=0;j<pending.length();j++)keep.add(pending.getJSONObject(j).getString("name"));}
        for(int i=0;i<all.length();i++){JSONObject r=all.getJSONObject(i);if(expired.contains(r.getString("id"))){JSONArray a=r.getJSONArray("documents");for(int j=0;j<a.length();j++){String name=a.getJSONObject(j).getString("name");if(!keep.contains(name)){File f=docs.file(name);if(f.exists()&&!f.delete())throw new IOException("回收站原件清理失败，下次将重试");}}store.delete(r.getString("id"));}}
        return true;
    }
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
        else {if(draft!=null)throw new IOException("请先保存或放弃当前草稿");draft=blankDraft(category);}
        persistDraft();
    }
    private void setCaptureName(String name){captureName=name;getPreferences(0).edit().putString("captureName",name).apply();}
    private void launchCamera(){
        try{File f=docs.captureFile();setCaptureName(f.getName());Uri uri=FileProvider.getUriForFile(this,getPackageName()+".files",f);Intent i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);i.putExtra(MediaStore.EXTRA_OUTPUT,uri);i.setClipData(ClipData.newRawUri("invoice",uri));i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);startActivityForResult(i,CAMERA);}catch(Exception e){if(!captureName.isEmpty())docs.remove(captureName);setCaptureName("");failure(new IOException("无法启动相机，请使用导入图片"));}
    }
    private void launchImport(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("*/*");i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/*","application/pdf"});i.addCategory(Intent.CATEGORY_OPENABLE);i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);try{startActivityForResult(i,IMPORT);}catch(ActivityNotFoundException e){failure(new IOException("手机没有可用的文件选择器"));}}
    private void attach(JSONObject d) throws Exception {
        if(draft==null){docs.remove(d.getString("name"));throw new IOException("草稿已关闭，请重新导入");}
        JSONArray a=draft.getJSONArray("documents");if(a.length()>=30){docs.remove(d.getString("name"));throw new IOException("每张发票最多30个附件");}
        boolean duplicate=false;JSONArray saved=store.list();for(int j=0;j<saved.length();j++){JSONArray other=saved.getJSONObject(j).getJSONArray("documents");for(int k=0;k<other.length();k++)if(other.getJSONObject(k).optString("sha256").equals(d.optString("sha256")))duplicate=true;}
        for(int k=0;k<a.length();k++)if(a.getJSONObject(k).optString("sha256").equals(d.optString("sha256")))duplicate=true;
        a.put(d);draft.put("needsScan",true);persistDraft();scanCurrent(duplicate);
    }
    private void scanCurrent(boolean duplicate) throws Exception {
        JSONArray a=draft.getJSONArray("documents");JSONObject d=a.getJSONObject(a.length()-1);emit("busy","正在识别第 "+draft.optInt("batchIndex",1)+" 张发票文字…");
        String text="",message="";try{text=docs.ocr(d);}catch(Exception e){message="自动识别失败，原件已保留，请手动填写信息。";}
        boolean first=a.length()==1;draft.put("ocr",draft.optString("ocr")+(first?"":"\n")+text);draft.remove("needsScan");if(!message.isEmpty())draft.put("scanMessage",message);persistDraft();
        emit("scan",new JSONObject().put("draft",draft).put("text",text).put("first",first).put("duplicate",duplicate).put("message",message));
    }
    private JSONObject blankDraft(String category) throws Exception {return new JSONObject().put("category",category).put("pendingId",UUID.randomUUID().toString()).put("documents",new JSONArray()).put("ocr","").put("date","").put("amount","").put("merchant","").put("location","").put("note","");}
    private void importSelection(List<Uri> uris,boolean append) throws Exception {
        if(uris.size()>30){if(!append){draft=null;persistDraft();}throw new IOException("每批最多选择 30 个文件，请分批导入");}
        if(append){for(Uri uri:uris)attach(docs.importUri(uri));return;}
        JSONArray pending=new JSONArray();List<String> errors=new ArrayList<>();long size=0;
        for(int i=0;i<uris.size();i++){
            emit("busy","正在保留第 "+(i+1)+" / "+uris.size()+" 个原件…");
            try{JSONObject d=docs.importUri(uris.get(i));if(size+d.getLong("size")>250L*1024*1024){docs.remove(d.getString("name"));throw new IOException("本批原件超过 250 MB，请分批导入");}size+=d.getLong("size");pending.put(d);draft.put("batchPending",pending);persistDraft();}
            catch(Exception e){errors.add("第 "+(i+1)+" 个文件："+e.getMessage());}
        }
        if(pending.length()==0){draft=null;persistDraft();throw new IOException(errors.isEmpty()?"没有可导入的文件":String.join("；",errors));}
        draft.put("batchTotal",pending.length()).put("batchIndex",0).put("batchCategory",draft.getString("category"));persistDraft();advanceBatch();
        if(!errors.isEmpty())emit("toast","部分文件未导入："+String.join("；",errors));
    }
    private boolean duplicateDocument(JSONObject d) throws Exception {
        JSONArray saved=store.list();for(int j=0;j<saved.length();j++){JSONObject r=saved.getJSONObject(j);if(r.optString("id").equals(draft.optString("id")))continue;JSONArray a=r.getJSONArray("documents");for(int k=0;k<a.length();k++)if(a.getJSONObject(k).optString("sha256").equals(d.optString("sha256")))return true;}
        JSONArray pending=draft.optJSONArray("batchPending");if(pending!=null)for(int k=0;k<pending.length();k++)if(pending.getJSONObject(k).optString("sha256").equals(d.optString("sha256")))return true;return false;
    }
    private void advanceBatch() throws Exception {
        JSONArray pending=draft==null?null:draft.optJSONArray("batchPending");
        if(pending==null||pending.length()==0){draft=null;persistDraft();data();return;}
        List<JSONObject> items=new ArrayList<>();for(int i=0;i<pending.length();i++)items.add(pending.getJSONObject(i));BatchQueue.Step<JSONObject> step=BatchQueue.next(items,draft.optInt("batchIndex",0),draft.optInt("batchTotal",0));JSONObject first=step.current;pending=new JSONArray();for(JSONObject item:step.pending)pending.put(item);int index=step.index,total=step.total;String cat=draft.optString("batchCategory",draft.getString("category"));
        draft=blankDraft(cat).put("batchPending",pending).put("batchIndex",index).put("batchTotal",total).put("batchCategory",cat).put("documents",new JSONArray().put(first)).put("needsScan",true);persistDraft();data();scanCurrent(duplicateDocument(first));
    }
    private void resumeBatch() throws Exception {
        if(draft==null)return;
        if(draft.has("savedId")){advanceBatch();return;}
        if(draft.getJSONArray("documents").length()==0&&draft.optJSONArray("batchPending")!=null&&draft.getJSONArray("batchPending").length()>0){advanceBatch();return;}
        if(draft.optBoolean("needsScan")&&draft.getJSONArray("documents").length()>0)scanCurrent(duplicateDocument(draft.getJSONArray("documents").getJSONObject(0)));
    }
    private void keepFields(JSONObject fields) throws Exception {
        if(draft==null)throw new IOException("没有草稿");
        for(String key:new String[]{"date","amount","merchant","location","category","note"})if(fields.has(key))draft.put(key,fields.getString(key));
        // Text from the on-device smart scan replaces the earlier OCR text of this draft.
        if(fields.has("ocr")){String text=fields.getString("ocr");draft.put("ocr",text.length()>100000?text.substring(0,100000):text);}
        persistDraft();
    }
    private boolean referenced(String name) throws Exception {JSONArray all=store.list();for(int i=0;i<all.length();i++){JSONArray a=all.getJSONObject(i).getJSONArray("documents");for(int j=0;j<a.length();j++)if(name.equals(a.getJSONObject(j).getString("name")))return true;}return false;}
    private void discard() throws Exception {if(draft!=null){JSONArray a=draft.getJSONArray("documents");for(int i=0;i<a.length();i++){String n=a.getJSONObject(i).getString("name");if(!referenced(n))docs.remove(n);}}advanceBatch();}
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
        else if(request==IMPORT){if(result==RESULT_OK&&intent!=null){List<Uri> uris=new ArrayList<>();if(intent.getClipData()!=null){for(int i=0;i<intent.getClipData().getItemCount();i++){Uri uri=intent.getClipData().getItemAt(i).getUri();if(uri!=null&&!uris.contains(uri))uris.add(uri);}}else if(intent.getData()!=null)uris.add(intent.getData());submit(()->{if(uris.isEmpty()){emit("cancel",null);return;}boolean append=draft!=null&&draft.optBoolean("pickerAppend");importSelection(uris,append);});}else submit(()->{if(draft!=null&&!draft.optBoolean("pickerAppend")&&draft.getJSONArray("documents").length()==0&&(draft.optJSONArray("batchPending")==null||draft.getJSONArray("batchPending").length()==0)){draft=null;persistDraft();}emit("cancel",null);});}
        else if(request==FOLDER){if(result==RESULT_OK&&intent!=null&&intent.getData()!=null){Uri u=intent.getData();emit("busy","正在保存文件…");submit(()->saveToFolder(u));}else emit("cancel",null);}
    }
    private void handleBack(){if(web!=null)web.evaluateJavascript("window.handleBack()",null);}
    // Android 13+ uses the OnBackInvokedDispatcher registered in onCreate.
    // This override is only the Android 8-12 compatibility path.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed(){handleBack();}
    @Override protected void onDestroy(){super.onDestroy();maintenanceHandler.removeCallbacks(maintenance);worker.shutdown();if(web!=null){web.removeJavascriptInterface("Native");web.destroy();web=null;}}
    final class Bridge {
        @JavascriptInterface public void ready(){submit(()->{try{purgeExpired();}catch(Exception e){emit("toast","回收站清理失败，稍后将重试");}data();resumeBatch();});}
        @JavascriptInterface public void capture(String category,boolean append){submit(()->{initDraft(category,append);runOnUiThread(()->launchCamera());});}
        @JavascriptInterface public void importFile(String category,boolean append){submit(()->{initDraft(category,append);draft.put("pickerAppend",append);persistDraft();runOnUiThread(()->launchImport());});}
        @JavascriptInterface public void updateDraft(String json){submit(()->keepFields(new JSONObject(json)));}
        @JavascriptInterface public void save(String json){submit(()->{JSONObject f=new JSONObject(json);keepFields(f);draft.put("confirmed",f.optBoolean("confirmed"));for(int i=0;i<draft.getJSONArray("documents").length();i++){JSONObject d=draft.getJSONArray("documents").getJSONObject(i);if(!docs.file(d.getString("name")).isFile())throw new IOException("附件缺失");}JSONObject saved=store.save(draft);draft.put("savedId",saved.getString("id"));persistDraft();advanceBatch();emit("toast","发票已保存");});}
        @JavascriptInterface public void edit(String id){submit(()->{if(draft!=null)throw new IOException("请先处理当前草稿");draft=store.get(id);if(draft.optLong("deletedAt")>0){draft=null;throw new IOException("请先从回收站恢复发票");}draft.put("amount",BigDecimal.valueOf(draft.getLong("amountMinor"),2).toPlainString());persistDraft();emit("draft",draft);});}
        @JavascriptInterface public void discardDraft(){submit(()->discard());}
        /** Stores crop corners for an image attachment of the current draft (null removes them). The file itself is never changed. */
        @JavascriptInterface public void setCrop(int index,String json){submit(()->{
            if(draft==null)throw new IOException("没有草稿");JSONArray a=draft.getJSONArray("documents");if(index<0||index>=a.length())throw new IOException("附件无效");
            JSONObject d=a.getJSONObject(index);
            if(json==null||json.equals("null")||json.isEmpty()){d.remove("crop");persistDraft();return;}
            JSONObject c=new JSONObject(json);CropSpec spec=Documents.crop(new JSONObject().put("mime",d.optString("mime")).put("crop",c));
            if(spec==null)throw new IOException("裁剪区域无效，请重新调整四个角");
            JSONArray quad=new JSONArray();for(int i=0;i<4;i++)quad.put(new JSONArray().put(spec.quad[2*i]).put(spec.quad[2*i+1]));
            d.put("crop",new JSONObject().put("quad",quad).put("rotate",spec.rotate).put("auto",c.optBoolean("auto")));persistDraft();
        });}
        @JavascriptInterface public void removeAttachment(int index){submit(()->{if(draft==null)throw new IOException("没有草稿");JSONArray a=draft.getJSONArray("documents");if(index<0||index>=a.length())throw new IOException("附件无效");String name=a.getJSONObject(index).getString("name");a.remove(index);persistDraft();if(!referenced(name))docs.remove(name);emit("draft",draft);});}
        @JavascriptInterface public void delete(String id){submit(()->{JSONObject r=store.get(id);if(draft!=null&&id.equals(draft.optString("id")))discard();store.delete(id);JSONArray a=r.getJSONArray("documents");for(int i=0;i<a.length();i++){String n=a.getJSONObject(i).getString("name");if(!referenced(n))docs.remove(n);}data();emit("toast","发票已删除");});}
        @JavascriptInterface public void archiveExport(){submit(()->{if(lastExportIds.isEmpty())throw new IOException("请先成功导出发票");store.archive(lastExportIds);lastExportIds.clear();data();emit("toast","本次导出的发票已归档");});}
        @JavascriptInterface public void lifecycle(String id,String action){submit(()->{if(draft!=null&&id.equals(draft.optString("id")))throw new IOException("请先保存或放弃这张发票的草稿");purgeExpired();store.lifecycle(id,action);data();emit("toast",action.equals("trash")?"已移入回收站，可在 30 天内恢复":action.equals("recover")?"已恢复到归档区":"已取消归档，发票仍保留");});}
        @JavascriptInterface public void markDays(String from,String to,String type){submit(()->{store.markDays(from,to,type);data();emit("toast","日历状态已更新");});}
        @JavascriptInterface public void open(String receiptId,int index){submit(()->{JSONArray a=receiptId.equals("draft")?draft.getJSONArray("documents"):store.get(receiptId).getJSONArray("documents");JSONObject d=a.getJSONObject(index);emit("preview",d);});}
        @JavascriptInterface public void export(String json){submit(()->{lastExportIds.clear();JSONObject q=new JSONObject(json);String category=q.getString("category"),from=q.getString("from"),to=q.getString("to");if(!ReceiptStore.CATEGORIES.contains(category)||!from.matches("\\d{4}-\\d{2}-\\d{2}")||!to.matches("\\d{4}-\\d{2}-\\d{2}")||java.time.LocalDate.parse(to).isBefore(java.time.LocalDate.parse(from)))throw new IOException("请选择费用种类和有效日期范围");java.time.LocalDate.parse(from);JSONArray ids=q.getJSONArray("ids");Set<String> selected=new HashSet<>();for(int i=0;i<ids.length();i++)selected.add(ids.getString(i));List<JSONObject> rows=new ArrayList<>();for(String id:selected){JSONObject r=store.get(id);if(r.optLong("deletedAt")>0||!r.getString("category").equals(category)||r.getString("date").compareTo(from)<0||r.getString("date").compareTo(to)>0)throw new IOException("选中发票与分类或日期范围不符");rows.add(r);}rows.sort(Comparator.comparing((JSONObject r)->r.optString("date")).thenComparing(r->r.optString("id")));lastExport=exports.export(rows,category,from,to);lastExportIds=new HashSet<>(selected);JSONArray names=new JSONArray();for(File f:lastExport)names.put(f.getName());emit("exported",names);});}
        @JavascriptInterface public void shareExport(){runOnUiThread(()->{if(lastExport==null)failure(new IOException("请先生成文件"));else share(lastExport);});}
        @JavascriptInterface public void saveExport(){runOnUiThread(()->{if(lastExport==null){failure(new IOException("请先生成文件"));return;}try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivityForResult(i,FOLDER);}catch(Exception e){failure(new IOException("无法选择文件夹，请使用分享"));}});}
        @JavascriptInterface public void backup(){submit(()->{lastExportIds.clear();purgeExpired();lastExport=new File[]{exports.backup(store.list(),store.days())};JSONArray names=new JSONArray();names.put(lastExport[0].getName());emit("exported",names);});}
        @JavascriptInterface public void quit(){runOnUiThread(()->finish());}
    }
}
