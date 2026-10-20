package xfan.games.gun.game;

import android.opengl.GLES20;

/** 顶点色 + 方向光 + 雾的简易着色器。 */
public class Program {

    private static final String VERT =
            "uniform mat4 uMVP;\n" +
                    "uniform mat4 uModel;\n" +
                    "attribute vec3 aPos;\n" +
                    "attribute vec3 aNormal;\n" +
                    "varying vec3 vN;\n" +
                    "varying vec3 vW;\n" +
                    "void main(){\n" +
                    "  vec4 w = uModel * vec4(aPos,1.0);\n" +
                    "  vW = w.xyz;\n" +
                    "  vN = normalize((uModel * vec4(aNormal, 0.0)).xyz);\n" +
                    "  gl_Position = uMVP * vec4(aPos,1.0);\n" +
                    "}\n";

    private static final String FRAG =
            "precision mediump float;\n" +
                    "uniform vec3 uColor;\n" +
                    "uniform vec3 uLightDir;\n" +
                    "uniform vec3 uCam;\n" +
                    "uniform vec3 uFogColor;\n" +
                    "uniform float uFogNear;\n" +
                    "uniform float uFogFar;\n" +
                    "uniform float uAlpha;\n" +
                    "varying vec3 vN;\n" +
                    "varying vec3 vW;\n" +
                    "void main(){\n" +
                    "  vec3 n = normalize(vN);\n" +
                    "  float d = max(dot(n, normalize(uLightDir)), 0.0);\n" +
                    "  float rim = max(dot(n, normalize(uCam - vW)), 0.0) * 0.12;\n" +
                    "  vec3 c = uColor * (0.38 + d * 0.72) + vec3(rim);\n" +
                    "  float dist = length(uCam - vW);\n" +
                    "  float f = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);\n" +
                    "  c = mix(c, uFogColor, f * 0.9);\n" +
                    "  gl_FragColor = vec4(c, uAlpha);\n" +
                    "}\n";

    public final int handle;
    public final int aPos;
    public final int aNormal;
    public final int uMVP;
    public final int uModel;
    public final int uColor;
    public final int uLightDir;
    public final int uCam;
    public final int uFogColor;
    public final int uFogNear;
    public final int uFogFar;
    public final int uAlpha;

    private Program(int h) {
        handle = h;
        aPos = GLES20.glGetAttribLocation(h, "aPos");
        aNormal = GLES20.glGetAttribLocation(h, "aNormal");
        uMVP = GLES20.glGetUniformLocation(h, "uMVP");
        uModel = GLES20.glGetUniformLocation(h, "uModel");
        uColor = GLES20.glGetUniformLocation(h, "uColor");
        uLightDir = GLES20.glGetUniformLocation(h, "uLightDir");
        uCam = GLES20.glGetUniformLocation(h, "uCam");
        uFogColor = GLES20.glGetUniformLocation(h, "uFogColor");
        uFogNear = GLES20.glGetUniformLocation(h, "uFogNear");
        uFogFar = GLES20.glGetUniformLocation(h, "uFogFar");
        uAlpha = GLES20.glGetUniformLocation(h, "uAlpha");
    }

    public static Program create() {
        int vs = compile(GLES20.GL_VERTEX_SHADER, VERT);
        int fs = compile(GLES20.GL_FRAGMENT_SHADER, FRAG);
        int p = GLES20.glCreateProgram();
        GLES20.glAttachShader(p, vs);
        GLES20.glAttachShader(p, fs);
        GLES20.glLinkProgram(p);
        int[] st = new int[1];
        GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, st, 0);
        if (st[0] == 0) {
            throw new RuntimeException("link failed: " + GLES20.glGetProgramInfoLog(p));
        }
        GLES20.glDeleteShader(vs);
        GLES20.glDeleteShader(fs);
        return new Program(p);
    }

    private static int compile(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        int[] st = new int[1];
        GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, st, 0);
        if (st[0] == 0) {
            throw new RuntimeException("compile failed: " + GLES20.glGetShaderInfoLog(s));
        }
        return s;
    }

    public void use() {
        GLES20.glUseProgram(handle);
    }
}
