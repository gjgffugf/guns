package xfan.games.gun;

import android.app.Activity;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.SurfaceTexture;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.animation.AlphaAnimation;
import android.widget.ImageView;
import android.widget.TextView;

import java.io.IOException;
import java.io.InputStream;

/**
 * 开屏页：优先播放 assets 下的 splash_video.mp4（也支持 splash.mp4），
 * 其次 splash.jpg / splash.png，两者都没有时使用程序化开屏动画。
 */
public class SplashActivity extends Activity {

    private static final long MAX_TIME = 8000L;
    private static final long IMAGE_TIME = 2600L;

    private final Handler handler = new Handler();
    private MediaPlayer mediaPlayer;
    private boolean finished;

    private final Runnable timeout = new Runnable() {
        @Override
        public void run() {
            goMain();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);

        final TextView skip = findViewById(R.id.btnSkip);
        skip.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                goMain();
            }
        });

        String video = findAsset("splash_video.mp4", "splash.mp4", "splash_video.mov");
        if (video != null) {
            playVideo(video);
            return;
        }
        String img = findAsset("splash.jpg", "splash.jpeg", "splash.png");
        if (img != null) {
            playImage(img);
            return;
        }
        // 程序化动画
        handler.postDelayed(timeout, 2900L);
    }

    private String findAsset(String... names) {
        try {
            String[] list = getAssets().list("");
            if (list == null) return null;
            for (String n : names) {
                for (String s : list) {
                    if (s.equalsIgnoreCase(n)) return s;
                }
            }
        } catch (IOException ignored) {
        }
        return null;
    }

    private void playVideo(final String name) {
        final TextureView tv = findViewById(R.id.videoView);
        final View splashView = findViewById(R.id.splashView);
        tv.setVisibility(View.VISIBLE);
        splashView.setVisibility(View.GONE);
        tv.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override
            public void onSurfaceTextureAvailable(SurfaceTexture st, int w, int h) {
                try {
                    AssetFileDescriptor afd = getAssets().openFd(name);
                    mediaPlayer = new MediaPlayer();
                    mediaPlayer.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                    mediaPlayer.setSurface(new Surface(st));
                    mediaPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                        @Override
                        public void onCompletion(MediaPlayer mp) {
                            goMain();
                        }
                    });
                    mediaPlayer.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                        @Override
                        public boolean onError(MediaPlayer mp, int what, int extra) {
                            goMain();
                            return true;
                        }
                    });
                    mediaPlayer.prepareAsync();
                    mediaPlayer.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                        @Override
                        public void onPrepared(MediaPlayer mp) {
                            mp.start();
                        }
                    });
                    afd.close();
                } catch (Exception e) {
                    goMain();
                }
            }

            @Override
            public void onSurfaceTextureSizeChanged(SurfaceTexture st, int w, int h) {
            }

            @Override
            public boolean onSurfaceTextureDestroyed(SurfaceTexture st) {
                return false;
            }

            @Override
            public void onSurfaceTextureUpdated(SurfaceTexture st) {
            }
        });
        handler.postDelayed(timeout, MAX_TIME);
    }

    private void playImage(String name) {
        final ImageView iv = findViewById(R.id.imgBg);
        final View splashView = findViewById(R.id.splashView);
        splashView.setVisibility(View.GONE);
        iv.setVisibility(View.VISIBLE);
        try {
            InputStream is = getAssets().open(name);
            Bitmap bm = BitmapFactory.decodeStream(is);
            is.close();
            iv.setImageBitmap(bm);
        } catch (Exception e) {
            iv.setVisibility(View.GONE);
            splashView.setVisibility(View.VISIBLE);
        }
        AlphaAnimation anim = new AlphaAnimation(0f, 1f);
        anim.setDuration(420);
        iv.startAnimation(anim);
        handler.postDelayed(timeout, IMAGE_TIME);
    }

    private void goMain() {
        if (finished) return;
        finished = true;
        handler.removeCallbacks(timeout);
        Sfx.play(Sfx.TRANSITION);
        Intent i = new Intent(SplashActivity.this, MainActivity.class);
        startActivity(i);
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(timeout);
        if (mediaPlayer != null) {
            try {
                mediaPlayer.release();
            } catch (Exception ignored) {
            }
            mediaPlayer = null;
        }
        super.onDestroy();
    }
}
