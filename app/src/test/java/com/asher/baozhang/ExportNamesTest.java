package com.asher.baozhang;

import org.junit.Test;
import static org.junit.Assert.*;

public class ExportNamesTest {
    @Test public void usesChosenRangeAcrossMonthsAndKeepsCategory() {
        assertEquals("2026-09-30至2026-10-10_出差餐补报账",ExportNames.base("出差餐补","2026-09-30","2026-10-10"));
        assertEquals("2026年10月_市内交通报账",ExportNames.base("市内交通（地铁）","2026-10-10","2026-10-10"));
        assertEquals("2026年1月_市内交通报账",ExportNames.base("市内交通（地铁）","2026-01-02","2026-01-28"));
        assertEquals("2026年10月至11月_市内交通报账",ExportNames.base("市内交通（地铁）","2026-10-10","2026-11-20"));
        assertEquals("2026年12月至2027年1月_市内交通报账",ExportNames.base("市内交通（地铁）","2026-12-10","2027-01-20"));
    }
    @Test public void rejectsInvalidRangeAndUnsafeCategory() {
        assertThrows(IllegalArgumentException.class,()->ExportNames.base("../x","2026-10-01","2026-10-10"));
        assertThrows(java.time.DateTimeException.class,()->ExportNames.base("出差餐补","2026-02-30","2026-10-10"));
        assertThrows(IllegalArgumentException.class,()->ExportNames.base("出差餐补","2026-10-11","2026-10-10"));
    }
}
