// ============================================================================
// Save system — autosave to localStorage at checkpoints + downloadable /
// loadable JSON save file. An in-memory checkpoint handles death respawns.
// ============================================================================

const KEY = 'demons-oath-save-v1';

export class SaveSys {
  constructor(G) { this.G = G; }

  collect() {
    const G = this.G;
    return {
      v: 1,
      difficulty: G.difficulty,
      chapter: G.level.chapterIndex,
      meta: JSON.parse(JSON.stringify(G.meta)),
      learned: [...G.skills.learned],
      stats: { ...G.stats },
      settings: { ...G.settings },
      savedAt: Date.now(),
    };
  }

  apply(data) {
    const G = this.G;
    G.difficulty = data.difficulty || 'normal';
    Object.assign(G.meta, data.meta);
    G.skills.learned = new Set(data.learned || []);
    Object.assign(G.stats, data.stats || {});
    if (data.settings) { Object.assign(G.settings, data.settings); G.ui.applySettings(); }
    return data.chapter | 0;
  }

  autoSave() {
    try { localStorage.setItem(KEY, JSON.stringify(this.collect())); } catch (e) { /* file:// or private mode */ }
  }

  loadLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  clearLocal() { try { localStorage.removeItem(KEY); } catch (e) {} }

  download() {
    const blob = new Blob([JSON.stringify(this.collect(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `demons-oath-save-ch${this.G.level.chapterIndex + 1}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  importFile(file, onDone) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (typeof data.chapter !== 'number' || !data.meta) throw new Error('bad save');
        onDone(data);
      } catch (e) { onDone(null); }
    };
    r.readAsText(file);
  }
}
