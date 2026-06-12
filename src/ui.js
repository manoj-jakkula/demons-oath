// ============================================================================
// UI — HUD bars, pooled damage numbers + enemy health bars (projected DOM),
// banners/toasts, boss bar, and all full-screen menus.
// ============================================================================
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(G) {
    this.G = G;
    this.el = {
      hud: $('hud'), hpfill: $('hpfill'), hpghost: $('hpghost'), stamfill: $('stamfill'),
      ragefill: $('ragefill'), ragebar: $('ragebar'), statsLine: $('stats-line'),
      potHp: $('pot-hp'), potRage: $('pot-rage'),
      wcChapter: $('wc-chapter'), wcWave: $('wc-wave'),
      bossbar: $('bossbar'), bossname: $('bossname'), bossfill: $('bossfill'), bossphase: $('bossphase'),
      prompt: $('prompt'), banner: $('banner'), bannerH1: $('banner-h1'), bannerH2: $('banner-h2'),
      toasts: $('toasts'), hurtvig: $('hurtvig'),
      menu: $('menu'), pause: $('pause'), skillsui: $('skillsui'), smith: $('smith'),
      death: $('death'), victory: $('victory'), touch: $('touch'),
    };

    // damage number pool
    this.nums = [];
    const numbers = $('numbers');
    for (let i = 0; i < G.cfg.vfx.damageNumberPool; i++) {
      const el = document.createElement('div');
      el.className = 'dmg';
      el.style.display = 'none';
      numbers.appendChild(el);
      this.nums.push({ el, life: 0, x: 0, y: 0, z: 0 });
    }

    // enemy bar pool
    this.ebars = [];
    const ebars = $('ebars');
    for (let i = 0; i < G.cfg.vfx.enemyBarPool; i++) {
      const el = document.createElement('div');
      el.className = 'ebar';
      el.innerHTML = '<div class="f"></div><div class="n"></div>';
      el.style.display = 'none';
      ebars.appendChild(el);
      this.ebars.push({ el, fill: el.firstChild, name: el.lastChild });
    }

    this._v = new THREE.Vector3();
    this.bannerT = 0;
    this.hurtA = 0;
    this.interactMsg = '';
    this.ghostHp = 1;
  }

  // ---- screens ---------------------------------------------------------------
  show(name) {
    for (const k of ['menu', 'pause', 'skillsui', 'smith', 'death', 'victory'])
      this.el[k].classList.toggle('hidden', k !== name);
    this.el.hud.style.display = name === null || name === 'skillsui' ? 'block' : 'none';
    if (name === 'menu') this.el.hud.style.display = 'none';
  }

  setInteractPrompt(msg) { this.interactMsg = msg; }

  banner(h1, h2) {
    this.el.bannerH1.textContent = h1;
    this.el.bannerH2.textContent = h2;
    this.el.banner.style.opacity = 1;
    this.bannerT = 2.6;
  }

  toast(msg, cls = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.textContent = msg;
    this.el.toasts.appendChild(el);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => el.remove(), 3500);
  }

  hurtPulse() { this.hurtA = 0.85; }

  dmgNumber(pos, text, cls = '') {
    let best = null;
    for (const n of this.nums) { if (n.life <= 0) { best = n; break; } }
    if (!best) best = this.nums[0];
    best.life = 0.9;
    best.x = pos.x + (Math.random() - 0.5) * 0.6;
    best.y = 1.7 + Math.random() * 0.4;
    best.z = pos.z + (Math.random() - 0.5) * 0.6;
    best.el.textContent = text;
    best.el.className = 'dmg ' + cls;
    best.el.style.display = 'block';
  }

  updateWave() {
    const G = this.G, ch = G.level.chapterCfg;
    this.el.wcChapter.textContent = `${ch.name} — ${ch.title}`;
    const ph = G.level.phase;
    let txt = '';
    if (ph === 'wave' || ph === 'wavegap' || ph === 'intro')
      txt = `Wave ${Math.min(G.level.waveIdx + 1, ch.waves.length)} / ${ch.waves.length}`;
    else if (ph === 'miniboss') txt = 'Champion';
    else if (ph === 'boss' || ph === 'prayer') txt = 'Boss';
    else if (ph === 'lootroom') txt = 'Sanctuary';
    this.el.wcWave.textContent = txt;
  }

  // ---- per-frame -----------------------------------------------------------------
  update(dt) {
    const G = this.G, p = G.player;

    // bars
    const hpK = Math.max(0, p.hp / p.maxhp);
    this.el.hpfill.style.transform = `scaleX(${hpK})`;
    this.ghostHp = Math.max(hpK, this.ghostHp - dt * 0.25);
    if (this.ghostHp - hpK < 0.005) this.ghostHp = hpK;
    this.el.hpghost.style.transform = `scaleX(${this.ghostHp})`;
    this.el.stamfill.style.transform = `scaleX(${Math.max(0, p.stamina / p.maxStamina)})`;
    const rageK = p.rage / G.cfg.player.rageMax;
    this.el.ragefill.style.transform = `scaleX(${rageK})`;
    this.el.ragebar.classList.toggle('full', rageK >= 1);

    this.el.statsLine.innerHTML =
      `Lv <b>${G.meta.level}</b> &nbsp; XP ${G.meta.xp}/${p.xpNeed()} &nbsp; <b>${G.meta.gold}</b> gold` +
      (G.meta.skillPoints > 0 ? ` &nbsp; <b>+${G.meta.skillPoints} skill pts (K)</b>` : '');
    this.el.potHp.textContent = G.meta.potions.hp;
    this.el.potRage.textContent = G.meta.potions.rage;

    // boss bar
    const b = G.boss;
    if (b && b.alive) {
      this.el.bossbar.style.display = 'block';
      this.el.bossname.textContent = b.name;
      this.el.bossfill.style.transform = `scaleX(${Math.max(0, b.hp / b.maxhp)})`;
      this.el.bossphase.textContent = b.type.phases.length > 1 ? `phase ${b.phaseIdx + 1} of ${b.type.phases.length}` : '';
    } else this.el.bossbar.style.display = 'none';

    // prompt: finisher beats interact
    let prompt = '';
    if (G.finisherTarget) prompt = 'E — EXECUTE';
    else if (this.interactMsg) prompt = this.interactMsg;
    this.el.prompt.textContent = prompt;
    this.el.prompt.style.display = prompt ? 'block' : 'none';
    const tuse = document.getElementById('tuse');
    if (tuse) tuse.classList.toggle('glow', !!prompt);
    this.interactMsg = '';

    // banner fade
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.style.opacity = 0;
    }

    // hurt vignette
    if (this.hurtA > 0) {
      this.hurtA = Math.max(0, this.hurtA - dt * 1.6);
    }
    const lowHp = hpK < 0.3 ? (0.3 - hpK) * 1.6 : 0;
    this.el.hurtvig.style.opacity = Math.min(1, this.hurtA + lowHp).toFixed(2);

    // damage numbers
    const W = window.innerWidth, H = window.innerHeight;
    for (const n of this.nums) {
      if (n.life <= 0) continue;
      n.life -= dt;
      if (n.life <= 0) { n.el.style.display = 'none'; continue; }
      n.y += dt * 1.6;
      this._v.set(n.x, n.y, n.z).project(G.camera);
      if (this._v.z > 1) { n.el.style.display = 'none'; n.life = 0; continue; }
      n.el.style.transform =
        `translate(${((this._v.x * 0.5 + 0.5) * W) | 0}px, ${((-this._v.y * 0.5 + 0.5) * H) | 0}px) translate(-50%,-50%)`;
      n.el.style.opacity = Math.min(1, n.life * 2.5).toFixed(2);
    }

    // enemy health bars
    let bi = 0;
    for (const e of G.enemies.active) {
      if (bi >= this.ebars.length) break;
      if (!e.alive || e.isBoss || e.untargetable) continue;
      if (e.hp >= e.maxhp && !e.elite && G.lockTarget !== e) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      if (dx * dx + dz * dz > 900) continue;
      this._v.set(e.pos.x, 2.3 * e.scaleBase, e.pos.z).project(G.camera);
      if (this._v.z > 1) continue;
      const bar = this.ebars[bi++];
      bar.el.style.display = 'block';
      bar.el.style.left = `${((this._v.x * 0.5 + 0.5) * W) | 0}px`;
      bar.el.style.top = `${((-this._v.y * 0.5 + 0.5) * H) | 0}px`;
      bar.fill.style.transform = `scaleX(${Math.max(0, e.hp / e.maxhp)})`;
      bar.name.textContent = (e.elite || G.lockTarget === e) ? e.name + (G.lockTarget === e ? ' ◆' : '') : '';
    }
    for (; bi < this.ebars.length; bi++) this.ebars[bi].el.style.display = 'none';
  }

  hideWorldUI() {
    for (const n of this.nums) { n.life = 0; n.el.style.display = 'none'; }
    for (const b of this.ebars) b.el.style.display = 'none';
    this.el.prompt.style.display = 'none';
  }

  // ---- skill tree -------------------------------------------------------------------
  renderSkills() {
    const G = this.G;
    $('sp-count').textContent = `${G.meta.skillPoints} skill point${G.meta.skillPoints === 1 ? '' : 's'} available`;
    for (const br of G.skills.branches) {
      const host = $('br-' + br);
      host.innerHTML = '';
      G.skills.defs(br).forEach((n, idx) => {
        const div = document.createElement('div');
        const st = G.skills.status(br, idx);
        div.className = 'node ' + st;
        div.innerHTML = `<span class="nm">${n.name}</span><span class="ds">${n.desc}</span>`;
        if (st === 'avail') div.onclick = () => {
          if (G.skills.learn(br, idx)) { G.audio.levelup(); this.renderSkills(); }
        };
        host.appendChild(div);
      });
    }
  }

  // ---- blacksmith ---------------------------------------------------------------------
  renderSmith() {
    const G = this.G, sh = G.cfg.shop;
    $('smith-gold').textContent = `${G.meta.gold} gold`;
    const upCost = Math.round(sh.upgradeBase * Math.pow(sh.upgradeGrowth, G.meta.weaponUp));
    $('up-desc').textContent = `+${sh.upgradeAtk} ATK (now +${G.meta.weaponUp * sh.upgradeAtk})`;
    $('btn-upgrade').innerHTML = `<span class="cost">${upCost}g</span>`;
    $('btn-buyhp').innerHTML = `<span class="cost">${sh.hpPotion}g</span>`;
    $('btn-buyrage').innerHTML = `<span class="cost">${sh.ragePotion}g</span>`;
    const cap = G.cfg.difficulty[G.difficulty].potions;
    $('btn-buyhp').disabled = G.meta.gold < sh.hpPotion || G.meta.potions.hp >= cap;
    $('btn-buyrage').disabled = G.meta.gold < sh.ragePotion || G.meta.potions.rage >= 2;
    $('btn-upgrade').disabled = G.meta.gold < upCost;
  }

  renderGearReadout() {
    const G = this.G;
    const host = $('gear-readout');
    let html = '';
    for (const slot of G.cfg.loot.slots) {
      const it = G.meta.gear[slot];
      if (it) {
        const st = Object.entries(it.stats).map(([k, v]) => `+${v} ${k}`).join(', ');
        html += `<div class="r${it.rarity}">${slot}: ${it.name} (${st})</div>`;
      } else html += `<div class="r0">${slot}: —</div>`;
    }
    html += `<div class="r0">weapon forge: +${G.meta.weaponUp * G.cfg.shop.upgradeAtk} ATK</div>`;
    host.innerHTML = html;
  }

  renderVictory() {
    const G = this.G, s = G.stats;
    const mins = Math.floor((Date.now() - s.startTime) / 60000);
    const secs = Math.floor(((Date.now() - s.startTime) % 60000) / 1000);
    $('victory-stats').innerHTML =
      `<span>Time</span><span>${mins}m ${String(secs).padStart(2, '0')}s</span>` +
      `<span>Damage dealt</span><span>${s.damageDealt | 0}</span>` +
      `<span>Damage taken</span><span>${s.damageTaken | 0}</span>` +
      `<span>Kills</span><span>${s.kills}</span>` +
      `<span>Parries</span><span>${s.parries}</span>` +
      `<span>Executions</span><span>${s.finishers}</span>` +
      `<span>Deaths</span><span>${s.deaths}</span>` +
      `<span>Gold earned</span><span>${s.gold}</span>` +
      `<span>Difficulty</span><span>${G.cfg.difficulty[G.difficulty].label}</span>`;
  }

  applySettings() {
    const G = this.G;
    $('set-vol').value = G.settings.volume;
    $('set-sens').value = G.settings.sensitivity;
    $('set-shake').checked = G.settings.shake;
  }
}
