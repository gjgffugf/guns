package xfan.games.gun.game;

/** 玩家输入状态（由 UI 层写入，GL 线程读取）。 */
public class InputState {

    public float moveX;      // -1..1 左右
    public float moveZ;      // -1..1 前后
    public float lookYaw;    // 本帧累计的视角增量（度）
    public float lookPitch;
    public boolean fire;
    public boolean sprint;
    public boolean ads;
    public boolean jump;
    public boolean reload;

    private int stance = Entity.STANCE_STAND;

    public int getStance() {
        return stance;
    }

    public void setStance(int s) {
        stance = s;
    }

    public void toggleCrouch() {
        stance = (stance == Entity.STANCE_CROUCH) ? Entity.STANCE_STAND : Entity.STANCE_CROUCH;
    }

    public void toggleProne() {
        stance = (stance == Entity.STANCE_PRONE) ? Entity.STANCE_STAND : Entity.STANCE_PRONE;
    }

    public void clearLook() {
        lookYaw = 0f;
        lookPitch = 0f;
    }
}
