package xfan.games.gun.game;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import xfan.games.gun.Sfx;
import xfan.games.gun.net.NetClient;

/**
 * 战场逻辑：地图、玩家、人机、网络玩家、射击判定、伤害与重生。
 * 所有模型都是代码程序化生成的立方体（临时测试资源），后续可替换为真实模型。
 */
public class World {

    public interface Events {
        void onKill(String text);

        void onHitMarker();

        void onDamaged();

        void onDead();

        void onRespawn();
    }

    /** 场景中的一个立方体（AABB）。 */
    public static class Box {
        public float cx, cy, cz, hx, hy, hz;
        public float[] color;

        public Box(float cx, float cy, float cz, float hx, float hy, float hz, float[] color) {
            this.cx = cx;
            this.cy = cy;
            this.cz = cz;
            this.hx = hx;
            this.hy = hy;
            this.hz = hz;
            this.color = color;
        }

        public float minX() {
            return cx - hx;
        }

        public float maxX() {
            return cx + hx;
        }

        public float minY() {
            return cy - hy;
        }

        public float maxY() {
            return cy + hy;
        }

        public float minZ() {
            return cz - hz;
        }

        public float maxZ() {
            return cz + hz;
        }
    }

    /** 曳光弹 / 命中特效。 */
    public static class Tracer {
        public float ox, oy, oz;
        public float dx, dy, dz;
        public float len;
        public float life;
        public float[] color;
    }

    public static class Hit {
        public Entity e;
        public float t;
        public int part; // 0 头 1 身 2 腿
    }

    // ===== 常量 =====
    public static final float GRAVITY = 22f;
    public static final float JUMP_SPEED = 7.4f;
    public static final float SPEED_WALK = 4.6f;
    public static final float SPEED_SPRINT = 7.6f;
    public static final float SPEED_CROUCH = 2.5f;
    public static final float SPEED_PRONE = 1.35f;

    public static final int MAG_SIZE = 30;
    public static final int RESERVE_MAX = 150;
    public static final float FIRE_INTERVAL = 0.095f;
    public static final float RELOAD_TIME = 1.9f;
    public static final float ADS_FOV = 42f;
    public static final float HIP_FOV = 78f;

    public static final float MAP_HALF = 48f;

    public final List<Box> obstacles = new ArrayList<>();
    public final List<Entity> bots = new ArrayList<>();
    public final List<Entity> remotes = new ArrayList<>();
    public final List<Tracer> tracers = new ArrayList<>();

    public Entity player = new Entity();
    public Random rnd = new Random();

    public int mag = MAG_SIZE;
    public int reserve = RESERVE_MAX;
    public float fireCooldown;
    public float reloadTimer;
    public float adsAmount;
    public float recoilPitch;
    public float recoilYaw;
    public float muzzleFlash;
    public float spread;

    public boolean dead;
    public float deadTimer;
    public int kills;

    public String mode = "solo";
    public NetClient net;
    public int myId = -1;

    private final Events events;
    private float netTimer;
    private float[] tmpDir = new float[3];

    public World(Events events) {
        this.events = events;
        buildMap();
        player.id = -1;
        player.name = "你";
        player.team = 0;
        resetPlayer(0);
    }

