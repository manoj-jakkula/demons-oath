// ============================================================================
// DEMON'S OATH — master tuning file. Every gameplay number lives here.
// ============================================================================

export const CONFIG = {
  step: 1 / 60,               // fixed timestep (s)

  player: {
    moveSpeed: 6.2,
    runLerp: 12,              // acceleration smoothing
    turnLerp: 14,
    radius: 0.45,
    maxHP: 100,
    maxStamina: 100,
    staminaRegen: 26,         // per second
    staminaDelay: 0.7,        // seconds after spending before regen
    rageMax: 100,
    rageOnHitDealt: 6,
    rageOnHitTaken: 9,
    rageDamage: 55,
    rageRadius: 6.5,
    baseAttack: 12,
    baseCrit: 0.06,
    critMult: 1.8,

    light: [   // 3-hit chain
      { dmg: 1.0, windup: 0.14, active: 0.10, recover: 0.26, range: 2.3, arc: 1.5, kb: 2.0 },
      { dmg: 1.1, windup: 0.13, active: 0.10, recover: 0.28, range: 2.3, arc: 1.6, kb: 2.4 },
      { dmg: 1.6, windup: 0.18, active: 0.12, recover: 0.40, range: 2.5, arc: 1.9, kb: 5.0 },
    ],
    comboWindow: 0.5,         // seconds after hit to chain
    heavy: { dmg: 2.4, windup: 0.42, active: 0.14, recover: 0.55, range: 2.7, arc: 1.7, kb: 7.0, stam: 30 },

    dodge: { dur: 0.46, iframes: 0.30, speed: 11.5, stam: 25 },
    blockReduction: 0.85,     // damage % absorbed by block
    blockStamPerHit: 16,
    parryWindow: 0.15,        // ±150ms — block must be this fresh
    riposteWindow: 1.4,       // counter window after a parry
    riposteMult: 2.6,

    finisherRange: 2.6,
    finisherHpPct: 0.15,      // execute below this fraction
    finisherHeal: 0.08,       // fraction of maxHP restored
    finisherDur: 1.25,

    hitstopLight: 0.06, hitstopHeavy: 0.085, hitstopParry: 0.11,

    potionHeal: 0.45,
    maxPotionsBase: 3,
  },

  xp: { base: 90, growth: 1.32, perLevelHP: 9, perLevelATK: 2 },

  difficulty: {
    normal: { dmg: 1.0, hp: 1.0, potions: 3, label: 'Normal' },
    knight: { dmg: 1.3, hp: 1.3, potions: 3, label: 'Knight' },
    demon:  { dmg: 1.6, hp: 1.6, potions: 2, label: 'Demon'  },
  },

  ai: {
    maxAttackers: 2,          // simultaneous attack tokens
    alertRange: 14,
    circleRadius: 4.6,
    separation: 1.6,
  },

  enemies: {
    ghoul: {
      name: 'Ghoul', hp: 26, dmg: 7, speed: 5.4, radius: 0.42, scale: 0.82,
      xp: 14, gold: [4, 9], poise: 0, color: 0x5a7050, eye: 0xb6ff7a,
      attacks: [{ windup: 0.45, active: 0.12, recover: 0.55, range: 1.9, dmg: 1.0, unblockable: false, kb: 1 }],
      attackCd: [0.7, 1.4], lootChance: 0.10,
    },
    knight: {
      name: 'Shield Knight', hp: 60, dmg: 13, speed: 3.1, radius: 0.52, scale: 1.05,
      xp: 34, gold: [10, 20], poise: 1, color: 0x5f6b7d, eye: 0xffd27a, shielded: true,
      attacks: [
        { windup: 0.65, active: 0.14, recover: 0.7, range: 2.2, dmg: 1.0, unblockable: false, kb: 3 },
        { windup: 0.9, active: 0.16, recover: 0.8, range: 2.4, dmg: 1.5, unblockable: false, kb: 5, name: 'bash' },
      ],
      attackCd: [1.2, 2.2], lootChance: 0.20,
    },
    cultist: {
      name: 'Cultist Caster', hp: 34, dmg: 11, speed: 3.4, radius: 0.42, scale: 0.95,
      xp: 28, gold: [8, 16], poise: 0, color: 0x4a3460, eye: 0xd58cff, ranged: true,
      teleportRange: 5.0, teleportCd: 4.5, castRange: 16,
      attacks: [{ windup: 0.85, active: 0.1, recover: 0.9, range: 18, dmg: 1.0, unblockable: false, projectile: true, projSpeed: 11 }],
      attackCd: [1.6, 2.6], lootChance: 0.18,
    },
    brute: {
      name: 'Brute', hp: 110, dmg: 20, speed: 2.7, radius: 0.7, scale: 1.45,
      xp: 55, gold: [16, 30], poise: 3, color: 0x6e4434, eye: 0xff5030,
      attacks: [
        { windup: 0.95, active: 0.18, recover: 0.9, range: 2.9, dmg: 1.0, unblockable: true, kb: 9 },
        { windup: 1.25, active: 0.22, recover: 1.1, range: 3.4, dmg: 1.4, unblockable: true, kb: 12, aoe: true },
      ],
      attackCd: [1.4, 2.4], lootChance: 0.3,
    },
    wraith: {
      name: 'Wraith', hp: 44, dmg: 14, speed: 4.6, radius: 0.45, scale: 1.0,
      xp: 40, gold: [12, 22], poise: 0, color: 0x9fb8c8, eye: 0x9fefff, phasing: true,
      phaseCd: 6, phaseDur: 1.6,
      attacks: [{ windup: 0.5, active: 0.12, recover: 0.6, range: 2.1, dmg: 1.0, unblockable: false, kb: 2 }],
      attackCd: [0.9, 1.7], lootChance: 0.22,
    },
  },

  miniboss: { hpMult: 3.2, dmgMult: 1.35, scaleMult: 1.3, xpMult: 3, goldMult: 3, poiseBonus: 2 },

  bosses: {
    abbot: {
      name: 'Plague Abbot', hp: 420, speed: 3.0, radius: 0.62, scale: 1.35,
      color: 0x556043, eye: 0xc9ff4a, xp: 220, gold: 120, dmg: 14,
      phases: [
        { at: 1.0, patterns: ['volley', 'slam', 'cloud'] },
        { at: 0.5, patterns: ['volley3', 'slam', 'cloud', 'summon'] },
      ],
    },
    wraithQueen: {
      name: 'Wraith Queen', hp: 620, speed: 4.2, radius: 0.6, scale: 1.4,
      color: 0xb9cede, eye: 0xa0f4ff, xp: 380, gold: 220, dmg: 17,
      phases: [
        { at: 1.0, patterns: ['slash', 'flurry', 'blink'] },
        { at: 0.55, patterns: ['slash', 'flurry', 'blink', 'summonWraiths', 'shriek'] },
      ],
    },
    demonLord: {
      name: 'Demon Lord', hp: 900, speed: 3.4, radius: 0.85, scale: 1.8,
      color: 0x701f1f, eye: 0xff7a20, xp: 800, gold: 500, dmg: 22,
      phases: [
        { at: 1.0, patterns: ['cleave', 'stomp'] },
        { at: 0.66, patterns: ['cleave', 'stomp', 'fireWave', 'charge'] },
        { at: 0.33, patterns: ['cleave', 'stomp', 'fireWave', 'charge', 'meteor'] },
      ],
    },
  },

  // selectable world looks; props: which prop set to build. 'auto' follows the story.
  themes: {
    forest:   { props: 'forest',  fog: 0x23402c, ground: 0x2c4530, sky: 0x27482f, fogDensity: 0.024 },
    village:  { props: 'village', fog: 0x2a3450, ground: 0x33403a, sky: 0x2c3a55, fogDensity: 0.026 },
    citadel:  { props: 'citadel', fog: 0x33191b, ground: 0x33201f, sky: 0x2e1512, fogDensity: 0.028 },
    daylight: { props: 'forest',  fog: 0x8aa3b8, ground: 0x49663c, sky: 0x9db8d8, fogDensity: 0.012 },
  },

  chapters: [
    {
      name: 'Chapter I', title: 'Cursed Village', fog: 0x252e48, ground: 0x303c36, sky: 0x2a3850,
      waves: [
        [{ t: 'ghoul', n: 2 }],
        [{ t: 'ghoul', n: 3 }, { t: 'knight', n: 1 }],
        [{ t: 'ghoul', n: 3 }, { t: 'knight', n: 1 }, { t: 'cultist', n: 1 }],
      ],
      miniboss: 'knight', boss: 'abbot',
    },
    {
      name: 'Chapter II', title: 'Blackroot Forest', fog: 0x1f3a28, ground: 0x28402c, sky: 0x24422c,
      waves: [
        [{ t: 'ghoul', n: 3 }, { t: 'cultist', n: 1 }],
        [{ t: 'wraith', n: 2 }, { t: 'ghoul', n: 2 }],
        [{ t: 'knight', n: 2 }, { t: 'cultist', n: 2 }, { t: 'wraith', n: 1 }],
      ],
      miniboss: 'brute', boss: 'wraithQueen',
    },
    {
      name: 'Chapter III', title: 'Demon Citadel', fog: 0x301719, ground: 0x32201f, sky: 0x2c1411,
      waves: [
        [{ t: 'knight', n: 2 }, { t: 'brute', n: 1 }],
        [{ t: 'wraith', n: 2 }, { t: 'cultist', n: 2 }, { t: 'ghoul', n: 2 }],
        [{ t: 'brute', n: 2 }, { t: 'knight', n: 1 }, { t: 'wraith', n: 2 }],
      ],
      miniboss: 'wraith', boss: 'demonLord',
    },
  ],

  arena: { radius: 26 },

  loot: {
    rarities: [
      { id: 0, name: 'Common',    color: 0xcfc5ae, css: '#cfc5ae', mult: 1.0, weight: 55 },
      { id: 1, name: 'Rare',      color: 0x3d7dd8, css: '#3d7dd8', mult: 1.5, weight: 28 },
      { id: 2, name: 'Epic',      color: 0x9b4dd8, css: '#b06ee8', mult: 2.2, weight: 13 },
      { id: 3, name: 'Legendary', color: 0xe8862a, css: '#e8862a', mult: 3.2, weight: 4  },
    ],
    slots: ['weapon', 'helmet', 'chest', 'gauntlets'],
    chestRarityBonus: 28,   // chests shift weight toward higher tiers
    bossRarityBonus: 45,
  },

  shop: {
    upgradeBase: 110, upgradeGrowth: 1.65, upgradeAtk: 6,
    hpPotion: 60, ragePotion: 80,
  },

  skills: {
    warrior: [
      { id: 'w1', name: 'Keen Edge',     desc: '+12% attack damage',            k: 'dmg', v: 0.12 },
      { id: 'w2', name: 'Swift Steel',   desc: '+12% attack speed',             k: 'aspd', v: 0.12 },
      { id: 'w3', name: 'Crushing Blow', desc: '+30% heavy damage',             k: 'heavy', v: 0.30 },
      { id: 'w4', name: 'Relentless',    desc: 'Combo window +0.25s',           k: 'combo', v: 0.25 },
      { id: 'w5', name: 'Warlord',       desc: '+20% attack damage',            k: 'dmg', v: 0.20 },
    ],
    guardian: [
      { id: 'g1', name: 'Iron Skin',     desc: '-12% damage taken',             k: 'def', v: 0.12 },
      { id: 'g2', name: 'Endurance',     desc: '+30 max stamina',               k: 'stam', v: 30 },
      { id: 'g3', name: 'Deflection',    desc: 'Parry window +60ms',            k: 'parry', v: 0.06 },
      { id: 'g4', name: 'Bulwark',       desc: 'Blocking costs 40% less stamina', k: 'blockcost', v: 0.40 },
      { id: 'g5', name: 'Retribution',   desc: 'Riposte damage +60%',           k: 'riposte', v: 0.60 },
    ],
    slayer: [
      { id: 's1', name: 'Bloodlust',     desc: '+30% rage generation',          k: 'ragegen', v: 0.30 },
      { id: 's2', name: 'Cruelty',       desc: '+8% crit chance',               k: 'crit', v: 0.08 },
      { id: 's3', name: 'Butcher',       desc: '+60% crit damage',              k: 'critdmg', v: 0.60 },
      { id: 's4', name: 'Reaper',        desc: 'Executions heal +8% more',      k: 'finheal', v: 0.08 },
      { id: 's5', name: 'Cataclysm',     desc: 'Rage blast +60% damage & radius', k: 'rageblast', v: 0.60 },
    ],
  },

  vfx: { maxParticles: 700, damageNumberPool: 28, enemyBarPool: 14 },
  camera: { dist: 7.2, height: 1.9, lockDist: 6.0, minPitch: -0.12, maxPitch: 1.15, fov: 62 },
};
