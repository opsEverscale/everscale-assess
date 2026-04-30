// POST /api/submit
// Body: { session_id, token, answers[28], confidence[28], responseTimes[28], tabSwitches }
//
// Validates the session belongs to the token, scores server-side using the saved
// item_order + choice_order, persists results, and burns the invite token.
//
// What the candidate gets back: a minimal "success" payload + their headline result
// (band + iq label only). Per-item answers and admin-only fields stay in the DB.

const { supabase } = require('./_lib/supabase');
const { computeResults } = require('./_lib/scoring');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

function isArrayOfLength(x, n) {
  return Array.isArray(x) && x.length === n;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { session_id, token, answers, confidence, responseTimes, tabSwitches } = body;
  if (!session_id || !token) return json(400, { error: 'missing_session_or_token' });

  // Look up session.
  const { data: sessionRow, error: sErr } = await supabase
    .from('sessions')
    .select('id, candidate_id, token, items_version, item_order, choice_order, started_at, submitted_at')
    .eq('id', session_id)
    .maybeSingle();

  if (sErr) {
    console.error('session lookup failed', sErr);
    return json(500, { error: 'session_lookup_failed' });
  }
  if (!sessionRow) return json(404, { error: 'session_not_found' });
  if (sessionRow.token !== token) return json(403, { error: 'token_mismatch' });
  if (sessionRow.submitted_at) return json(409, { error: 'already_submitted' });

  const n = sessionRow.item_order.length;
  if (!isArrayOfLength(answers, n) || !isArrayOfLength(confidence, n) || !isArrayOfLength(responseTimes, n)) {
    return json(400, { error: 'answers_length_mismatch', expected: n });
  }

  // Load BANK for this version.
  const { data: snap, error: snapErr } = await supabase
    .from('items_snapshot')
    .select('version, bank')
    .eq('version', sessionRow.items_version)
    .maybeSingle();

  if (snapErr || !snap) {
    console.error('items_snapshot missing for', sessionRow.items_version, snapErr);
    return json(500, { error: 'bank_unavailable' });
  }

  const submittedAt = new Date();
  const results = computeResults({
    BANK: snap.bank,
    itemOrder: sessionRow.item_order,
    choiceOrder: sessionRow.choice_order,
    submission: {
      answers, confidence, responseTimes,
      tabSwitches: Number(tabSwitches) || 0
    },
    startedAt: sessionRow.started_at,
    submittedAt
  });

  // Persist scoring results + payload.
  const updateRow = {
    submitted_at: submittedAt.toISOString(),
    duration_sec: results.durationSec,
    weighted_score: results.weighted,
    raw_correct: results.correctCount,
    iq_label: results.bandLabel,
    band: results.bandLabel,
    calibration_score: results.calibrationScore,
    low_diff_misses: results.flags.filter(f =>
      f.text.includes('low-difficulty') && (f.kind === 'bad' || f.kind === 'warn')
    ).length,
    integrity_flag: results.integrityFlag,
    payload: {
      perItem: results.perItem,
      weighted: results.weighted,
      maxWeighted: results.maxWeighted,
      weightedPct: results.weightedPct,
      iq: results.iq,
      pctile: results.pctile,
      bandLow: results.bandLow,
      bandHigh: results.bandHigh,
      bandLabel: results.bandLabel,
      ci: results.ci,
      languageFair: {
        iq: results.lfIQ,
        bandLabel: results.lfBandLabel,
        pct: results.lfPct,
        weighted: results.lfWeighted,
        max: results.lfMax,
        gap: results.lfGap,
        interp: results.lfInterp
      },
      categoryBreakdown: results.categoryBreakdown,
      calibration: {
        score: results.calibrationScore,
        avgConfCorrect: results.avgConfCorrect,
        avgConfWrong: results.avgConfWrong
      },
      responseTimes: {
        total: results.rtTotal,
        mean: results.rtMean,
        min: results.rtMin,
        max: results.rtMax
      },
      flags: results.flags,
      tabSwitches: results.tabSwitches
    }
  };

  const { error: upErr } = await supabase
    .from('sessions')
    .update(updateRow)
    .eq('id', session_id)
    .is('submitted_at', null);

  if (upErr) {
    console.error('session update failed', upErr);
    return json(500, { error: 'session_update_failed' });
  }

  // Burn the invite token.
  const { error: tokErr } = await supabase
    .from('invite_tokens')
    .update({ used_at: submittedAt.toISOString() })
    .eq('token', token)
    .is('used_at', null);

  if (tokErr) {
    console.error('token burn failed (non-fatal)', tokErr);
    // Don't fail the whole submit — the session is already recorded.
  }

  // Candidate-facing response: minimal. They see the headline only;
  // admins see the full payload via /api/admin/*.
  return json(200, {
    ok: true,
    session_id,
    submitted_at: updateRow.submitted_at,
    headline: {
      band: results.bandLabel,
      duration_sec: results.durationSec
    }
  });
};
