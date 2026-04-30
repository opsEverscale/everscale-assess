// Scoring — ported verbatim from Ver 8 (iq-test Ver 8.html L2456-2613)
// Server-side ONLY. Inputs: BANK (full items with .correct), session row's
// item_order + choice_order, candidate's submitted answers + confidence + times.

const CATEGORY_LABELS = {
  pattern: 'Pattern Recognition',
  verbal: 'Verbal Reasoning',
  logical: 'Logical Reasoning',
  spatial: 'Spatial Reasoning',
  numerical: 'Numerical Reasoning',
  sjt: 'Situational Judgment'
};

function erf(x) {
  // Abramowitz-Stegun approximation
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function pctToIQ(pct) {
  const pts = [
    [0.00, 60], [0.10, 70], [0.25, 85], [0.40, 95], [0.50, 100],
    [0.60, 105], [0.70, 110], [0.80, 118], [0.90, 130], [1.00, 140]
  ];
  if (pct <= pts[0][0]) return pts[0][1];
  if (pct >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (pct <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const t = (pct - x0) / (x1 - x0);
      return Math.round(y0 + t * (y1 - y0));
    }
  }
  return 100;
}

function iqToPercentile(iq) {
  const z = (iq - 100) / 15;
  const p = 0.5 * (1 + erf(z / Math.sqrt(2)));
  return Math.round(p * 100);
}

function iqBandLabel(iq) {
  if (iq >= 130) return 'Very Superior (130+)';
  if (iq >= 120) return 'Superior (120–129)';
  if (iq >= 110) return 'High Average (110–119)';
  if (iq >= 90)  return 'Average (90–109)';
  if (iq >= 80)  return 'Low Average (80–89)';
  if (iq >= 70)  return 'Borderline (70–79)';
  return 'Below 70';
}

// submission shape (from client):
// { answers:        [displayedIdx | null, ...]   length = 28, parallel to item_order
//   confidence:     [1-3 | null, ...]            length = 28
//   responseTimes:  [ms, ...]                    length = 28
//   tabSwitches:    integer
// }
function computeResults({ BANK, itemOrder, choiceOrder, submission, startedAt, submittedAt }) {
  const bankById = new Map(BANK.map(it => [it.id, it]));

  const perItem = itemOrder.map((itemId, idx) => {
    const item = bankById.get(itemId);
    if (!item) throw new Error(`Bank missing item ${itemId} during scoring`);
    const order = choiceOrder[itemId] || item.choices.map((_, i) => i);
    const displayedIdx = submission.answers[idx];
    const userChoiceOrigIdx = displayedIdx == null ? null : order[displayedIdx];
    const correct = userChoiceOrigIdx === item.correct;
    const skipped = displayedIdx == null;
    const correctDisplayedSlot = order.indexOf(item.correct);
    const getLabel = (origIdx) =>
      origIdx == null ? null : (item.choices[origIdx] && item.choices[origIdx].label);
    return {
      id: item.id,
      category: item.category,
      difficulty: item.difficulty,
      userChoice: userChoiceOrigIdx,
      correctChoice: item.correct,
      userDisplayedSlot: displayedIdx,
      correctDisplayedSlot,
      userChoiceLabel: getLabel(userChoiceOrigIdx),
      correctChoiceLabel: getLabel(item.correct),
      correct,
      skipped,
      confidence: submission.confidence[idx] || null,
      timeMs: submission.responseTimes[idx] || 0
    };
  });

  const totalItems = perItem.length;
  const correctCount = perItem.filter(p => p.correct).length;

  const maxWeighted = perItem.reduce((s, p) => s + p.difficulty, 0);
  const weighted = perItem.reduce((s, p) => s + (p.correct ? p.difficulty : 0), 0);
  const weightedPct = maxWeighted > 0 ? weighted / maxWeighted : 0;

  const iq = pctToIQ(weightedPct);
  const pctile = iqToPercentile(iq);
  const ci = 14;
  const bandLow = Math.round(iq - ci);
  const bandHigh = Math.round(iq + ci);
  const bandLabel = iqBandLabel(iq);

  // Language-fair g estimate
  const LANG_FAIR_CATS = ['pattern', 'spatial', 'numerical'];
  const lfItems = perItem.filter(p => LANG_FAIR_CATS.includes(p.category));
  const lfMax = lfItems.reduce((s, p) => s + p.difficulty, 0);
  const lfWeighted = lfItems.reduce((s, p) => s + (p.correct ? p.difficulty : 0), 0);
  const lfPct = lfMax > 0 ? lfWeighted / lfMax : 0;
  const lfIQ = pctToIQ(lfPct);
  const lfBandLabel = iqBandLabel(lfIQ);
  const lfGap = lfIQ - iq;
  let lfInterp;
  if (Math.abs(lfGap) <= 5) lfInterp = 'Scores converge';
  else if (lfGap > 5 && lfGap <= 12) lfInterp = 'Mild language effect';
  else if (lfGap > 12) lfInterp = 'Strong language bottleneck';
  else lfInterp = 'Stronger on language items';

  // Category breakdown
  const catMap = {};
  perItem.forEach(p => {
    const k = p.category;
    if (!catMap[k]) catMap[k] = { correct: 0, total: 0, confSum: 0, confN: 0, timeSum: 0 };
    catMap[k].total++;
    if (p.correct) catMap[k].correct++;
    if (p.confidence != null) {
      catMap[k].confSum += p.confidence;
      catMap[k].confN++;
    }
    catMap[k].timeSum += p.timeMs;
  });
  const categoryBreakdown = Object.keys(catMap).map(k => ({
    category: k,
    label: CATEGORY_LABELS[k] || k,
    correct: catMap[k].correct,
    total: catMap[k].total,
    accuracy: catMap[k].correct / catMap[k].total,
    avgConfidence: catMap[k].confN ? catMap[k].confSum / catMap[k].confN : null,
    avgTimeMs: catMap[k].timeSum / catMap[k].total
  }));

  // Calibration
  const answered = perItem.filter(p => p.confidence != null);
  let calibrationScore = null, avgConfCorrect = null, avgConfWrong = null;
  if (answered.length) {
    const sum = answered.reduce((acc, p) =>
      acc + Math.abs(((p.confidence - 1) / 2) - (p.correct ? 1 : 0)), 0);
    calibrationScore = 1 - (sum / answered.length);
    const corr = answered.filter(p => p.correct);
    const wrong = answered.filter(p => !p.correct);
    avgConfCorrect = corr.length ? corr.reduce((s, p) => s + p.confidence, 0) / corr.length : null;
    avgConfWrong = wrong.length ? wrong.reduce((s, p) => s + p.confidence, 0) / wrong.length : null;
  }

  // Response time stats
  const times = perItem.map(p => p.timeMs).filter(t => t > 0);
  const rtTotal = times.reduce((a, b) => a + b, 0);
  const rtMean = times.length ? rtTotal / times.length : 0;
  const rtMin = times.length ? Math.min(...times) : 0;
  const rtMax = times.length ? Math.max(...times) : 0;

  // Integrity flags
  const easyItems = perItem.filter(p => !p.skipped && p.difficulty <= 3);
  const easyMissed = easyItems.filter(p => !p.correct).length;
  const fastAnswers = perItem.filter(p => !p.skipped && p.timeMs < 2000).length;
  const veryFastAnswers = perItem.filter(p => !p.skipped && p.timeMs < 1000).length;
  const tabSwitches = submission.tabSwitches || 0;

  const flags = [];
  if (easyMissed >= 2) flags.push({ kind: 'bad', text: `Missed ${easyMissed} low-difficulty items (engagement concern)` });
  else if (easyMissed === 1) flags.push({ kind: 'warn', text: `Missed 1 low-difficulty item` });
  else flags.push({ kind: 'ok', text: `Baseline engagement passed` });

  if (tabSwitches === 0) flags.push({ kind: 'ok', text: `No tab switches` });
  else if (tabSwitches <= 2) flags.push({ kind: 'warn', text: `${tabSwitches} tab switches` });
  else flags.push({ kind: 'bad', text: `${tabSwitches} tab switches` });

  if (veryFastAnswers >= 3) flags.push({ kind: 'bad', text: `${veryFastAnswers} items answered in <1s (suspicious)` });
  else if (fastAnswers >= 5) flags.push({ kind: 'warn', text: `${fastAnswers} items answered in <2s` });
  else flags.push({ kind: 'ok', text: `Response times within normal range` });

  const skipped = perItem.filter(p => p.skipped).length;
  if (skipped === 0) flags.push({ kind: 'ok', text: `All items attempted` });
  else if (skipped <= 3) flags.push({ kind: 'warn', text: `${skipped} items skipped` });
  else flags.push({ kind: 'bad', text: `${skipped} items skipped` });

  const integrityFlag = flags.some(f => f.kind === 'bad');

  const startedAtDate = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const submittedAtDate = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
  const durationSec = Math.round((submittedAtDate - startedAtDate) / 1000);

  return {
    perItem,
    totalItems, correctCount,
    weighted, maxWeighted, weightedPct,
    iq, pctile, bandLow, bandHigh, bandLabel, ci,
    lfIQ, lfBandLabel, lfPct, lfWeighted, lfMax, lfGap, lfInterp,
    categoryBreakdown,
    calibrationScore, avgConfCorrect, avgConfWrong,
    rtTotal, rtMean, rtMin, rtMax,
    flags, integrityFlag, tabSwitches,
    durationSec
  };
}

module.exports = {
  CATEGORY_LABELS,
  computeResults,
  pctToIQ,
  iqToPercentile,
  iqBandLabel
};
