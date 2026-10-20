package xfan.games.gun;

import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.util.Log;

/**
 * 程序化音效：不使用任何音频文件，全部由代码合成 PCM 后交给 AudioTrack 播放。
 */
public final class Sfx {

    public static final int SHOT = 0;
    public static final int HIT = 1;
    public static final int RELOAD_START = 2;
    public static final int RELOAD = 3;
    public static final int JUMP = 4;
    public static final int DIE = 5;
    public static final int KILL = 6;
    public static final int CLICK = 7;
    public static final int TRANSITION = 8;

    private static final int SR = 22050;
    private static final String TAG = "Sfx";

    private Sfx() {
    }

    public static void play(final int type) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    short[] pcm = gen(type);
                    AudioTrack at = new AudioTrack(AudioManager.STREAM_MUSIC, SR,
                            AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT,
                            pcm.length * 2, AudioTrack.MODE_STATIC);
                    at.write(pcm, 0, pcm.length);
                    at.play();
                    long ms = (long) (pcm.length * 1000L / SR) + 40L;
                    Thread.sleep(ms);
                    at.stop();
                    at.release();
                } catch (Exception e) {
                    Log.w(TAG, "sfx error", e);
                }
            }
        }, "sfx").start();
    }

    private static short[] gen(int type) {
        switch (type) {
            case SHOT:
                return shot();
            case HIT:
                return tone(1400, 0.05f, 0.35f, 0f);
            case RELOAD_START:
                return tone(220, 0.08f, 0.25f, 120);
            case RELOAD:
                return tone(520, 0.12f, 0.3f, -220);
            case JUMP:
                return tone(320, 0.07f, 0.22f, 180);
            case DIE:
                return tone(420, 0.55f, 0.4f, -340);
            case KILL:
                return twoTone(880, 1320, 0.09f, 0.35f);
            case CLICK:
                return tone(760, 0.045f, 0.3f, 0f);
            case TRANSITION:
            default:
                return sweep(180, 900, 0.32f, 0.35f);
        }
    }

    private static short[] shot() {
        int n = (int) (SR * 0.16f);
        short[] out = new short[n];
        for (int i = 0; i < n; i++) {
            float t = i / (float) SR;
            float env = (float) Math.exp(-t * 32f);
            float body = (float) Math.sin(2 * Math.PI * 120f * t) * (float) Math.exp(-t * 55f) * 0.6f;
            float noise = (float) (Math.random() * 2 - 1) * env;
            float crack = (float) Math.sin(2 * Math.PI * 900f * t) * (float) Math.exp(-t * 90f) * 0.25f;
            float v = noise * 0.85f + body + crack;
            out[i] = clamp(v * 0.85f);
        }
        return out;
    }

    private static short[] tone(float freq, float dur, float vol, final float slide) {
        int n = (int) (SR * dur);
        short[] out = new short[n];
        double phase = 0;
        for (int i = 0; i < n; i++) {
            float t = i / (float) SR;
            float f = freq + slide * t;
            phase += 2 * Math.PI * f / SR;
            float env = (float) Math.exp(-t * (3.5f / Math.max(dur, 0.05f)));
            out[i] = clamp((float) Math.sin(phase) * env * vol);
        }
        return out;
    }

    private static short[] sweep(float f0, float f1, float dur, float vol) {
        int n = (int) (SR * dur);
        short[] out = new short[n];
        double phase = 0;
        for (int i = 0; i < n; i++) {
            float t = i / (float) n;
            float f = f0 + (f1 - f0) * t;
            phase += 2 * Math.PI * f / SR;
            float env = (float) Math.sin(Math.PI * t);
            out[i] = clamp((float) Math.sin(phase) * env * vol);
        }
        return out;
    }

    private static short[] twoTone(float f0, float f1, float dur, float vol) {
        int half = (int) (SR * dur);
        short[] out = new short[half * 2];
        double phase = 0;
        for (int i = 0; i < out.length; i++) {
            float t = i / (float) SR;
            float f = (i < half) ? f0 : f1;
            phase += 2 * Math.PI * f / SR;
            float env = (float) Math.exp(-t * 4f);
            out[i] = clamp((float) Math.sin(phase) * env * vol);
        }
        return out;
    }

    private static short clamp(float v) {
        if (v > 1f) v = 1f;
        if (v < -1f) v = -1f;
        return (short) (v * 32767f);
    }
}