    // ===== 地图 =====
    private void buildMap() {
        obstacles.clear();
        float[] ground = {0.22f, 0.26f, 0.20f};
        obstacles.add(new Box(0, -0.5f, 0, MAP_HALF + 6, 0.5f, MAP_HALF + 6, ground));

        float[] wall = {0.30f, 0.31f, 0.34f};
        obstacles.add(new Box(0, 3f, -MAP_HALF, MAP_HALF + 2, 3f, 1f, wall));
        obstacles.add(new Box(0, 3f, MAP_HALF, MAP_HALF + 2, 3f, 1f, wall));
        obstacles.add(new Box(-MAP_HALF, 3f, 0, 1f, 3f, MAP_HALF + 2, wall));
        obstacles.add(new Box(MAP_HALF, 3f, 0, 1f, 3f, MAP_HALF + 2, wall));

        float[] crate = {0.42f, 0.33f, 0.22f};
        float[] metal = {0.36f, 0.38f, 0.42f};
        float[] sand = {0.55f, 0.50f, 0.36f};

        // 中心建筑
        obstacles.add(new Box(0, 1.6f, 0, 3.2f, 1.6f, 3.2f, metal));
        obstacles.add(new Box(0, 4.2f, 0, 1.2f, 1.0f, 1.2f, metal));

        // 掩体
        addCrate(-12, 0, -8, 1.5f, sand);
        addCrate(10, 0, -12, 1.8f, crate);
        addCrate(16, 0, 9, 1.2f, crate);
        addCrate(-18, 0, 12, 2.0f, sand);
        addCrate(4, 0, 20, 1.4f, crate);
        addCrate(-6, 0, 26, 1.6f, sand);
        addCrate(24, 0, -4, 1.3f, crate);
        addCrate(-24, 0, -18, 1.7f, sand);
        addCrate(28, 0, 24, 1.5f, crate);
        addCrate(-30, 0, 28, 1.2f, sand);

        // 高掩体墙
        obstacles.add(new Box(-20, 1.5f, 0, 0.6f, 1.5f, 5f, metal));
        obstacles.add(new Box(20, 1.5f, 4, 0.6f, 1.5f, 5f, metal));
        obstacles.add(new Box(0, 1.2f, -22, 6f, 1.2f, 0.6f, metal));
        obstacles.add(new Box(6, 1.2f, 30, 6f, 1.2f, 0.6f, metal));

        // 可跳上去的平台
        obstacles.add(new Box(-14, 0.9f, 24, 2.5f, 0.9f, 2.5f, metal));
        obstacles.add(new Box(14, 1.6f, -26, 3f, 1.6f, 2f, metal));
    }

    private void addCrate(float x, float z, float rot, float size, float[] color) {
        obstacles.add(new Box(x, size * 0.6f, z, size, size * 0.6f, size, color));
    }

    public void spawnBots(int count) {
        bots.clear();
        for (int i = 0; i < count; i++) {
            Entity b = new Entity();
            b.id = 100 + i;
            b.name = "敌人0" + (i + 1);
            b.team = 1;
            float[] sp = spawnPoint(i + 1);
            b.reset(sp[0], sp[1]);
            b.yaw = rnd.nextFloat() * 360f;
            b.aiTimer = rnd.nextFloat() * 2f;
            bots.add(b);
        }
    }

    private float[] spawnPoint(int i) {
        float[][] pts = {
                {0f, -32f}, {-30f, -6f}, {30f, -10f}, {12f, 32f},
                {-16f, 34f}, {34f, 20f}, {-34f, -30f}, {22f, -34f}
        };
        return pts[i % pts.length];
    }

    private void resetPlayer(int seed) {
        float[] sp = spawnPoint(seed);
        player.reset(sp[0], sp[1]);
        player.yaw = 0f;
        player.pitch = 0f;
        mag = MAG_SIZE;
        reserve = RESERVE_MAX;
        reloadTimer = 0f;
        dead = false;
        deadTimer = 0f;
    }

    // ===== 主循环 =====
    public void update(float dt, InputState in) {
        updateTimers(dt);

        if (dead) {
            deadTimer -= dt;
            if (deadTimer <= 0) {
                resetPlayer(rnd.nextInt(8));
                if (events != null) events.onRespawn();
            }
            updateBots(dt);
            updateTracers(dt);
            syncNetwork(dt);
            return;
        }

        updateLocalPlayer(dt, in);
        updateBots(dt);
        updateTracers(dt);
        syncNetwork(dt);
    }

    private void updateTimers(float dt) {
        if (fireCooldown > 0) fireCooldown -= dt;
        if (reloadTimer > 0) {
            reloadTimer -= dt;
            if (reloadTimer <= 0) {
                int need = MAG_SIZE - mag;
                int take = Math.min(need, reserve);
                mag += take;
                reserve -= take;
                Sfx.play(Sfx.RELOAD);
            }
        }
        if (muzzleFlash > 0) muzzleFlash -= dt;
        // 后坐力回落
        recoilPitch *= Math.max(0f, 1f - dt * 8f);
        recoilYaw *= Math.max(0f, 1f - dt * 8f);
    }

