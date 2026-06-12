// ============================================================================
// Player — state machine (no boolean spaghetti): idle/run, attack chain x3,
// heavy, dodge (iframes), block/parry, riposte, rage special, finisher,
// hit-react, dead. Procedurally animated primitive knight.
// ============================================================================
import * as THREE from 'three';
import { playerStrike, hitEnemy } from './combat.js';

export class Player {
  constructor(G) {
    this.G = G;
    this.buildMesh();
    this.pos = this.mesh.position;
    this.radius = G.cfg.player.radius;
    this.facing = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.buf = { light: 0, heavy: 0, dodge: 0 };
    this.kbx = 0; this.kbz = 0;
    this.vx = 0; this.vz = 0;
    this.alive = true;
    this.reset(true);
  }

  buildMesh() {
    const G = this.G;
    this.mesh = new THREE.Group();
    this.rig = new THREE.Group();          // rolls/leans without fighting yaw
    this.mesh.add(this.rig);

    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    this.mTorso = mat(0x4a4f5c); this.mHelm = mat(0x6a7079);
    this.mArms = mat(0x3c414c); this.mLegs = mat(0x2e3138);
    this.mBlade = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.35, emissive: 0x000000, emissiveIntensity: 0.5 });
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

    const torso = this.torso = box(0.56, 0.7, 0.34, this.mTorso);
    torso.position.y = 1.12;
    this.rig.add(torso);
    const trim = box(0.58, 0.1, 0.36, this.mHelm); trim.position.y = -0.32; torso.add(trim);

    const head = this.head = box(0.3, 0.3, 0.3, this.mHelm);
    head.position.y = 0.52; torso.add(head);
    const visor = box(0.26, 0.06, 0.06, new THREE.MeshBasicMaterial({ color: 0x86d2ff }));
    visor.position.set(0, 0.02, 0.16); head.add(visor);

    this.legL = box(0.17, 0.78, 0.17, this.mLegs); this.legL.position.set(-0.16, 0.47, 0);
    this.legR = box(0.17, 0.78, 0.17, this.mLegs); this.legR.position.set(0.16, 0.47, 0);
    this.rig.add(this.legL, this.legR);

    const mkArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.36, 0.28, 0);
      const arm = box(0.14, 0.6, 0.14, this.mArms);
      arm.position.y = -0.3;
      pivot.add(arm);
      torso.add(pivot);
      return pivot;
    };
    this.armR = mkArm(1);
    this.armL = mkArm(-1);

    // sword
    const blade = box(0.07, 1.05, 0.04, this.mBlade);
    blade.position.y = -1.05;
    const guard = box(0.26, 0.05, 0.08, this.mHelm); guard.position.y = -0.52;
    this.armR.add(blade, guard);
    this.blade = blade;

    // shield (visible while blocking)
    this.shield = box(0.55, 0.7, 0.07, mat(0x57514a));
    this.shield.position.set(0, -0.45, 0.14);
    this.armL.add(this.shield);

    this.G.scene.add(this.mesh);
  }

  // ---- run / respawn state ----------------------------------------------------
  reset(fullRun) {
    const G = this.G;
    if (fullRun) {
      G.meta.gold = 0; G.meta.xp = 0; G.meta.level = 1; G.meta.skillPoints = 0;
      G.meta.weaponUp = 0; G.meta.gear = {};
      G.meta.potions = { hp: G.cfg.difficulty[G.difficulty].potions, rage: 1 };
      G.skills.learned.clear();
    }
    this.recalcStats();
    this.hp = this.maxhp;
    this.stamina = this.maxStamina;
    this.rage = 0;
    this.alive = true;
    this.state = 'idle'; this.stateT = 0;
    this.iframes = 0; this.riposteT = 0; this.blockTime = 0;
    this.blocking = false;
    this.staminaCd = 0;
    this.comboIdx = 0; this.hitDone = false; this.sinceHit = 99;
    this.kbx = 0; this.kbz = 0;
    this.mesh.visible = true;
    this.rig.rotation.set(0, 0, 0);
    this.rig.position.y = 0;
    this.finTarget = null;
    this.applyGearVisuals();
  }

  recalcStats() {
    const G = this.G, cp = G.cfg.player, m = G.meta;
    let atk = 0, def = 0, hp = 0, stam = 0, crit = 0;
    for (const slot of G.cfg.loot.slots) {
      const it = m.gear[slot];
      if (!it) continue;
      atk += it.stats.atk || 0; def += it.stats.def || 0;
      hp += it.stats.hp || 0; stam += it.stats.stam || 0; crit += it.stats.crit || 0;
    }
    atk += m.weaponUp * G.cfg.shop.upgradeAtk;
    this.attack = (cp.baseAttack + (m.level - 1) * G.cfg.xp.perLevelATK + atk) * G.skills.mult('dmg');
    this.defense = def;
    this.maxhp = cp.maxHP + (m.level - 1) * G.cfg.xp.perLevelHP + hp;
    this.maxStamina = cp.maxStamina + stam + G.skills.val('stam');
    this.critChance = cp.baseCrit + crit / 100 + G.skills.val('crit');
    this.aspd = G.skills.mult('aspd');
    if (this.hp > this.maxhp) this.hp = this.maxhp;
    if (this.stamina > this.maxStamina) this.stamina = this.maxStamina;
  }

  applyGearVisuals() {
    const G = this.G, gear = G.meta.gear, tiers = G.cfg.loot.rarities;
    const tint = (matr, slot, base) => {
      const it = gear[slot];
      matr.color.setHex(base);
      if (it) matr.color.lerp(new THREE.Color(tiers[it.rarity].color), 0.45);
    };
    tint(this.mHelm, 'helmet', 0x6a7079);
    tint(this.mTorso, 'chest', 0x4a4f5c);
    tint(this.mArms, 'gauntlets', 0x3c414c);
    const w = gear.weapon;
    this.mBlade.emissive.setHex(w ? tiers[w.rarity].color : 0x000000);
    this.mBlade.emissiveIntensity = w && w.rarity > 0 ? 0.5 : 0;
  }

  facingDot(p) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    return Math.sin(this.facing) * dx / l + Math.cos(this.facing) * dz / l;
  }

  setState(s) { this.state = s; this.stateT = 0; }
  canAct() { return this.state === 'idle' || this.state === 'run' || this.state === 'block'; }

  gainRage(x) {
    if (!this.alive) return;
    const was = this.rage;
    this.rage = Math.min(this.G.cfg.player.rageMax, this.rage + x * this.G.skills.mult('ragegen'));
    if (was < this.G.cfg.player.rageMax && this.rage >= this.G.cfg.player.rageMax) this.G.audio.growl(1.3);
  }

  gainXP(x) {
    const G = this.G, m = G.meta;
    m.xp += x;
    G.stats.xp += x;
    let need = this.xpNeed();
    while (m.xp >= need) {
      m.xp -= need;
      m.level++;
      m.skillPoints++;
      this.recalcStats();
      this.hp = Math.min(this.maxhp, this.hp + this.maxhp * 0.3);
      G.vfx.levelup(this.mesh.position);
      G.audio.levelup();
      G.ui.toast(`Level ${m.level} — skill point earned (K)`, 'r3');
      need = this.xpNeed();
    }
  }

  xpNeed() {
    const x = this.G.cfg.xp;
    return Math.round(x.base * Math.pow(x.growth, this.G.meta.level - 1));
  }

  // ---- actions ------------------------------------------------------------------
  startAttack(idx, kind = 'light') {
    const cp = this.G.cfg.player;
    this.comboIdx = idx;
    this.atkKind = kind;
    this.spec = kind === 'heavy' ? cp.heavy : cp.light[idx];
    this.setState(kind === 'heavy' ? 'heavy' : 'attack');
    this.hitDone = false;
    this.faceCombat();
    this.G.audio[kind === 'heavy' ? 'swingHeavy' : 'swing']();
  }

  faceCombat() {
    const G = this.G;
    if (G.lockTarget && G.lockTarget.alive) {
      const t = G.lockTarget.pos;
      this.facing = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
    } else if (G.input.move.x || G.input.move.z) {
      this.facing = Math.atan2(G.input.move.x, G.input.move.z);
    } else {
      this.facing = G.camYaw;
    }
  }

  tryDodge() {
    const cp = this.G.cfg.player;
    if (this.stamina < cp.dodge.stam || this.state === 'dodge' || this.state === 'dead'
      || this.state === 'finisher' || this.state === 'special' || this.state === 'hitreact') return;
    this.stamina -= cp.dodge.stam;
    this.staminaCd = cp.staminaDelay;
    const mv = this.G.input.move;
    if (mv.x || mv.z) { this.dodgeDirX = mv.x; this.dodgeDirZ = mv.z; }
    else { this.dodgeDirX = Math.sin(this.facing); this.dodgeDirZ = Math.cos(this.facing); }
    const l = Math.hypot(this.dodgeDirX, this.dodgeDirZ) || 1;
    this.dodgeDirX /= l; this.dodgeDirZ /= l;
    this.facing = Math.atan2(this.dodgeDirX, this.dodgeDirZ);
    this.iframes = cp.dodge.iframes;
    this.blocking = false;
    this.setState('dodge');
    this.G.audio.dodge();
    this.G.vfx.dust(this.pos);
  }

  trySpecial() {
    const G = this.G, cp = G.cfg.player;
    if (this.rage < cp.rageMax || !this.canAct()) return;
    this.rage = 0;
    this.blocking = false;
    this.setState('special');
    G.audio.rage();
  }

  tryPotion(which) {
    const G = this.G, m = G.meta;
    if (which === 'hp' && m.potions.hp > 0 && this.hp < this.maxhp) {
      m.potions.hp--;
      this.hp = Math.min(this.maxhp, this.hp + this.maxhp * G.cfg.player.potionHeal);
      G.vfx.heal(this.mesh.position);
      G.audio.potion();
      G.ui.dmgNumber(this.pos, 'HEAL', 'heal');
    } else if (which === 'rage' && m.potions.rage > 0 && this.rage < G.cfg.player.rageMax) {
      m.potions.rage--;
      this.rage = G.cfg.player.rageMax;
      G.audio.potion();
    }
  }

  tryFinisher() {
    const G = this.G, t = G.finisherTarget;
    if (!t || !t.alive) return false;
    this.finTarget = t;
    t.stagger(G.cfg.player.finisherDur + 0.4);
    t.untargetable = true;
    this.setState('finisher');
    G.slowmo = Math.max(G.slowmo, 0.6);
    G.stats.finishers++;
    G.audio.swingHeavy();
    this.facing = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    return true;
  }

  hitReact() {
    if (this.state === 'dodge' || this.state === 'finisher' || this.state === 'special' || !this.alive) return;
    this.blocking = false;
    this.setState('hitreact');
  }

  guardBreak() {
    this.blocking = false;
    this.setState('hitreact');
    this.stateT = -0.45; // longer stun when guard shatters
    this.G.audio.stagger();
    this.G.ui.dmgNumber(this.pos, 'GUARD BROKEN', 'player');
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.blocking = false;
    this.setState('dead');
    this.G.stats.deaths++;
    this.G.audio.bigDeath();
    this.G.onPlayerDeath();
  }

  // ---- per-tick update -------------------------------------------------------------
  update(dt) {
    const G = this.G, cp = G.cfg.player, inp = G.input;

    // timers
    this.iframes = Math.max(0, this.iframes - dt);
    this.riposteT = Math.max(0, this.riposteT - dt);
    this.staminaCd = Math.max(0, this.staminaCd - dt);
    this.sinceHit += dt;
    for (const k in this.buf) this.buf[k] = Math.max(0, this.buf[k] - dt);
    if (inp.pressed.light) this.buf.light = 0.25;
    if (inp.pressed.heavy) this.buf.heavy = 0.25;
    if (inp.pressed.dodge) this.buf.dodge = 0.2;

    // stamina regen
    const busy = this.state === 'attack' || this.state === 'heavy' || this.state === 'special';
    if (this.staminaCd <= 0 && !busy && !this.blocking)
      this.stamina = Math.min(this.maxStamina, this.stamina + cp.staminaRegen * dt);

    // find finisher target
    G.finisherTarget = null;
    if (this.canAct()) {
      let best = null, bd = cp.finisherRange;
      for (const e of G.enemies.active) {
        if (!e.alive || e.isBoss || e.untargetable) continue;
        if (e.hp / e.maxhp > cp.finisherHpPct) continue;
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (d < bd) { bd = d; best = e; }
      }
      G.finisherTarget = best;
    }

    // consumables / specials
    if (inp.pressed.potion1) this.tryPotion('hp');
    if (inp.pressed.potion2) this.tryPotion('rage');
    if (inp.pressed.special) this.trySpecial();
    if (inp.pressed.use && G.finisherTarget && this.canAct()) {
      if (this.tryFinisher()) inp.pressed.use = false;
    }

    this.stateT += dt;
    const aspd = this.aspd;

    switch (this.state) {
      case 'idle':
      case 'run': {
        this.handleLocomotion(dt);
        this.handleBlockHold();
        if (this.state === 'block') break;
        if (this.buf.dodge) { this.buf.dodge = 0; this.tryDodge(); break; }
        if (this.riposteT > 0 && this.buf.light) { this.buf.light = 0; this.riposteT = 0; this.startAttack(2, 'riposte'); break; }
        if (this.buf.light) { this.buf.light = 0; this.startAttack(0); break; }
        if (this.buf.heavy && this.stamina >= cp.heavy.stam) {
          this.buf.heavy = 0; this.stamina -= cp.heavy.stam; this.staminaCd = cp.staminaDelay;
          this.startAttack(0, 'heavy'); break;
        }
        break;
      }

      case 'block': {
        this.blockTime += dt;
        this.handleLocomotion(dt, 0.32);
        if (!inp.held.block || this.stamina <= 0) { this.blocking = false; this.setState('idle'); break; }
        if (this.buf.dodge) { this.buf.dodge = 0; this.tryDodge(); break; }
        if (this.riposteT > 0 && this.buf.light) {
          this.buf.light = 0; this.riposteT = 0; this.blocking = false; this.startAttack(2, 'riposte'); break;
        }
        // face the lock target (or camera) while guarding
        const want = G.lockTarget && G.lockTarget.alive
          ? Math.atan2(G.lockTarget.pos.x - this.pos.x, G.lockTarget.pos.z - this.pos.z) : G.camYaw;
        this.facing = angleLerpP(this.facing, want, dt * 10);
        break;
      }

      case 'attack':
      case 'heavy': {
        const s = this.spec;
        const wind = s.windup / aspd, act = s.active / aspd;
        // small forward drive during the swing
        const drive = this.state === 'heavy' ? 2.4 : 3.2;
        if (this.stateT < wind + act) {
          this.pos.x += Math.sin(this.facing) * drive * dt;
          this.pos.z += Math.cos(this.facing) * drive * dt;
        }
        if (G.lockTarget && G.lockTarget.alive && this.stateT < wind) {
          const t = G.lockTarget.pos;
          this.facing = angleLerpP(this.facing, Math.atan2(t.x - this.pos.x, t.z - this.pos.z), dt * 12);
        }
        if (!this.hitDone && this.stateT >= wind) {
          this.hitDone = true;
          this.sinceHit = 0;
          const kind = this.atkKind === 'riposte' ? 'riposte' : this.state === 'heavy' ? 'heavy' : 'light';
          playerStrike(G, s, kind);
          G.vfx.slash(this.pos, this.facing, this.state === 'heavy', this.atkKind === 'riposte' ? 0xbfe8ff : 0xdfe8ff);
        }
        if (this.buf.dodge) { this.buf.dodge = 0; this.tryDodge(); break; }
        // combo cancel window after the hit
        if (this.state === 'attack' && this.atkKind === 'light' && this.hitDone && this.buf.light
            && this.comboIdx < cp.light.length - 1
            && this.sinceHit <= cp.comboWindow + this.G.skills.val('combo')) {
          this.buf.light = 0;
          this.startAttack(this.comboIdx + 1);
          break;
        }
        if (this.stateT >= (s.windup + s.active + s.recover) / aspd) this.setState('idle');
        break;
      }

      case 'dodge': {
        const d = cp.dodge;
        const k = 1 - (this.stateT / d.dur) * 0.55;
        this.pos.x += this.dodgeDirX * d.speed * k * dt;
        this.pos.z += this.dodgeDirZ * d.speed * k * dt;
        if (this.stateT >= d.dur) this.setState('idle');
        break;
      }

      case 'special': {
        if (!this.rageFired && this.stateT >= 0.28) {
          this.rageFired = true;
          const blast = this.G.skills.mult('rageblast');
          const r = cp.rageRadius * (1 + (blast - 1) * 0.5);
          playerStrike(G, { range: r, arc: 99, dmg: (cp.rageDamage * blast) / this.attack, kb: 10 }, 'rage');
          G.vfx.rageBlast(this.mesh.position, r);
        }
        if (this.stateT >= 0.65) { this.rageFired = false; this.setState('idle'); }
        break;
      }

      case 'finisher': {
        const t = this.finTarget;
        const dur = cp.finisherDur;
        if (t && this.stateT < 0.35) { // lunge in
          this.pos.x += (t.pos.x - Math.sin(this.facing) * 1.2 - this.pos.x) * Math.min(1, dt * 10);
          this.pos.z += (t.pos.z - Math.cos(this.facing) * 1.2 - this.pos.z) * Math.min(1, dt * 10);
        }
        if (t && t.alive && !this.finStruck && this.stateT >= dur * 0.55) {
          this.finStruck = true;
          G.audio.finisher();
          G.freeze = Math.max(G.freeze, 0.09);
          G.ui.dmgNumber(t.pos, 'EXECUTED', 'crit');
          G.vfx.blood(t.mesh.position, true);
          t.untargetable = false;
          hitEnemy(G, t, Math.max(1, Math.ceil(t.hp)), { crit: false, heavy: true });
          const heal = this.maxhp * (cp.finisherHeal + this.G.skills.val('finheal'));
          this.hp = Math.min(this.maxhp, this.hp + heal);
          G.vfx.heal(this.mesh.position);
        }
        if (this.stateT >= dur) { this.finStruck = false; this.finTarget = null; this.setState('idle'); }
        break;
      }

      case 'hitreact':
        if (this.stateT >= 0.32) this.setState('idle');
        break;

      case 'dead':
        break;
    }

    // knockback
    if (this.kbx || this.kbz) {
      this.pos.x += this.kbx * dt; this.pos.z += this.kbz * dt;
      this.kbx *= Math.pow(0.0001, dt); this.kbz *= Math.pow(0.0001, dt);
      if (Math.abs(this.kbx) < 0.05) this.kbx = 0;
      if (Math.abs(this.kbz) < 0.05) this.kbz = 0;
    }

    G.level.clampToArena(this.pos, this.radius);
    this.animate(dt);
    this.mesh.rotation.y = this.facing;
  }

  handleBlockHold() {
    if (this.G.input.held.block && this.stamina > 0) {
      this.blocking = true;
      this.blockTime = 0;
      this.setState('block');
      this.G.audio.uiClick();
    }
  }

  handleLocomotion(dt, mult = 1) {
    const G = this.G, mv = G.input.move;
    const spd = G.cfg.player.moveSpeed * mult;
    if (mv.x || mv.z) {
      this.pos.x += mv.x * spd * dt;
      this.pos.z += mv.z * spd * dt;
      if (this.state !== 'block') {
        if (G.lockTarget && G.lockTarget.alive) {
          const t = G.lockTarget.pos;
          this.facing = angleLerpP(this.facing, Math.atan2(t.x - this.pos.x, t.z - this.pos.z), dt * 10);
        } else {
          this.facing = angleLerpP(this.facing, Math.atan2(mv.x, mv.z), dt * G.cfg.player.turnLerp);
        }
        if (this.state === 'idle') this.setState('run');
      }
    } else if (this.state === 'run') this.setState('idle');
  }

  // ---- procedural animation ------------------------------------------------------
  animate(dt) {
    this.animT = (this.animT || 0) + dt;
    const s = this.state, t = this.stateT;
    const run = s === 'run';
    const swing = run ? Math.sin(this.animT * 12) : 0;

    // defaults
    let armR = run ? swing * 0.5 : Math.sin(this.animT * 2) * 0.05;
    let armL = -armR;
    let armRz = 0, armLz = 0;
    this.legL.rotation.x = run ? swing * 0.7 : 0;
    this.legR.rotation.x = run ? -swing * 0.7 : 0;
    this.rig.rotation.x = 0; this.rig.rotation.z = 0;
    this.rig.position.y = run ? Math.abs(Math.sin(this.animT * 12)) * 0.05 : 0;
    this.torso.rotation.y = 0;
    this.shield.visible = false;

    if (s === 'attack' || s === 'heavy') {
      const sp = this.spec, aspd = this.aspd;
      const wind = sp.windup / aspd, act = sp.active / aspd, rec = sp.recover / aspd;
      const over = s === 'heavy';
      if (t < wind) {
        const k = t / wind;
        armR = -0.5 - k * (over ? 2.1 : 1.6);
        this.torso.rotation.y = k * (this.comboIdx === 1 ? 0.5 : -0.5);
      } else if (t < wind + act) {
        const k = (t - wind) / act;
        armR = (over ? -2.6 : -2.1) + k * (over ? 4.1 : 3.4);
        this.torso.rotation.y = (this.comboIdx === 1 ? 0.5 : -0.5) * (1 - k * 2);
      } else {
        const k = Math.min(1, (t - wind - act) / rec);
        armR = (over ? 1.5 : 1.3) * (1 - k);
        this.torso.rotation.y = 0;
      }
    } else if (s === 'block') {
      this.shield.visible = true;
      armL = -1.25; armLz = 0.35;
      armR = 0.25;
      this.rig.position.y = -0.06;
    } else if (s === 'dodge') {
      const k = t / this.G.cfg.player.dodge.dur;
      this.rig.rotation.x = k * Math.PI * 2;
      this.rig.position.y = Math.sin(k * Math.PI) * 0.25;
      this.legL.rotation.x = 0.6; this.legR.rotation.x = -0.4;
    } else if (s === 'special') {
      const k = Math.min(1, t / 0.3);
      armR = -2.4 + k * 3.2; armL = -2.4 + k * 3.2;
      armRz = -0.9; armLz = 0.9;
      this.rig.position.y = t < 0.3 ? 0.18 : 0;
    } else if (s === 'finisher') {
      const dur = this.G.cfg.player.finisherDur;
      const k = t / dur;
      armR = k < 0.5 ? -0.4 - k * 4 : -2.4 + (k - 0.5) * 7.6;
      this.rig.rotation.x = k < 0.5 ? -0.1 : 0.22;
    } else if (s === 'hitreact') {
      this.rig.rotation.x = -0.25 * Math.max(0, 1 - t * 3);
      armR = 0.4; armL = 0.4;
    } else if (s === 'dead') {
      const k = Math.min(1, t * 1.8);
      this.rig.rotation.x = -k * Math.PI / 2;
      this.rig.position.y = -k * 0.2;
    }

    this.armR.rotation.x = armR;
    this.armL.rotation.x = armL;
    this.armR.rotation.z = armRz;
    this.armL.rotation.z = armLz;
  }
}

function angleLerpP(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}
