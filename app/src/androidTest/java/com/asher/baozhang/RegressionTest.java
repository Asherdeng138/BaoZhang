package com.asher.baozhang;

import android.content.Context;
import android.content.Intent;
import android.app.Activity;
import android.graphics.Bitmap;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class RegressionTest {
    private ActivityScenario<MainActivity> scenario;
    private final UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
    private Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    private WebView web(MainActivity a){return (WebView)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0).findViewWithTag("receipt-web");}
    private void execute(String code){scenario.onActivity(a->web(a).evaluateJavascript(code,null));}
    private String value(String code) throws Exception {
        ArrayBlockingQueue<String> result=new ArrayBlockingQueue<>(1);
        scenario.onActivity(a->web(a).evaluateJavascript(code,result::offer));
        String answer=result.poll(10,TimeUnit.SECONDS);assertNotNull("JavaScript response timed out",answer);return answer;
    }
    private void eventually(String code,String expected) throws Exception {
        long end=System.currentTimeMillis()+15000;String actual="";
        do{actual=value(code);if(expected.equals(actual))return;Thread.sleep(100);}while(System.currentTimeMillis()<end);
        assertEquals(code,expected,actual);
    }
    private void answer(boolean accept){
        String id=accept?"button1":"button2";
        assertTrue("Native confirmation must be displayed",device.wait(Until.hasObject(By.res("android",id)),5000));
        device.findObject(By.res("android",id)).click();
        assertTrue(device.wait(Until.gone(By.res("android",id)),5000));
    }
    private JSONObject fixture() throws Exception {
        Context c=context();c.deleteDatabase("receipts.db");new File(c.getFilesDir(),"draft.json").delete();
        Documents docs=new Documents(c);File file=docs.file("regression-receipt.png");
        Bitmap image=Bitmap.createBitmap(32,48,Bitmap.Config.ARGB_8888);
        try(FileOutputStream out=new FileOutputStream(file)){image.compress(Bitmap.CompressFormat.PNG,100,out);}finally{image.recycle();}
        return new JSONObject().put("date","2026-10-10").put("amount","12.38").put("merchant","Regression receipt")
                .put("category","办公用品").put("location","").put("note","").put("ocr","").put("confirmed",true)
                .put("documents",new JSONArray().put(docs.describe(file,"image/png")));
    }
    @Test public void removeCancelReuploadAndDeletePersist() throws Exception {
        JSONObject draft=fixture();
        try(FileOutputStream out=new FileOutputStream(new File(context().getFilesDir(),"draft.json"))){out.write(draft.toString().getBytes(StandardCharsets.UTF_8));}
        try(ActivityScenario<MainActivity> opened=ActivityScenario.launch(MainActivity.class)){
            scenario=opened;eventually("typeof S!=='undefined' && !!S.draft","true");
            execute("showEditor();document.querySelector('[data-remove]').click()");answer(false);
            eventually("S.draft.documents.length","1");
            execute("document.querySelector('[data-remove]').click()");answer(true);
            eventually("S.draft.documents.length","0");
            assertFalse(new File(context().getFilesDir(),"documents/regression-receipt.png").exists());
            assertEquals("true",value("!!document.getElementById('appendFile') && !S.busy"));
            File replacement=new Documents(context()).file("replacement.png");
            Bitmap image=Bitmap.createBitmap(32,48,Bitmap.Config.ARGB_8888);
            try(FileOutputStream out=new FileOutputStream(replacement)){image.compress(Bitmap.CompressFormat.PNG,100,out);}finally{image.recycle();}
            // Supply the same URI result as the system picker. This runs the native
            // import, copy, OCR and draft persistence code (without external picker UI).
            Intent picked=new Intent().setData(FileProvider.getUriForFile(context(),context().getPackageName()+".files",replacement));
            scenario.onActivity(a->a.onActivityResult(101,Activity.RESULT_OK,picked));
            eventually("S.draft.documents.length","1");eventually("S.busy","false");
            execute("showEditor();document.getElementById('editConfirmed').checked=true;document.getElementById('saveReceipt').click()");
            eventually("S.receipts.length","1");
            execute("showDetail(S.receipts[0].id);document.querySelector('[data-delete]').click()");answer(false);
            eventually("S.receipts.length","1");
            execute("document.querySelector('[data-delete]').click()");answer(true);
            eventually("S.receipts.length","0");
            try(ReceiptStore store=new ReceiptStore(context())){assertEquals(0,store.list().length());}
        }
        try(ActivityScenario<MainActivity> opened=ActivityScenario.launch(MainActivity.class)){
            scenario=opened;eventually("typeof S!=='undefined' && !S.demo","true");eventually("S.receipts.length","0");
        }
    }
    @Test public void containerReservesInsetsAndClearsKeyboardSpace() throws Exception {
        fixture();
        try(ActivityScenario<MainActivity> opened=ActivityScenario.launch(MainActivity.class)){
            scenario=opened;eventually("typeof S!=='undefined' && !S.demo","true");
            scenario.onActivity(a->{
                ViewGroup root=(ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);
                WebView w=web(a);WindowInsetsCompat current=ViewCompat.getRootWindowInsets(root);assertNotNull(current);
                Insets bars=current.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
                int[] position=new int[2];w.getLocationInWindow(position);
                assertTrue("WebView must start below status bar/cutout",position[1]>=bars.top);
                int types=WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout();
                WindowInsetsCompat keyboard=new WindowInsetsCompat.Builder(current).setInsets(types,Insets.of(18,86,12,30))
                        .setInsets(WindowInsetsCompat.Type.ime(),Insets.of(0,0,0,340)).build();
                WindowInsetsCompat passed=ViewCompat.dispatchApplyWindowInsets(root,keyboard);
                assertEquals(86,root.getPaddingTop());assertEquals(18,root.getPaddingLeft());assertEquals(340,root.getPaddingBottom());
                assertEquals(Insets.NONE,passed.getInsets(types|WindowInsetsCompat.Type.ime()));
                ViewCompat.dispatchApplyWindowInsets(root,new WindowInsetsCompat.Builder(keyboard).setInsets(WindowInsetsCompat.Type.ime(),Insets.NONE).build());
                assertEquals("Keyboard space is released",30,root.getPaddingBottom());
                assertEquals(0,w.getPaddingTop());ViewCompat.requestApplyInsets(root);
            });
        }
    }
}
