// ============================================================================
// Bosses — Plague Abbot, Wraith Queen, Demon Lord. Multi-phase pattern AI
// with a unique mechanic each: poison clouds / add-summoning blinks / arena
// fire hazards + expanding flame waves.
// ============================================================================
import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { enemyMeleeHit, hitPlayer } from './combat.js';

// ---------------------------------------------------------------------------
function buildBossBody(key, t) {
  const grp = new THREE.Group();
  const mat = (c, e = 0x000000, ei = 0) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.8, emissive: e, emissiveIntensity: ei, transparent: true, opacity: 1,
  });
  const body = mat(t.color);
  const dark = mat(new THREE.Color(t.color).multiplyScalar(0.5).getHex());
  const eyeM = new THREE.MeshBasicMaterial({ color: t.eye, transparent: true });
  const parts = { body, dark, eyeM, legL: null, legR: null, torso: null, weapon: null };
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  let torso, head;
  if (key === 'abbot') {
    torso = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.9, 8), body);
    torso.position.y = 1.15;
    head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), dark);
    head.position.y = 1.0; torso.add(head);
    const cowl = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 7), body);
    cowl.position.y = 0.18; head.add(cowl);
  } else if (key === 'wraithQueen') {
    body.opacity = 0.85; dark.opacity = 0.85;
    torso = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.3, 7), body);
    torso.position.y = 1.4;
    head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), dark);
    head.position.y = 1.25; torso.add(head);
    const crownM = mat(0xdde8f0, 0xdde8f0, 0.3);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), crownM);
      const a = (i / 5) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.2, 0.24, Math.sin(a) * 0.2);
      head.add(sp);
    }
  } else { // demonLord
    torso = box(1.3, 1.25, 0.75, body);
    torso.position.y = 1.7;
    head = box(0.42, 0.4, 0.42, dark);
    head.position.y = 0.85; torso.add(head);
    const hornM = mat(0x2a1714);
    for (const sx of [-0.22, 0.22]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 5), hornM);
      horn.position.set(sx, 0.4, 0); horn.rotation.z = -sx * 1.4;
      head.add(horn);
    }
    const crack = box(1.32, 0.16, 0.77, new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true }));
    crack.position.y = -0.1; torso.add(crack);
    parts.legL = box(0.32, 1.1, 0.32, dark); parts.legL.position.set(-0.35, 0.55, 0);
    parts.legR = box(0.32, 1.1, 0.32, dark); parts.legR.position.set(0.35, 0.55, 0);
    grp.add(parts.legL, parts.legR);
  }
  grp.add(torso);
  parts.torso = torso; parts.head = head;

  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 4);
  for (const sx of [-0.1, 0.1]) {
    const e = new THREE.Mesh(eyeGeo, eyeM);
    e.position.set(sx, 0.02, 0.2);
    head.add(e);
  }

  const mkArm = (side, len) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (key === 'demonLord' ? 0.78 : 0.5), 0.4, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, len, 0.18), dark);
    arm.position.y = -len / 2;
    pivot.add(arm);
    torso.add(pivot);
    return pivot;
  };
  parts.armL = mkArm(-1, key === 'demonLord' ? 1.1 : 0.8);
  parts.armR = mkArm(1, key === 'demonLord' ? 1.1 : 0.8);

  if (key === 'abbot') {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9), mat(0x3a2c20));
    staff.position.y = -0.8; parts.armR.add(staff);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: t.eye, transparent: true }));
    orb.position.y = 0.55; staff.add(orb);
    parts.weapon = orb;
  } else if (key === 'wraithQueen') {
    for (const [pivot, side] of [[parts.armR, 1], [parts.armL, -1]]) {
      const blade = box(0.07, 1.2, 0.07, mat(0xc8dcec, 0xc8dcec, 0.5));
      blade.position.y = -1.2; pivot.add(blade);
      if (side === 1) parts.weapon = blade;
    }
  } else {
    const sword = box(0.16, 2.1, 0.1, mat(0x55202a, 0xff3010, 0.4));
    sword.position.y = -1.9; parts.armR.add(sword);
    parts.weapon = sword;
  }

  const tele = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  tele.position.y = key === 'demonLord' ? 3.4 : 3.0;
  grp.add(tele);
  parts.tele = tele;

  return { grp, parts };
}

