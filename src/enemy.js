// ============================================================================
// Enemies — 5 types with distinct silhouettes, pooled, driven by a state
// machine: idle → patrol → alert → chase/circle → windup → active → recover
// → stagger → dead. Manager grants max 2 attack tokens so mobs can't stunlock.
// ============================================================================
import * as THREE from 'three';
import { enemyMeleeHit, hitPlayer } from './combat.js';

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

// ---------------------------------------------------------------------------
// mesh construction — primitive bodies with strong silhouettes
// ---------------------------------------------------------------------------
export function buildBody(typeKey, t) {
  const grp = new THREE.Group();
  const mat = (c, e = 0x000000, ei = 0) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.85, emissive: e, emissiveIntensity: ei, transparent: true, opacity: 1,
  });
  const body = mat(t.color);
  const dark = mat(new THREE.Color(t.color).multiplyScalar(0.55).getHex());
  const eyeM = new THREE.MeshBasicMaterial({ color: t.eye, transparent: true, opacity: 1 });
  const parts = { body, dark, eyeM, legL: null, legR: null, armR: null, armL: null, torso: null, weapon: null };

  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  let torso, head;
  if (typeKey === 'ghoul') {
    torso = box(0.5, 0.62, 0.34, body); torso.position.y = 1.0; torso.rotation.x = 0.5;
    head = box(0.3, 0.28, 0.3, dark); head.position.set(0, 0.42, 0.18); torso.add(head);
  } else if (typeKey === 'knight') {
    torso = box(0.72, 0.85, 0.45, body); torso.position.y = 1.15;
    head = box(0.34, 0.36, 0.34, dark); head.position.y = 0.62; torso.add(head);
    const plume = box(0.06, 0.2, 0.3, mat(0x8a2020)); plume.position.y = 0.28; head.add(plume);
  } else if (typeKey === 'cultist') {
    torso = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 7), body); torso.position.y = 0.95;
    head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), dark); head.position.y = 0.78; torso.add(head);
  } else if (typeKey === 'brute') {
    torso = box(1.0, 0.95, 0.62, body); torso.position.y = 1.3; torso.rotation.x = 0.18;
    head = box(0.3, 0.26, 0.3, dark); head.position.set(0, 0.56, 0.22); torso.add(head);
    const spikeM = mat(0x3a2a20);
    for (let i = -1; i <= 1; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), spikeM);
      sp.position.set(i * 0.3, 0.55, -0.1); torso.add(sp);
    }
  } else { // wraith
    torso = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 6), body); torso.position.y = 1.1;
    body.opacity = 0.8; dark.opacity = 0.8;
    head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), dark); head.position.y = 0.85; torso.add(head);
  }
  grp.add(torso);
  parts.torso = torso; parts.head = head;

  // eyes
  const eyeGeo = new THREE.SphereGeometry(0.045, 6, 4);
  for (const sx of [-0.08, 0.08]) {
    const e = new THREE.Mesh(eyeGeo, eyeM);
    e.position.set(sx, 0.02, typeKey === 'cultist' || typeKey === 'wraith' ? 0.16 : 0.16);
    head.add(e);
  }

  // legs (not for wraith/cultist robes)
  if (typeKey === 'ghoul' || typeKey === 'knight' || typeKey === 'brute') {
    const lw = typeKey === 'brute' ? 0.26 : 0.16;
    parts.legL = box(lw, 0.75, lw, dark); parts.legL.position.set(-0.18, 0.45, 0);
    parts.legR = box(lw, 0.75, lw, dark); parts.legR.position.set(0.18, 0.45, 0);
    grp.add(parts.legL, parts.legR);
  }

  // arms: pivot groups at shoulders
  const armGeo = (l) => new THREE.BoxGeometry(0.14, l, 0.14);
  const mkArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (typeKey === 'brute' ? 0.6 : 0.4), typeKey === 'brute' ? 0.35 : 0.3, 0);
    const arm = new THREE.Mesh(armGeo(typeKey === 'brute' ? 0.9 : 0.6), dark);
    arm.position.y = -(typeKey === 'brute' ? 0.45 : 0.3);
    pivot.add(arm);
    torso.add(pivot);
    return pivot;
  };
  parts.armL = mkArm(-1);
  parts.armR = mkArm(1);

  // weapons
  const wpnM = mat(0x9aa3ad, 0x9aa3ad, 0);
  if (typeKey === 'ghoul') {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 4), wpnM);
    claw.position.y = -0.65; claw.rotation.x = Math.PI; parts.armR.add(claw); parts.weapon = claw;
  } else if (typeKey === 'knight') {
    const sword = box(0.07, 0.9, 0.07, wpnM); sword.position.y = -0.95; parts.armR.add(sword); parts.weapon = sword;
    const shield = box(0.55, 0.75, 0.08, mat(0x46525f, 0x46525f, 0));
    shield.position.set(0, -0.55, 0.12); parts.armL.add(shield); parts.shield = shield;
  } else if (typeKey === 'cultist') {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4), mat(0x3a2c20));
    staff.position.y = -0.6; parts.armR.add(staff);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshBasicMaterial({ color: t.eye, transparent: true }));
    orb.position.y = 0.12; staff.add(orb); parts.weapon = orb;
  } else if (typeKey === 'brute') {
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 1.3, 6), mat(0x4a3527));
    club.position.y = -1.1; parts.armR.add(club); parts.weapon = club;
  } else {
    const scythe = box(0.06, 1.0, 0.06, wpnM); scythe.position.y = -0.8; parts.armR.add(scythe); parts.weapon = scythe;
  }

  // telegraph orb above head — color-coded attack warning
  const tele = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  tele.position.y = 2.3;
  grp.add(tele);
  parts.tele = tele;

  return { grp, parts };
}

