package xfan.games.gun.game;

/** 极简 4x4 矩阵工具（列主序，与 OpenGL 一致）。 */
public final class Mat4 {

    private Mat4() {
    }

    public static float[] identity() {
        float[] m = new float[16];
        m[0] = m[5] = m[10] = m[15] = 1f;
        return m;
    }

    public static void setIdentity(float[] m) {
        for (int i = 0; i < 16; i++) m[i] = 0;
        m[0] = m[5] = m[10] = m[15] = 1f;
    }

    public static void perspective(float[] m, float fovDeg, float aspect, float near, float far) {
        float f = (float) (1.0 / Math.tan(Math.toRadians(fovDeg) * 0.5));
        for (int i = 0; i < 16; i++) m[i] = 0;
        m[0] = f / aspect;
        m[5] = f;
        m[10] = (far + near) / (near - far);
        m[11] = -1f;
        m[14] = (2f * far * near) / (near - far);
    }

    public static void ortho(float[] m, float l, float r, float b, float t, float n, float f) {
        for (int i = 0; i < 16; i++) m[i] = 0;
        m[0] = 2f / (r - l);
        m[5] = 2f / (t - b);
        m[10] = -2f / (f - n);
        m[12] = -(r + l) / (r - l);
        m[13] = -(t + b) / (t - b);
        m[14] = -(f + n) / (f - n);
        m[15] = 1f;
    }

    /** out = a * b */
    public static void multiply(float[] out, float[] a, float[] b) {
        float[] t = new float[16];
        for (int i = 0; i < 4; i++) {
            for (int j = 0; j < 4; j++) {
                float s = 0f;
                for (int k = 0; k < 4; k++) {
                    s += a[i + k * 4] * b[k + j * 4];
                }
                t[i + j * 4] = s;
            }
        }
        System.arraycopy(t, 0, out, 0, 16);
    }

    /** m = m * T(x,y,z) */
    public static void translate(float[] m, float x, float y, float z) {
        for (int i = 0; i < 4; i++) {
            m[12 + i] += m[i] * x + m[4 + i] * y + m[8 + i] * z;
        }
    }

    /** m = m * S(x,y,z) */
    public static void scale(float[] m, float x, float y, float z) {
        for (int i = 0; i < 4; i++) {
            m[i] *= x;
            m[4 + i] *= y;
            m[8 + i] *= z;
        }
    }

    /** m = m * R(axis, deg) */
    public static void rotate(float[] m, float deg, float ax, float ay, float az) {
        float[] r = new float[16];
        double rad = Math.toRadians(deg);
        float c = (float) Math.cos(rad);
        float s = (float) Math.sin(rad);
        float len = (float) Math.sqrt(ax * ax + ay * ay + az * az);
        if (len > 0.000001f) {
            float rl = 1f / len;
            ax *= rl;
            ay *= rl;
            az *= rl;
        }
        float nc = 1f - c;
        r[0] = ax * ax * nc + c;
        r[4] = ax * ay * nc - az * s;
        r[8] = ax * az * nc + ay * s;
        r[1] = ay * ax * nc + az * s;
        r[5] = ay * ay * nc + c;
        r[9] = ay * az * nc - ax * s;
        r[2] = az * ax * nc - ay * s;
        r[6] = az * ay * nc + ax * s;
        r[10] = az * az * nc + c;
        r[15] = 1f;
        multiply(m, m, r);
    }

    /**
     * 第一人称视口矩阵。
     * 约定：yaw=0、pitch=0 时朝向 -Z；yaw 增大向左转。
     */
    public static void viewFps(float[] m, float ex, float ey, float ez, float yawDeg, float pitchDeg) {
        setIdentity(m);
        rotate(m, -pitchDeg, 1f, 0f, 0f);
        rotate(m, -yawDeg, 0f, 1f, 0f);
        translate(m, -ex, -ey, -ez);
    }

    /** 由 yaw / pitch 求前向单位向量。 */
    public static void forward(float yawDeg, float pitchDeg, float[] out) {
        double y = Math.toRadians(yawDeg);
        double p = Math.toRadians(pitchDeg);
        float cp = (float) Math.cos(p);
        out[0] = (float) (-Math.sin(y) * cp);
        out[1] = (float) Math.sin(p);
        out[2] = (float) (Math.cos(y) * -cp);
    }

    public static void copy(float[] dst, float[] src) {
        System.arraycopy(src, 0, dst, 0, 16);
    }
}
