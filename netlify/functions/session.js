// GET /api/session?invite=<token>
//
// Resolves an invite token into a candidate-facing session payload.
// Anti-leak guarantees:
//   - Never sends the `correct` field for any item.
//   - Never sends item difficulty / subtype / category metadata that the candidate
//     could mine for hints (we only send id, prompt, choices, and figure_html if any).
//   - BANK + scoring lives only in the function's memory and the DB.
//
// Resume semantics (deliberate divergence from Ver 8 local file):
//   - The first valid GET with a given unused token CREATES a sessions row and
//     persists item_order + choice_order seeded from the new session id.
//   - Subsequent GETs with the same token (e.g. browser refresh) return the SAME
//     session — same items, same choice order — until submit lands.
//   - Token is marked used_at only on /api/submit success.

const crypto = require('crypto');
const { supabase } = require('./_lib/supabase');
const figures = require('./_lib/figures');
const {
  sampleSessionItems,
  shuffleChoices,
  mulberry32,
  seedFromString
} = require('./_lib/sampling');

const BANK_VERSION = process.env.BANK_VERSION || 'v8';
const SESSION_MINUTES = Number(process.env.SESSION_MINUTES || 25);
const IP_HASH_SALT = process.env.IP_HASH_SALT || 'everscale-stage1-default-salt';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store'
  },
  body: JSON.stringify(body)
});

function hashIp(ip) {
  if (!ip) return null;
  return crypto
    .createHmac('sha256', IP_HASH_SALT)
    .update(ip)
    .digest('hex')
    .slice(0, 32);
}

function clientIpFrom(event) {
  // Netlify forwards the original IP in x-nf-client-connection-ip; fall back to XFF.
  const h = event.headers || {};
  return (
    h['x-nf-client-connection-ip'] ||
    (h['x-forwarded-for'] || '').split(',')[0].trim() ||
    null
  );
}

// Build the candidate-facing item payload — strip everything that could leak the answer.
function sanitizeItem(item, withFigure) {
  const out = {
    id: item.id,
    prompt: item.prompt,
    choices: item.choices.map(c => ({ label: c.label }))
  };
  if (withFigure) out.figure_html = withFigure;
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'method_not_allowed' });
  }

  const token = (event.queryStringParameters || {}).invite;
  if (!token || typeof token !== 'string' || token.length < 8) {
    return json(400, { error: 'invalid_invite_token' });
  }

  // 1. Look up the invite + candidate.
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('invite_tokens')
    .select('token, candidate_id, used_at, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (tokenErr) {
    console.error('invite lookup error', tokenErr);
    return json(500, { error: 'lookup_failed' });
  }
  if (!tokenRow) return json(404, { error: 'invite_not_found' });
  if (tokenRow.used_at) return json(410, { error: 'invite_already_used' });
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
    return json(410, { error: 'invite_expired' });
  }

  const { data: candidate, error: candErr } = await supabase
    .from('candidates')
    .select('id, name, email, role_applied_for')
    .eq('id', tokenRow.candidate_id)
    .maybeSingle();

  if (candErr || !candidate) {
    console.error('candidate lookup error', candErr);
    return json(500, { error: 'candidate_missing' });
  }

  // 2. Resume? Look for an existing in-flight session for this token.
  const { data: existing, error: exErr } = await supabase
    .from('sessions')
    .select('id, items_version, item_order, choice_order, started_at')
    .eq('token', token)
    .is('submitted_at', null)
    .maybeSingle();

  if (exErr) {
    console.error('session lookup error', exErr);
    return json(500, { error: 'session_lookup_failed' });
  }

  let sessionRow = existing;

  // 3. Load the bank for this version.
  const { data: snap, error: snapErr } = await supabase
    .from('items_snapshot')
    .select('version, bank')
    .eq('version', BANK_VERSION)
    .maybeSingle();

  if (snapErr || !snap) {
    console.error('items_snapshot missing for', BANK_VERSION, snapErr);
    return json(500, { error: 'bank_unavailable' });
  }

  const BANK = snap.bank;
  const bankById = new Map(BANK.map(it => [it.id, it]));

  let itemsForCandidate;

  if (sessionRow) {
    // Rehydrate from persisted item_order + choice_order.
    const ids = sessionRow.item_order;
    const choiceOrder = sessionRow.choice_order;
    itemsForCandidate = ids.map(id => {
      const orig = bankById.get(id);
      if (!orig) throw new Error(`bank missing item ${id} for resume`);
      const order = choiceOrder[id] || orig.choices.map((_, i) => i);
      return { ...orig, choices: order.map(i => orig.choices[i]) };
    });
  } else {
    // Create a new session. Generate the id ourselves so we can seed sampling
    // from it (instead of waiting for the DB default and re-fetching).
    const newSessionId = crypto.randomUUID();
    const seed = seedFromString(newSessionId);
    const rnd = mulberry32(seed);

    const sampled = sampleSessionItems(BANK, rnd);
    const { shuffled, choiceOrder } = shuffleChoices(sampled, rnd);

    const insertRow = {
      id: newSessionId,
      candidate_id: candidate.id,
      token,
      items_version: BANK_VERSION,
      item_order: sampled.map(it => it.id),
      choice_order: choiceOrder,
      user_agent: (event.headers || {})['user-agent'] || null,
      ip_hash: hashIp(clientIpFrom(event))
    };

    const { data: inserted, error: insErr } = await supabase
      .from('sessions')
      .insert(insertRow)
      .select('id, started_at')
      .single();

    if (insErr) {
      console.error('session insert error', insErr);
      return json(500, { error: 'session_create_failed' });
    }

    sessionRow = { id: inserted.id, started_at: inserted.started_at };
    itemsForCandidate = shuffled;
  }

  // 4. Render figures server-side and strip leak-y fields.
  const safeItems = itemsForCandidate.map(item => {
    const fig = figures.hasFigure(item.id) ? figures.render(item.id) : null;
    return sanitizeItem(item, fig);
  });

  return json(200, {
    session_id: sessionRow.id,
    started_at: sessionRow.started_at,
    duration_sec: SESSION_MINUTES * 60,
    items: safeItems,
    candidate: {
      name: candidate.name,
      email: candidate.email,
      role_applied_for: candidate.role_applied_for
    }
  });
};
