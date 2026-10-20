package xfan.games.gun.game;

import android.opengl.GLES20;
import android.opengl.GLSurfaceView;

import java.util.ArrayList;
import java.util.List;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/** OpenGL ES 2.0 渲染器：全部图形由代码程序化生成（临时测试模型）。 */
public class Renderer implements GLSurfaceView.Renderer {

    public interface HudListener {
        void onHud(int fps, int hp, int mag, int reserve, boolean reloading, boolean dead);

        void onNetInfo(String text);
    }

    private final World world;
    private final InputState input;
    private final HudListener hud;

    private Program prog;
    private Mesh cube;

    private final float[] proj = Mat4.identity();
    private final float[] view = Mat4.identity();
    private final float[] mvp = Mat4.identity();
    private final float[] model = Mat4.identity();
    private final float[] projView = Mat4.identity();

    private float[] camPos = new float[3];
    private final float[] lightDir = {0.45f, 0.85f, 0.3f};
    private final float[] fogColor = {0.09f, 0.13f, 0.20f};

    private int width = 1, height = 1;
    private float aspect = 1f;

    private long lastFrameNs = 0;
    private long lastDrawNs = 0;
    private float frameEma = 16.7f;
    private int targetFps = 60;
    private long hudTimer = 0;

    private float fov = World.HIP_FOV;
    private float bobPhase;
    private float hitFlash;

    public Renderer(World world, InputState input, HudListener hud) {
        this.world = world;
        this.input = input;
        this.hud = hud;
    }

    public void setTargetFps(int fps) {
        this.targetFps = fps;
    }

