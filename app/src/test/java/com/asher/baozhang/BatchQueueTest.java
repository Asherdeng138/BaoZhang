package com.asher.baozhang;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.Collections;

public class BatchQueueTest {
    @Test public void advancesInOrderAndRestoresRemainingProgress() {
        BatchQueue.Step<String> first=BatchQueue.next(Arrays.asList("first.pdf","second.jpg","third.png"),0,3);
        assertEquals("first.pdf",first.current);assertEquals(1,first.index);assertEquals(3,first.total);assertEquals(2,first.pending.size());
        // Saving or discarding the current receipt takes the same step, and a restart uses the persisted remainder.
        BatchQueue.Step<String> second=BatchQueue.next(first.pending,first.index,first.total);
        assertEquals("second.jpg",second.current);assertEquals(2,second.index);assertEquals(3,second.total);
        BatchQueue.Step<String> third=BatchQueue.next(second.pending,second.index,second.total);
        assertEquals("third.png",third.current);assertEquals(3,third.index);assertTrue(third.pending.isEmpty());
        assertNull(BatchQueue.next(third.pending,third.index,third.total));
    }
    @Test public void interruptedCopyRecoversTotalAndDoesNotMutateInput() {
        java.util.List<String> pending=new java.util.ArrayList<>(Arrays.asList("one","two"));
        BatchQueue.Step<String> step=BatchQueue.next(pending,0,0);assertEquals(2,step.total);assertEquals(2,pending.size());
        pending.clear();assertEquals("two",step.pending.get(0));
        try{step.pending.clear();fail("Queue must be immutable");}catch(UnsupportedOperationException expected){}
    }
    @Test(expected=IllegalArgumentException.class) public void rejectsNegativeProgress(){BatchQueue.next(Collections.singletonList("one"),-1,1);}
}
