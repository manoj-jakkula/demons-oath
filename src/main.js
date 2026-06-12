// ============================================================================
// DEMON'S OATH — entry point. Owns the renderer, fixed-timestep loop,
// camera (orbit + lock-on + shake + arena collision), input (KB/M + touch),
// and top-level game state transitions.
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Player } from './player.js';
import { EnemyManager } from './enemy.js';
import { LevelManager } from './level.js';
import { LootSys } from './loot.js';
import { Skills } from './skills.js';
import { UI } from './ui.js';
import { AudioSys } from './audio.js';
import { VFX } from './vfx.js';
import { SaveSys } from './save.js';

// ---------------------------------------------------------------------------
// renderer / scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
document.getElementById('app').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.1, 220);

scene.add(new THREE.HemisphereLight(0x55608a, 0x241c14, 1.7));
const moon = new THREE.DirectionalLight(0x9db4dd, 1.5);
moon.position.set(-14, 26, -10);
scene.add(moon);

// ---------------------------------------------------------------------------
// global game context
// ---------------------------------------------------------------------------
const G = {
  cfg: CONFIG, scene, camera, renderer,
  state: 'menu',
  time: 0, freeze: 0, slowmo: 0, shake: 0,
  camYaw: 0, camPitch: 0.42,
  difficulty: 'normal',
  lockTarget: null, finisherTarget: null, boss: null,
  meta: { gold: 0, xp: 0, level: 1, skillPoints: 0, weaponUp: 0, gear: {}, potions: { hp: 3, rage: 1 } },
  stats: null,
  settings: { volume: 0.7, sensitivity: 1, shake: true },
  input: {
    keys: {},
    held: { block: false },
    pressed: { light: false, heavy: false, dodge: false, special: false, use: false, potion1: false, potion2: false },
    move: { x: 0, z: 0 },
    joy: { x: 0, y: 0, active: false },
  },
};
window.G = G; // debugging aid

function freshStats() {
  return { damageDealt: 0, damageTaken: 0, kills: 0, parries: 0, finishers: 0, deaths: 0, gold: 0, xp: 0, startTime: Date.now() };
}
G.stats = freshStats();

// systems (order matters: vfx/audio before things that use them)
G.audio = new AudioSys();
G.vfx = new VFX(G);
G.skills = new Skills(G);
G.loot = new LootSys(G);
G.enemies = new EnemyManager(G);
G.level = new LevelManager(G);
G.ui = new UI(G);
G.save = new SaveSys(G);
G.player = new Player(G);

const isTouch = 'ontouchstart' in window && navigator.maxTouchPoints > 0;

// ---------------------------------------------------------------------------
// state transitions
// ---------------------------------------------------------------------------
function setState(s) {
  const prev = G.state;
  G.state = s;
  switch (s) {
    case 'menu':
      G.ui.show('menu');
      G.ui.hideWorldUI();
      document.getElementById('touch').style.display = 'none';
      break;
    case 'playing':
      G.ui.show(null);
      if (isTouch) document.getElementById('touch').style.display = 'block';
      else if (!document.pointerLockElement) lockPointer();
      break;
    case 'paused':
      G.ui.renderGearReadout();
      G.ui.show('pause');
      unlockPointer();
      break;
    case 'skills':
      G.ui.renderSkills();
      G.ui.show('skillsui');
      unlockPointer();
      break;
    case 'smith':
      G.ui.renderSmith();
      G.ui.show('smith');
      G.ui.hideWorldUI();
      unlockPointer();
      G.save.autoSave();
      break;
    case 'dead':
      G.ui.show('death');
      G.ui.hideWorldUI();
      unlockPointer();
      break;
    case 'victory':
      G.ui.renderVictory();
      G.ui.show('victory');
      G.ui.hideWorldUI();
      unlockPointer();
      G.save.clearLocal();
      break;
  }
  if (prev === 'playing' && s !== 'playing') clearTransientInput();
}
G.setState = (s) => setState(s === 'blacksmith' ? 'smith' : s);

G.onPlayerDeath = () => {
  G.audio.setBossMusic(false);
  setTimeout(() => { if (!G.player.alive) setState('dead'); }, 1300);
};

G.onVictory = () => setState('victory');

