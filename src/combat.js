// ============================================================================
// Combat — single place where damage is resolved, for both directions.
// Handles crits, knight shields, block / parry / iframe rules, hit-stop,
// shake, rage gain, and damage numbers.
// ============================================================================

const _v = { x: 0, z: 0 };
function dirTo(a, b) { // normalized planar direction a -> b
  _v.x = b.x - a.x; _v.z = b.z - a.z;
  const l = Math.hypot(_v.x, _v.z) || 1;
  _v.x /= l; _v.z /= l;
  return _v;
}

// ---- player strikes an area ------------------------------------------------
// spec: {range, arc, dmg(multiplier), kb}, kind: 'light'|'heavy'|'riposte'|'rage'
export function playerStrike(G, spec, kind = 'light') {
  const p = G.player;
  const cp = G.cfg.player;
  let hitAny = false;
  for (const e of G.enemies.active) {
    if (!e.alive || e.untargetable) continue;
    const d = dirTo(p.pos, e.pos);
    const dist = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    if (dist > spec.range + e.radius) continue;
    if (spec.arc < 6) { // arc in radians (full circle for rage)
      const facingDot = Math.cos(p.facing) * d.z + Math.sin(p.facing) * d.x; // facing vector is (sin,cos)
      if (facingDot < Math.cos(spec.arc / 2)) continue;
    }

    // shield knight frontal block (parry or flank to bypass)
    if (e.shielded && !e.staggerT && kind !== 'rage' && kind !== 'riposte') {
      const eFace = { x: Math.sin(e.facing), z: Math.cos(e.facing) };
      const toP = dirTo(e.pos, p.pos);
      if (eFace.x * toP.x + eFace.z * toP.z > 0.17) { // attack from the front
        if (kind === 'heavy') {
          e.stagger(1.1); // heavy breaks the guard
          G.vfx.sparks(e.mesh.position);
          G.audio.stagger();
          G.ui.dmgNumber(e.pos, 'GUARD BREAK', 'crit');
        } else {
          G.vfx.sparks(e.mesh.position);
          G.audio.block();
          G.ui.dmgNumber(e.pos, 'BLOCKED', 'blocked');
          e.onBlockedHit();
        }
        hitAny = true;
        continue;
      }
    }

    // damage roll
    let dmg = p.attack * spec.dmg;
    if (kind === 'heavy') dmg *= G.skills.mult('heavy');
    if (kind === 'riposte') dmg *= cp.riposteMult * G.skills.mult('riposte') / 1; // riposte skill is additive mult
    let crit = Math.random() < p.critChance;
    if (kind === 'riposte') crit = true;
    if (crit) dmg *= cp.critMult * G.skills.mult('critdmg');
    dmg = Math.round(dmg * (0.92 + Math.random() * 0.16));

    hitEnemy(G, e, dmg, { crit, kbx: d.x * spec.kb, kbz: d.z * spec.kb, heavy: kind !== 'light' });
    hitAny = true;
  }
  return hitAny;
}

export function hitEnemy(G, e, dmg, { crit = false, kbx = 0, kbz = 0, heavy = false } = {}) {
  const cp = G.cfg.player;
  e.hp -= dmg;
  G.stats.damageDealt += dmg;
  G.player.gainRage(cp.rageOnHitDealt * (crit ? 1.6 : 1));

  G.ui.dmgNumber(e.pos, String(dmg), crit ? 'crit' : '');
  G.vfx.blood(e.mesh.position, crit || heavy);
  if (crit) G.audio.crit(); else G.audio.impact(heavy);

  G.freeze = Math.max(G.freeze, heavy || crit ? cp.hitstopHeavy : cp.hitstopLight);
  G.shake += crit ? 0.3 : heavy ? 0.22 : 0.1;

  e.onHit(dmg, kbx, kbz, heavy);
  if (e.hp <= 0) e.die();
}

// ---- something hits the player ----------------------------------------------
// source: entity with .pos (or null for zones); returns true if damage landed
export function hitPlayer(G, source, rawDmg, { unblockable = false, kb = 0, isZone = false } = {}) {
  const p = G.player;
  const cp = G.cfg.player;
  if (!p.alive || p.iframes > 0 || p.state === 'finisher') return false;

  let dmg = rawDmg * G.cfg.difficulty[G.difficulty].dmg;

  const facingSource = source ? p.facingDot(source.pos) > 0.2 : false;
  if (p.blocking && !unblockable && facingSource && !isZone) {
    const parryWin = cp.parryWindow + G.skills.val('parry');
    if (p.blockTime <= parryWin) {
      // ---- PARRY ----
      G.stats.parries++;
      G.vfx.parryFlash(p.mesh.position);
      G.audio.parry();
      if (G.haptic) G.haptic(25);
      G.freeze = Math.max(G.freeze, cp.hitstopParry);
      G.shake += 0.25;
      p.gainRage(14);
      p.riposteT = cp.riposteWindow;
      G.ui.dmgNumber(p.pos, 'PARRY!', 'crit');
      if (source && source.onParried) source.onParried();
      return false;
    }
    // ---- normal block ----
    const cost = cp.blockStamPerHit * (1 - G.skills.val('blockcost'));
    p.stamina -= cost;
    p.staminaCd = cp.staminaDelay;
    G.vfx.sparks(p.mesh.position);
    G.audio.block();
    G.shake += 0.08;
    if (p.stamina <= 0) {
      p.stamina = 0;
      p.guardBreak();           // exhausted: stagger + take partial damage
      dmg *= 0.5;
    } else {
      dmg *= (1 - cp.blockReduction);
      dmg = Math.max(1, Math.round(dmg));
      p.hp -= dmg;
      G.ui.dmgNumber(p.pos, String(dmg), 'blocked');
      if (p.hp <= 0) p.die();
      return true;
    }
  }

  // ---- clean hit ----
  const defPct = p.defense / (p.defense + 70);
  dmg *= (1 - defPct) * (2 - G.skills.mult('def')); // def skill: -12% taken per node
  dmg = Math.max(1, Math.round(dmg));
  p.hp -= dmg;
  p.gainRage(cp.rageOnHitTaken);
  G.stats.damageTaken += dmg;
  G.ui.dmgNumber(p.pos, String(dmg), 'player');
  G.ui.hurtPulse();
  G.vfx.blood(p.mesh.position);
  G.audio.hurt();
  if (G.haptic) G.haptic(40);
  G.shake += 0.3;
  if (kb && source) {
    const d = dirTo(source.pos, p.pos);
    p.kbx += d.x * kb; p.kbz += d.z * kb;
  }
  if (!isZone) p.hitReact();
  if (p.hp <= 0) p.die();
  return true;
}

// enemy melee swing connects?
export function enemyMeleeHit(G, e, atk) {
  const p = G.player;
  const dist = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
  if (dist > atk.range + p.radius) return false;
  if (!atk.aoe) {
    const d = dirTo(e.pos, p.pos);
    const f = e.facing;
    if (Math.sin(f) * d.x + Math.cos(f) * d.z < 0.35) return false; // player not in front arc
  }
  return hitPlayer(G, e, e.dmg * atk.dmg, { unblockable: !!atk.unblockable, kb: atk.kb || 0 });
}
