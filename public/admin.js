// Admin SPA — Cognitive Assessment, Everscale Group
// Single-page controller for login (magic link), list, and detail views.
// Auth: Supabase Auth in the browser; admin functions enforce ADMIN_EMAILS server-side.

(function () {
  'use strict';

  // -------- Supabase client (browser, publishable key) --------
  const SUPABASE_URL = 'https://etnhpcztkurubonffrpl.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_M8-vlrZnVbD4YhUVuWLNtQ_Sc1TuT-C';

  // window.supabase is the global UMD bundle; .createClient() builds an instance.
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      detectSessionInUrl: true,    // pull JWT out of magic-link fragment
      persistSession: true,        // keep session across reloads
      autoRefreshToken: true,
      storageKey: 'everscale-admin-auth'
    }
  });

  // -------- DOM helpers --------
  const $  = (id) => document.getElementById(id);
  const showScreen = (which) => {
    ['screen-login','screen-list','screen-detail'].forEach(id => {
      $(id).classList.toggle('active', id === which);
    });
  };
  const setText = (id, v) => { const el = $(id); if (el) el.textContent = (v == null || v === '') ? '—' : String(v); };
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  };
  const fmtMin = (m) => (m == null) ? '—' : (m + ' min');
  const fmtPct = (n) => (n == null || isNaN(n)) ? '—' : (Math.round(n*100) + '%');
  const fmtCalib = (n) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(2);
  const escHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  // -------- State --------
  const state = {
    rows: [],
    sortKey: 'submitted_at',
    sortDir: -1,    // -1 desc, +1 asc
    search: '',
    bandFilter: '',
    flaggedOnly: false
  };

  // -------- Authenticated fetch --------
  async function authFetch(path, opts = {}) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      throw new Error('not_authenticated');
    }
    const headers = Object.assign(
      { 'authorization': 'Bearer ' + session.access_token },
      opts.headers || {}
    );
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    return res;
  }

  // -------- LOGIN --------
  async function sendMagicLink() {
    const email = $('login-email').value.trim().toLowerCase();
    const errEl = $('login-error');
    const okEl  = $('login-success');
    errEl.style.display = 'none';
    okEl.style.display = 'none';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = 'Please enter a valid email.';
      errEl.style.display = 'block';
      return;
    }

    $('btn-send-link').disabled = true;
    $('btn-send-link').textContent = 'Sending…';
    try {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + '/admin',
          shouldCreateUser: true   // first sign-in creates the auth user
        }
      });
      if (error) throw error;
      okEl.textContent = 'Check your inbox — we sent a sign-in link to ' + email + '.';
      okEl.style.display = 'block';
      $('login-email').value = '';
    } catch (e) {
      errEl.textContent = 'Could not send sign-in link. ' + (e.message || '');
      errEl.style.display = 'block';
    } finally {
      $('btn-send-link').disabled = false;
      $('btn-send-link').textContent = 'Send sign-in link';
    }
  }

  async function signOut() {
    await sb.auth.signOut();
    location.hash = '';
    showScreen('screen-login');
  }

  // -------- LIST --------
  async function loadList() {
    showScreen('screen-list');
    $('list-loading').style.display = 'block';
    $('list-empty').style.display = 'none';
    $('sessions-table').style.display = 'none';

    try {
      const res = await authFetch('/api/admin/sessions');
      if (res.status === 401 || res.status === 403) {
        // The JWT is valid but the email isn't allow-listed (or vice versa).
        const body = await res.json().catch(() => ({}));
        await sb.auth.signOut();
        showScreen('screen-login');
        const errEl = $('login-error');
        errEl.textContent = body.error === 'not_authorized'
          ? 'That email is not authorized for admin access.'
          : 'Your sign-in session is invalid. Please sign in again.';
        errEl.style.display = 'block';
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const data = await res.json();
      state.rows = data.rows || [];
      renderList();
    } catch (e) {
      $('list-loading').textContent = 'Could not load sessions: ' + (e.message || '');
    }
  }

  function applyFilters(rows) {
    const q = state.search.trim().toLowerCase();
    const band = state.bandFilter;
    const flaggedOnly = state.flaggedOnly;
    return rows.filter(r => {
      if (q) {
        const hay = ((r.name || '') + ' ' + (r.email || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (band && r.band !== band) return false;
      if (flaggedOnly && !r.integrity_flag) return false;
      return true;
    });
  }

  function applySort(rows) {
    const k = state.sortKey, dir = state.sortDir;
    const sorted = rows.slice().sort((a, b) => {
      const av = a[k], bv = b[k];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return sorted;
  }

  function renderList() {
    const filtered = applySort(applyFilters(state.rows));
    $('list-loading').style.display = 'none';

    if (filtered.length === 0) {
      $('list-empty').style.display = 'block';
      $('sessions-table').style.display = 'none';
      $('row-count').textContent = '0 sessions';
      return;
    }
    $('list-empty').style.display = 'none';
    $('sessions-table').style.display = '';
    $('row-count').textContent = filtered.length + (filtered.length === 1 ? ' session' : ' sessions');

    const tbody = $('sessions-tbody');
    tbody.innerHTML = filtered.map(r => `
      <tr data-id="${escHtml(r.id)}">
        <td>${escHtml(r.name)}</td>
        <td class="muted-cell">${escHtml(r.email)}</td>
        <td>${fmtDate(r.submitted_at)}</td>
        <td class="num">${r.duration_min ?? '—'}</td>
        <td class="num">${r.raw_correct ?? '—'}</td>
        <td class="num"><strong>${r.iq ?? '—'}</strong></td>
        <td>${escHtml(r.band || '')}</td>
        <td class="num">${r.percentile ?? '—'}</td>
        <td class="num">${fmtCalib(r.calibration)}</td>
        <td class="num">${r.tab_switches ?? 0}</td>
        <td>${r.integrity_flag ? '<span class="flag-pill">⚠</span>' : ''}</td>
      </tr>
    `).join('');

    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      tr.addEventListener('click', () => loadDetail(tr.dataset.id));
    });
  }

  function exportCsv() {
    // Build the CSV URL and stream the download via authFetch + blob.
    (async () => {
      try {
        const res = await authFetch('/api/admin/sessions.csv');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const today = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = 'everscale-assessment-' + today + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (e) {
        alert('Could not export CSV: ' + (e.message || ''));
      }
    })();
  }

  // -------- DETAIL --------
  async function loadDetail(sessionId) {
    showScreen('screen-detail');
    $('detail-loading').style.display = '';
    $('detail-error').style.display = 'none';
    $('detail-body').style.display = 'none';

    try {
      const res = await authFetch('/api/admin/sessions/' + encodeURIComponent(sessionId));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || ('HTTP ' + res.status));
      }
      const data = await res.json();
      renderDetail(data);
    } catch (e) {
      $('detail-loading').style.display = 'none';
      const errEl = $('detail-error');
      errEl.textContent = 'Could not load session: ' + (e.message || '');
      errEl.style.display = '';
    }
  }

  function renderDetail({ session, candidate, items }) {
    // header / candidate
    $('d-name').textContent = candidate.name || '(no name)';
    $('d-email').textContent = candidate.email || '';
    if (candidate.role_applied_for) {
      $('d-role').textContent = 'Role: ' + candidate.role_applied_for;
      $('d-role').style.display = '';
    } else {
      $('d-role').style.display = 'none';
    }

    // integrity badge
    const badge = $('d-flag-badge');
    badge.innerHTML = session.integrity_flag
      ? '<span class="flag-badge">⚠ Integrity flag</span>'
      : '<span class="ok-badge">✓ Clean</span>';

    // score grid
    setText('d-iq', session.iq);
    setText('d-band-label', session.bandLabel || session.band);
    setText('d-pctile', session.percentile);
    setText('d-ci', (session.bandLow != null && session.bandHigh != null)
      ? (session.bandLow + '–' + session.bandHigh)
      : '—');
    setText('d-raw', (session.raw_correct != null ? session.raw_correct + ' / 28' : '—'));
    setText('d-weighted', (session.weighted_score != null && session.maxWeighted != null)
      ? (session.weighted_score + ' / ' + session.maxWeighted)
      : (session.weighted_score ?? '—'));
    setText('d-duration', fmtMin(session.duration_min));
    setText('d-calibration', fmtCalib(session.calibration));

    // integrity grid
    setText('d-tabswitch', session.tab_switches ?? 0);
    setText('d-lowmiss', session.low_diff_misses ?? 0);
    setText('d-started', fmtDate(session.started_at));
    setText('d-submitted', fmtDate(session.submitted_at));

    const flagsEl = $('d-flags');
    flagsEl.innerHTML = (session.flags || []).map(f => {
      const cls = f.kind === 'ok' ? 'flag-ok' : f.kind === 'warn' ? 'flag-warn' : 'flag-info';
      return `<li class="${cls}">${escHtml(f.text || f.kind || '')}</li>`;
    }).join('') || '<li class="flag-info">No flags emitted.</li>';

    // language-fair
    if (session.languageFair) {
      const lf = session.languageFair;
      setText('d-lf-iq', lf.iq);
      setText('d-lf-band', lf.bandLabel || '');
      setText('d-lf-gap', (lf.gap != null) ? (lf.gap > 0 ? '+' + lf.gap : lf.gap) : '—');
      setText('d-lf-interp', lf.interp || '');
      $('d-lf-card').style.display = '';
    } else {
      $('d-lf-card').style.display = 'none';
    }

    // category breakdown
    const catEl = $('d-categories');
    catEl.innerHTML = (session.categoryBreakdown || []).map(c => {
      const pct = Math.round((c.accuracy || 0) * 100);
      return `
        <div class="cat-row">
          <div class="cat-label">${escHtml(c.label || c.category || '')}</div>
          <div class="cat-bar"><div class="cat-fill" style="width:${pct}%"></div></div>
          <div class="cat-stats">${c.correct}/${c.total} (${pct}%)</div>
        </div>`;
    }).join('') || '<p class="muted">No breakdown available.</p>';

    // per-item table
    const tbody = $('d-items-tbody');
    tbody.innerHTML = (items || []).map((it, i) => {
      const correctChip = it.skipped
        ? '<span class="result-chip skip">SKIP</span>'
        : it.correct
          ? '<span class="result-chip ok">✓</span>'
          : '<span class="result-chip wrong">✗</span>';
      const time = (it.time_ms != null) ? Math.round(it.time_ms / 100) / 10 + 's' : '—';
      const conf = (it.confidence != null) ? ['—','Low','Med','High'][it.confidence] || it.confidence : '—';
      // Trim long prompts to keep the table tidy.
      const prompt = (it.prompt || '').slice(0, 180);
      // SVG-based choice labels are too long for the table; truncate.
      const userAns = sanitizeChoice(it.user_choice_label);
      const corrAns = sanitizeChoice(it.correct_choice_label);
      return `
        <tr class="${it.correct ? 'row-ok' : (it.skipped ? 'row-skip' : 'row-wrong')}">
          <td class="num">${it.order}</td>
          <td class="mono">${escHtml(it.id)}</td>
          <td>${escHtml(it.category)}${it.subtype ? ' · ' + escHtml(it.subtype) : ''}</td>
          <td class="num">${it.difficulty ?? '—'}</td>
          <td class="prompt-cell">${escHtml(prompt)}${(it.prompt || '').length > 180 ? '…' : ''}</td>
          <td>${userAns}</td>
          <td>${corrAns}</td>
          <td>${correctChip}</td>
          <td class="num">${time}</td>
          <td class="num">${conf}</td>
        </tr>`;
    }).join('');

    $('detail-loading').style.display = 'none';
    $('detail-body').style.display = '';
  }

  function sanitizeChoice(label) {
    if (label == null) return '<span class="muted-cell">(skipped)</span>';
    const s = String(label);
    // SVG strings: detect and show a placeholder rather than dumping markup.
    if (s.trim().startsWith('<svg')) {
      return '<span class="muted-cell">[figure]</span>';
    }
    return escHtml(s.length > 80 ? s.slice(0, 80) + '…' : s);
  }

  // -------- Sorting / filter wiring --------
  function wireListControls() {
    document.querySelectorAll('#sessions-table thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (state.sortKey === k) state.sortDir *= -1;
        else { state.sortKey = k; state.sortDir = (k === 'submitted_at' ? -1 : 1); }
        renderList();
      });
    });

    $('filter-search').addEventListener('input', e => {
      state.search = e.target.value;
      renderList();
    });
    $('filter-band').addEventListener('change', e => {
      state.bandFilter = e.target.value;
      renderList();
    });
    $('filter-flagged-only').addEventListener('change', e => {
      state.flaggedOnly = !!e.target.checked;
      renderList();
    });

    $('btn-refresh').addEventListener('click', loadList);
    $('btn-export-csv').addEventListener('click', exportCsv);
    $('btn-sign-out').addEventListener('click', (e) => { e.preventDefault(); signOut(); });
    $('btn-back-list').addEventListener('click', () => loadList());
  }

  function wireLoginControls() {
    $('btn-send-link').addEventListener('click', sendMagicLink);
    $('login-email').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMagicLink();
    });
  }

  // -------- INVITE MODAL --------
  function openInviteModal() {
    $('invite-form-view').style.display = '';
    $('invite-success-view').style.display = 'none';
    $('inv-name').value = '';
    $('inv-email').value = '';
    $('inv-role').value = '';
    $('invite-error').style.display = 'none';
    $('invite-modal').style.display = 'flex';
    setTimeout(() => $('inv-name').focus(), 50);
  }
  function closeInviteModal() {
    $('invite-modal').style.display = 'none';
  }

  async function submitInvite() {
    const name = $('inv-name').value.trim();
    const email = $('inv-email').value.trim();
    const role = $('inv-role').value.trim();
    const errEl = $('invite-error');
    errEl.style.display = 'none';

    if (name.length < 2) {
      errEl.textContent = 'Please enter the candidate\'s name.';
      errEl.style.display = 'block';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = 'Please enter a valid email address.';
      errEl.style.display = 'block';
      return;
    }

    const btn = $('invite-submit');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    try {
      const res = await authFetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, role_applied_for: role })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && body.error === 'email_already_exists') {
          errEl.textContent = 'A candidate with that email already exists' +
            (body.existing_name ? ' (' + body.existing_name + ').' : '.') +
            ' Reuse the existing invite, or delete that record first.';
        } else if (body.error === 'email_invalid') {
          errEl.textContent = 'Email address is invalid.';
        } else if (body.error === 'name_invalid') {
          errEl.textContent = 'Candidate name must be 2-80 characters.';
        } else {
          errEl.textContent = 'Could not create invite: ' + (body.error || ('HTTP ' + res.status));
        }
        errEl.style.display = 'block';
        return;
      }

      // success — switch to success view
      const inviteUrl = window.location.origin + '/?invite=' + encodeURIComponent(body.token);
      $('invite-url').textContent = inviteUrl;
      $('invite-expiry-days').textContent = body.expiry_days || 7;
      const expiresOn = body.expires_at
        ? new Date(body.expires_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })
        : '';
      $('invite-summary').textContent =
        'For ' + name + ' (' + email + ')' + (role ? ' · ' + role : '') +
        (expiresOn ? ' · expires ' + expiresOn : '');
      $('invite-form-view').style.display = 'none';
      $('invite-success-view').style.display = '';
    } catch (e) {
      errEl.textContent = 'Network error: ' + (e.message || '');
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create invite';
    }
  }

  function copyInviteUrl() {
    const url = $('invite-url').textContent;
    if (!url) return;
    const btn = $('invite-copy');
    const orig = btn.textContent;
    const done = (msg) => {
      btn.textContent = msg;
      setTimeout(() => { btn.textContent = orig; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => done('Copied ✓')).catch(() => fallback());
    } else {
      fallback();
    }
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done('Copied ✓'); }
      catch (e) { done('Copy failed'); }
      ta.remove();
    }
  }

  function wireInviteControls() {
    $('btn-invite-open').addEventListener('click', openInviteModal);
    $('invite-close').addEventListener('click', closeInviteModal);
    $('invite-cancel').addEventListener('click', closeInviteModal);
    $('invite-submit').addEventListener('click', submitInvite);
    $('invite-copy').addEventListener('click', copyInviteUrl);
    $('invite-another').addEventListener('click', openInviteModal);
    $('invite-done').addEventListener('click', () => {
      closeInviteModal();
      loadList(); // refresh so the new candidate row eventually appears (after they submit)
    });

    // Backdrop click closes (but click inside the card does not).
    $('invite-modal').addEventListener('click', (e) => {
      if (e.target === $('invite-modal')) closeInviteModal();
    });
    // Escape closes when modal is open.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('invite-modal').style.display !== 'none') {
        closeInviteModal();
      } else if (e.key === 'Enter' && $('invite-modal').style.display !== 'none' && $('invite-form-view').style.display !== 'none') {
        // Enter inside form fields submits, except when the role textarea has focus (none here, but defensive).
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
          submitInvite();
        }
      }
    });
  }

  // -------- Bootstrap --------
  async function bootstrap() {
    wireLoginControls();
    wireListControls();
    wireInviteControls();

    // 1. If the URL has a magic-link fragment, Supabase JS picks it up
    //    automatically (detectSessionInUrl). Wait briefly for it to settle.
    await new Promise(r => setTimeout(r, 50));

    // 2. Check for an existing session.
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user && session.user.email) {
      $('who-email').textContent = session.user.email;
      // Clean the URL fragment so a refresh doesn't re-process it.
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      await loadList();
    } else {
      showScreen('screen-login');
    }

    // 3. React to subsequent auth changes (magic-link return, sign-out, etc.)
    sb.auth.onAuthStateChange((event, sess) => {
      if (event === 'SIGNED_IN' && sess && sess.user) {
        $('who-email').textContent = sess.user.email;
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        loadList();
      } else if (event === 'SIGNED_OUT') {
        showScreen('screen-login');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