// ---------------------------------------------------------------------------
export class Enemy {
  constructor(G, typeKey) {
    this.G = G;
    this.typeKey = typeKey;
    this.type = this.lookupType(typeKey);
    const { grp, parts } = this.build(typeKey, this.type);
    this.mesh = grp;
    this.parts = parts;
    this.pos = grp.position;
    this.mesh.visible = false;
    G.scene.add(grp);
    this.alive = false;
    this.isBoss = false;
    this.facing = 0;
    this.kbx = 0; this.kbz = 0;
    this.animT = 0;
  }

  lookupType(typeKey) { return this.G.cfg.enemies[typeKey]; }
  build(typeKey, type) { return buildBody(typeKey, type); }

  spawn(x, z, elite = false) {
    const G = this.G, t = this.type, mb = G.cfg.miniboss;
    const diff = G.cfg.difficulty[G.difficulty];
    this.elite = elite;
    const lvlScale = 1 + (G.level.chapterIndex) * 0.35;
    this.maxhp = Math.round(t.hp * diff.hp * lvlScale * (elite ? mb.hpMult : 1));
    this.hp = this.maxhp;
    this.dmg = t.dmg * lvlScale * (elite ? mb.dmgMult : 1);
    this.speed = t.speed;
    this.radius = t.radius * (elite ? 1.2 : 1);
    this.poise = (t.poise || 0) + (elite ? mb.poiseBonus : 0);
    this.shielded = !!t.shielded;
    this.name = elite ? `${t.name} Champion` : t.name;
    this.scaleBase = t.scale * (elite ? mb.scaleMult : 1);

    this.pos.set(x, 0, z);
    this.mesh.scale.setScalar(this.scaleBase);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.visible = true;
    this.facing = Math.atan2(G.player.pos.x - x, G.player.pos.z - z);
    this.alive = true;
    this.state = 'spawn';
    this.stateT = 0;
    this.staggerT = 0;
    this.attackCd = 0.8 + Math.random();
    this.atk = null;
    this.hasToken = false;
    this.flashT = 0;
    this.deadT = 0;
    this.untargetable = false;
    this.phased = false;
    this.phaseCd = (t.phaseCd || 0) * (0.5 + Math.random() * 0.7);
    this.teleCd = 2;
    this.circleDir = Math.random() < 0.5 ? 1 : -1;
    this.homeX = x; this.homeZ = z;
    this.wanderT = 0;
    this.alerted = false;
    this.kbx = 0; this.kbz = 0;
    this.setOpacity(1);
    this.parts.tele.material.opacity = 0;
    this.G.vfx.dust(this.pos);
    this.G.vfx.soulBurst(this.pos, 0x6a3a8a);
  }

  setOpacity(o) {
    this.parts.body.opacity = o * (this.typeKey === 'wraith' ? 0.8 : 1);
    this.parts.dark.opacity = o * (this.typeKey === 'wraith' ? 0.8 : 1);
    this.parts.eyeM.opacity = Math.min(1, o * 1.5);
  }

  setState(s) { this.state = s; this.stateT = 0; }

