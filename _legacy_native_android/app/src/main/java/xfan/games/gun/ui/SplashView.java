package xfan.games.gun.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.View;

import java.util.Random;

/** 无素材时的程序化开屏动画（有视频/图片资源时会被覆盖隐藏）。 */
public class SplashView extends View {

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Random rnd = new Random();
    private long start = -1;
    private float[] px = new float[40];
    private float[] py = new float[40];
    private float[] pr = new float[40];

    public SplashView(Context context, AttributeSet attrs) {
        super(context, attrs);
        for (int i = 0; i < px.length; i++) {
            px[i] = rnd.nextFloat();
            py[i] = rnd.nextFloat();
            pr[i] = 1f + rnd.nextFloat() * 2.5f;
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (start < 0) start = System.currentTimeMillis();
        long t = System.currentTimeMillis() - start;
        float p = Math.min(1f, t / 2600f);
        int w = getWidth();
        int h = getHeight();

        // 背景
        LinearGradient g = new LinearGradient(0, 0, 0, h,
                0xff070c16, 0xff16233c, Shader.TileMode.CLAMP);
        paint.setShader(g);
        paint.setStyle(Paint.Style.FILL);
        canvas.drawRect(0, 0, w, h, paint);
        paint.setShader(null);

        // 网格
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1f);
        paint.setARGB(40, 255, 140, 90);
        float step = Math.max(48f, h / 14f);
        for (float x = (t / 40f) % step; x < w; x += step) {
            canvas.drawLine(x, 0, x, h, paint);
        }
        for (float y = 0; y < h; y += step) {
            canvas.drawLine(0, y, w, y, paint);
        }

        // 粒子
        paint.setStyle(Paint.Style.FILL);
        for (int i = 0; i < px.length; i++) {
            float yy = (py[i] + (t / 9000f) * (0.4f + pr[i] * 0.15f)) % 1f;
            paint.setARGB((int) (90 + 120 * (1f - yy)), 255, 170, 90);
            canvas.drawCircle(px[i] * w, yy * h, pr[i], paint);
        }

        // 标题
        float scale = 0.75f + 0.25f * easeOut(p);
        float alpha = Math.min(1f, p * 2.2f);
        paint.setARGB((int) (255 * alpha), 255, 255, 255);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTextSize(Math.min(w, h) * 0.14f * scale);
        paint.setFakeBoldText(true);
        paint.setShadowLayer(24, 0, 0, 0xffff5722);
        canvas.drawText("破 绷 战 场", w / 2f, h * 0.47f, paint);
        paint.setShadowLayer(0, 0, 0, 0);

        paint.setTextSize(Math.min(w, h) * 0.035f);
        paint.setFakeBoldText(false);
        paint.setARGB((int) (200 * alpha), 255, 200, 160);
        canvas.drawText("BREAKBIND  BATTLEFIELD", w / 2f, h * 0.56f, paint);

        // 扫描光带
        float sweep = ((t / 1400f) % 1f);
        paint.setARGB(60, 255, 255, 255);
        canvas.drawRect(0, sweep * h, w, sweep * h + 3f, paint);

        // 进度条
        float barW = w * 0.34f;
        float barH = 5f;
        float left = (w - barW) / 2f;
        float top = h * 0.74f;
        paint.setARGB(60, 255, 255, 255);
        canvas.drawRoundRect(new RectF(left, top, left + barW, top + barH), 3, 3, paint);
        paint.setARGB(230, 255, 112, 67);
        canvas.drawRoundRect(new RectF(left, top, left + barW * p, top + barH), 3, 3, paint);

        paint.setTextSize(Math.min(w, h) * 0.03f);
        paint.setARGB(150, 200, 220, 255);
        canvas.drawText("正在装载战场资源…", w / 2f, h * 0.80f, paint);

        if (p < 1f) invalidate();
    }

    private static float easeOut(float x) {
        return 1f - (1f - x) * (1f - x);
    }
}