    private void updateLocalPlayer(float dt, InputState in) {
        // 视角
        if (in != null) {
            player.yaw += in.lookYaw;
            player.pitch += in.lookPitch;
            if (player.pitch > 88f) player.pitch = 88f;
            if (player.pitch < -88f) player.pitch = -88f;
            if (player.yaw > 360f) player.yaw -= 360f;
            if (player.yaw < -360f) player.yaw += 360f;
            in.clearLook();

            player.stance = in.getStance();
        }

        float ads = (in != null && in.ads) ? 1f : 0f;
        adsAmount += (ads - adsAmount) * Math.min(1f, dt * 12f);

        // 移动速度
        float speed;
        switch (player.stance) {
            case Entity.STANCE_CROUCH:
                speed = SPEED_CROUCH;
                break;
            case Entity.STANCE_PRONE:
                speed = SPEED_PRONE;
                break;
            default:
                speed = SPEED_WALK;
        }
        boolean sprinting = (in != null && in.sprint && player.stance == Entity.STANCE_STAND
                && adsAmount < 0.4f && (in.moveZ > 0.3f));
        if (sprinting) speed = SPEED_SPRINT;
        if (adsAmount > 0.05f) speed *= (1f - 0.45f * adsAmount);

        float yawRad = (float) Math.toRadians(player.yaw);
        float fx = (float) (-Math.sin(yawRad));
        float fz = (float) (-Math.cos(yawRad));
        float rx = (float) Math.cos(yawRad);
        float rz = (float) (-Math.sin(yawRad));

        float mx = (in != null) ? in.moveX : 0f;
        float mz = (in != null) ? in.moveZ : 0f;
        float len = (float) Math.sqrt(mx * mx + mz * mz);
        if (len > 1f) {
            mx /= len;
            mz /= len;
        }

        float dirX = fx * mz + rx * mx;
        float dirZ = fz * mz + rz * mx;

        float targetVx = dirX * speed;
        float targetVz = dirZ * speed;
        float accel = player.onGround ? 18f : 6f;
        player.vx += (targetVx - player.vx) * Math.min(1f, accel * dt);
        player.vz += (targetVz - player.vz) * Math.min(1f, accel * dt);

        if (in != null && in.jump && player.onGround && player.stance != Entity.STANCE_PRONE) {
            player.vy = JUMP_SPEED;
            player.onGround = false;
            in.jump = false;
            Sfx.play(Sfx.JUMP);
        }
        if (in != null && !player.onGround) in.jump = false;

        player.vy -= GRAVITY * dt;
        moveEntity(player, player.vx * dt, player.vy * dt, player.vz * dt);

        if (Math.abs(player.vx) + Math.abs(player.vz) > 0.6f && player.onGround) {
            player.walkPhase += dt * (sprinting ? 13f : 8f);
        }

        if (in != null && in.reload) {
            in.reload = false;
            startReload();
        }

        // 开镜时精度更高
        spread = (0.028f - 0.020f * adsAmount) + (sprinting ? 0.03f : 0f)
                + (player.stance == Entity.STANCE_PRONE ? -0.008f : 0f);
        if (spread < 0.004f) spread = 0.004f;

        if (in != null && in.fire) {
            tryFire();
        }
    }

    private void startReload() {
        if (reloadTimer > 0 || mag >= MAG_SIZE || reserve <= 0) return;
        reloadTimer = RELOAD_TIME;
        Sfx.play(Sfx.RELOAD_START);
    }

    public void tryFire() {
        if (dead || reloadTimer > 0 || fireCooldown > 0) return;
        if (mag <= 0) {
            startReload();
            return;
        }
        mag--;
        fireCooldown = FIRE_INTERVAL;
        muzzleFlash = 0.05f;
        Sfx.play(Sfx.SHOT);

        float[] eye = eyePos(player);
        float yaw = player.yaw + recoilYaw + (rnd.nextFloat() - 0.5f) * spread * 40f;
        float pitch = player.pitch + recoilPitch + (rnd.nextFloat() - 0.5f) * spread * 40f;
        Mat4.forward(yaw, pitch, tmpDir);

        Hit h = raycast(eye[0], eye[1], eye[2], tmpDir[0], tmpDir[1], tmpDir[2], player, 220f);
        float dist = (h == null) ? 220f : h.t;
        addTracer(eye[0], eye[1], eye[2], tmpDir[0], tmpDir[1], tmpDir[2], Math.min(dist, 220f),
                new float[]{1f, 0.85f, 0.35f});

        // 后坐力
        recoilPitch += 0.85f;
        recoilYaw += (rnd.nextFloat() - 0.5f) * 0.7f;

        if (net != null && net.isConnected()) {
            net.sendFire(eye, tmpDir);
        }

        if (h != null && h.e != null) {
            int dmg = damageOf(h.part);
            applyDamage(h.e, dmg, true);
            if (events != null) events.onHitMarker();
            if (net != null && net.isConnected() && h.e.team == 0 && h.e.id != myId) {
                net.sendHit(h.e.id, dmg);
            }
        }

        if (mag == 0) startReload();
    }