// ---------------------------------------------------------------------------
// pattern definitions. melee: resolved vs player at windup end.
// red (unblockable) attacks must be dodged.
// ---------------------------------------------------------------------------
const PATTERNS = {
  volley:  { range: 17, windup: 0.85, recover: 1.2, exec: (b) => b.fireVolley(1) },
  volley3: { range: 17, windup: 0.95, recover: 1.5, exec: (b) => b.fireVolley(3) },
  slam:    { range: 3.0, windup: 0.9, recover: 1.0, melee: { range: 3.2, dmg: 1.25, kb: 8, aoe: true } },
  cloud:   { range: 14, windup: 1.0, recover: 1.4, exec: (b) => {
      const p = b.G.player.pos;
      b.G.level.spawnHazard(p.x, p.z, 2.9, 0.9, 4.5, 9, 0x86c128);
      b.G.audio.cast();
    } },
  summon:  { range: 20, windup: 1.2, recover: 1.6, oncePerFight: true, exec: (b) => b.summonAdds(['ghoul', 'ghoul']) },
  slash:   { range: 2.7, windup: 0.55, recover: 0.8, melee: { range: 2.8, dmg: 1.0, kb: 3 } },
  flurry:  { range: 2.7, windup: 0.7, recover: 1.0, multi: 3, interval: 0.34, melee: { range: 2.9, dmg: 0.6, kb: 2 } },
  blink:   { range: 30, windup: 0.45, recover: 0.25, exec: (b) => {
      const p = b.G.player;
      b.G.vfx.soulBurst(b.pos, 0xa0f4ff);
      b.pos.x = p.pos.x - Math.sin(p.facing) * 2.4;
      b.pos.z = p.pos.z - Math.cos(p.facing) * 2.4;
      b.G.level.clampToArena(b.pos, b.radius);
      b.G.audio.teleport();
      b.cd = 0; b.forcePattern = 'slash';
    } },
  summonWraiths: { range: 30, windup: 1.3, recover: 1.6, oncePerPhase: true, exec: (b) => b.summonAdds(['wraith', 'ghoul']) },
  shriek:  { range: 4.2, windup: 0.95, recover: 1.3, red: true, melee: { range: 4.6, dmg: 1.1, kb: 10, aoe: true, unblockable: true },
             exec: (b) => b.G.audio.shriek() },
  cleave:  { range: 3.2, windup: 0.8, recover: 0.9, melee: { range: 3.6, dmg: 1.1, kb: 6 } },
  stomp:   { range: 3.6, windup: 1.05, recover: 1.15, red: true, melee: { range: 4.0, dmg: 1.35, kb: 9, aoe: true, unblockable: true } },
  fireWave:{ range: 30, windup: 1.1, recover: 1.6, red: true, exec: (b) => b.launchWave() },
  charge:  { range: 30, windup: 0.8, recover: 1.0, red: true, charge: true },
  meteor:  { range: 30, windup: 0.6, recover: 1.4, red: true, exec: (b) => {
      const p = b.G.player.pos;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 1.5 + Math.random() * 2;
        b.G.level.spawnHazard(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 2.1, 1.0 + i * 0.35, 3.0, 13, 0xff5a10);
      }
      b.G.audio.cast();
    } },
};

// ---------------------------------------------------------------------------
export class Boss extends Enemy {
  lookupType(key) { return this.G.cfg.bosses[key]; }
  build(key, type) { return buildBossBody(key, type); }