function startRun(fromSave = null) {
  G.audio.init();
  G.stats = freshStats();
  let chapter = 0;
  if (fromSave) {
    chapter = G.save.apply(fromSave);
    G.player.recalcStats();
    G.player.hp = G.player.maxhp;
    G.player.stamina = G.player.maxStamina;
    G.player.rage = 0;
    G.player.alive = true;
    G.player.state = 'idle';
    G.player.mesh.visible = true;
    G.player.rig.rotation.set(0, 0, 0);
    G.player.applyGearVisuals();
  } else {
    G.player.reset(true);
  }
  G.level.startChapter(chapter);
  setState('playing');
}

function respawn() {
  G.stats.deaths = G.stats.deaths; // already counted on death
  G.meta.potions.hp = Math.max(G.meta.potions.hp, CONFIG.difficulty[G.difficulty].potions);
  G.player.reset(false);
  G.level.startChapter(G.level.chapterIndex, true);
  setState('playing');
}

// ---------------------------------------------------------------------------
// pointer lock
// ---------------------------------------------------------------------------
function lockPointer() {
  if (isTouch) return;
  try { canvas.requestPointerLock(); } catch (e) {}
}
function unlockPointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.state === 'playing' && !isTouch) setState('paused');
});
canvas.addEventListener('click', () => { if (G.state === 'playing') lockPointer(); });

// ---------------------------------------------------------------------------
// keyboard / mouse
// ---------------------------------------------------------------------------
const inp = G.input;

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  inp.keys[k] = true;
  if (G.state === 'playing') {
    if (k === ' ') { inp.pressed.dodge = true; e.preventDefault(); }
    if (k === 'shift') inp.held.block = true;
    if (k === 'q') inp.pressed.special = true;
    if (k === 'e') inp.pressed.use = true;
    if (k === '1') inp.pressed.potion1 = true;
    if (k === '2') inp.pressed.potion2 = true;
    if (k === 'tab') { cycleLockOn(); e.preventDefault(); }
    if (k === 'k') setState('skills');
  } else if (G.state === 'skills' && k === 'k') {
    setState('playing');
  } else if (G.state === 'paused' && k === 'escape') {
    // resume handled by button; Esc here returns to game
    setState('playing');
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  inp.keys[k] = false;
  if (k === 'shift') inp.held.block = false;
});
window.addEventListener('blur', () => clearTransientInput());

canvas.addEventListener('mousedown', (e) => {
  if (G.state !== 'playing' || !document.pointerLockElement) return;
  if (e.button === 0) inp.pressed.light = true;
  if (e.button === 2) inp.pressed.heavy = true;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => {
  if (G.state !== 'playing' || !document.pointerLockElement) return;
  const s = G.settings.sensitivity;
  G.camYaw -= e.movementX * 0.0023 * s;
  G.camPitch += e.movementY * 0.0019 * s;
  G.camPitch = Math.max(CONFIG.camera.minPitch, Math.min(CONFIG.camera.maxPitch, G.camPitch));
});

function clearTransientInput() {
  for (const k in inp.pressed) inp.pressed[k] = false;
  inp.held.block = false;
  for (const k in inp.keys) inp.keys[k] = false;
}

function computeMove() {
  let f = 0, r = 0;
  if (inp.keys['w'] || inp.keys['arrowup']) f += 1;
  if (inp.keys['s'] || inp.keys['arrowdown']) f -= 1;
  if (inp.keys['d'] || inp.keys['arrowright']) r += 1;
  if (inp.keys['a'] || inp.keys['arrowleft']) r -= 1;
  if (isTouch && inp.joy.active) { f = -inp.joy.y; r = inp.joy.x; }
  const len = Math.hypot(f, r);
  if (len > 1) { f /= len; r /= len; }
  const sy = Math.sin(G.camYaw), cy = Math.cos(G.camYaw);
  inp.move.x = f * sy + r * -cy;
  inp.move.z = f * cy + r * sy;
}

// ---------------------------------------------------------------------------
// lock-on
// ---------------------------------------------------------------------------
function cycleLockOn() {
  const candidates = G.enemies.active.filter((e) =>
    e.alive && !e.untargetable &&
    Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z) < 22);
  if (!candidates.length) { G.lockTarget = null; return; }
  candidates.sort((a, b) =>
    Math.hypot(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z) -
    Math.hypot(b.pos.x - G.player.pos.x, b.pos.z - G.player.pos.z));
  const i = candidates.indexOf(G.lockTarget);
  G.lockTarget = i === -1 ? candidates[0] : candidates[(i + 1) % candidates.length];
  G.audio.uiClick();
}

