// ============================================================================
// Level — builds each chapter's arena (props, torches, fog, sky), runs the
// chapter flow: 3 waves → mini-boss → loot room (chest + shrine) → boss.
// Owns ground hazards (poison clouds, fire patches) and disposes everything
// between chapters.
// ============================================================================
import * as THREE from 'three';
import { Boss } from './boss.js';
import { hitPlayer } from './combat.js';

export class LevelManager {
  constructor(G) {
    this.G = G;
    this.group = null;
    this.chapterIndex = 0;
    this.phase = 'idle';
    this.phaseT = 0;
    this.waveIdx = 0;
    this.obstacles = [];
    this.torches = [];
    this.checkpoint = 'waves';
    this.chest = null; this.shrine = null;
    this.chestOpened = false; this.prayed = false;

    // hazard pool
    this.hazards = [];
    const geo = new THREE.CircleGeometry(1, 24);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xff5a10, transparent: true, opacity: 0, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.05;
      m.visible = false;
      G.scene.add(m);
      this.hazards.push({ mesh: m, active: false, delay: 0, dur: 0, dps: 0, r: 1, tick: 0 });
    }
  }

  get chapterCfg() { return this.G.cfg.chapters[this.chapterIndex]; }

  clampToArena(pos, r) {
    const R = this.G.cfg.arena.radius - r;
    const d = Math.hypot(pos.x, pos.z);
    if (d > R) { pos.x *= R / d; pos.z *= R / d; }
    for (const o of this.obstacles) {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const dist = Math.hypot(dx, dz), min = o.r + r;
      if (dist < min && dist > 0.001) {
        pos.x = o.x + dx / dist * min;
        pos.z = o.z + dz / dist * min;
      }
    }
  }

  // ---- environment building -------------------------------------------------
  startChapter(i, fromCheckpoint = false) {
    const G = this.G;
    this.chapterIndex = i;
    this.disposeEnv();
    this.buildEnv();
    G.enemies.killAll();
    G.loot.clearAll();
    this.clearHazards();
    G.player.pos.set(0, 0, -G.cfg.arena.radius * 0.55);
    G.player.facing = 0;
    G.camYaw = 0;
    G.lockTarget = null;
    G.boss = null;
    G.audio.setBossMusic(false);

    this.waveIdx = 0;
    this.chestOpened = false; this.prayed = false;
    this.phase = fromCheckpoint && this.checkpoint === 'boss' ? 'lootroom' : 'intro';
    if (!fromCheckpoint) this.checkpoint = 'waves';
    this.phaseT = 0;
    const ch = this.chapterCfg;
    G.ui.banner(ch.name, ch.title);
    G.ui.updateWave();
    G.save.autoSave();
    if (this.phase === 'lootroom') this.spawnLootRoom();
  }

  buildEnv() {
    const G = this.G, ch = this.chapterCfg, R = G.cfg.arena.radius;
    const grp = this.group = new THREE.Group();
    G.scene.add(grp);
    this.obstacles.length = 0;
    this.torches.length = 0;

    // player-selected world theme overrides the chapter palette/props
    const theme = G.cfg.themes[G.settings.theme] || null;
    const pal = theme || ch;
    const style = theme ? theme.props : ['village', 'forest', 'citadel'][this.chapterIndex];

    // light mode: lift the palette into daylight
    const lightMode = G.settings.light === 'light';
    G.applyLighting(lightMode);
    let skyC = pal.sky, fogC = pal.fog, groundC = pal.ground, dens = pal.fogDensity || 0.026;
    if (lightMode) {
      skyC = new THREE.Color(pal.sky).lerp(new THREE.Color(0xaecdf0), 0.8).getHex();
      fogC = new THREE.Color(pal.fog).lerp(new THREE.Color(0xc4d6e2), 0.75).getHex();
      groundC = new THREE.Color(pal.ground).lerp(new THREE.Color(0x6f9a50), 0.5).getHex();
      dens = 0.008;
    }

    G.scene.fog = new THREE.FogExp2(fogC, dens);
    G.scene.background = new THREE.Color(skyC);

    const mat = (c, opt = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, ...opt });

    // ground
    const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 14, 48), mat(groundC));
    ground.rotation.x = -Math.PI / 2;
    grp.add(ground);

    // arena boundary: ring of rocks
    const rockGeo = new THREE.DodecahedronGeometry(1.4);
    const rockMat = mat(0x2c2a28);
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const rr = R + 1.6 + Math.random() * 1.2;
      rock.position.set(Math.cos(a) * rr, 0.4 + Math.random() * 0.5, Math.sin(a) * rr);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      rock.scale.setScalar(0.8 + Math.random() * 1.4);
      grp.add(rock);
    }

    const addObstacle = (x, z, r) => this.obstacles.push({ x, z, r });

    if (style === 'village') {
      // cursed village: ruined houses + fences
      const wallM = mat(0x3a332b), roofM = mat(0x241f1a);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.4;
        const x = Math.cos(a) * (R * 0.78), z = Math.sin(a) * (R * 0.78);
        const house = new THREE.Group();
        const w = 3 + Math.random() * 1.5;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, w * 0.8), wallM);
        body.position.y = 1.2;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, 1.6, 4), roofM);
        roof.position.y = 3.1; roof.rotation.y = Math.PI / 4;
        house.add(body, roof);
        house.position.set(x, 0, z);
        house.rotation.y = -a;
        grp.add(house);
        addObstacle(x, z, w * 0.62);
      }
      // well at mid-edge
      const well = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1.0, 10), mat(0x4a443c));
      well.position.set(7, 0.5, 6);
      grp.add(well);
      addObstacle(7, 6, 1.5);
    } else if (style === 'forest') {
      // blackroot forest: gnarled trees
      const trunkM = mat(0x35271a), leafM = mat(0x1f4228);
      for (let k = 0; k < 16; k++) {
        const a = Math.random() * Math.PI * 2;
        const rr = R * (0.55 + Math.random() * 0.38);
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        if (Math.hypot(x, z - (-R * 0.55)) < 5) continue; // keep spawn clear
        const h = 4 + Math.random() * 3;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, h, 6), trunkM);
        trunk.position.set(x, h / 2, z);
        trunk.rotation.z = (Math.random() - 0.5) * 0.2;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.8 + Math.random(), 2.6, 6), leafM);
        leaf.position.set(x, h + 0.8, z);
        grp.add(trunk, leaf);
        addObstacle(x, z, 0.7);
      }
      // glowing mushrooms
      for (let k = 0; k < 8; k++) {
        const a = Math.random() * Math.PI * 2, rr = R * (0.3 + Math.random() * 0.6);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5),
          new THREE.MeshBasicMaterial({ color: 0x4adf9a, transparent: true, opacity: 0.85 }));
        m.position.set(Math.cos(a) * rr, 0.15, Math.sin(a) * rr);
        grp.add(m);
      }
    } else {
      // demon citadel: pillars + lava cracks
      const pillarM = mat(0x2e2226);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        const x = Math.cos(a) * (R * 0.7), z = Math.sin(a) * (R * 0.7);
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 7, 8), pillarM);
        p.position.set(x, 3.5, z);
        grp.add(p);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.4), pillarM);
        cap.position.set(x, 7.2, z);
        grp.add(cap);
        addObstacle(x, z, 1.5);
      }
      for (let k = 0; k < 7; k++) {
        const a = Math.random() * Math.PI * 2, rr = R * (0.2 + Math.random() * 0.7);
        const crack = new THREE.Mesh(new THREE.PlaneGeometry(2.2 + Math.random() * 2, 0.5),
          new THREE.MeshBasicMaterial({ color: 0xff4a10, transparent: true, opacity: 0.5 }));
        crack.rotation.x = -Math.PI / 2;
        crack.rotation.z = Math.random() * 3;
        crack.position.set(Math.cos(a) * rr, 0.03, Math.sin(a) * rr);
        grp.add(crack);
      }
    }

    // torches around the arena (flame mesh + up to 5 real lights; sun replaces them in light mode)
    const postM = mat(0x1f1a14);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 1.1;
      const x = Math.cos(a) * (R * 0.92), z = Math.sin(a) * (R * 0.92);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 5), postM);
      post.position.set(x, 1.3, z);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffa030 }));
      flame.position.set(x, 2.75, z);
      grp.add(post, flame);
      let light = null;
      if (!lightMode) {
        light = new THREE.PointLight(0xff8c30, 5, 13, 1.8);
        light.position.set(x, 2.9, z);
        grp.add(light);
      }
      this.torches.push({ flame, light, seed: Math.random() * 10 });
    }

    // light mode: lush dressing — grass, flowers, circling birds
    this.birds = [];
    if (lightMode) {
      const dummy = new THREE.Object3D();
      const grass = new THREE.InstancedMesh(
        new THREE.ConeGeometry(0.07, 0.55, 4),
        new THREE.MeshStandardMaterial({ color: 0x4e7d36, roughness: 1 }), 240);
      for (let i = 0; i < 240; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * (R + 8);
        dummy.position.set(Math.cos(a) * rr, 0.22, Math.sin(a) * rr);
        dummy.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
        dummy.scale.setScalar(0.6 + Math.random() * 1.1);
        dummy.updateMatrix();
        grass.setMatrixAt(i, dummy.matrix);
      }
      grp.add(grass);
      const flowerM = [0xe8d44d, 0xd86a9a, 0xe0e6f0].map((c) => new THREE.MeshBasicMaterial({ color: c }));
      const flowerG = new THREE.SphereGeometry(0.09, 5, 4);
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * (R + 5);
        const f = new THREE.Mesh(flowerG, flowerM[i % 3]);
        f.position.set(Math.cos(a) * rr, 0.32, Math.sin(a) * rr);
        grp.add(f);
      }
      const wingG = new THREE.PlaneGeometry(0.55, 0.16);
      const birdM = new THREE.MeshBasicMaterial({ color: 0x2a2f38, side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Group();
        const wl = new THREE.Mesh(wingG, birdM); wl.position.x = -0.28;
        const wr = new THREE.Mesh(wingG, birdM); wr.position.x = 0.28;
        b.add(wl, wr);
        grp.add(b);
        this.birds.push({ grp: b, wl, wr, a: Math.random() * Math.PI * 2,
          r: 10 + Math.random() * 16, h: 13 + Math.random() * 7,
          spd: 0.12 + Math.random() * 0.15, ph: Math.random() * 9 });
      }
    }
  }

  disposeEnv() {
    const G = this.G;
    if (!this.group) return;
    G.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
      if (o.isLight && o.dispose) o.dispose();
    });
    this.group = null;
    this.chest = null;
    this.shrine = null;
    this.birds = [];
  }

  // ---- hazards ----------------------------------------------------------------
  spawnHazard(x, z, r, delay, dur, dps, color) {
    for (const h of this.hazards) {
      if (h.active) continue;
      h.active = true;
      h.delay = delay; h.dur = dur; h.dps = dps; h.r = r; h.tick = 0;
      h.mesh.position.set(x, 0.05, z);
      h.mesh.scale.setScalar(r);
      h.mesh.material.color.setHex(color);
      h.mesh.material.opacity = 0;
      h.mesh.visible = true;
      this.G.vfx.ring({ x, z }, r, 0xff3020, delay, 'telegraph');
      return;
    }
  }

  clearHazards() {
    for (const h of this.hazards) { h.active = false; h.mesh.visible = false; }
  }

  updateHazards(dt) {
    const G = this.G, p = G.player;
    for (const h of this.hazards) {
      if (!h.active) continue;
      if (h.delay > 0) {
        h.delay -= dt;
        if (h.delay <= 0) { h.mesh.material.opacity = 0.45; G.shake += 0.15; G.audio.impact(true); }
        continue;
      }
      h.dur -= dt;
      h.mesh.material.opacity = 0.3 + 0.18 * Math.sin(G.time * 14);
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.45;
        const dx = p.pos.x - h.mesh.position.x, dz = p.pos.z - h.mesh.position.z;
        if (dx * dx + dz * dz < h.r * h.r)
          hitPlayer(G, null, h.dps * 0.45, { unblockable: true, isZone: true });
      }
      if (h.dur <= 0) { h.active = false; h.mesh.visible = false; }
    }
  }

  // ---- chapter flow --------------------------------------------------------------
  spawnWave(idx) {
    const G = this.G, ch = this.chapterCfg;
    const wave = ch.waves[idx];
    let n = 0;
    for (const g of wave) {
      for (let i = 0; i < g.n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 10 + Math.random() * 9;
        let x = G.player.pos.x + Math.cos(a) * r;
        let z = G.player.pos.z + Math.sin(a) * r;
        const e = G.enemies.spawn(g.t, x, z);
        this.clampToArena(e.pos, e.radius);
        n++;
      }
    }
    G.audio.waveHorn();
    G.ui.banner('', `wave ${idx + 1} of ${ch.waves.length}`);
    G.ui.updateWave();
  }

  spawnLootRoom() {
    const G = this.G;
    const mat = (c, e, ei) => new THREE.MeshStandardMaterial({ color: c, emissive: e || 0, emissiveIntensity: ei || 0, roughness: 0.6 });
    // chest
    const chest = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), mat(0x5a4327));
    base.position.y = 0.35;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.8), mat(0x6b522f));
    lid.position.set(0, 0.85, 0);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.16, 0.86), mat(0xd4af37, 0xd4af37, 0.25));
    band.position.y = 0.5;
    chest.add(base, lid, band);
    chest.position.set(3.5, 0, 2);
    this.group.add(chest);
    this.chest = chest; this.chestLid = lid;
    // shrine
    const shrine = new THREE.Group();
    const ob = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 5), mat(0x3c3a44));
    ob.position.y = 1.2;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.25),
      new THREE.MeshBasicMaterial({ color: 0x86d2ff }));
    gem.position.y = 2.0;
    shrine.add(ob, gem);
    shrine.position.set(-3.5, 0, 2);
    this.group.add(shrine);
    this.shrine = shrine; this.shrineGem = gem;
    this.G.ui.banner('Sanctuary', 'claim the spoils — pray to face the horror beyond');
    this.G.ui.updateWave();
  }

  spawnBoss() {
    const G = this.G, key = this.chapterCfg.boss;
    const boss = new Boss(G, key);
    boss.spawn(0, G.cfg.arena.radius * 0.5);
    G.enemies.active.push(boss);
    this.checkpoint = 'boss';
    G.save.autoSave();
    G.ui.updateWave();
  }

  onBossDeath() {
    this.phase = 'cleared';
    this.phaseT = 0;
    this.G.ui.banner('Victory', `${this.chapterCfg.title} cleansed`);
  }

  update(dt) {
    const G = this.G;
    this.phaseT += dt;
    this.updateHazards(dt);

    // torch flicker
    for (const t of this.torches) {
      const f = 0.8 + Math.sin(G.time * 11 + t.seed * 7) * 0.18 + Math.sin(G.time * 23 + t.seed) * 0.12;
      if (t.light) t.light.intensity = 5 * f;
      t.flame.scale.setScalar(0.8 + f * 0.35);
    }

    // birds circling overhead (light mode)
    if (this.birds) {
      for (const b of this.birds) {
        b.a += b.spd * dt;
        b.grp.position.set(Math.cos(b.a) * b.r, b.h + Math.sin(G.time * 0.7 + b.ph) * 1.2, Math.sin(b.a) * b.r);
        b.grp.rotation.y = -b.a;
        const flap = Math.sin(G.time * 9 + b.ph) * 0.55;
        b.wl.rotation.y = flap; b.wr.rotation.y = -flap;
      }
    }
    if (this.shrineGem) this.shrineGem.rotation.y += dt * 1.5;

    switch (this.phase) {
      case 'intro':
        if (this.phaseT > 2.2) { this.phase = 'wave'; this.phaseT = 0; this.spawnWave(this.waveIdx); }
        break;

      case 'wave':
        if (G.enemies.aliveCount() === 0 && this.phaseT > 1) { this.phase = 'wavegap'; this.phaseT = 0; }
        break;

      case 'wavegap':
        if (this.phaseT > 1.6) {
          this.phaseT = 0;
          this.waveIdx++;
          if (this.waveIdx < this.chapterCfg.waves.length) {
            this.phase = 'wave';
            this.spawnWave(this.waveIdx);
          } else {
            this.phase = 'miniboss';
            const key = this.chapterCfg.miniboss;
            const e = G.enemies.spawn(key, 0, G.cfg.arena.radius * 0.5, true);
            e.alerted = true;
            G.audio.bigDeath();
            G.ui.banner(e.name, 'a champion bars the way');
            G.ui.updateWave();
          }
        }
        break;

      case 'miniboss':
        if (G.enemies.aliveCount() === 0 && this.phaseT > 1) {
          this.phase = 'lootroom'; this.phaseT = 0;
          this.spawnLootRoom();
        }
        break;

      case 'lootroom': {
        const p = G.player.pos;
        let prompt = '';
        if (this.chest && !this.chestOpened &&
            Math.hypot(p.x - this.chest.position.x, p.z - this.chest.position.z) < 2.2) {
          prompt = 'E — open chest';
          if (G.input.pressed.use) {
            G.input.pressed.use = false;
            this.chestOpened = true;
            this.chestLid.rotation.x = -1.1;
            this.chestLid.position.y = 1.0;
            G.audio.chestOpen();
            G.loot.drop({ x: this.chest.position.x + 1.4, z: this.chest.position.z + 0.5 },
              { item: G.loot.rollItem(G.cfg.loot.chestRarityBonus) });
            G.loot.drop({ x: this.chest.position.x - 1.0, z: this.chest.position.z + 1.2 },
              { gold: 40 + ((Math.random() * 40) | 0) + this.chapterIndex * 30 });
          }
        } else if (this.shrine && !this.prayed &&
            Math.hypot(p.x - this.shrine.position.x, p.z - this.shrine.position.z) < 2.2) {
          prompt = 'E — pray at the shrine (restore & face the boss)';
          if (G.input.pressed.use) {
            G.input.pressed.use = false;
            this.prayed = true;
            G.player.hp = G.player.maxhp;
            G.player.stamina = G.player.maxStamina;
            G.vfx.heal(G.player.mesh.position);
            G.audio.levelup();
            this.checkpoint = 'boss';
            G.save.autoSave();
            this.phase = 'prayer'; this.phaseT = 0;
          }
        }
        G.ui.setInteractPrompt(prompt);
        break;
      }

      case 'prayer':
        if (this.phaseT > 1.6) {
          this.phase = 'boss'; this.phaseT = 0;
          this.spawnBoss();
        }
        break;

      case 'boss':
        break;

      case 'cleared':
        if (this.phaseT > 3) {
          this.phase = 'idle';
          if (this.chapterIndex < G.cfg.chapters.length - 1) {
            G.setState('blacksmith');
          } else {
            G.onVictory();
          }
        }
        break;
    }
  }
}
