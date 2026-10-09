package com.asher.baozhang;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Small standalone OOXML writer. Strings are always inline text, never formulas. */
final class XlsxWriter {
    static class Row {
        String id,date,category,currency,merchant,location,note,pages;long amountMinor;int attachments;
        Row(String id,String date,String category,String currency,String merchant,String location,String note,long minor,int attachments,String pages){this.id=id;this.date=date;this.category=category;this.currency=currency;this.merchant=merchant;this.location=location;this.note=note;this.amountMinor=minor;this.attachments=attachments;this.pages=pages;}
    }
    static String xml(String s){StringBuilder b=new StringBuilder();for(int i=0;i<s.length();i++){char c=s.charAt(i);if(c=='&')b.append("&amp;");else if(c=='<')b.append("&lt;");else if(c=='>')b.append("&gt;");else if(c=='\"')b.append("&quot;");else if(c=='\'')b.append("&apos;");else if(c=='\n'||c=='\r'||c=='\t'||c>=32)b.append(c);}return b.toString();}
    private static String cell(String ref,String text,int style){return "<c r=\""+ref+"\" s=\""+style+"\" t=\"inlineStr\"><is><t xml:space=\"preserve\">"+xml(text)+"</t></is></c>";}
    private static String number(String ref,String value,int style){return "<c r=\""+ref+"\" s=\""+style+"\"><v>"+value+"</v></c>";}
    private static void entry(ZipOutputStream z,String name,String value) throws IOException {z.putNextEntry(new ZipEntry(name));z.write(value.getBytes(StandardCharsets.UTF_8));z.closeEntry();}
    private static String startSheet(String widths){return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews><cols>"+widths+"</cols><sheetData>";}
    static void write(File destination,List<Row> rows) throws IOException {
        String[] headers={"序号","费用种类","费用日期","商家 / 运营方","所在地","金额（£）","备注","附件数","合并PDF页码","记录编号"};
        StringBuilder detail=new StringBuilder(startSheet("<col min=\"1\" max=\"1\" width=\"8\" customWidth=\"1\"/><col min=\"2\" max=\"3\" width=\"20\" customWidth=\"1\"/><col min=\"4\" max=\"5\" width=\"28\" customWidth=\"1\"/><col min=\"6\" max=\"7\" width=\"14\" customWidth=\"1\"/><col min=\"8\" max=\"8\" width=\"40\" customWidth=\"1\"/><col min=\"9\" max=\"11\" width=\"20\" customWidth=\"1\"/>"));
        detail.append("<row r=\"1\" ht=\"26\" customHeight=\"1\">");for(int i=0;i<headers.length;i++)detail.append(cell(""+(char)('A'+i)+1,headers[i],1));detail.append("</row>");
        Map<String,Long> groups=new LinkedHashMap<>();Map<String,Integer> counts=new HashMap<>();long total=0;
        int n=2;for(Row r:rows){String key=r.category;groups.put(key,groups.getOrDefault(key,0L)+r.amountMinor);counts.put(key,counts.getOrDefault(key,0)+1);total+=r.amountMinor;
            detail.append("<row r=\"").append(n).append("\" ht=\"34\" customHeight=\"1\">").append(number("A"+n,String.valueOf(n-1),0)).append(cell("B"+n,r.category,0)).append(cell("C"+n,r.date,0)).append(cell("D"+n,r.merchant,0)).append(cell("E"+n,r.location,0)).append(number("F"+n,BigDecimal.valueOf(r.amountMinor,2).toPlainString(),2)).append(cell("G"+n,r.note,0)).append(number("H"+n,String.valueOf(r.attachments),0)).append(cell("I"+n,r.pages,0)).append(cell("J"+n,r.id,0)).append("</row>");n++;
        }detail.append("</sheetData><autoFilter ref=\"A1:J").append(n-1).append("\"/><pageMargins left=\"0.3\" right=\"0.3\" top=\"0.5\" bottom=\"0.5\" header=\"0.2\" footer=\"0.2\"/></worksheet>");
        StringBuilder summary=new StringBuilder(startSheet("<col min=\"1\" max=\"1\" width=\"24\" customWidth=\"1\"/><col min=\"2\" max=\"4\" width=\"20\" customWidth=\"1\"/>"));
        summary.append("<row r=\"1\">").append(cell("A1","费用种类",1)).append(cell("B1","发票数",1)).append(cell("C1","合计金额（£）",1)).append("</row>");n=2;
        for(Map.Entry<String,Long> e:groups.entrySet()){summary.append("<row r=\"").append(n).append("\">").append(cell("A"+n,e.getKey(),0)).append(number("B"+n,String.valueOf(counts.get(e.getKey())),0)).append(number("C"+n,BigDecimal.valueOf(e.getValue(),2).toPlainString(),2)).append("</row>");n++;}
        summary.append("<row r=\"").append(n).append("\">").append(cell("A"+n,"总计",1)).append(number("B"+n,String.valueOf(rows.size()),0)).append(number("C"+n,BigDecimal.valueOf(total,2).toPlainString(),2)).append("</row>");
        summary.append("<row r=\"").append(n+2).append("\">").append(cell("A"+(n+2),"所有金额均为英镑（£）。",0)).append("</row></sheetData></worksheet>");
        try(ZipOutputStream z=new ZipOutputStream(new FileOutputStream(destination))){
            entry(z,"[Content_Types].xml","<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>");
            entry(z,"_rels/.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
            entry(z,"xl/workbook.xml","<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"发票明细\" sheetId=\"1\" r:id=\"rId1\"/><sheet name=\"分类汇总\" sheetId=\"2\" r:id=\"rId2\"/></sheets></workbook>");
            entry(z,"xl/_rels/workbook.xml.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/><Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>");
            entry(z,"xl/styles.xml","<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><color rgb=\"FFFFFFFF\"/><name val=\"Calibri\"/></font></fonts><fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF246B5B\"/><bgColor indexed=\"64\"/></patternFill></fill></fills><borders count=\"1\"><border/></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"3\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyAlignment=\"1\"><alignment vertical=\"center\" wrapText=\"1\"/></xf><xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"0\" xfId=\"0\" applyFill=\"1\" applyFont=\"1\"/><xf numFmtId=\"2\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\"/></cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>");
            entry(z,"xl/worksheets/sheet1.xml",detail.toString());entry(z,"xl/worksheets/sheet2.xml",summary.toString());
        }
    }
}