function maintainLockOn(dt) {
  const t = G.lockTarget;
  if (t && (!t.alive || t.untargetable ||
      Math.hypot(t.pos.x - G.player.pos.x, t.pos.z - G.player.pos.z) > 26)) {
    G.lockTarget = null;
  }
  // touch: auto lock nearest
  if (isTouch && !G.lockTarget) {
    let best = null, bd = 18;
    for (const e of G.enemies.active) {
      if (!e.alive || e.untargetable) continue;
      const d = Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    G.lockTarget = best;
  }
  // camera gently swings toward the lock target
  if (G.lockTarget) {
    const t2 = G.lockTarget.pos, p = G.player.pos;
    const want = Math.atan2(t2.x - p.x, t2.z - p.z);
    let d = (want - G.camYaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    G.camYaw += d * Math.min(1, dt * 3.2);
  } else if (isTouch) {
    // follow behind the player when running free on touch
    const mv = inp.move;
    if (mv.x || mv.z) {
      const want = Math.atan2(mv.x, mv.z);
      let d = (want - G.camYaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      G.camYaw += d * Math.min(1, dt * 1.2);
    }
  }
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------
const camTargetV = new THREE.Vector3();
let camDist = CONFIG.camera.dist;

function updateCamera(dt) {
  const c = CONFIG.camera, p = G.player;
  const wantDist = (G.lockTarget ? c.lockDist : c.dist) * (p.state === 'finisher' ? 0.62 : 1);
  camDist += (wantDist - camDist) * Math.min(1, dt * 4);

  const target = camTargetV.set(p.pos.x, p.pos.y + c.height, p.pos.z);
  if (G.lockTarget) {
    target.x += (G.lockTarget.pos.x - p.pos.x) * 0.22;
    target.z += (G.lockTarget.pos.z - p.pos.z) * 0.22;
  }

  const cp = Math.cos(G.camPitch), sp = Math.sin(G.camPitch);
  let cx = target.x - Math.sin(G.camYaw) * cp * camDist;
  let cz = target.z - Math.cos(G.camYaw) * cp * camDist;
  let cy = target.y + sp * camDist;

  // keep camera inside the arena shell and above ground
  const R = CONFIG.arena.radius + 9;
  const d = Math.hypot(cx, cz);
  if (d > R) { cx *= R / d; cz *= R / d; }
  if (cy < 0.4) cy = 0.4;

  camera.position.set(cx, cy, cz);
  camera.lookAt(target);

  // shake (post-lookAt offset)
  if (G.settings.shake && G.shake > 0.001) {
    const s = Math.min(G.shake, 1) * 0.11;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.rotation.z += (Math.random() - 0.5) * s * 0.18;
  }
}

// ---------------------------------------------------------------------------
// touch controls
// ---------------------------------------------------------------------------
function setupTouch() {
  const joy = document.getElementById('joy');
  const knob = document.getElementById('joyknob');
  let joyId = null;
  const setKnob = (dx, dy) => {
    knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
  };
  joy.addEventListener('touchstart', (e) => {
    joyId = e.changedTouches[0].identifier;
    inp.joy.active = true;
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      const r = joy.getBoundingClientRect();
      let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      inp.joy.x = dx; inp.joy.y = dy;
      setKnob(dx, dy);
    }
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null;
        inp.joy.active = false; inp.joy.x = 0; inp.joy.y = 0;
        setKnob(0, 0);
      }
    }
  });
  const bind = (id, fn, up) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { fn(); e.preventDefault(); }, { passive: false });
    if (up) el.addEventListener('touchend', up);
  };
  bind('tatk', () => { inp.pressed.light = true; });
  bind('thvy', () => { inp.pressed.heavy = true; });
  bind('tdge', () => { inp.pressed.dodge = true; });
  bind('trge', () => { inp.pressed.special = true; });
  bind('tuse', () => { inp.pressed.use = true; });
  bind('tblk', () => { inp.held.block = true; }, () => { inp.held.block = false; });
  bind('tpause', () => { if (G.state === 'playing') setState('paused'); });
}
if (isTouch) setupTouch();

// tappable potion icons (touch has no 1/2 keys; desktop pointer-lock ignores these)
document.querySelectorAll('#potions .potion')[0].addEventListener('click', () => { inp.pressed.potion1 = true; });
document.querySelectorAll('#potions .potion')[1].addEventListener('click', () => { inp.pressed.potion2 = true; });

