// Difficulty-tiered sampling — ported verbatim from Ver 8 (iq-test Ver 8.html ~L2198-2276)
// to guarantee candidates hit the same tiered structure as the local author tested.
//
// 28 items per session: pattern(matrix 1 + arrows 1 + series 1 + domino 5) + verbal 5
// + logical 4 + numerical 5 + sjt 3 + spatial 3.
//
// This code runs server-side ONLY. Do not expose to the client.

const SESSION_QUOTAS = {
  pattern: {
    matrix: { random: 1 },
    arrows: { random: 1 },
    series: { random: 1 },
    domino: { byDifficulty: { 5: 2, 6: 2, 7: 1 } }
  },
  verbal:    { byDifficulty: { 3: 1, 4: 1, 5: 2, 6: 1 } },
  logical:   { byDifficulty: { 3: 1, 4: 1, 5: 1, 6: 1 } },
  numerical: { byDifficulty: { 3: 1, 4: 2, 5: 1, 6: 1 } },
  sjt:       { byDifficulty: { 3: 2, 4: 1 } },
  spatial:   { random: 3 }
};

function shuffleWith(arr, rnd) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// --- Ver 8 parity: sampleSessionItems ---
// Works on an array of BANK items (not indices). Returns an array of item objects
// in display order. Accepts a seeded RNG so the same session_id yields the same
// items on resume.
function sampleSessionItems(BANK, rnd) {
  const byCat = { pattern: [], verbal: [], logical: [], spatial: [], numerical: [], sjt: [] };
  const patternBySub = { matrix: [], arrows: [], series: [], domino: [] };
  BANK.forEach(item => {
    if (!byCat[item.category]) return;
    byCat[item.category].push(item);
    if (item.category === 'pattern') {
      const s = item.subtype || 'domino';
      if (!patternBySub[s]) patternBySub[s] = [];
      patternBySub[s].push(item);
    }
  });

  const pickN = (pool, n) => shuffleWith(pool, rnd).slice(0, n);

  function sampleByDifficulty(pool, hist) {
    const used = new Set();
    const picked = [];
    Object.entries(hist).forEach(([diffStr, want]) => {
      const diff = Number(diffStr);
      const tier = pool.filter(it => it.difficulty === diff && !used.has(it.id));
      const got = pickN(tier, want);
      got.forEach(it => { picked.push(it); used.add(it.id); });
      if (got.length < want) {
        const fallback = pool.filter(it => !used.has(it.id));
        const extra = pickN(fallback, want - got.length);
        extra.forEach(it => { picked.push(it); used.add(it.id); });
      }
    });
    return picked;
  }

  function applyQuota(pool, spec) {
    if (spec.byDifficulty) return sampleByDifficulty(pool, spec.byDifficulty);
    if (typeof spec.random === 'number') return pickN(pool, spec.random);
    return [];
  }

  const picks = [];

  // Pattern: per-subtype sampling with subtype-wide backfill.
  const usedPatternIds = new Set();
  ['matrix', 'arrows', 'series', 'domino'].forEach(sub => {
    const subPool = patternBySub[sub] || [];
    const got = applyQuota(subPool, SESSION_QUOTAS.pattern[sub]);
    got.forEach(it => { picks.push(it); usedPatternIds.add(it.id); });
    const spec = SESSION_QUOTAS.pattern[sub];
    const wantTotal = spec.byDifficulty
      ? Object.values(spec.byDifficulty).reduce((a, b) => a + b, 0)
      : (spec.random || 0);
    if (got.length < wantTotal) {
      const fallback = byCat.pattern.filter(it => !usedPatternIds.has(it.id));
      const extra = pickN(fallback, wantTotal - got.length);
      extra.forEach(it => { picks.push(it); usedPatternIds.add(it.id); });
    }
  });

  ['verbal', 'logical', 'spatial', 'numerical', 'sjt'].forEach(cat => {
    picks.push(...applyQuota(byCat[cat], SESSION_QUOTAS[cat]));
  });

  return shuffleWith(picks, rnd);
}

// Shuffle choices within each item; return a parallel choice_order map
// (itemId → [origIdx in display order]) so the server can un-shuffle answers on submit.
function shuffleChoices(items, rnd) {
  const choiceOrder = {};
  const shuffled = items.map(item => {
    const indices = item.choices.map((_, i) => i);
    const order = shuffleWith(indices, rnd);
    choiceOrder[item.id] = order;
    return {
      ...item,
      choices: order.map(origIdx => item.choices[origIdx])
    };
  });
  return { shuffled, choiceOrder };
}

// Deterministic PRNG seeded from session_id so resume-after-refresh is stable.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

module.exports = {
  SESSION_QUOTAS,
  sampleSessionItems,
  shuffleChoices,
  mulberry32,
  seedFromString
};
