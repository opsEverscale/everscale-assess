// Admin API — list, detail, CSV export of cognitive-assessment sessions.
//
// Routes (all require Bearer JWT in Authorization header for an admin email):
//   GET /api/admin/sessions          → summary list of all submitted sessions
//   GET /api/admin/sessions/:id      → full detail of one session
//   GET /api/admin/sessions.csv      → CSV export of all submitted sessions
//
// Auth: validated by requireAdmin(event). Email must be in ADMIN_EMAILS env.
// The redirect rule in netlify.toml maps /api/admin/* → /.netlify/functions/admin/:splat
// so this single function handles every admin route.

const { supabase } = require('./_lib/supabase');
const { requireAdmin, jsonError, jsonOk } = require('./_lib/admin-auth');

// --- helpers ------------------------------------------------------------

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function durationMinutes(seconds) {
  if (seconds == null) return null;
  return Math.round((seconds / 60) * 10) / 10; // one decimal
}

function parseRoute(rawPath) {
  // rawPath examples we care about:
  //   /.netlify/functions/admin/sessions
  //   /.netlify/functions/admin/sessions.csv
  //   /.netlify/functions/admin/sessions/<uuid>
  // Also tolerate /api/admin/... in case a caller bypasses redirects.
  const path = (rawPath || '').replace(/\/+$/, '');
  // Strip the leading /.netlify/functions/admin or /api/admin
  const stripped = path
    .replace(/^\/\.netlify\/functions\/admin/i, '')
    .replace(/^\/api\/admin/i, '')
    || '/';

  if (stripped === '/sessions' || stripped === '/sessions/') {
    return { kind: 'list' };
  }
  if (stripped === '/sessions.csv') {
    return { kind: 'csv' };
  }
  const m = stripped.match(/^\/sessions\/([0-9a-f-]{36})$/i);
  if (m) {
    return { kind: 'detail', id: m[1] };
  }
  return { kind: 'unknown' };
}

// --- handlers -----------------------------------------------------------