// ---------------------------------------------------------------------------
// menu / screen wiring
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

for (const btn of document.querySelectorAll('.diff')) {
  btn.addEventListener('click', () => {
    for (const b of document.querySelectorAll('.diff')) b.classList.remove('sel');
    btn.classList.add('sel');
    G.difficulty = btn.dataset.d;
    G.audio.init(); G.audio.uiClick();
  });
}

$('btn-start').addEventListener('click', () => startRun());
$('btn-continue').addEventListener('click', () => {
  const data = G.save.loadLocal();
  if (data) startRun(data);
});
$('btn-loadfile').addEventListener('click', () => $('filein').click());
$('filein').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  G.save.importFile(f, (data) => {
    if (data) startRun(data);
    else G.ui.toast('Could not read that save file', '');
  });
  e.target.value = '';
});

$('btn-resume').addEventListener('click', () => setState('playing'));
$('btn-skills').addEventListener('click', () => setState('skills'));
$('btn-skills-close').addEventListener('click', () => setState('playing'));
$('btn-savefile').addEventListener('click', () => G.save.download());
$('btn-quit').addEventListener('click', () => {
  G.enemies.killAll();
  G.loot.clearAll();
  G.audio.setBossMusic(false);
  setState('menu');
  refreshContinue();
});
$('btn-respawn').addEventListener('click', () => respawn());
$('btn-victory-menu').addEventListener('click', () => { setState('menu'); refreshContinue(); });

$('btn-upgrade').addEventListener('click', () => {
  const sh = CONFIG.shop;
  const cost = Math.round(sh.upgradeBase * Math.pow(sh.upgradeGrowth, G.meta.weaponUp));
  if (G.meta.gold >= cost) {
    G.meta.gold -= cost; G.meta.weaponUp++;
    G.player.recalcStats();
    G.audio.pickup(2);
    G.ui.renderSmith();
  }
});
$('btn-buyhp').addEventListener('click', () => {
  if (G.meta.gold >= CONFIG.shop.hpPotion) {
    G.meta.gold -= CONFIG.shop.hpPotion; G.meta.potions.hp++;
    G.audio.potion(); G.ui.renderSmith();
  }
});
$('btn-buyrage').addEventListener('click', () => {
  if (G.meta.gold >= CONFIG.shop.ragePotion) {
    G.meta.gold -= CONFIG.shop.ragePotion; G.meta.potions.rage++;
    G.audio.potion(); G.ui.renderSmith();
  }
});
$('btn-smith-go').addEventListener('click', () => {
  G.level.startChapter(G.level.chapterIndex + 1);
  setState('playing');
});

$('set-vol').addEventListener('input', (e) => {
  G.settings.volume = parseFloat(e.target.value);
  G.audio.setVolume(G.settings.volume);
});
$('set-sens').addEventListener('input', (e) => { G.settings.sensitivity = parseFloat(e.target.value); });
$('set-shake').addEventListener('change', (e) => { G.settings.shake = e.target.checked; });

function refreshContinue() {
  const has = !!G.save.loadLocal();
  $('btn-continue').style.display = has ? 'block' : 'none';
}
refreshContinue();

// first interaction anywhere boots audio (autoplay policy)
window.addEventListener('pointerdown', () => G.audio.init(), { once: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// fixed-timestep loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const STEP = CONFIG.step;
let acc = 0;

function update(dt) {
  G.time += dt;
  computeMove();
  maintainLockOn(dt);
  G.player.update(dt);
  G.enemies.update(dt);
  G.level.update(dt);
  G.loot.update(dt);
  G.vfx.update(dt);
  G.ui.update(dt);
  updateCamera(dt);
  G.shake = Math.max(0, G.shake - dt * 2.2);
  for (const k in inp.pressed) inp.pressed[k] = false;
}

function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.1);

  if (G.state === 'playing') {
    if (G.freeze > 0) {
      G.freeze -= dt;               // hit-stop: keep rendering, halt simulation
    } else {
      const scale = G.slowmo > 0 ? 0.3 : 1;
      if (G.slowmo > 0) G.slowmo = Math.max(0, G.slowmo - dt);
      acc = Math.min(acc + dt * scale, STEP * 5);
      while (acc >= STEP) { update(STEP); acc -= STEP; }
    }
  }
  renderer.render(scene, camera);
}

setState('menu');
frame();
