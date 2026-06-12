// ============================================================================
// Skill tree — 3 branches x 5 nodes. Nodes unlock sequentially per branch.
// Effects are queried via mult()/val() so combat code stays declarative.
// ============================================================================

export class Skills {
  constructor(G) {
    this.G = G;
    this.learned = new Set();
    this.branches = ['warrior', 'guardian', 'slayer'];
  }

  defs(branch) { return this.G.cfg.skills[branch]; }

  // additive multiplier: 1 + sum of values for learned nodes with effect key k
  mult(k) {
    let m = 1;
    for (const b of this.branches)
      for (const n of this.defs(b))
        if (n.k === k && this.learned.has(n.id)) m += n.v;
    return m;
  }

  // flat sum for learned nodes with effect key k
  val(k) {
    let s = 0;
    for (const b of this.branches)
      for (const n of this.defs(b))
        if (n.k === k && this.learned.has(n.id)) s += n.v;
    return s;
  }

  status(branch, idx) {
    const n = this.defs(branch)[idx];
    if (this.learned.has(n.id)) return 'learned';
    const prevOk = idx === 0 || this.learned.has(this.defs(branch)[idx - 1].id);
    return prevOk && this.G.meta.skillPoints > 0 ? 'avail' : 'locked';
  }

  learn(branch, idx) {
    if (this.status(branch, idx) !== 'avail') return false;
    const n = this.defs(branch)[idx];
    this.learned.add(n.id);
    this.G.meta.skillPoints--;
    this.G.player.recalcStats();
    return true;
  }
}