    private int damageOf(int part) {
        switch (part) {
            case 0:
                return 68;
            case 2:
                return 16;
            default:
                return 26;
        }
    }

    public void applyDamage(Entity e, int dmg, boolean byPlayer) {
        if (!e.alive) return;
        e.hp -= dmg;
        if (e.hp <= 0) {
            e.hp = 0;
            e.alive = false;
            e.respawnTimer = 3f;
            Sfx.play(Sfx.KILL);
            if (events != null) {
                events.onKill(byPlayer ? ("击倒 " + e.name) : (e.name + " 阵亡"));
            }
            if (byPlayer) kills++;
        }
    }

    // ===== 移动与碰撞 =====
    public void moveEntity(Entity e, float dx, float dy, float dz) {
        e.x += dx;
        resolveAxis(e, 0, dx);
        e.z += dz;
        resolveAxis(e, 1, dz);
        e.y += dy;
        e.onGround = false;
        resolveAxis(e, 2, dy);
        if (e.y <= 0f) {
            e.y = 0f;
            if (e.vy < 0) e.vy = 0f;
            e.onGround = true;
        }
        // 边界
        if (e.x < -MAP_HALF) e.x = -MAP_HALF;
        if (e.x > MAP_HALF) e.x = MAP_HALF;
        if (e.z < -MAP_HALF) e.z = -MAP_HALF;
        if (e.z > MAP_HALF) e.z = MAP_HALF;
    }

    private void resolveAxis(Entity e, int axis, float delta) {
        float hx = e.radius();
        float hz = e.radius();
        float h = e.bodyHeight();
        float minX = e.x - hx, maxX = e.x + hx;
        float minY = e.y, maxY = e.y + h;
        float minZ = e.z - hz, maxZ = e.z + hz;

        for (Box b : obstacles) {
            if (b.minY() < 0.001f) continue; // 地面不参与水平碰撞
            if (maxX <= b.minX() || minX >= b.maxX()) continue;
            if (maxY <= b.minY() || minY >= b.maxY()) continue;
            if (maxZ <= b.minZ() || minZ >= b.maxZ()) continue;

            if (axis == 0) {
                if (delta > 0) e.x = b.minX() - hx - 0.001f;
                else e.x = b.maxX() + hx + 0.001f;
                maxX = e.x + hx;
                minX = e.x - hx;
            } else if (axis == 1) {
                if (delta > 0) e.z = b.minZ() - hz - 0.001f;
                else e.z = b.maxZ() + hz + 0.001f;
                maxZ = e.z + hz;
                minZ = e.z - hz;
            } else {
                if (delta > 0) {
                    e.y = b.minY() - h - 0.001f;
                    if (e.vy > 0) e.vy = 0f;
                } else {
                    e.y = b.maxY();
                    if (e.vy < 0) e.vy = 0f;
                    e.onGround = true;
                }
                minY = e.y;
                maxY = e.y + h;
            }
        }
    }

    public float[] eyePos(Entity e) {
        return new float[]{e.x, e.y + e.eyeHeight(), e.z};
    }

