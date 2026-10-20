package xfan.games.gun.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

/** 左下虚拟摇杆。 */
public class JoystickView extends View {

    public interface Listener {
        void onMove(float x, float y);

        void onRelease();
    }

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private float cx, cy, radius;
    private float kx, ky;
    private boolean active;
    private Listener listener;

    public JoystickView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public void setListener(Listener l) {
        listener = l;
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        cx = w / 2f;
        cy = h / 2f;
        radius = Math.min(w, h) / 2f - 6f;
        kx = cx;
        ky = cy;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        paint.setStyle(Paint.Style.FILL);
        paint.setARGB(45, 255, 255, 255);
        canvas.drawCircle(cx, cy, radius, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f);
        paint.setARGB(110, 255, 255, 255);
        canvas.drawCircle(cx, cy, radius, paint);

        paint.setStyle(Paint.Style.FILL);
        paint.setARGB(active ? 200 : 130, 255, 112, 67);
        canvas.drawCircle(kx, ky, radius * 0.42f, paint);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_MOVE: {
                active = true;
                float dx = event.getX() - cx;
                float dy = event.getY() - cy;
                float d = (float) Math.sqrt(dx * dx + dy * dy);
                if (d > radius) {
                    dx *= radius / d;
                    dy *= radius / d;
                }
                kx = cx + dx;
                ky = cy + dy;
                if (listener != null) {
                    listener.onMove(dx / radius, dy / radius);
                }
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                active = false;
                kx = cx;
                ky = cy;
                if (listener != null) listener.onRelease();
                invalidate();
                return true;
            default:
                break;
        }
        return true;
    }
}
