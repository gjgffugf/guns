package xfan.games.gun.game;

/** 战场上的角色（玩家 / 人机 / 联网玩家共用）。 */
public class Entity {

    public static final int STANCE_STAND = 0;
    public static final int STANCE_CROUCH = 1;
    public static final int STANCE_PRONE = 2;

    public int id;
    public String name = "";
    public int team; // 0=我方 1=敌方

    public float x, y, z;      // y 为脚底高度
    public float vx, vy, vz;
    public float yaw, pitch;
    public boolean onGround = true;

    public int hp = 100;
    public int maxHp = 100;
    public int stance = STANCE_STAND;
    public boolean alive = true;
    public float respawnTimer;

    public float walkPhase;
    public float muzzleFlash;

    // 人机用
    public float aiTimer;
    public float fireTimer;
    public float strafeDir = 1f;
    public float targetX, targetZ;

    // 网络插值目标
    public float tx, ty, tz, tYaw;
    public boolean hasTarget;

    public float eyeHeight() {
        switch (stance) {
            case STANCE_CROUCH:
                return 1.05f;
            case STANCE_PRONE:
                return 0.45f;
            default:
                return 1.62f;
        }
    }

    public float bodyHeight() {
        switch (stance) {
            case STANCE_CROUCH:
                return 1.25f;
            case STANCE_PRONE:
                return 0.65f;
            default:
                return 1.8f;
        }
    }

    public float radius() {
        return 0.35f;
    }

    public void reset(float px, float pz) {
        x = px;
        z = pz;
        y = 0f;
        vx = vy = vz = 0f;
        hp = maxHp;
        alive = true;
        stance = STANCE_STAND;
        respawnTimer = 0f;
    }
}