async function handleList() {
  // Summary list — only fields we render in the table view.
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id,
      submitted_at,
      duration_sec,
      raw_correct,
      weighted_score,
      iq_label,
      band,
      calibration_score,
      low_diff_misses,
      integrity_flag,
      payload,
      candidate_id,
      candidates ( name, email, role_applied_for, invited_at, invited_by )
    `)
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false })
    .limit(500);

  if (error) {
    return jsonError(500, 'db_error', { detail: error.message });
  }

  // Project to a slim summary shape.
  const rows = (data || []).map(s => ({
    id: s.id,
    name: s.candidates?.name || '',
    email: s.candidates?.email || '',
    role_applied_for: s.candidates?.role_applied_for || '',
    invited_by: s.candidates?.invited_by || '',
    submitted_at: s.submitted_at,
    duration_min: durationMinutes(s.duration_sec),
    raw_correct: s.raw_correct,
    weighted_score: s.weighted_score,
    iq: s.payload?.iq ?? null,
    band: s.band,
    percentile: s.payload?.pctile ?? null,
    calibration: s.calibration_score == null ? null : Number(s.calibration_score),
    integrity_flag: s.integrity_flag === true,
    tab_switches: Number(s.payload?.tabSwitches ?? 0),
    low_diff_misses: s.low_diff_misses ?? 0
  }));

  return jsonOk({ count: rows.length, rows });
}

async function handleDetail(id) {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id,
      token,
      items_version,
      item_order,
      choice_order,
      started_at,
      submitted_at,
      duration_sec,
      user_agent,
      payload,
      weighted_score,
      raw_correct,
      iq_label,
      band,
      calibration_score,
      low_diff_misses,
      integrity_flag,
      candidate_id,
      candidates ( name, email, role_applied_for, invited_at, invited_by )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return jsonError(500, 'db_error', { detail: error.message });
  }
  if (!data) {
    return jsonError(404, 'session_not_found');
  }
  if (!data.submitted_at) {
    return jsonError(404, 'session_not_submitted');
  }

  // Pull the original bank so we can show full prompts and choice text
  // for the candidate's per-item answers (the payload only stores user/correct
  // labels, not the full prompt). We fetch the bank version this session used.
  const { data: snap, error: snapErr } = await supabase
    .from('items_snapshot')
    .select('bank')
    .eq('version', data.items_version)
    .maybeSingle();

  if (snapErr || !snap) {
    return jsonError(500, 'bank_lookup_failed', { detail: snapErr?.message });
  }

  // Build a map id → item for easy lookup in the per-item table.
  const bankById = {};
  for (const it of (snap.bank || [])) {
    bankById[it.id] = it;
  }

  // Hydrate per-item rows: each entry in payload.perItem is the source of truth
  // for what the candidate actually saw and chose. We attach the original
  // prompt and difficulty/category for richer display.
  const perItem = Array.isArray(data.payload?.perItem) ? data.payload.perItem : [];
  const hydratedItems = perItem.map((entry, idx) => {
    const orig = bankById[entry.id] || {};
    return {
      order: idx + 1,
      id: entry.id,
      category: entry.category || orig.category || '',
      subtype: orig.subtype || null,
      difficulty: entry.difficulty ?? orig.difficulty ?? null,
      prompt: orig.prompt || '',
      correct: !!entry.correct,
      skipped: !!entry.skipped,
      time_ms: entry.timeMs ?? null,
      confidence: entry.confidence ?? null,
      user_choice_label: entry.userChoiceLabel ?? null,
      correct_choice_label: entry.correctChoiceLabel ?? null,
      user_displayed_slot: entry.userDisplayedSlot ?? null,
      correct_displayed_slot: entry.correctDisplayedSlot ?? null
    };
  });

  return jsonOk({
    session: {
      id: data.id,
      items_version: data.items_version,
      started_at: data.started_at,
      submitted_at: data.submitted_at,
      duration_sec: data.duration_sec,
      duration_min: durationMinutes(data.duration_sec),
      user_agent: data.user_agent,
      raw_correct: data.raw_correct,
      weighted_score: data.weighted_score,
      iq: data.payload?.iq ?? null,
      iq_label: data.iq_label,
      band: data.band,
      bandLabel: data.payload?.bandLabel || data.band,
      bandLow: data.payload?.bandLow ?? null,
      bandHigh: data.payload?.bandHigh ?? null,
      ci: data.payload?.ci ?? null,
      percentile: data.payload?.pctile ?? null,
      maxWeighted: data.payload?.maxWeighted ?? null,
      weightedPct: data.payload?.weightedPct ?? null,
      calibration: data.calibration_score == null ? null : Number(data.calibration_score),
      avgConfWrong: data.payload?.calibration?.avgConfWrong ?? null,
      avgConfCorrect: data.payload?.calibration?.avgConfCorrect ?? null,
      tab_switches: Number(data.payload?.tabSwitches ?? 0),
      low_diff_misses: data.low_diff_misses ?? 0,
      integrity_flag: data.integrity_flag === true,
      flags: Array.isArray(data.payload?.flags) ? data.payload.flags : [],
      languageFair: data.payload?.languageFair || null,
      categoryBreakdown: Array.isArray(data.payload?.categoryBreakdown)
        ? data.payload.categoryBreakdown
        : [],
      responseTimes: data.payload?.responseTimes || null
    },
    candidate: {
      name: data.candidates?.name || '',
      email: data.candidates?.email || '',
      role_applied_for: data.candidates?.role_applied_for || '',
      invited_at: data.candidates?.invited_at || null,
      invited_by: data.candidates?.invited_by || ''
    },
    items: hydratedItems
  });
}

async function handleCsv() {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      submitted_at,
      duration_sec,
      raw_correct,
      weighted_score,
      band,
      calibration_score,
      integrity_flag,
      payload,
      candidates ( name, email, role_applied_for )
    `)
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false })
    .limit(5000);

  if (error) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'db_error', detail: error.message })
    };
  }

  const headers = [
    'name',
    'email',
    'submitted_at',
    'duration_min',
    'raw_correct',
    'weighted_score',
    'iq',
    'band',
    'percentile',
    'calibration',
    'integrity_flag',
    'tab_switches',
    'role_applied_for'
  ];

  const lines = [headers.join(',')];
  for (const s of (data || [])) {
    const cells = [
      s.candidates?.name || '',
      s.candidates?.email || '',
      s.submitted_at || '',
      durationMinutes(s.duration_sec) ?? '',
      s.raw_correct ?? '',
      s.weighted_score ?? '',
      s.payload?.iq ?? '',
      s.band || '',
      s.payload?.pctile ?? '',
      s.calibration_score == null ? '' : Number(s.calibration_score),
      s.integrity_flag === true ? 'true' : 'false',
      s.payload?.tabSwitches ?? 0,
      s.candidates?.role_applied_for || ''
    ];
    lines.push(cells.map(csvEscape).join(','));
  }

  const csv = lines.join('\n') + '\n';
  const today = new Date().toISOString().slice(0, 10);
  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="everscale-assessment-${today}.csv"`,
      'cache-control': 'no-store'
    },
    body: csv
  };
}

// --- entrypoint ---------------------------------------------------------

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonError(405, 'method_not_allowed');
  }

  const auth = await requireAdmin(event);
  if (!auth.ok) {
    return jsonError(auth.status, auth.code);
  }

  // event.path looks like /.netlify/functions/admin/sessions[/...]
  const route = parseRoute(event.path || event.rawUrl || '');

  switch (route.kind) {
    case 'list':   return handleList();
    case 'csv':    return handleCsv();
    case 'detail': return handleDetail(route.id);
    default:
      return jsonError(404, 'unknown_route');
  }
};
