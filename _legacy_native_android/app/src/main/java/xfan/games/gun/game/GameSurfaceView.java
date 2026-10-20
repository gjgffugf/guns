package xfan.games.gun.game;

import android.content.Context;
import android.opengl.GLSurfaceView;
import android.util.AttributeSet;
import android.view.MotionEvent;

/** 游戏画面 + 右半屏滑动转视角。 */
public class GameSurfaceView extends GLSurfaceView {

    public static final float LOOK_SENSITIVITY = 0.30f;

    private InputState input;
    private int lookPointer = -1;
    private float lastX, lastY;
    private float zoneStart = 0.35f;

    public GameSurfaceView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    public GameSurfaceView(Context context, InputState input) {
        super(context);
        this.input = input;
        init();
    }

    public void setInput(InputState input) {
        this.input = input;
    }

    private void init() {
        setEGLContextClientVersion(2);
        setPreserveEGLContextOnPause(true);
        setFocusable(true);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (input == null) return super.onTouchEvent(event);
        float w = getWidth();
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                if (event.getX() > w * zoneStart) {
                    lookPointer = event.getPointerId(0);
                    lastX = event.getX();
                    lastY = event.getY();
                }
                break;
            case MotionEvent.ACTION_POINTER_DOWN: {
                int idx = event.getActionIndex();
                if (event.getX(idx) > w * zoneStart && lookPointer == -1) {
                    lookPointer = event.getPointerId(idx);
                    lastX = event.getX(idx);
                    lastY = event.getY(idx);
                }
                break;
            }
            case MotionEvent.ACTION_MOVE: {
                int idx = (lookPointer == -1) ? -1 : event.findPointerIndex(lookPointer);
                if (idx >= 0) {
                    float x = event.getX(idx);
                    float y = event.getY(idx);
                    input.lookYaw -= (x - lastX) * LOOK_SENSITIVITY;
                    input.lookPitch -= (y - lastY) * LOOK_SENSITIVITY;
                    lastX = x;
                    lastY = y;
                }
                break;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
            case MotionEvent.ACTION_POINTER_UP: {
                int upId = event.getPointerId(event.getActionIndex());
                if (upId == lookPointer) lookPointer = -1;
                break;
            }
            default:
                break;
        }
        return true;
    }
}
