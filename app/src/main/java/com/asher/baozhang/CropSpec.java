package com.asher.baozhang;

/**
 * Crop corners for an image attachment, stored with the attachment as
 * {"quad":[[x,y]x4 normalised 0..1, clockwise from top-left],"rotate":0|90|180|270}.
 * The original file is never modified; previews, exports and OCR apply this on the fly.
 */
final class CropSpec {
    final double[] quad; // x0,y0,x1,y1,x2,y2,x3,y3
    final int rotate;
    private CropSpec(double[] quad,int rotate){this.quad=quad;this.rotate=rotate;}

    /** Returns null when the values do not describe a usable crop. */
    static CropSpec of(double[] q,int rotate){
        if(q==null||q.length!=8)return null;
        if(rotate!=0&&rotate!=90&&rotate!=180&&rotate!=270)return null;
        for(double v:q)if(Double.isNaN(v)||v<-0.01||v>1.01)return null;
        double[] c=q.clone();for(int i=0;i<8;i++)c[i]=Math.min(1,Math.max(0,c[i]));
        // Must be a convex quadrilateral in clockwise (screen) order with a reasonable area.
        int sign=0;
        for(int i=0;i<4;i++){
            double ax=c[2*i],ay=c[2*i+1],bx=c[2*((i+1)%4)],by=c[2*((i+1)%4)+1],cx=c[2*((i+2)%4)],cy=c[2*((i+2)%4)+1];
            double cross=(bx-ax)*(cy-by)-(by-ay)*(cx-bx);
            int s=cross>1e-9?1:cross<-1e-9?-1:0;if(s==0)return null;if(sign==0)sign=s;else if(s!=sign)return null;
        }
        if(sign<0)return null;
        if(area(c)<0.02)return null;
        return new CropSpec(c,rotate);
    }
    static double area(double[] q){double a=0;for(int i=0;i<4;i++){int j=(i+1)%4;a+=q[2*i]*q[2*j+1]-q[2*j]*q[2*i+1];}return Math.abs(a)/2;}
    boolean isFullFrame(){double[] f={0,0,1,0,1,1,0,1};for(int i=0;i<8;i++)if(Math.abs(quad[i]-f[i])>0.002)return false;return true;}
    /** Corner points in pixels of a bitmap of the given size. */
    float[] pixels(int w,int h){float[] p=new float[8];for(int i=0;i<4;i++){p[2*i]=(float)(quad[2*i]*(w-1));p[2*i+1]=(float)(quad[2*i+1]*(h-1));}return p;}
    /** Output size before rotation: the longer opposite edges. */
    static int[] outputSize(float[] p){
        double top=Math.hypot(p[2]-p[0],p[3]-p[1]),bottom=Math.hypot(p[4]-p[6],p[5]-p[7]),left=Math.hypot(p[6]-p[0],p[7]-p[1]),right=Math.hypot(p[4]-p[2],p[5]-p[3]);
        return new int[]{Math.max(1,(int)Math.round(Math.max(top,bottom))),Math.max(1,(int)Math.round(Math.max(left,right)))};
    }
}