  distToPlayer() {
    const p = this.G.player.pos;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  faceToward(x, z, dt, rate = 8) {
    this.facing = angleLerp(this.facing, Math.atan2(x - this.pos.x, z - this.pos.z), dt * rate);
  }

  moveStep(dx, dz, dt, spd) {
    this.pos.x += dx * spd * dt;
    this.pos.z += dz * spd * dt;
  }

  // ---- damage reactions ------------------------------------------------------
  onHit(dmg, kbx, kbz, heavy) {
    this.flashT = 0.12;
    this.alerted = true;
    this.G.enemies.alertAll();
    const kbScale = this.elite ? 0.3 : 1;
    this.kbx += kbx * kbScale; this.kbz += kbz * kbScale;
    // poise: light hits don't interrupt heavies/brutes
    if (this.poise <= 0 || (heavy && this.poise <= 2)) {
      if (this.state !== 'dead' && this.staggerT <= 0 && this.state !== 'active') {
        this.releaseToken();
        this.setState('hitreact');
        this.staggerT = Math.max(this.staggerT, 0.22);
      }
    }
  }

  onBlockedHit() { /* knight: blocked a player hit; counter chance */
    if (Math.random() < 0.4 && this.attackCd > 0.4) this.attackCd = 0.25;
  }

  onParried() { this.stagger(1.7); }

  stagger(dur) {
    this.releaseToken();
    this.staggerT = Math.max(this.staggerT, dur);
    this.setState('stagger');
    this.G.audio.stagger();
    this.parts.tele.material.opacity = 0;
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.releaseToken();
    this.untargetable = true;
    this.setState('dead');
    this.deadT = 0;
    const G = this.G;
    G.stats.kills++;
    G.audio.death();
    G.vfx.blood(this.mesh.position, true);
    G.player.gainXP(Math.round(this.type.xp * (this.elite ? G.cfg.miniboss.xpMult : 1)));
    G.loot.dropFromEnemy(this.pos, this.type, this.elite);
    if (G.lockTarget === this) G.lockTarget = null;
    if (G.finisherTarget === this) G.finisherTarget = null;
  }

  releaseToken() {
    if (this.hasToken) { this.hasToken = false; this.G.enemies.tokens++; }
  }

  startAttack(atk) {
    this.atk = atk;
    this.setState('windup');
    this.G.audio.growl(this.typeKey === 'ghoul' ? 1.6 : this.typeKey === 'brute' ? 0.7 : 1);
    if (atk.aoe) this.G.vfx.ring(this.pos, atk.range, 0xff3020, atk.windup, 'telegraph');
  }

  // ---- main update ------------------------------------------------------------
  update(dt) {
    const G = this.G;
    if (this.state === 'dead') {
      this.deadT += dt;
      this.mesh.rotation.x = -Math.min(1, this.deadT * 3) * Math.PI / 2.2;
      this.pos.y = -Math.max(0, this.deadT - 1.2) * 0.6;
      if (this.deadT > 0.8) this.setOpacity(Math.max(0, 1 - (this.deadT - 0.8) / 1.0));
      if (this.deadT > 1.9) { this.mesh.visible = false; G.enemies.release(this); }
      return;
    }

    // knockback decay
    if (this.kbx || this.kbz) {
      this.pos.x += this.kbx * dt; this.pos.z += this.kbz * dt;
      this.kbx *= Math.pow(0.0001, dt); this.kbz *= Math.pow(0.0001, dt);
      if (Math.abs(this.kbx) < 0.05) this.kbx = 0;
      if (Math.abs(this.kbz) < 0.05) this.kbz = 0;
    }

    // hit flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.parts.body.emissive.setHex(0xffffff);
      this.parts.body.emissiveIntensity = this.flashT > 0 ? 0.7 : 0;
    } else this.parts.body.emissiveIntensity = 0;

    if (this.staggerT > 0) {
      this.staggerT -= dt;
      this.stateT += dt;
      if (this.staggerT <= 0) this.setState('chase');
      this.animate(dt);
      this.applyTransform();
      return;
    }

    this.attackCd -= dt;
    this.brain(dt);
    this.animate(dt);
    this.applyTransform();
  }

