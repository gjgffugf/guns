package xfan.games.gun.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.util.AttributeSet;
import android.view.View;

/** 准星：腰射为十字，开镜为细十字+圆点，命中时出现 hitmarker。 */
public class CrosshairView extends View {

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private boolean ads;
    private float hitTime;
    private float spreadPx = 8f;

    public CrosshairView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public void setAds(boolean ads) {
        if (this.ads != ads) {
            this.ads = ads;
            invalidate();
        }
    }

    public void setSpread(float px) {
        spreadPx = px;
    }

    public void hit() {
        hitTime = System.currentTimeMillis();
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float cx = getWidth() / 2f;
        float cy = getHeight() / 2f;
        float gap = ads ? 3f : (4f + spreadPx);
        float len = ads ? 7f : 9f;
        float th = ads ? 1.4f : 2.2f;

        paint.setColor(0xFFFFFFFF);
        paint.setStrokeWidth(th);
        paint.setStyle(Paint.Style.STROKE);
        canvas.drawLine(cx - gap - len, cy, cx - gap, cy, paint);
        canvas.drawLine(cx + gap, cy, cx + gap + len, cy, paint);
        canvas.drawLine(cx, cy - gap - len, cx, cy - gap, paint);
        canvas.drawLine(cx, cy + gap, cx, cy + gap + len, paint);

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(0xCCFFFFFF);
        canvas.drawCircle(cx, cy, ads ? 1.2f : 1.8f, paint);

        if (ads) {
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1f);
            paint.setColor(0x33000000);
            canvas.drawCircle(cx, cy, getWidth() * 0.30f, paint);
        }

        long since = System.currentTimeMillis() - hitTime;
        if (since < 220) {
            float a = 1f - since / 220f;
            paint.setColor(0xFFFF5544);
            paint.setStrokeWidth(2.5f);
            paint.setAlpha((int) (255 * a));
            float d1 = 7f, d2 = 14f;
            canvas.drawLine(cx - d2, cy - d2, cx - d1, cy - d1, paint);
            canvas.drawLine(cx + d1, cy - d2, cx + d2, cy - d1, paint);
            canvas.drawLine(cx - d2, cy + d1, cx - d1, cy + d2, paint);
            canvas.drawLine(cx + d1, cy + d1, cx + d2, cy + d2, paint);
            paint.setAlpha(255);
            postInvalidateDelayed(30);
        }
    }
}
