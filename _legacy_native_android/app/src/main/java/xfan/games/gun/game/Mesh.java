package xfan.games.gun.game;

import android.opengl.GLES20;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/** 单位立方体网格（中心在原点，边长 1），顶点含法线。 */
public class Mesh {

    private static final int FLOATS = 9; // pos3 + normal3 + uv2 -> 这里 pos3+normal3+pad3
    private final FloatBuffer buffer;
    private final int vertexCount;

    private Mesh(float[] data, int vertexCount) {
        this.vertexCount = vertexCount;
        ByteBuffer bb = ByteBuffer.allocateDirect(data.length * 4);
        bb.order(ByteOrder.nativeOrder());
        buffer = bb.asFloatBuffer();
        buffer.put(data);
        buffer.position(0);
    }

    public static Mesh unitCube() {
        // 6 面 * 6 顶点 * (3 pos + 3 normal + 3 dummy)
        float[] v = new float[6 * 6 * FLOATS];
        int p = 0;
        float[][] faces = {
                // +X
                {0.5f, -0.5f, 0.5f, 0.5f, -0.5f, -0.5f, 0.5f, 0.5f, -0.5f, 0.5f, 0.5f, 0.5f, 1, 0, 0},
                // -X
                {-0.5f, -0.5f, -0.5f, -0.5f, -0.5f, 0.5f, -0.5f, 0.5f, 0.5f, -0.5f, 0.5f, -0.5f, -1, 0, 0},
                // +Y
                {-0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, -0.5f, -0.5f, 0.5f, -0.5f, 0, 1, 0},
                // -Y
                {-0.5f, -0.5f, -0.5f, 0.5f, -0.5f, -0.5f, 0.5f, -0.5f, 0.5f, -0.5f, -0.5f, 0.5f, 0, -1, 0},
                // +Z
                {-0.5f, -0.5f, 0.5f, 0.5f, -0.5f, 0.5f, 0.5f, 0.5f, 0.5f, -0.5f, 0.5f, 0.5f, 0, 0, 1},
                // -Z
                {0.5f, -0.5f, -0.5f, -0.5f, -0.5f, -0.5f, -0.5f, 0.5f, -0.5f, 0.5f, 0.5f, -0.5f, 0, 0, -1},
        };
        // 每个面 4 个角点 + 法线，展开为两个三角形
        for (float[] f : faces) {
            float nx = f[12], ny = f[13], nz = f[14];
            float[] quad = {f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8], f[9], f[10], f[11]};
            int[] order = {0, 1, 2, 0, 2, 3};
            for (int idx : order) {
                v[p++] = quad[idx * 3];
                v[p++] = quad[idx * 3 + 1];
                v[p++] = quad[idx * 3 + 2];
                v[p++] = nx;
                v[p++] = ny;
                v[p++] = nz;
                v[p++] = 0f;
                v[p++] = 0f;
                v[p++] = 0f;
            }
        }
        return new Mesh(v, 36);
    }

    public void bind(int positionHandle, int normalHandle) {
        buffer.position(0);
        GLES20.glVertexAttribPointer(positionHandle, 3, GLES20.GL_FLOAT, false, FLOATS * 4, buffer);
        GLES20.glEnableVertexAttribArray(positionHandle);
        buffer.position(3);
        GLES20.glVertexAttribPointer(normalHandle, 3, GLES20.GL_FLOAT, false, FLOATS * 4, buffer);
        GLES20.glEnableVertexAttribArray(normalHandle);
    }

    public void draw() {
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, vertexCount);
    }
}
