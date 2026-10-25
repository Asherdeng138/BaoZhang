package com.asher.baozhang;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Immutable queue step: one imported file becomes one receipt, never an attachment append. */
final class BatchQueue {
    static final class Step<T> {
        final T current;
        final List<T> pending;
        final int index,total;
        Step(T current,List<T> pending,int index,int total){this.current=current;this.pending=Collections.unmodifiableList(pending);this.index=index;this.total=total;}
    }
    static <T> Step<T> next(List<T> pending,int completed,int total) {
        if(completed<0||total<0)throw new IllegalArgumentException("批次进度无效");
        if(pending.isEmpty())return null;
        int actualTotal=Math.max(total,completed+pending.size());
        return new Step<>(pending.get(0),new ArrayList<>(pending.subList(1,pending.size())),completed+1,actualTotal);
    }
}
