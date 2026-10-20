package xfan.games.gun.net;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 极简 TCP 客户端：JSON 行协议。
 * 上行：hello / st(状态) / fire / hit
 * 下行：welcome / snap(快照) / fire / hit / leave
 */
public class NetClient {

    private static final String TAG = "NetClient";

    public static class Snapshot {
        public int count;
        public int[] ids;
        public float[] px, py, pz, yaw;
        public int[] hp;
        public int[] stance;
        public int[] alive;
    }

    public static class ShotEvent {
        public float ox, oy, oz, dx, dy, dz;
    }

    public static class HitEvent {
        public int targetId;
        public int dmg;
    }

    private final String host;
    private final int port;
    private final String name;

    private Socket socket;
    private OutputStream out;
    private BufferedReader in;
    private Thread recvThread;
    private volatile boolean connected;
    private volatile int myId = -1;

    private volatile Snapshot pending;
    private final List<ShotEvent> shots = new CopyOnWriteArrayList<>();
    private final List<HitEvent> hits = new CopyOnWriteArrayList<>();
    private final List<String> statusLog = new CopyOnWriteArrayList<>();

    public NetClient(String host, int port, String name) {
        this.host = host;
        this.port = port;
        this.name = name;
    }

    public boolean isConnected() {
        return connected;
    }

    public int getMyId() {
        return myId;
    }

    public List<String> drainStatus() {
        List<String> l = new ArrayList<>(statusLog);
        statusLog.clear();
        return l;
    }

    public void connect() {
        recvThread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    socket = new Socket(host, port);
                    socket.setTcpNoDelay(true);
                    socket.setSoTimeout(0);
                    out = socket.getOutputStream();
                    in = new BufferedReader(new InputStreamReader(socket.getInputStream(), "UTF-8"));
                    connected = true;
                    sendRaw("{\"t\":\"hello\",\"name\":" + JSONObject.quote(name) + "}");
                    statusLog.add("已连接 " + host + ":" + port);
                    String line;
                    while (connected && (line = in.readLine()) != null) {
                        handleLine(line);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "net error", e);
                    statusLog.add("连接失败：" + e.getMessage());
                } finally {
                    connected = false;
                    closeQuietly();
                }
            }
        }, "net-client");
        recvThread.setDaemon(true);
        recvThread.start();
    }

    private void handleLine(String line) {
        try {
            JSONObject o = new JSONObject(line);
            String t = o.optString("t", "");
            if ("welcome".equals(t)) {
                myId = o.optInt("id", -1);
                statusLog.add("已加入服务器，ID=" + myId);
            } else if ("snap".equals(t)) {
                JSONArray ps = o.getJSONArray("ps");
                Snapshot s = new Snapshot();
                s.count = ps.length();
                s.ids = new int[s.count];
                s.px = new float[s.count];
                s.py = new float[s.count];
                s.pz = new float[s.count];
                s.yaw = new float[s.count];
                s.hp = new int[s.count];
                s.stance = new int[s.count];
                s.alive = new int[s.count];
                for (int i = 0; i < s.count; i++) {
                    JSONObject p = ps.getJSONObject(i);
                    s.ids[i] = p.optInt("id", -1);
                    JSONArray pos = p.optJSONArray("p");
                    if (pos != null) {
                        s.px[i] = (float) pos.optDouble(0, 0);
                        s.py[i] = (float) pos.optDouble(1, 0);
                        s.pz[i] = (float) pos.optDouble(2, 0);
                    }
                    s.yaw[i] = (float) p.optDouble("y", 0);
                    s.hp[i] = p.optInt("hp", 100);
                    s.stance[i] = p.optInt("st", 0);
                    s.alive[i] = p.optInt("al", 1);
                }
                pending = s;
            } else if ("fire".equals(t)) {
                ShotEvent e = new ShotEvent();
                JSONArray oo = o.optJSONArray("o");
                JSONArray dd = o.optJSONArray("d");
                if (oo != null && dd != null) {
                    e.ox = (float) oo.optDouble(0, 0);
                    e.oy = (float) oo.optDouble(1, 0);
                    e.oz = (float) oo.optDouble(2, 0);
                    e.dx = (float) dd.optDouble(0, 0);
                    e.dy = (float) dd.optDouble(1, 0);
                    e.dz = (float) dd.optDouble(2, 0);
                    shots.add(e);
                }
            } else if ("hit".equals(t)) {
                HitEvent e = new HitEvent();
                e.targetId = o.optInt("id", -1);
                e.dmg = o.optInt("d", 0);
                hits.add(e);
            }
        } catch (Exception e) {
            Log.w(TAG, "bad line: " + line, e);
        }
    }

    public Snapshot takeSnapshot() {
        Snapshot s = pending;
        pending = null;
        return s;
    }

    public List<ShotEvent> drainShots() {
        List<ShotEvent> l = new ArrayList<>(shots);
        shots.clear();
        return l;
    }

    public List<HitEvent> drainHits() {
        List<HitEvent> l = new ArrayList<>(hits);
        hits.clear();
        return l;
    }

    private void sendRaw(String json) {
        try {
            if (out != null && connected) {
                out.write((json + "\n").getBytes("UTF-8"));
                out.flush();
            }
        } catch (Exception e) {
            Log.w(TAG, "send failed", e);
        }
    }

    public void sendState(float x, float y, float z, float yaw, float pitch,
                          int hp, int stance, boolean alive) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"t\":\"st\",\"p\":[").append(f(x)).append(',').append(f(y)).append(',')
                .append(f(z)).append("],\"y\":").append(f(yaw)).append(",\"pi\":").append(f(pitch))
                .append(",\"hp\":").append(hp).append(",\"st\":").append(stance)
                .append(",\"al\":").append(alive ? 1 : 0).append('}');
        sendRaw(sb.toString());
    }

    public void sendFire(float[] o, float[] d) {
        sendRaw("{\"t\":\"fire\",\"o\":[" + f(o[0]) + "," + f(o[1]) + "," + f(o[2]) + "],\"d\":["
                + f(d[0]) + "," + f(d[1]) + "," + f(d[2]) + "]}");
    }

    public void sendHit(int targetId, int dmg) {
        sendRaw("{\"t\":\"hit\",\"id\":" + targetId + ",\"d\":" + dmg + "}");
    }

    private static String f(float v) {
        return String.valueOf(Math.round(v * 100f) / 100f);
    }

    private void closeQuietly() {
        try {
            if (in != null) in.close();
        } catch (Exception ignored) {
        }
        try {
            if (out != null) out.close();
        } catch (Exception ignored) {
        }
        try {
            if (socket != null) socket.close();
        } catch (Exception ignored) {
        }
    }

    public void close() {
        connected = false;
        closeQuietly();
    }
}