  spawn(x, z) {
    const G = this.G, t = this.type;
    const diff = G.cfg.difficulty[G.difficulty];
    this.isBoss = true;
    this.elite = false;
    this.maxhp = Math.round(t.hp * diff.hp);
    this.hp = this.maxhp;
    this.dmg = t.dmg;
    this.speed = t.speed;
    this.radius = t.radius;
    this.poise = 99;
    this.shielded = false;
    this.name = t.name;
    this.untargetable = false;
    this.phased = false;

    this.pos.set(x, 0, z);
    this.mesh.scale.setScalar(t.scale);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.visible = true;
    this.facing = Math.atan2(G.player.pos.x - x, G.player.pos.z - z);
    this.alive = true;
    this.setOpacity(1);

    this.state = 'intro'; this.stateT = 0;
    this.staggerT = 0; this.flashT = 0; this.deadT = 0;
    this.kbx = 0; this.kbz = 0;
    this.hasToken = false;
    this.phaseIdx = 0;
    this.patterns = t.phases[0].patterns;
    this.usedFight = new Set();
    this.usedPhase = new Set();
    this.pattern = null;
    this.forcePattern = null;
    this.cd = 1.2;
    this.hitsLeft = 0; this.hitT = 0;
    this.chargeT = 0; this.chargeHit = false;
    this.ambientT = 0;
    this.waves = [];
    if (!this.waveMeshes) {
      this.waveMeshes = [];
      const geo = new THREE.RingGeometry(0.9, 1.0, 48);
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0xff6a18, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
        }));
        m.rotation.x = -Math.PI / 2; m.visible = false;
        G.scene.add(m);
        this.waveMeshes.push(m);
      }
    }

    G.boss = this;
    G.audio.setBossMusic(true);
    G.audio.bigDeath(); // entrance roar
    G.ui.banner(t.name, 'slay the abomination');
    G.shake += 0.6;
  }

  setOpacity(o) {
    const w = this.typeKey === 'wraithQueen' ? 0.85 : 1;
    this.parts.body.opacity = o * w;
    this.parts.dark.opacity = o * w;
    this.parts.eyeM.opacity = Math.min(1, o * 1.5);
  }

  onHit(dmg, kbx, kbz, heavy) {
    this.flashT = 0.1; // no knockback, no stagger from raw hits — parry instead
    this.checkPhase();
  }

  onParried() { this.stagger(1.25); }

  checkPhase() {
    const t = this.type;
    const next = t.phases[this.phaseIdx + 1];
    if (next && this.hp / this.maxhp <= next.at) {
      this.phaseIdx++;
      this.patterns = next.patterns;
      this.usedPhase.clear();
      this.setState('phasechange');
      this.releaseTokenSafe();
      this.parts.tele.material.opacity = 0;
      this.G.audio.shriek();
      this.G.shake += 0.7;
      this.G.vfx.ring(this.pos, 6, 0xff4030, 0.7, 'expand');
      this.G.ui.banner('', `phase ${this.phaseIdx + 1}`);
      if (this.typeKey === 'wraithQueen') this.summonAdds(['wraith', 'ghoul', 'ghoul']);
    }
  }

  releaseTokenSafe() { /* bosses don't use the token system */ }

  summonAdds(types) {
    const G = this.G;
    for (const tk of types) {
      const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 3;
      const e = G.enemies.spawn(tk, this.pos.x + Math.cos(a) * r, this.pos.z + Math.sin(a) * r);
      G.level.clampToArena(e.pos, e.radius);
      e.alerted = true;
    }
    G.audio.cast();
  }

  fireVolley(n) {
    const G = this.G;
    const spec = { dmg: 1.0, projSpeed: 12 };
    for (let i = 0; i < n; i++)
      setTimeout(() => { if (this.alive && G.state === 'playing') G.enemies.fireProjectile(this, spec); }, i * 240);
    G.audio.cast();
  }

  launchWave() {
    this.waves.push({ r: 1.2, speed: 7.5, max: 16, hit: false, x: this.pos.x, z: this.pos.z });
    this.G.audio.rage();
    this.G.shake += 0.4;
  }

  updateWaves(dt) {
    const G = this.G, p = G.player;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += w.speed * dt;
      const m = this.waveMeshes[i % this.waveMeshes.length];
      m.visible = true;
      m.position.set(w.x, 0.12, w.z);
      m.scale.setScalar(w.r);
      m.material.opacity = 0.85 * (1 - w.r / w.max);
      if (!w.hit) {
        const d = Math.hypot(p.pos.x - w.x, p.pos.z - w.z);
        if (Math.abs(d - w.r) < 0.7) {
          w.hit = true; // one chance to dodge through it
          hitPlayer(G, { pos: { x: w.x, z: w.z } }, this.dmg * 1.1, { unblockable: true, kb: 6 });
        }
      }
      if (w.r >= w.max) {
        this.waves.splice(i, 1);
        m.visible = false;
      }
    }
  }

  pickPattern() {
    if (this.forcePattern) { const k = this.forcePattern; this.forcePattern = null; return k; }
    const opts = this.patterns.filter((k) => {
      const p = PATTERNS[k];
      if (p.oncePerFight && this.usedFight.has(k)) return false;
      if (p.oncePerPhase && this.usedPhase.has(k)) return false;
      return k !== this.lastPattern || this.patterns.length === 1;
    });
    return opts[(Math.random() * opts.length) | 0] || this.patterns[0];
  }

  update(dt) {
    if (this.waves.length) this.updateWaves(dt);
    super.update(dt);
  }

  brain(dt) {
    const G = this.G, p = G.player;
    const dist = this.distToPlayer();
    this.stateT += dt;
    this.checkPhase();

    // demon lord phase 3: ambient arena hazards
    if (this.typeKey === 'demonLord' && this.phaseIdx >= 2) {
      this.ambientT -= dt;
      if (this.ambientT <= 0) {
        this.ambientT = 5.5;
        G.level.spawnHazard(p.pos.x, p.pos.z, 2.0, 1.1, 2.8, 11, 0xff5a10);
      }
    }

    switch (this.state) {
      case 'intro':
        this.faceToward(p.pos.x, p.pos.z, dt, 4);
        if (this.stateT > 2.0) this.setState('chase');
        break;

      case 'phasechange':
        this.faceToward(p.pos.x, p.pos.z, dt, 3);
        if (this.stateT > 1.4) { this.cd = 0.5; this.setState('chase'); }
        break;

      case 'chase': {
        if (!this.pattern) { this.patternKey = this.pickPattern(); this.pattern = PATTERNS[this.patternKey]; }
        this.faceToward(p.pos.x, p.pos.z, dt, 7);
        this.cd -= dt;
        const need = this.pattern.range * 0.9;
        if (dist > need) {
          this.moveStep(Math.sin(this.facing), Math.cos(this.facing), dt, this.speed);
        } else if (this.cd <= 0) {
          this.setState('windup');
          this.atk = { windup: this.pattern.windup, active: 0.2, recover: this.pattern.recover };
          this.G.audio.growl(this.typeKey === 'demonLord' ? 0.6 : 0.9);
          if (this.pattern.melee && this.pattern.melee.aoe)
            G.vfx.ring(this.pos, this.pattern.melee.range, this.pattern.red ? 0xff3020 : 0xfff0d0, this.pattern.windup, 'telegraph');
        }
        break;
      }

      case 'windup': {
        const pat = this.pattern;
        this.faceToward(p.pos.x, p.pos.z, dt, pat.red ? 2.5 : 5);
        if (pat.melee && dist > pat.melee.range * 0.7)
          this.moveStep(Math.sin(this.facing), Math.cos(this.facing), dt, this.speed * 0.8);
        const tm = this.parts.tele.material;
        tm.color.setHex(pat.red ? 0xff2818 : 0xfff6e8);
        tm.opacity = 0.4 + 0.6 * Math.abs(Math.sin(this.stateT * 14));
        this.parts.tele.scale.setScalar(1 + this.stateT / pat.windup);
        if (this.stateT >= pat.windup) {
          tm.opacity = 0;
          if (pat.oncePerFight) this.usedFight.add(this.patternKey);
          if (pat.oncePerPhase) this.usedPhase.add(this.patternKey);
          this.lastPattern = this.patternKey;
          if (pat.exec) pat.exec(this);
          if (pat.charge) { this.setState('charging'); this.chargeT = 0.65; this.chargeHit = false; G.audio.swingHeavy(); break; }
          if (pat.melee) {
            G.audio.swingHeavy();
            this.atkSpec = pat.melee;
            this.resolveMelee();
            if (pat.melee.aoe) { G.vfx.ring(this.pos, pat.melee.range, 0xff5030, 0.3, 'expand'); G.shake += 0.3; }
          }
          if (pat.multi) { this.hitsLeft = pat.multi - 1; this.hitT = pat.interval; this.setState('strike'); break; }
          this.setState('recover');
        }
        break;
      }

      case 'strike': // flurry follow-up hits
        this.faceToward(p.pos.x, p.pos.z, dt, 6);
        this.hitT -= dt;
        if (this.hitT <= 0) {
          this.G.audio.swing();
          this.resolveMelee();
          this.hitsLeft--;
          this.hitT = this.pattern.interval;
          if (this.hitsLeft <= 0) this.setState('recover');
        }
        break;

      case 'charging': {
        this.chargeT -= dt;
        this.moveStep(Math.sin(this.facing), Math.cos(this.facing), dt, this.speed * 4.2);
        G.vfx.dust(this.pos);
        if (!this.chargeHit && dist < this.radius + p.radius + 0.6) {
          this.chargeHit = true;
          hitPlayer(G, this, this.dmg * 1.3, { unblockable: true, kb: 11 });
        }
        if (this.chargeT <= 0) { G.shake += 0.3; this.setState('recover'); }
        break;
      }

      case 'recover':
        if (this.stateT >= this.pattern.recover) {
          this.pattern = null;
          this.cd = 0.5 + Math.random() * 0.9;
          this.setState('chase');
        }
        break;
    }

    this.G.level.clampToArena(this.pos, this.radius);
  }

  resolveMelee() {
    const s = this.atkSpec || this.pattern.melee;
    enemyMeleeHit(this.G, this, { range: s.range, dmg: s.dmg, kb: s.kb, unblockable: !!s.unblockable, aoe: !!s.aoe });
  }

  animate(dt) {
    // map boss pattern states onto the base humanoid animation
    const mapped = this.state === 'strike' ? 'active' : this.state;
    const saved = this.state;
    this.state = ['windup', 'active', 'recover', 'stagger', 'hitreact', 'chase', 'patrol', 'circle'].includes(mapped) ? mapped : 'idle';
    if (this.state === 'active' && !this.atk) this.atk = { windup: 0.5, active: 0.3, recover: 1 };
    super.animate(dt);
    this.state = saved;
    if (this.typeKey === 'wraithQueen') this.parts.torso.position.y = 1.4 + Math.sin(this.animT * 2.4) * 0.15;
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.untargetable = true;
    this.setState('dead');
    this.deadT = 0;
    const G = this.G;
    G.stats.kills++;
    G.boss = null;
    G.slowmo = Math.max(G.slowmo, 1.1);
    G.vfx.bossExplosion(this.mesh.position);
    G.audio.bigDeath();
    G.audio.setBossMusic(false);
    G.player.gainXP(this.type.xp);
    G.loot.drop(this.pos, { gold: this.type.gold });
    G.loot.drop({ x: this.pos.x + 1.2, z: this.pos.z }, { item: G.loot.rollItem(G.cfg.loot.bossRarityBonus) });
    if (G.lockTarget === this) G.lockTarget = null;
    for (const m of this.waveMeshes) m.visible = false;
    this.waves.length = 0;
    G.level.onBossDeath();
  }
}
