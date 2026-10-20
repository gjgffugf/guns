package xfan.games.gun.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;

/** 通用条状进度（血条）。 */
public class BarView extends View {

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private float value = 1f;

    public BarView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public void setValue(float v) {
        float nv = Math.max(0f, Math.min(1f, v));
        if (Math.abs(nv - value) > 0.001f) {
            value = nv;
            invalidate();
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float w = getWidth();
        float h = getHeight();
        RectF bg = new RectF(0, 0, w, h);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(0x66000000);
        canvas.drawRoundRect(bg, h / 2f, h / 2f, paint);

        int color = value > 0.55f ? 0xFF3DDC84 : (value > 0.28f ? 0xFFFFB300 : 0xFFFF5252);
        paint.setColor(color);
        canvas.drawRoundRect(new RectF(0, 0, w * value, h), h / 2f, h / 2f, paint);

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1f);
        paint.setColor(0x55FFFFFF);
        canvas.drawRoundRect(bg, h / 2f, h / 2f, paint);
    }
}
