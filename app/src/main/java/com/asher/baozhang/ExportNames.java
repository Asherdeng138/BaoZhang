package com.asher.baozhang;

import java.time.LocalDate;

/** Stable user-visible names; export directories provide collision isolation. */
final class ExportNames {
    static String base(String category,String from,String to) {
        if(category==null||!category.matches("[\\u4e00-\\u9fffA-Za-z0-9（）()]+")
            ||from==null||to==null||!from.matches("\\d{4}-\\d{2}-\\d{2}")||!to.matches("\\d{4}-\\d{2}-\\d{2}"))
            throw new IllegalArgumentException("请选择费用种类和有效日期范围");
        LocalDate start=LocalDate.parse(from),end=LocalDate.parse(to);
        if(end.isBefore(start))throw new IllegalArgumentException("结束日期不能早于开始日期");
        if(category.equals("市内交通（地铁）")) {
            String period=start.getYear()+"年"+start.getMonthValue()+"月";
            if(start.getYear()!=end.getYear()||start.getMonthValue()!=end.getMonthValue())
                period+="至"+(start.getYear()==end.getYear()?"":end.getYear()+"年")+end.getMonthValue()+"月";
            return period+"_市内交通报账";
        }
        return from+"至"+to+"_"+category+"报账";
    }
}