    // ===== 射线检测 =====
    private static float rayBox(float ox, float oy, float oz, float dx, float dy, float dz,
                                float minx, float miny, float minz,
                                float maxx, float maxy, float maxz, float maxT) {
        float tmin = 0f, tmax = maxT;
        // X
        if (Math.abs(dx) < 1e-6f) {
            if (ox < minx || ox > maxx) return -1f;
        } else {
            float t1 = (minx - ox) / dx;
            float t2 = (maxx - ox) / dx;
            if (t1 > t2) {
                float t = t1;
                t1 = t2;
                t2 = t;
            }
            if (t1 > tmin) tmin = t1;
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) return -1f;
        }
        // Y
        if (Math.abs(dy) < 1e-6f) {
            if (oy < miny || oy > maxy) return -1f;
        } else {
            float t1 = (miny - oy) / dy;
            float t2 = (maxy - oy) / dy;
            if (t1 > t2) {
                float t = t1;
                t1 = t2;
                t2 = t;
            }
            if (t1 > tmin) tmin = t1;
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) return -1f;
        }
        // Z
        if (Math.abs(dz) < 1e-6f) {
            if (oz < minz || oz > maxz) return -1f;
        } else {
            float t1 = (minz - oz) / dz;
            float t2 = (maxz - oz) / dz;
            if (t1 > t2) {
                float t = t1;
                t1 = t2;
                t2 = t;
            }
            if (t1 > tmin) tmin = t1;
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) return -1f;
        }
        return tmin;
    }

    /** 返回最近命中（实体优先于地形，比较距离）。 */
    public Hit raycast(float ox, float oy, float oz, float dx, float dy, float dz,
                       Entity shooter, float maxDist) {
        Hit best = null;
        float bestT = maxDist;

        for (Box b : obstacles) {
            if (b.minY() < 0.001f && dy >= 0) continue;
            float t = rayBox(ox, oy, oz, dx, dy, dz, b.minX(), b.minY(), b.minZ(),
                    b.maxX(), b.maxY(), b.maxZ(), bestT);
            if (t >= 0 && t < bestT) {
                bestT = t;
                best = null;
            }
        }

        List<Entity> list = new ArrayList<>();
        list.addAll(bots);
        list.addAll(remotes);
        if (shooter != player) list.add(player);

        for (Entity e : list) {
            if (e == null || !e.alive || e == shooter) continue;
            float h = e.bodyHeight();
            float r = e.radius();
            // 腿
            float t = rayBox(ox, oy, oz, dx, dy, dz,
                    e.x - r, e.y, e.z - r, e.x + r, e.y + h * 0.45f, e.z + r, bestT);
            int part = 2;
            if (t < 0) {
                // 身
                t = rayBox(ox, oy, oz, dx, dy, dz,
                        e.x - r, e.y + h * 0.45f, e.z - r, e.x + r, e.y + h * 0.82f, e.z + r, bestT);
                part = 1;
            }
            if (t < 0) {
                // 头
                float hr = 0.17f;
                t = rayBox(ox, oy, oz, dx, dy, dz,
                        e.x - hr, e.y + h * 0.82f, e.z - hr, e.x + hr, e.y + h, e.z + hr, bestT);
                part = 0;
            }
            if (t >= 0 && t < bestT) {
                bestT = t;
                best = new Hit();
                best.e = e;
                best.t = t;
                best.part = part;
            }
        }
        return best;
    }

    public boolean hasLineOfSight(Entity a, Entity b) {
        float[] ea = eyePos(a);
        float[] eb = eyePos(b);
        float dx = eb[0] - ea[0], dy = eb[1] - ea[1], dz = eb[2] - ea[2];
        float dist = (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 0.001f) return true;
        dx /= dist;
        dy /= dist;
        dz /= dist;
        for (Box box : obstacles) {
            if (box.minY() < 0.001f) continue;
            float t = rayBox(ea[0], ea[1], ea[2], dx, dy, dz,
                    box.minX(), box.minY(), box.minZ(), box.maxX(), box.maxY(), box.maxZ(), dist);
            if (t >= 0 && t < dist - 0.25f) return false;
        }
        return true;
    }

    // ===== 人机 =====
    private void updateBots(float dt) {
        for (Entity b : bots) {
            if (!b.alive) {
                b.respawnTimer -= dt;
                if (b.respawnTimer <= 0) {
                    float[] sp = spawnPoint(rnd.nextInt(8));
                    b.reset(sp[0], sp[1]);
                    b.aiTimer = 0f;
                }
                continue;
            }

            float[] eye = eyePos(b);
            float[] pe = eyePos(player);
            float dx = pe[0] - eye[0];
            float dz = pe[2] - eye[2];
            float dist = (float) Math.sqrt(dx * dx + dz * dz);
            boolean see = player.alive && !dead && hasLineOfSight(b, player) && dist < 55f;

            b.aiTimer -= dt;
            if (see) {
                // 面向玩家
                float want = (float) Math.toDegrees(Math.atan2(-dx, -dz));
                b.yaw = approachAngle(b.yaw, want, dt * 220f);
                float wantPitch = (float) Math.toDegrees(Math.atan2(pe[1] - eye[1], dist));
                b.pitch += (wantPitch - b.pitch) * Math.min(1f, dt * 8f);

                // 保持中距离
                float wantDist = 14f;
                float move = 0f;
                if (dist > wantDist + 3f) move = 1f;
                else if (dist < wantDist - 4f) move = -0.8f;
                // 侧向游走
                float strafe = (float) Math.sin(b.walkPhase * 0.7f) * 0.7f * b.strafeDir;

                float yawRad = (float) Math.toRadians(b.yaw);
                float fx = (float) (-Math.sin(yawRad));
                float fz = (float) (-Math.cos(yawRad));
                float rx = (float) Math.cos(yawRad);
                float rz = (float) (-Math.sin(yawRad));
                float speed = SPEED_WALK * 0.82f;
                float vx = (fx * move + rx * strafe) * speed;
                float vz = (fz * move + rz * strafe) * speed;
                b.vx = vx;
                b.vz = vz;
                b.walkPhase += dt * 7f;

                b.fireTimer -= dt;
                if (b.fireTimer <= 0 && dist < 48f) {
                    botFire(b);
                    b.fireTimer = 0.16f + rnd.nextFloat() * 0.14f;
                }
            } else {
                // 巡逻
                if (b.aiTimer <= 0) {
                    b.targetX = (rnd.nextFloat() - 0.5f) * MAP_HALF * 1.6f;
                    b.targetZ = (rnd.nextFloat() - 0.5f) * MAP_HALF * 1.6f;
                    b.aiTimer = 3f + rnd.nextFloat() * 3f;
                    b.strafeDir = rnd.nextBoolean() ? 1f : -1f;
                }
                float tx = b.targetX - b.x;
                float tz = b.targetZ - b.z;
                float tl = (float) Math.sqrt(tx * tx + tz * tz);
                if (tl > 1.2f) {
                    float want = (float) Math.toDegrees(Math.atan2(-tx, -tz));
                    b.yaw = approachAngle(b.yaw, want, dt * 120f);
                    float yawRad = (float) Math.toRadians(b.yaw);
                    b.vx = (float) (-Math.sin(yawRad)) * SPEED_WALK * 0.55f;
                    b.vz = (float) (-Math.cos(yawRad)) * SPEED_WALK * 0.55f;
                    b.walkPhase += dt * 5f;
                } else {
                    b.vx = 0f;
                    b.vz = 0f;
                }
                b.fireTimer = 0.4f;
            }

            b.vy -= GRAVITY * dt;
            float beforeX = b.x, beforeZ = b.z;
            moveEntity(b, b.vx * dt, b.vy * dt, b.vz * dt);
            if (Math.abs(b.x - beforeX) < 0.002f && Math.abs(b.z - beforeZ) < 0.002f && b.vy <= 0f) {
                // 卡住了：换个巡逻点
                b.aiTimer = 0f;
                if (b.onGround) b.vy = JUMP_SPEED * 0.7f;
            }
            if (b.muzzleFlash > 0) b.muzzleFlash -= dt;
        }
    }

    private void botFire(Entity b) {
        float[] eye = eyePos(b);
        float[] pe = eyePos(player);
        float dx = pe[0] - eye[0];
        float dy = pe[1] - eye[1] - 0.15f;
        float dz = pe[2] - eye[2];
        float dist = (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 0.001f) return;
        dx /= dist;
        dy /= dist;
        dz /= dist;
        float sp = 0.035f + dist * 0.0016f;
        dx += (rnd.nextFloat() - 0.5f) * sp;
        dy += (rnd.nextFloat() - 0.5f) * sp;
        dz += (rnd.nextFloat() - 0.5f) * sp;
        float n = (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx /= n;
        dy /= n;
        dz /= n;

        b.muzzleFlash = 0.06f;
        Hit h = raycast(eye[0], eye[1], eye[2], dx, dy, dz, b, 120f);
        float len = (h == null) ? 120f : h.t;
        addTracer(eye[0], eye[1], eye[2], dx, dy, dz, Math.min(len, 120f), new float[]{1f, 0.4f, 0.35f});

        if (h != null && h.e == player && !dead) {
            int dmg = h.part == 0 ? 22 : (h.part == 2 ? 7 : 12);
            player.hp -= dmg;
            Sfx.play(Sfx.HIT);
            if (events != null) events.onDamaged();
            if (player.hp <= 0) {
                player.hp = 0;
                player.alive = false;
                dead = true;
                deadTimer = 3.5f;
                Sfx.play(Sfx.DIE);
                if (events != null) events.onDead();
            }
        }
    }

    private static float approachAngle(float cur, float target, float maxStep) {
        float d = target - cur;
        while (d > 180f) d -= 360f;
        while (d < -180f) d += 360f;
        if (d > maxStep) d = maxStep;
        if (d < -maxStep) d = -maxStep;
        float r = cur + d;
        while (r > 360f) r -= 360f;
        while (r < -360f) r += 360f;
        return r;
    }

    // ===== 曳光弹 =====
    private void addTracer(float ox, float oy, float oz, float dx, float dy, float dz,
                           float len, float[] color) {
        Tracer t = new Tracer();
        t.ox = ox;
        t.oy = oy;
        t.oz = oz;
        t.dx = dx;
        t.dy = dy;
        t.dz = dz;
        t.len = len;
        t.life = 0.07f;
        t.color = color;
        tracers.add(t);
        if (tracers.size() > 64) tracers.remove(0);
    }

    private void updateTracers(float dt) {
        for (int i = tracers.size() - 1; i >= 0; i--) {
            tracers.get(i).life -= dt;
            if (tracers.get(i).life <= 0) tracers.remove(i);
        }
    }

    // ===== 网络同步 =====
    private void syncNetwork(float dt) {
        if (net == null || !net.isConnected()) return;

        netTimer -= dt;
        if (netTimer <= 0) {
            netTimer = 0.05f;
            net.sendState(player.x, player.y, player.z, player.yaw, player.pitch,
                    player.hp, player.stance, player.alive);
        }

        NetClient.Snapshot s = net.takeSnapshot();
        if (s != null) {
            myId = net.getMyId();
            applySnapshot(s);
        }

        for (NetClient.ShotEvent e : net.drainShots()) {
            addTracer(e.ox, e.oy, e.oz, e.dx, e.dy, e.dz, 90f, new float[]{1f, 0.9f, 0.5f});
        }
        for (NetClient.HitEvent e : net.drainHits()) {
            if (e.targetId == myId && !dead) {
                player.hp -= e.dmg;
                Sfx.play(Sfx.HIT);
                if (events != null) events.onDamaged();
                if (player.hp <= 0) {
                    player.hp = 0;
                    player.alive = false;
                    dead = true;
                    deadTimer = 3.5f;
                    Sfx.play(Sfx.DIE);
                    if (events != null) events.onDead();
                }
            }
        }
    }

    private void applySnapshot(NetClient.Snapshot s) {
        // 移除消失的玩家
        for (int i = remotes.size() - 1; i >= 0; i--) {
            Entity r = remotes.get(i);
            boolean found = false;
            for (int j = 0; j < s.count; j++) {
                if (s.ids[j] == r.id) {
                    found = true;
                    break;
                }
            }
            if (!found) remotes.remove(i);
        }
        for (int j = 0; j < s.count; j++) {
            int id = s.ids[j];
            if (id == myId) continue;
            Entity r = null;
            for (Entity e : remotes) {
                if (e.id == id) {
                    r = e;
                    break;
                }
            }
            if (r == null) {
                r = new Entity();
                r.id = id;
                r.name = "玩家" + id;
                r.team = 0;
                remotes.add(r);
                r.x = s.px[j];
                r.y = s.py[j];
                r.z = s.pz[j];
                r.yaw = s.yaw[j];
            }
            r.tx = s.px[j];
            r.ty = s.py[j];
            r.tz = s.pz[j];
            r.tYaw = s.yaw[j];
            r.hasTarget = true;
            r.hp = s.hp[j];
            r.stance = s.stance[j];
            r.alive = s.alive[j] != 0;
        }
        // 插值
        for (Entity r : remotes) {
            if (!r.hasTarget) continue;
            r.x += (r.tx - r.x) * 0.25f;
            r.y += (r.ty - r.y) * 0.25f;
            r.z += (r.tz - r.z) * 0.25f;
            float d = r.tYaw - r.yaw;
            while (d > 180f) d -= 360f;
            while (d < -180f) d += 360f;
            r.yaw += d * 0.3f;
        }
    }
}
