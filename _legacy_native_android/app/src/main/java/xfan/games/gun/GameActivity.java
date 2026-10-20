package xfan.games.gun;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.util.List;

import xfan.games.gun.game.Entity;
import xfan.games.gun.game.GameSurfaceView;
import xfan.games.gun.game.InputState;
import xfan.games.gun.game.Renderer;
import xfan.games.gun.game.World;
import xfan.games.gun.net.NetClient;
import xfan.games.gun.ui.BarView;
import xfan.games.gun.ui.CrosshairView;
import xfan.games.gun.ui.JoystickView;

/** 游戏主界面：OpenGL 战场 + 触控 HUD。 */
public class GameActivity extends Activity implements Renderer.HudListener, World.Events {

    private final InputState input = new InputState();
    private World world;
    private Renderer renderer;
    private GameSurfaceView glView;
    private NetClient net;

    private TextView tvFps, tvHp, tvAmmo, tvFeed, tvNet, tvStance;
    private BarView barHp;
    private CrosshairView crosshair;
    private FrameLayout deadMask;
    private final Handler ui = new Handler();
    private String mode = "solo";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_game);

        mode = getIntent().getStringExtra("mode");
        if (mode == null) mode = "solo";

        tvFps = findViewById(R.id.tvFps);
        tvHp = findViewById(R.id.tvHp);
        tvAmmo = findViewById(R.id.tvAmmo);
        tvFeed = findViewById(R.id.tvFeed);
        tvNet = findViewById(R.id.tvNet);
        tvStance = findViewById(R.id.tvStance);
        barHp = findViewById(R.id.barHp);
        crosshair = findViewById(R.id.crosshair);
        deadMask = findViewById(R.id.deadMask);
        glView = findViewById(R.id.glView);

        world = new World(this);
        world.mode = mode;
        world.spawnBots(1);

        renderer = new Renderer(world, input, this);
        renderer.setTargetFps(Settings.getFps(this));
        glView.setInput(input);
        glView.setRenderer(renderer);
        glView.setRenderMode(GameSurfaceView.RENDERMODE_CONTINUOUSLY);

        bindControls();

        if ("multi".equals(mode)) {
            String addr = getIntent().getStringExtra("addr");
            String name = getIntent().getStringExtra("name");
            if (name == null) name = Settings.getName(this);
            String host = "127.0.0.1";
            int port = 19132;
            if (addr != null && addr.contains(":")) {
                String[] sp = addr.split(":");
                host = sp[0];
                try {
                    port = Integer.parseInt(sp[1].trim());
                } catch (Exception ignored) {
                }
            } else if (addr != null && !addr.isEmpty()) {
                host = addr;
            }
            tvNet.setText("连接中… " + host + ":" + port);
            net = new NetClient(host, port, name);
            net.connect();
            world.net = net;
        } else {
            tvNet.setText("单人模式 · 人机 1");
        }
    }

    private void bindControls() {
        JoystickView joy = findViewById(R.id.joystick);
        joy.setListener(new JoystickView.Listener() {
            @Override
            public void onMove(float x, float y) {
                input.moveX = x;
                input.moveZ = -y;
            }

            @Override
            public void onRelease() {
                input.moveX = 0f;
                input.moveZ = 0f;
            }
        });

        hold(R.id.btnFire, new BooleanSink() {
            @Override
            public void set(boolean v) {
                input.fire = v;
            }
        });
        hold(R.id.btnSprint, new BooleanSink() {
            @Override
            public void set(boolean v) {
                input.sprint = v;
            }
        });

        findViewById(R.id.btnAds).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                input.ads = !input.ads;
                crosshair.setAds(input.ads);
                Sfx.play(Sfx.CLICK);
            }
        });
        findViewById(R.id.btnCrouch).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                input.toggleCrouch();
                Sfx.play(Sfx.CLICK);
            }
        });
        findViewById(R.id.btnProne).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                input.toggleProne();
                Sfx.play(Sfx.CLICK);
            }
        });
        findViewById(R.id.btnJump).setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                    input.jump = true;
                }
                return true;
            }
        });
        findViewById(R.id.btnReload).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                input.reload = true;
            }
        });
        findViewById(R.id.btnExit).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Sfx.play(Sfx.CLICK);
                finish();
            }
        });
    }

    private interface BooleanSink {
        void set(boolean v);
    }

    private void hold(int id, final BooleanSink sink) {
        View v = findViewById(id);
        v.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View view, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        sink.set(true);
                        view.setPressed(true);
                        break;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        sink.set(false);
                        view.setPressed(false);
                        break;
                    default:
                        break;
                }
                return true;
            }
        });
    }

    // ===== HUD =====
    @Override
    public void onHud(final int fps, final int hp, final int mag, final int reserve,
                      final boolean reloading, final boolean dead) {
        final int stance = world.player.stance;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                tvFps.setText("FPS " + fps);
                tvHp.setText(String.valueOf(hp));
                barHp.setValue(hp / 100f);
                tvAmmo.setText(reloading ? "换弹中…" : (mag + " / " + reserve));
                tvStance.setText(stance == Entity.STANCE_PRONE ? "趴下"
                        : (stance == Entity.STANCE_CROUCH ? "蹲下" : "站立"));
                if (net != null) {
                    List<String> st = net.drainStatus();
                    if (!st.isEmpty()) {
                        tvNet.setText(st.get(st.size() - 1));
                    } else if (net.isConnected()) {
                        tvNet.setText("已连接 · ID=" + net.getMyId()
                                + " · 同场 " + (world.remotes.size() + 1) + " 人");
                    } else {
                        tvNet.setText("未连接服务器（离线练习）");
                    }
                }
            }
        });
    }

    @Override
    public void onNetInfo(String text) {
        // 预留
    }

    // ===== 战斗事件 =====
    @Override
    public void onKill(final String text) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                tvFeed.setText(text);
                tvFeed.setVisibility(View.VISIBLE);
                ui.removeCallbacks(feedHide);
                ui.postDelayed(feedHide, 2200);
            }
        });
    }

    private final Runnable feedHide = new Runnable() {
        @Override
        public void run() {
            tvFeed.setVisibility(View.GONE);
        }
    };

    @Override
    public void onHitMarker() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                crosshair.hit();
            }
        });
    }

    @Override
    public void onDamaged() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                flashDamage();
            }
        });
    }

    private void flashDamage() {
        final View v = getWindow().getDecorView();
        v.setBackgroundColor(0x66FF0000);
        ui.postDelayed(new Runnable() {
            @Override
            public void run() {
                v.setBackgroundDrawable(null);
            }
        }, 90);
    }

    @Override
    public void onDead() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                deadMask.setVisibility(View.VISIBLE);
            }
        });
    }

    @Override
    public void onRespawn() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                deadMask.setVisibility(View.GONE);
            }
        });
    }

    // ===== 生命周期 =====
    @Override
    protected void onPause() {
        if (glView != null) glView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (glView != null) glView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (net != null) net.close();
        super.onDestroy();
    }
}
