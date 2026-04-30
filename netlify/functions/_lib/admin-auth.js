// Admin auth helper — validates the Supabase JWT carried by the admin SPA
// and enforces the ADMIN_EMAILS allow-list (CEO + Head of HR, equal access).
//
// Usage from a Netlify function:
//   const { requireAdmin, jsonError } = require('./_lib/admin-auth');
//   const auth = await requireAdmin(event);
//   if (!auth.ok) return jsonError(auth.status, auth.code);
//   // auth.email and auth.userId are available
//
// Anti-leak: never echoes the token back, never includes user metadata
// from Supabase beyond email + id.

const { supabase } = require('./supabase');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

function getBearerToken(event) {
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function requireAdmin(event) {
  const jwt = getBearerToken(event);
  if (!jwt) {
    return { ok: false, status: 401, code: 'no_token' };
  }

  // Verify JWT with Supabase. getUser(jwt) returns the user iff the token
  // is valid + not expired. We use the service-role client only to perform
  // the lookup; the JWT itself is what authenticates the user.
  let user;
  try {
    const { data, error } = await supabase.auth.getUser(jwt);
    if (error || !data || !data.user) {
      return { ok: false, status: 401, code: 'invalid_token' };
    }
    user = data.user;
  } catch (e) {
    return { ok: false, status: 401, code: 'token_verify_failed' };
  }

  const email = (user.email || '').toLowerCase();
  if (!email) {
    return { ok: false, status: 403, code: 'no_email_on_token' };
  }
  if (!ADMIN_EMAILS.includes(email)) {
    return { ok: false, status: 403, code: 'not_authorized' };
  }

  return { ok: true, email, userId: user.id };
}

function jsonError(status, code, extra = {}) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    },
    body: JSON.stringify({ error: code, ...extra })
  };
}

function jsonOk(payload) {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

module.exports = { requireAdmin, jsonError, jsonOk, ADMIN_EMAILS };
