package xfan.games.gun;

import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.view.View;
import android.view.Window;
import android.widget.Button;
import android.widget.EditText;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

/** 游戏模式选择页。 */
public class MainActivity extends Activity {

    private View overlay;
    private final Handler handler = new Handler();
    private boolean leaving;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        overlay = findViewById(R.id.overlay);
        Button solo = findViewById(R.id.btnSolo);
        Button multi = findViewById(R.id.btnMulti);
        Button room = findViewById(R.id.btnRoom);
        TextView settings = findViewById(R.id.btnSettings);

        solo.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                enterMode(v, "solo", null);
            }
        });
        multi.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showServerDialog(v);
            }
        });
        room.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Sfx.play(Sfx.CLICK);
                Toast.makeText(MainActivity.this, "开房间功能开发中", Toast.LENGTH_SHORT).show();
            }
        });
        settings.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Sfx.play(Sfx.CLICK);
                showSettings();
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        leaving = false;
        overlay.setAlpha(0f);
        overlay.setVisibility(View.GONE);
    }

    private void enterMode(final View btn, final String mode, final String addr) {
        if (leaving) return;
        leaving = true;
        Sfx.play(Sfx.CLICK);
        Sfx.play(Sfx.TRANSITION);

        btn.animate().scaleX(0.9f).scaleY(0.9f).setDuration(100).start();
        overlay.setVisibility(View.VISIBLE);
        overlay.setAlpha(0f);
        overlay.animate().alpha(1f).setDuration(200).setStartDelay(40)
                .withEndAction(new Runnable() {
                    @Override
                    public void run() {
                        Intent i = new Intent(MainActivity.this, GameActivity.class);
                        i.putExtra("mode", mode);
                        if (addr != null) {
                            i.putExtra("addr", addr);
                            i.putExtra("name", Settings.getName(MainActivity.this));
                        }
                        startActivity(i);
                        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
                        handler.postDelayed(new Runnable() {
                            @Override
                            public void run() {
                                overlay.animate().alpha(0f).setDuration(150).start();
                                btn.animate().scaleX(1f).scaleY(1f).setDuration(150).start();
                            }
                        }, 260);
                    }
                }).start();
    }

    // ===== 设置 =====
    private void showSettings() {
        final Dialog d = new Dialog(this);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        d.setContentView(R.layout.dialog_settings);
        if (d.getWindow() != null) {
            d.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        }

        final int cur = Settings.getFps(this);
        final RadioGroup rg = d.findViewById(R.id.rgFps);
        final RadioButton rb60 = d.findViewById(R.id.rb60);
        final RadioButton rb90 = d.findViewById(R.id.rb90);
        final RadioButton rb120 = d.findViewById(R.id.rb120);
        final RadioButton rb144 = d.findViewById(R.id.rb144);
        final TextView info = d.findViewById(R.id.tvFpsInfo);
        info.setText("当前：" + cur + " FPS");

        switch (cur) {
            case 90:
                rb90.setChecked(true);
                break;
            case 120:
                rb120.setChecked(true);
                break;
            case 144:
                rb144.setChecked(true);
                break;
            default:
                rb60.setChecked(true);
        }

        int[] values = {60, 90, 120, 144};
        final RadioButton[] rbs = {rb60, rb90, rb120, rb144};
        for (int i = 0; i < rbs.length; i++) {
            final int v = values[i];
            rbs[i].setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v2) {
                    info.setText("当前：" + v + " FPS（保存后生效）");
                }
            });
        }

        d.findViewById(R.id.btnCancel).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                d.dismiss();
            }
        });
        d.findViewById(R.id.btnOk).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                int id = rg.getCheckedRadioButtonId();
                int fps = 60;
                if (id == R.id.rb90) fps = 90;
                else if (id == R.id.rb120) fps = 120;
                else if (id == R.id.rb144) fps = 144;
                Settings.setFps(MainActivity.this, fps);
                Sfx.play(Sfx.CLICK);
                Toast.makeText(MainActivity.this, "帧率上限已设为 " + fps + " FPS", Toast.LENGTH_SHORT).show();
                d.dismiss();
            }
        });
        d.show();
    }

    // ===== 服务器地址 =====
    private void showServerDialog(final View btn) {
        final Dialog d = new Dialog(this);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        d.setContentView(R.layout.dialog_server);
        if (d.getWindow() != null) {
            d.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        }
        final EditText etAddr = d.findViewById(R.id.etAddr);
        final EditText etName = d.findViewById(R.id.etName);
        final TextView status = d.findViewById(R.id.tvStatus);
        etAddr.setText(Settings.getAddr(this));
        etName.setText(Settings.getName(this));

        d.findViewById(R.id.btnCancel).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                d.dismiss();
            }
        });
        d.findViewById(R.id.btnOk).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String addr = etAddr.getText().toString().trim();
                if (addr.isEmpty()) {
                    status.setText("请填写服务器地址");
                    return;
                }
                String name = etName.getText().toString().trim();
                if (name.isEmpty()) name = "玩家";
                Settings.setAddr(MainActivity.this, addr);
                Settings.setName(MainActivity.this, name);
                d.dismiss();
                enterMode(btn, "multi", addr);
            }
        });
        d.show();
    }
}
