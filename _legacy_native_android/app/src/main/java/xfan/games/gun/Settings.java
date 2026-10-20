package xfan.games.gun;

import android.content.Context;
import android.content.SharedPreferences;

/** 本地设置持久化。 */
public final class Settings {

    public static final int[] FPS_OPTIONS = {60, 90, 120, 144};
    public static final int DEFAULT_FPS = 60;

    private static final String PREF = "xfan_gun_settings";
    private static final String KEY_FPS = "fps";
    private static final String KEY_ADDR = "server_addr";
    private static final String KEY_NAME = "player_name";

    private Settings() {
    }

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    public static int getFps(Context c) {
        int v = sp(c).getInt(KEY_FPS, DEFAULT_FPS);
        for (int f : FPS_OPTIONS) {
            if (f == v) return v;
        }
        return DEFAULT_FPS;
    }

    public static void setFps(Context c, int fps) {
        sp(c).edit().putInt(KEY_FPS, fps).apply();
    }

    public static String getAddr(Context c) {
        return sp(c).getString(KEY_ADDR, "127.0.0.1:19132");
    }

    public static void setAddr(Context c, String addr) {
        sp(c).edit().putString(KEY_ADDR, addr).apply();
    }

    public static String getName(Context c) {
        return sp(c).getString(KEY_NAME, "玩家" + (int) (Math.random() * 900 + 100));
    }

    public static void setName(Context c, String name) {
        sp(c).edit().putString(KEY_NAME, name).apply();
    }
}
