package com.asher.baozhang;

import static org.junit.Assert.*;
import org.junit.Test;

public class CropSpecTest {
    @Test public void acceptsClockwiseQuadAndClampsSmallOverflow(){
        CropSpec c=CropSpec.of(new double[]{0.1,0.05,0.9,0.1,0.85,0.95,-0.005,0.9},90);
        assertNotNull(c);assertEquals(90,c.rotate);assertEquals(0,c.quad[6],0);
        assertFalse(c.isFullFrame());
        assertTrue(CropSpec.of(new double[]{0,0,1,0,1,1,0,1},0).isFullFrame());
    }
    @Test public void rejectsInvalidCrops(){
        assertNull(CropSpec.of(new double[]{0,0,1,0,1,1},0));                     // too few values
        assertNull(CropSpec.of(new double[]{0,0,1,0,1,1,0,1},45));                // bad rotation
        assertNull(CropSpec.of(new double[]{0,0,0,1,1,1,1,0},0));                 // counter-clockwise
        assertNull(CropSpec.of(new double[]{0,0,1,1,1,0,0,1},0));                 // self-intersecting
        assertNull(CropSpec.of(new double[]{0.5,0.5,0.6,0.5,0.6,0.6,0.5,0.6},0)); // area 1% < 2%
        assertNull(CropSpec.of(new double[]{0,0,2,0,1,1,0,1},0));                 // outside the image
        assertNull(CropSpec.of(new double[]{0,0,Double.NaN,0,1,1,0,1},0));
    }
    @Test public void outputSizeUsesLongestOppositeEdges(){
        int[] s=CropSpec.outputSize(new float[]{10,0,110,0,120,300,0,300});
        assertEquals(120,s[0]);assertTrue(s[1]>=300);
    }
}