    public int getMeasuredFps() {
        return Math.round(1000f / Math.max(frameEma, 0.5f));
    }

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        GLES20.glClearColor(fogColor[0], fogColor[1], fogColor[2], 1f);
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthFunc(GLES20.GL_LEQUAL);
        GLES20.glDisable(GLES20.GL_CULL_FACE);
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
        prog = Program.create();
        cube = Mesh.unitCube();
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int w, int h) {
        width = w;
        height = h;
        aspect = (h > 0) ? (float) w / h : 1f;
        GLES20.glViewport(0, 0, w, h);
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        long now = System.nanoTime();
        long interval = Math.round(1_000_000_000L / (double) targetFps);
        if (lastDrawNs != 0 && (now - lastDrawNs) < interval - 1_200_000L) {
            return; // 帧率上限节流（高于屏幕刷新率时以硬件为准）
        }
        float dt;
        if (lastFrameNs == 0) dt = 0.016f;
        else dt = (now - lastFrameNs) / 1_000_000_000f;
        if (dt > 0.06f) dt = 0.06f;
        if (dt < 0.0005f) dt = 0.0005f;
        lastFrameNs = now;
        if (lastDrawNs != 0) {
            frameEma = frameEma * 0.85f + ((now - lastDrawNs) / 1_000_000f) * 0.15f;
        }
        lastDrawNs = now;

        world.update(dt, input);

        fov += (lerpFov() - fov) * Math.min(1f, dt * 14f);
        if (hitFlash > 0) hitFlash -= dt;

        renderScene(dt);

        // HUD 刷新（节流）
        if (now - hudTimer > 180_000_000L) {
            hudTimer = now;
            if (hud != null) {
                final int fps = getMeasuredFps();
                final int hp = Math.max(0, world.player.hp);
                final int mag = world.mag;
                final int reserve = world.reserve;
                final boolean reloading = world.reloadTimer > 0;
                final boolean dead = world.dead;
                hud.onHud(fps, hp, mag, reserve, reloading, dead);
            }
        }
    }

    private float lerpFov() {
        return World.HIP_FOV + (World.ADS_FOV - World.HIP_FOV) * world.adsAmount;
    }

    private void renderScene(float dt) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthMask(true);

        prog.use();
        GLES20.glUniform3f(prog.uLightDir, lightDir[0], lightDir[1], lightDir[2]);
        GLES20.glUniform3f(prog.uFogColor, fogColor[0], fogColor[1], fogColor[2]);
        GLES20.glUniform1f(prog.uFogNear, 25f);
        GLES20.glUniform1f(prog.uFogFar, 150f);
        GLES20.glUniform1f(prog.uAlpha, 1f);

        float[] eye = eyeOfPlayer();
        camPos = eye;
        Mat4.perspective(proj, fov, aspect, 0.06f, 400f);
        Mat4.viewFps(view, eye[0], eye[1], eye[2],
                world.player.yaw + world.recoilYaw,
                world.player.pitch + world.recoilPitch);
        Mat4.multiply(projView, proj, view);
        GLES20.glUniform3f(prog.uCam, eye[0], eye[1], eye[2]);

        // 地图
        for (World.Box b : world.obstacles) {
            Mat4.setIdentity(model);
            Mat4.translate(model, b.cx, b.cy, b.cz);
            Mat4.scale(model, b.hx * 2f, b.hy * 2f, b.hz * 2f);
            draw(b.color);
        }

        // 人机
        for (Entity e : world.bots) {
            if (!e.alive) continue;
            drawHumanoid(e, new float[]{0.78f, 0.24f, 0.20f});
            drawHealthBar(e);
        }
        // 联网玩家
        for (Entity e : world.remotes) {
            if (!e.alive) continue;
            drawHumanoid(e, new float[]{0.24f, 0.58f, 0.86f});
            drawHealthBar(e);
        }

        // 曳光弹
        GLES20.glDepthMask(false);
        for (World.Tracer t : world.tracers) {
            float alpha = Math.max(0f, t.life / 0.07f);
            GLES20.glUniform1f(prog.uAlpha, alpha);
            float yaw = (float) Math.toDegrees(Math.atan2(-t.dx, -t.dz));
            float pitch = (float) Math.toDegrees(Math.asin(Math.max(-1f, Math.min(1f, t.dy))));
            Mat4.setIdentity(model);
            Mat4.translate(model, t.ox + t.dx * t.len * 0.5f,
                    t.oy + t.dy * t.len * 0.5f,
                    t.oz + t.dz * t.len * 0.5f);
            Mat4.rotate(model, yaw, 0f, 1f, 0f);
            Mat4.rotate(model, pitch, 1f, 0f, 0f);
            Mat4.scale(model, 0.035f, 0.035f, t.len);
            draw(t.color);
        }
        GLES20.glUniform1f(prog.uAlpha, 1f);
        GLES20.glDepthMask(true);

        // 第一人称武器
        GLES20.glClear(GLES20.GL_DEPTH_BUFFER_BIT);
        drawViewModel(dt);
    }

    private float[] eyeOfPlayer() {
        Entity p = world.player;
        float h = p.eyeHeight();
        // 头部摆动
        float bob = (float) Math.sin(bobPhase) * 0.022f * (1f - world.adsAmount);
        return new float[]{p.x, p.y + h + bob, p.z};
    }

    private void draw(float[] color) {
        GLES20.glUniform3f(prog.uColor, color[0], color[1], color[2]);
        Mat4.multiply(mvp, projView, model);
        GLES20.glUniformMatrix4fv(prog.uMVP, 1, false, mvp, 0);
        GLES20.glUniformMatrix4fv(prog.uModel, 1, false, model, 0);
        cube.bind(prog.aPos, prog.aNormal);
        cube.draw();
    }

    // ===== 人形（程序化） =====
    private void drawHumanoid(Entity e, float[] color) {
        float[] base = Mat4.identity();
        Mat4.translate(base, e.x, e.y, e.z);
        Mat4.rotate(base, e.yaw, 0f, 1f, 0f);
        boolean prone = (e.stance == Entity.STANCE_PRONE);
        boolean crouch = (e.stance == Entity.STANCE_CROUCH);
        if (prone) {
            Mat4.rotate(base, 82f, 1f, 0f, 0f);
            Mat4.translate(base, 0f, 0.12f, 0f);
        } else if (crouch) {
            Mat4.scale(base, 1f, 0.72f, 1f);
        }

        float swing = (float) Math.sin(e.walkPhase) * 0.5f;
        float[] dark = {color[0] * 0.7f, color[1] * 0.7f, color[2] * 0.7f};
        float[] skin = {0.86f, 0.70f, 0.55f};

        // 腿
        for (int s = -1; s <= 1; s += 2) {
            float[] m = Mat4.identity();
            Mat4.copy(m, base);
            Mat4.translate(m, 0.15f * s, 0.85f, 0f);
            Mat4.rotate(m, swing * 32f * s, 1f, 0f, 0f);
            Mat4.translate(m, 0f, -0.42f, 0f);
            Mat4.scale(m, 0.17f, 0.85f, 0.19f);
            Mat4.setIdentity(model);
            Mat4.copy(model, m);
            draw(dark);
        }
        // 躯干
        float[] m = Mat4.identity();
        Mat4.copy(m, base);
        Mat4.translate(m, 0f, 1.16f, 0f);
        Mat4.scale(m, 0.52f, 0.62f, 0.30f);
        Mat4.copy(model, m);
        draw(color);
        // 头
        Mat4.copy(m, base);
        Mat4.translate(m, 0f, 1.60f, 0f);
        Mat4.scale(m, 0.26f, 0.28f, 0.26f);
        Mat4.copy(model, m);
        draw(skin);
        // 头盔
        Mat4.copy(m, base);
        Mat4.translate(m, 0f, 1.70f, 0f);
        Mat4.scale(m, 0.30f, 0.10f, 0.30f);
        Mat4.copy(model, m);
        draw(dark);
        // 手臂 + 武器
        for (int s = -1; s <= 1; s += 2) {
            Mat4.copy(m, base);
            Mat4.translate(m, 0.34f * s, 1.42f, 0f);
            Mat4.rotate(m, -20f - swing * 18f * s, 1f, 0f, 0f);
            Mat4.translate(m, 0f, -0.26f, -0.06f);
            Mat4.scale(m, 0.14f, 0.55f, 0.15f);
            Mat4.copy(model, m);
            draw(color);
        }
        // 手中武器
        Mat4.copy(m, base);
        Mat4.translate(m, 0.30f, 1.20f, -0.30f);
        Mat4.scale(m, 0.08f, 0.10f, 0.62f);
        Mat4.copy(model, m);
        draw(new float[]{0.16f, 0.16f, 0.18f});
    }

    private void drawHealthBar(Entity e) {
        float y = e.y + e.bodyHeight() + 0.28f;
        float[] m = Mat4.identity();
        Mat4.setIdentity(m);
        Mat4.translate(m, e.x, y, e.z);
        Mat4.rotate(m, -world.player.yaw, 0f, 1f, 0f);
        Mat4.scale(m, 0.92f, 0.10f, 0.03f);
        Mat4.copy(model, m);
        GLES20.glUniform1f(prog.uAlpha, 0.65f);
        draw(new float[]{0.05f, 0.05f, 0.05f});
        float ratio = Math.max(0f, (float) e.hp / e.maxHp);
        Mat4.setIdentity(m);
        Mat4.translate(m, e.x - 0.46f * (1f - ratio), y, e.z);
        Mat4.rotate(m, -world.player.yaw, 0f, 1f, 0f);
        Mat4.scale(m, 0.92f * ratio, 0.10f, 0.035f);
        Mat4.copy(model, m);
        GLES20.glUniform1f(prog.uAlpha, 1f);
        draw(ratio > 0.35f ? new float[]{0.25f, 0.85f, 0.35f} : new float[]{0.9f, 0.25f, 0.2f});
    }

    // ===== 第一人称武器 =====
    private void drawViewModel(float dt) {
        float ads = world.adsAmount;
        Entity p = world.player;
        float moving = (Math.abs(p.vx) + Math.abs(p.vz) > 1.2f) ? 1f : 0f;
        boolean sprinting = input != null && input.sprint
                && Math.abs(p.vz) + Math.abs(p.vx) > 2f;
        bobPhase += dt * (moving * (sprinting ? 11f : 7f));

        float bobX = (float) Math.sin(bobPhase) * 0.016f * moving * (1f - ads * 0.85f);
        float bobY = (float) Math.abs(Math.cos(bobPhase)) * 0.014f * moving * (1f - ads * 0.85f);

        float hipX = 0.20f, hipY = -0.17f, hipZ = -0.42f;
        float adsX = 0f, adsY = -0.082f, adsZ = -0.30f;
        float px = hipX + (adsX - hipX) * ads + bobX;
        float py = hipY + (adsY - hipY) * ads + bobY;
        float pz = hipZ + (adsZ - hipZ) * ads + world.muzzleFlash * 0.35f;

        GLES20.glUniform1f(prog.uFogNear, 1000f);
        GLES20.glUniform1f(prog.uFogFar, 2000f);
        Mat4.perspective(proj, 58f, aspect, 0.01f, 8f);
        Mat4.setIdentity(view);
        Mat4.multiply(projView, proj, view);
        GLES20.glUniform3f(prog.uCam, 0f, 0f, 0f);

        float[] base = Mat4.identity();
        Mat4.translate(base, px, py, pz);
        Mat4.rotate(base, -6f * (1f - ads), 0f, 0f, 1f);
        Mat4.rotate(base, 8f * (1f - ads), 0f, 1f, 0f);
        Mat4.rotate(base, -world.muzzleFlash * 22f, 1f, 0f, 0f);

        float[] gun = {0.17f, 0.17f, 0.19f};
        float[] dark = {0.09f, 0.09f, 0.10f};
        float[] skin = {0.86f, 0.70f, 0.55f};

        // 机匣
        float[] m = Mat4.identity();
        Mat4.copy(m, base);
        Mat4.scale(m, 0.09f, 0.10f, 0.44f);
        Mat4.copy(model, m);
        draw(gun);
        // 枪管
        Mat4.copy(m, base);
        Mat4.translate(m, 0f, 0.015f, -0.40f);
        Mat4.scale(m, 0.045f, 0.045f, 0.36f);
        Mat4.copy(model, m);
        draw(dark);
        // 枪托
        Mat4.copy(m, base);
        Mat4.translate(m, 0f, -0.02f, 0.34f);
        Mat4.scale(m, 0.07f, 0.11f, 0.22f);
        Mat4.copy(model, m);
        draw(gun);
        // 握把
        Mat4.copy(m, base);
        Mat4.translate(m, 0f, -0.11f, 0.16f);
        Mat4.rotate(m, -12f, 1f, 0f, 0f);
        Mat4.scale(m, 0.06f, 0.17f, 0.08f);
        Mat4.copy(model, m);
        draw(dark);
        // 弹匣
        Mat4.copy(m, base);
        Mat4.translate(m, 0f, -0.15f, -0.06f);
        Mat4.scale(m, 0.055f, 0.20f, 0.10f);
        Mat4.copy(model, m);
        draw(dark);
        // 瞄具
        Mat4.copy(m, base);
        Mat4.translate(m, 0f, 0.085f, -0.12f);
        Mat4.scale(m, 0.05f, 0.045f, 0.10f);
        Mat4.copy(model, m);
        draw(dark);
        // 手
        Mat4.copy(m, base);
        Mat4.translate(m, 0.005f, -0.09f, 0.10f);
        Mat4.scale(m, 0.10f, 0.12f, 0.12f);
        Mat4.copy(model, m);
        draw(skin);
        Mat4.copy(m, base);
        Mat4.translate(m, 0.01f, -0.02f, -0.20f);
        Mat4.scale(m, 0.10f, 0.10f, 0.14f);
        Mat4.copy(model, m);
        draw(skin);

        // 枪口火焰
        if (world.muzzleFlash > 0) {
            Mat4.copy(m, base);
            Mat4.translate(m, 0f, 0.015f, -0.60f);
            float s = 0.10f + 0.10f * (world.muzzleFlash / 0.05f);
            Mat4.scale(m, s, s, s * 1.6f);
            Mat4.copy(model, m);
            GLES20.glUniform1f(prog.uAlpha, 0.9f);
            draw(new float[]{1f, 0.85f, 0.35f});
            GLES20.glUniform1f(prog.uAlpha, 1f);
        }

        GLES20.glUniform1f(prog.uFogNear, 25f);
        GLES20.glUniform1f(prog.uFogFar, 150f);
    }

    /** 供外部（如受击闪红）调用。 */
    public void flashHit() {
        hitFlash = 0.25f;
    }
}
