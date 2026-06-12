// ============================================================================
// Loot — rarity rolls, randomized gear stats, world drops with rarity glow.
// Drops auto-equip when better than the current piece; otherwise smelt to gold.
// ============================================================================
import * as THREE from 'three';

const NAMES = {
  weapon:    ['Worn Blade', 'Soldier Sword', 'Knight Saber', 'Demonfang'],
  helmet:    ['Rusted Helm', 'Iron Helm', 'Warden Visor', 'Crown of Wrath'],
  chest:     ['Tattered Mail', 'Iron Cuirass', 'Bastion Plate', 'Hellforged Aegis'],
  gauntlets: ['Frayed Wraps', 'Iron Fists', 'Duelist Grips', 'Talons of Ruin'],
};

export class LootSys {
  constructor(G) {
    this.G = G;
    this.drops = [];
    // pooled drop visuals: gem + light beam
    const gemGeo = new THREE.OctahedronGeometry(0.24);
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.16, 3.2, 6, 1, true);
    for (let i = 0; i < 10; i++) {
      const grp = new THREE.Group();
      const gem = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3,
      }));
      gem.position.y = 0.6;
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      beam.position.y = 1.6;
      grp.add(gem, beam);
      grp.visible = false;
      G.scene.add(grp);
      this.drops.push({ grp, gem, beam, item: null, gold: 0, active: false, t: 0 });
    }
  }

  rollRarity(bonus = 0) {
    const tiers = this.G.cfg.loot.rarities;
    // shift weight from common toward higher tiers by `bonus`
    const w = tiers.map((t, i) => Math.max(1, t.weight + (i === 0 ? -bonus : bonus * (i / 4))));
    let total = 0; for (const x of w) total += x;
    let r = Math.random() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return 0;
  }

  rollItem(rarityBonus = 0, forceSlot = null) {
    const G = this.G;
    const slot = forceSlot || G.cfg.loot.slots[(Math.random() * 4) | 0];
    const rarity = this.rollRarity(rarityBonus);
    const tier = G.cfg.loot.rarities[rarity];
    const lvl = G.meta.level;
    const roll = (base) => Math.round(base * tier.mult * (0.85 + Math.random() * 0.3) * (1 + lvl * 0.07));
    const stats = {};
    if (slot === 'weapon')    { stats.atk = roll(7); if (rarity >= 2) stats.crit = 2 + ((Math.random() * 4) | 0); }
    if (slot === 'helmet')    { stats.def = roll(3); stats.hp = roll(6); }
    if (slot === 'chest')     { stats.def = roll(5); stats.hp = roll(9); }
    if (slot === 'gauntlets') { stats.atk = roll(3); stats.stam = roll(8); }
    const score = (stats.atk | 0) * 3 + (stats.def | 0) * 3 + (stats.hp | 0) + (stats.stam | 0) + (stats.crit | 0) * 4;
    return { slot, rarity, name: NAMES[slot][rarity], stats, score };
  }

  // ---- world drops ----------------------------------------------------------
  drop(pos, { item = null, gold = 0 } = {}) {
    for (const d of this.drops) {
      if (d.active) continue;
      d.active = true; d.item = item; d.gold = gold; d.t = 0;
      const color = item ? this.G.cfg.loot.rarities[item.rarity].color : 0xffd040;
      d.gem.material.color.set(color);
      d.gem.material.emissive.set(color);
      d.beam.material.color.set(color);
      d.gem.scale.setScalar(item ? 1 : 0.55);
      d.beam.visible = !!item && item.rarity >= 1;
      d.grp.position.set(pos.x, 0, pos.z);
      d.grp.visible = true;
      if (item) this.G.audio.pickup(0); // soft chime on drop appearing
      return;
    }
  }

  dropFromEnemy(pos, type, isElite) {
    const G = this.G;
    const goldRange = type.gold;
    const mult = isElite ? G.cfg.miniboss.goldMult : 1;
    const gold = Math.round((goldRange[0] + Math.random() * (goldRange[1] - goldRange[0])) * mult);
    this.drop(pos, { gold });
    const chance = type.lootChance * (isElite ? 2.5 : 1);
    if (Math.random() < chance) {
      const off = { x: pos.x + 0.8, z: pos.z + 0.4 };
      this.drop(off, { item: this.rollItem(isElite ? 20 : 0) });
    }
  }

  equipOrSmelt(item) {
    const G = this.G;
    const cur = G.meta.gear[item.slot];
    const tier = G.cfg.loot.rarities[item.rarity];
    if (!cur || item.score > cur.score) {
      G.meta.gear[item.slot] = item;
      const statTxt = Object.entries(item.stats).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(' ');
      G.ui.toast(`${tier.name} ${item.name} — ${statTxt}`, `r${item.rarity}`);
      G.audio.pickup(item.rarity);
      G.player.recalcStats();
      G.player.applyGearVisuals();
    } else {
      const gold = 10 + item.score;
      G.meta.gold += gold;
      G.ui.toast(`${item.name} smelted: +${gold} gold`, '');
      G.audio.gold();
    }
  }

  update(dt) {
    const G = this.G;
    const pp = G.player.pos;
    for (const d of this.drops) {
      if (!d.active) continue;
      d.t += dt;
      d.gem.rotation.y += dt * 2.4;
      d.gem.position.y = 0.6 + Math.sin(d.t * 3) * 0.12;
      const dx = pp.x - d.grp.position.x, dz = pp.z - d.grp.position.z;
      if (dx * dx + dz * dz < 1.45) {
        d.active = false; d.grp.visible = false;
        if (d.gold) {
          G.meta.gold += d.gold;
          G.stats.gold += d.gold;
          G.ui.toast(`+${d.gold} gold`, '');
          G.audio.gold();
        }
        if (d.item) this.equipOrSmelt(d.item);
        G.vfx.soulBurst(d.grp.position, d.item ? G.cfg.loot.rarities[d.item.rarity].color : 0xffd040);
      }
    }
  }

  clearAll() {
    for (const d of this.drops) { d.active = false; d.grp.visible = false; }
  }
}