  brain(dt) {
    const G = this.G, t = this.type;
    const p = G.player;
    const dist = this.distToPlayer();
    this.stateT += dt;

    switch (this.state) {
      case 'spawn':
        if (this.stateT > 0.5) this.setState(this.alerted ? 'chase' : 'patrol');
        break;

      case 'idle':
      case 'patrol': {
        if (this.alerted || dist < G.cfg.ai.alertRange) { this.setState('alert'); G.audio.growl(); break; }
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 1.5 + Math.random() * 2;
          const a = Math.random() * Math.PI * 2;
          this.wx = this.homeX + Math.cos(a) * 3;
          this.wz = this.homeZ + Math.sin(a) * 3;
        }
        const dx = this.wx - this.pos.x, dz = this.wz - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.4) {
          this.faceToward(this.wx, this.wz, dt, 4);
          this.moveStep(dx / d, dz / d, dt, this.speed * 0.35);
        }
        break;
      }

      case 'alert':
        this.alerted = true;
        this.faceToward(p.pos.x, p.pos.z, dt, 6);
        if (this.stateT > 0.45) this.setState('chase');
        break;

      case 'chase': {
        this.faceToward(p.pos.x, p.pos.z, dt, 9);
        if (t.phasing && this.tickPhase(dt, dist)) break;
        // cultist: keep range, teleport if crowded
        if (t.ranged) {
          this.teleCd -= dt;
          if (dist < t.teleportRange && this.teleCd <= 0) { this.teleport(); break; }
          if (dist > t.castRange * 0.85) this.moveStep(Math.sin(this.facing), Math.cos(this.facing), dt, this.speed);
          else if (dist < 7) this.moveStep(-Math.sin(this.facing), -Math.cos(this.facing), dt, this.speed * 0.7);
          if (this.attackCd <= 0 && dist < t.castRange && this.G.enemies.requestToken(this)) {
            this.startAttack(t.attacks[0]);
            this.G.audio.cast();
          }
          break;
        }
        // melee approach
        const reach = (this.atkRange() - 0.4);
        if (dist > reach) {
          this.moveStep(Math.sin(this.facing), Math.cos(this.facing), dt, this.speed);
        }
        if (dist <= reach + 0.5 && this.attackCd <= 0) {
          if (this.G.enemies.requestToken(this)) {
            const atks = t.attacks;
            this.startAttack(atks[(Math.random() * atks.length) | 0]);
          } else this.setState('circle');
        } else if (dist <= reach && this.attackCd > 0.3) {
          this.setState('circle');
        }
        break;
      }

      case 'circle': {
        this.faceToward(p.pos.x, p.pos.z, dt, 9);
        if (t.phasing && this.tickPhase(dt, dist)) break;
        const r = this.G.cfg.ai.circleRadius;
        // orbit the player, drift to ideal radius
        const ox = this.pos.x - p.pos.x, oz = this.pos.z - p.pos.z;
        const d = Math.hypot(ox, oz) || 1;
        const tx = -oz / d * this.circleDir, tz = ox / d * this.circleDir;
        const radial = (d - r) * -0.5;
        this.moveStep(tx + ox / d * radial, tz + oz / d * radial, dt, this.speed * 0.55);
        if (this.stateT > 1.2 + Math.random()) this.setState('chase');
        if (this.attackCd <= 0 && d < this.atkRange() + 1 && this.G.enemies.requestToken(this)) {
          this.startAttack(t.attacks[(Math.random() * t.attacks.length) | 0]);
        }
        break;
      }

      case 'windup': {
        const a = this.atk;
        this.faceToward(p.pos.x, p.pos.z, dt, a.unblockable ? 3.5 : 6);
        // drift toward the player while winding up so swings connect
        if (!a.projectile && dist > a.range * 0.7)
          this.moveStep(Math.sin(this.facing), Math.cos(this.facing), dt, this.speed * 0.85);
        // telegraph: white = blockable, red = unblockable
        const tm = this.parts.tele.material;
        tm.color.setHex(a.unblockable ? 0xff2818 : 0xfff6e8);
        tm.opacity = 0.4 + 0.6 * Math.abs(Math.sin(this.stateT * 16));
        const sc = 1 + this.stateT / a.windup;
        this.parts.tele.scale.setScalar(sc);
        if (this.stateT >= a.windup) {
          tm.opacity = 0;
          this.setState('active');
          this.G.audio.swing();
          if (a.projectile) {
            this.G.enemies.fireProjectile(this);
          } else {
            enemyMeleeHit(this.G, this, a);
            if (a.aoe) { this.G.vfx.ring(this.pos, a.range, 0xff5030, 0.3, 'expand'); this.G.shake += 0.25; }
          }
        }
        break;
      }

      case 'active':
        if (this.stateT >= this.atk.active) this.setState('recover');
        break;

      case 'recover':
        if (this.stateT >= this.atk.recover) {
          this.releaseToken();
          const cd = t.attackCd;
          this.attackCd = cd[0] + Math.random() * (cd[1] - cd[0]);
          this.setState('circle');
        }
        break;

      case 'hitreact':
        if (this.stateT > 0.22) this.setState('chase');
        break;

      case 'phase': {
        // wraith: invisible, slide behind the player, ambush
        this.untargetable = true;
        const dur = t.phaseDur;
        this.setOpacity(Math.max(0.06, 1 - this.stateT * 4));
        const behind = 2.0;
        const bx = p.pos.x - Math.sin(p.facing) * behind;
        const bz = p.pos.z - Math.cos(p.facing) * behind;
        this.pos.x += (bx - this.pos.x) * Math.min(1, dt * 3);
        this.pos.z += (bz - this.pos.z) * Math.min(1, dt * 3);
        if (this.stateT >= dur) {
          this.untargetable = false; this.phased = false;
          this.setOpacity(1);
          this.phaseCd = t.phaseCd;
          this.G.audio.shriek();
          this.faceToward(p.pos.x, p.pos.z, 1, 99);
          if (this.G.enemies.requestToken(this)) this.startAttack(t.attacks[0]);
          else this.setState('chase');
        }
        break;
      }
    }

    // separation from other enemies
    for (const o of this.G.enemies.active) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz, min = this.G.cfg.ai.separation;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        this.pos.x += dx / d * (min - d) * dt * 3;
        this.pos.z += dz / d * (min - d) * dt * 3;
      }
    }
    this.G.level.clampToArena(this.pos, this.radius);
  }

  atkRange() {
    let r = 0;
    for (const a of this.type.attacks) if (!a.projectile) r = Math.max(r, a.range);
    return r || 2;
  }

  tickPhase(dt, dist) {
    if (this.phased) return false;
    this.phaseCd -= dt;
    if (this.phaseCd <= 0 && dist < 12 && dist > 2.2) { this.beginPhase(); return true; }
    return false;
  }

  beginPhase() {
    this.phased = true;
    this.setState('phase');
    this.G.audio.teleport();
    this.G.vfx.soulBurst(this.pos, 0x9fefff);
  }

  teleport() {
    const G = this.G, p = G.player.pos;
    this.teleCd = this.type.teleportCd;
    G.vfx.soulBurst(this.pos, 0xd58cff);
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 4;
    this.pos.x = p.x + Math.cos(a) * r;
    this.pos.z = p.z + Math.sin(a) * r;
    G.level.clampToArena(this.pos, this.radius);
    G.audio.teleport();
    G.vfx.soulBurst(this.pos, 0xd58cff);
  }

  // ---- procedural animation -----------------------------------------------------
  animate(dt) {
    this.animT += dt;
    const P = this.parts;
    const s = this.state;
    const moving = s === 'chase' || s === 'patrol' || s === 'circle';
    const bob = Math.sin(this.animT * (moving ? 11 : 2.4));

    if (this.typeKey === 'wraith') {
      this.mesh.position.y = Math.max(this.mesh.position.y, 0); // hover applied below via torso
      P.torso.position.y = 1.1 + Math.sin(this.animT * 2.2) * 0.12;
    } else if (P.legL) {
      const swing = moving ? Math.sin(this.animT * 11) * 0.6 : 0;
      P.legL.rotation.x = swing;
      P.legR.rotation.x = -swing;
      P.torso.position.y = (this.typeKey === 'brute' ? 1.3 : this.typeKey === 'ghoul' ? 1.0 : 1.15) + (moving ? Math.abs(bob) * 0.05 : bob * 0.015);
    }

    let armR = moving ? Math.sin(this.animT * 11) * 0.4 : Math.sin(this.animT * 2) * 0.06;
    let armL = -armR;
    if (s === 'windup') {
      const k = Math.min(1, this.stateT / this.atk.windup);
      armR = -0.4 - k * 1.8; // raise weapon back
    } else if (s === 'active') {
      armR = -2.2 + Math.min(1.1, this.stateT / this.atk.active) * 3.4; // fast swing through
    } else if (s === 'recover') {
      armR = 1.2 * (1 - Math.min(1, this.stateT / this.atk.recover));
    } else if (s === 'stagger' || s === 'hitreact') {
      armR = 0.5; armL = 0.5;
      P.torso.rotation.z = Math.sin(this.animT * 30) * 0.1 * Math.min(1, this.staggerT);
    }
    if (s !== 'stagger' && s !== 'hitreact') P.torso.rotation.z = 0;
    P.armR.rotation.x = armR;
    P.armL.rotation.x = armL;
    if (this.shielded && P.shield) {
      // raise shield when guarding (idle/chase), lower while attacking
      P.armL.rotation.x = (s === 'windup' || s === 'active') ? 0.3 : -1.2;
    }
  }

  applyTransform() {
    this.mesh.rotation.y = this.facing;
  }

  dispose() {
    this.G.scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

// ---------------------------------------------------------------------------
export class EnemyManager {
  constructor(G) {
    this.G = G;
    this.pools = {};      // typeKey -> Enemy[]
    this.active = [];
    this.tokens = G.cfg.ai.maxAttackers;

    // projectile pool
    this.projs = [];
    const geo = new THREE.SphereGeometry(0.17, 8, 6);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xd58cff, transparent: true }));
      m.visible = false;
      G.scene.add(m);
      this.projs.push({ mesh: m, active: false, vx: 0, vz: 0, life: 0, dmg: 0, src: null });
    }
  }

  spawn(typeKey, x, z, elite = false) {
    const pool = this.pools[typeKey] || (this.pools[typeKey] = []);
    let e = pool.pop();
    if (!e) e = new Enemy(this.G, typeKey);
    e.spawn(x, z, elite);
    this.active.push(e);
    return e;
  }

  release(e) {
    const i = this.active.indexOf(e);
    if (i >= 0) this.active.splice(i, 1);
    (this.pools[e.typeKey] || (this.pools[e.typeKey] = [])).push(e);
  }

  requestToken(e) {
    if (e.hasToken) return true;
    if (this.tokens > 0) { this.tokens--; e.hasToken = true; return true; }
    return false;
  }

  alertAll() {
    for (const e of this.active) e.alerted = true;
  }

  aliveCount() {
    let n = 0;
    for (const e of this.active) if (e.alive) n++;
    return n;
  }

  fireProjectile(e, spec = e.atk) {
    for (const pr of this.projs) {
      if (pr.active) continue;
      const G = this.G, p = G.player.pos;
      pr.active = true;
      pr.mesh.visible = true;
      pr.mesh.position.set(e.pos.x, 1.4, e.pos.z);
      const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const spd = spec.projSpeed || 11;
      pr.vx = dx / d * spd; pr.vz = dz / d * spd;
      pr.life = 3.5;
      pr.dmg = e.dmg * spec.dmg;
      pr.src = e;
      pr.mesh.material.color.setHex(e.isBoss ? 0xc9ff4a : 0xd58cff);
      return;
    }
  }

  updateProjectiles(dt) {
    const G = this.G, p = G.player;
    for (const pr of this.projs) {
      if (!pr.active) continue;
      pr.life -= dt;
      pr.mesh.position.x += pr.vx * dt;
      pr.mesh.position.z += pr.vz * dt;
      pr.mesh.material.opacity = Math.min(1, pr.life * 2);
      const dx = p.pos.x - pr.mesh.position.x, dz = p.pos.z - pr.mesh.position.z;
      if (dx * dx + dz * dz < (p.radius + 0.35) ** 2) {
        // a parry/block of a projectile reflects nothing but negates it
        hitPlayer(G, pr.src && pr.src.alive ? pr.src : { pos: pr.mesh.position }, pr.dmg, { unblockable: false, kb: 1.5 });
        G.vfx.sparks(pr.mesh.position);
        pr.active = false; pr.mesh.visible = false;
        continue;
      }
      if (pr.life <= 0) { pr.active = false; pr.mesh.visible = false; }
    }
  }

  update(dt) {
    // refresh token count from actual holders (guards against leaks)
    let held = 0;
    for (const e of this.active) if (e.hasToken) held++;
    this.tokens = Math.max(0, this.G.cfg.ai.maxAttackers - held);

    for (let i = this.active.length - 1; i >= 0; i--) this.active[i].update(dt);
    this.updateProjectiles(dt);
  }

  killAll(silent = false) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.alive = false;
      e.releaseToken();
      e.mesh.visible = false;
      this.release(e);
    }
    for (const pr of this.projs) { pr.active = false; pr.mesh.visible = false; }
  }
}
