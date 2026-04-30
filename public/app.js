/* Cognitive Assessment — candidate-facing controller
 *
 * Differences from Ver 8 local file:
 *   - No BANK in client. Items + figure HTML come from GET /api/session?invite=<token>.
 *   - No scoring in client. POST /api/submit returns only { ok, headline:{band, duration_sec} }.
 *   - Resume-on-refresh: server returns the same item set + display order for an in-flight
 *     session, so simply re-fetching restores the test (timer derived from started_at).
 *   - Candidate result screen is intentionally minimal: confirmation only, no IQ point estimate
 *     and no category breakdown. Detailed scoring stays admin-only.
 */

(function () {
  'use strict';

  /* --------------- CATEGORY LABELS --------------- */
  const CATEGORY_LABELS = {
    pattern:   'Pattern Recognition',
    verbal:    'Verbal Reasoning',
    logical:   'Logical Reasoning',
    spatial:   'Spatial Reasoning',
    numerical: 'Numerical Reasoning',
    sjt:       'Situational Judgment'
  };

  /* --------------- STATE --------------- */
  const state = {
    token: null,
    sessionId: null,
    durationSec: 25 * 60,
    startedAt: null,            // Date — from server
    items: [],                  // [{ id, prompt, choices:[{label}], figure_html? }] in display order
    candidate: { name: '', email: '', role_applied_for: '' },
    current: 0,
    answers: [],                // displayed-slot index | null
    confidence: [],             // 1|2|3 | null
    responseTimes: [],          // ms per item, accumulated as user navigates
    itemStartTime: 0,
    tabSwitches: 0,
    timerInterval: null,
    secondsLeft: 25 * 60,
    submitting: false,
    submitted: false
  };

  /* --------------- UTIL --------------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function getInviteToken() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('invite') || '').trim();
  }

  /* --------------- LIFECYCLE --------------- */
  async function bootstrap() {
    const token = getInviteToken();
    if (!token || token.length < 8) {
      return showInvalid('No invitation token found in this link. Please use the link from your invitation email.');
    }
    state.token = token;

    try {
      const resp = await fetch(`/api/session?invite=${encodeURIComponent(token)}`, {
        method: 'GET',
        cache: 'no-store',
        headers: { 'accept': 'application/json' }
      });
      const data = await safeJson(resp);

      if (!resp.ok) {
        return showInvalid(humanInviteError(data && data.error, resp.status));
      }
      hydrateSession(data);
      show('screen-intro');
    } catch (err) {
      console.error('session fetch failed', err);
      showInvalid('We could not load your assessment. Please check your connection and try again.');
    }
  }

  function hydrateSession(data) {
    state.sessionId = data.session_id;
    state.startedAt = data.started_at ? new Date(data.started_at) : new Date();
    state.durationSec = Number(data.duration_sec) || (25 * 60);
    state.items = Array.isArray(data.items) ? data.items : [];
    state.candidate = data.candidate || { name: '', email: '', role_applied_for: '' };

    const n = state.items.length;
    state.answers = new Array(n).fill(null);
    state.confidence = new Array(n).fill(null);
    state.responseTimes = new Array(n).fill(0);
    state.current = 0;

    // Read-only display of who this session belongs to (so candidate sees their own info, can't edit).
    document.getElementById('candidateName').value = state.candidate.name || '';
    document.getElementById('candidateEmail').value = state.candidate.email || '';

    // Compute remaining time from server's started_at — refresh-safe.
    const elapsedSec = Math.max(0, Math.floor((Date.now() - state.startedAt.getTime()) / 1000));
    state.secondsLeft = Math.max(0, state.durationSec - elapsedSec);
  }

  async function safeJson(resp) {
    try { return await resp.json(); } catch { return null; }
  }

  function humanInviteError(code, status) {
    if (code === 'invite_not_found') return 'This invitation link was not recognized. Please use the exact link from your email.';
    if (code === 'invite_already_used') return 'This invitation has already been used. Each invitation can only be used once.';
    if (code === 'invite_expired') return 'This invitation has expired. Please contact the hiring team for a new link.';
    if (code === 'invalid_invite_token') return 'The invitation link is malformed. Please use the exact link from your email.';
    if (status === 500) return 'Something went wrong on our end. Please try again in a moment.';
    return 'This invitation link can no longer be used.';
  }

  function showInvalid(msg) {
    document.getElementById('invalid-msg').textContent = msg;
    show('screen-invalid');
  }

  /* --------------- INTRO / START --------------- */
  document.getElementById('btn-start').addEventListener('click', startTest);

  function startTest() {
    if (!state.items.length) return;
    if (state.secondsLeft <= 0) return finishTest(true);
    show('screen-test');
    startTimer();
    renderQuestion();
    attachAntiCheat();
  }

  /* --------------- TIMER --------------- */
  function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    updateTimerDisplay();
    state.timerInterval = setInterval(() => {
      state.secondsLeft--;
      updateTimerDisplay();
      if (state.secondsLeft <= 0) {
        clearInterval(state.timerInterval);
        finishTest(true);
      }
    }, 1000);
  }
  function updateTimerDisplay() {
    const el = document.getElementById('timer');
    el.textContent = fmtTime(Math.max(0, state.secondsLeft));
    el.classList.remove('warn', 'danger');
    if (state.secondsLeft <= 60) el.classList.add('danger');
    else if (state.secondsLeft <= 180) el.classList.add('warn');
  }

  /* --------------- QUESTION RENDERING --------------- */
  function renderQuestion() {
    const idx = state.current;
    const item = state.items[idx];
    if (!item) return;
    state.itemStartTime = performance.now();

    document.getElementById('prog-fill').style.width = `${((idx + 1) / state.items.length) * 100}%`;
    document.getElementById('prog-text').textContent = `Question ${idx + 1} of ${state.items.length}`;
    // No category leak — the server already strips item.category. Show a generic header.
    document.getElementById('q-category').textContent = 'Question';
    document.getElementById('q-prompt').innerHTML = item.prompt || '';

    const figWrap = document.getElementById('q-figure');
    figWrap.innerHTML = item.figure_html || '';

    const choicesWrap = document.getElementById('q-choices');
    choicesWrap.innerHTML = '';
    (item.choices || []).forEach((choice, displayedIdx) => {
      const letter = String.fromCharCode(65 + displayedIdx); // A B C D
      const el = document.createElement('div');
      el.className = 'choice';
      const label = (choice && choice.label) || '';
      const isSvg = label.trim().startsWith('<svg');
      el.innerHTML = `
        <span class="choice-letter">${letter}</span>
        ${isSvg ? `<span class="choice-figure">${label}</span>` : `<span class="choice-label">${escapeHtml(label)}</span>`}
      `;
      el.addEventListener('click', () => {
        document.querySelectorAll('#q-choices .choice').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        state.answers[idx] = displayedIdx;
        document.getElementById('btn-skip').style.display = 'none';
      });
      if (state.answers[idx] === displayedIdx) el.classList.add('selected');
      choicesWrap.appendChild(el);
    });

    document.querySelectorAll('.conf-btn').forEach(b => {
      b.classList.remove('selected');
      if (parseInt(b.dataset.val, 10) === state.confidence[idx]) b.classList.add('selected');
    });

    const isLast = idx === state.items.length - 1;
    const hasAnswer = state.answers[idx] != null;
    document.getElementById('btn-prev').disabled = idx === 0;

    const nextBtn = document.getElementById('btn-next');
    nextBtn.style.display = isLast ? 'none' : '';
    nextBtn.textContent = 'Next →';

    const skipBtn = document.getElementById('btn-skip');
    skipBtn.style.display = (hasAnswer || isLast) ? 'none' : '';

    document.getElementById('submit-bar').classList.toggle('active', isLast);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  /* --------------- CONFIDENCE / NAV HANDLERS --------------- */
  document.getElementById('conf-row').addEventListener('click', e => {
    if (!e.target.classList.contains('conf-btn')) return;
    const val = parseInt(e.target.dataset.val, 10);
    state.confidence[state.current] = val;
    document.querySelectorAll('.conf-btn').forEach(b => b.classList.remove('selected'));
    e.target.classList.add('selected');
  });

  document.getElementById('btn-prev').addEventListener('click', () => gotoItem(state.current - 1));
  document.getElementById('btn-next').addEventListener('click', () => {
    if (state.current < state.items.length - 1) gotoItem(state.current + 1);
  });
  document.getElementById('btn-submit').addEventListener('click', () => finishTest(false));
  document.getElementById('btn-skip').addEventListener('click', () => {
    // Skip only when unanswered (Ver 6 bug guard).
    if (state.answers[state.current] != null) return;
    state.answers[state.current] = null;
    state.confidence[state.current] = null;
    if (state.current === state.items.length - 1) finishTest(false);
    else gotoItem(state.current + 1);
  });

  function gotoItem(i) {
    const elapsed = Math.round(performance.now() - state.itemStartTime);
    state.responseTimes[state.current] = (state.responseTimes[state.current] || 0) + elapsed;
    if (i < 0 || i >= state.items.length) return;
    state.current = i;
    renderQuestion();
  }

  /* --------------- ANTI-CHEAT --------------- */
  function attachAntiCheat() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && document.getElementById('screen-test').classList.contains('active')) {
        state.tabSwitches++;
      }
    });
    ['copy','paste','cut','contextmenu'].forEach(ev => {
      document.addEventListener(ev, e => {
        if (document.getElementById('screen-test').classList.contains('active')) e.preventDefault();
      });
    });
  }

  /* --------------- FINISH / SUBMIT --------------- */
  async function finishTest(timeOut) {
    // Capture time on the final visited item.
    const elapsed = Math.round(performance.now() - state.itemStartTime);
    state.responseTimes[state.current] = (state.responseTimes[state.current] || 0) + elapsed;

    if (state.timerInterval) clearInterval(state.timerInterval);
    if (state.submitted || state.submitting) return;

    state.submitting = true;
    show('screen-loading');
    document.querySelector('#screen-loading h2').textContent =
      timeOut ? 'Time expired — submitting your answers…' : 'Submitting your answers…';

    try {
      const resp = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: state.sessionId,
          token: state.token,
          answers: state.answers,
          confidence: state.confidence,
          responseTimes: state.responseTimes,
          tabSwitches: state.tabSwitches
        })
      });
      const data = await safeJson(resp);

      if (!resp.ok) {
        return showSubmitError(humanSubmitError(data && data.error, resp.status));
      }
      state.submitted = true;
      renderResults(data, timeOut);
      show('screen-results');
    } catch (err) {
      console.error('submit failed', err);
      showSubmitError('We could not reach the server. Please check your connection and try again.');
    } finally {
      state.submitting = false;
    }
  }

  function humanSubmitError(code, status) {
    if (code === 'already_submitted') return 'Your assessment has already been submitted. There is nothing more to do.';
    if (code === 'token_mismatch')    return 'Something is off with your session. Please reload the page.';
    if (code === 'session_not_found') return 'Your session could not be found. Please reload the page.';
    if (code === 'answers_length_mismatch') return 'The submission was incomplete. Please reload and finish all questions.';
    if (status === 500) return 'Something went wrong on our end. Please try again in a moment.';
    return 'Submission failed. Please try again.';
  }

  function showSubmitError(msg) {
    document.getElementById('submit-error-msg').textContent = msg;
    show('screen-submit-error');
  }
  document.getElementById('btn-retry-submit').addEventListener('click', () => {
    if (state.submitted) return;
    finishTest(false);
  });

  function renderResults(payload, timeOut) {
    const sub = document.getElementById('res-subtitle');
    sub.textContent = timeOut
      ? 'Time expired — your answers were submitted automatically.'
      : 'Thank you for completing the cognitive ability assessment.';
    // Headline stays generic — we deliberately do NOT echo band/IQ to candidate.
    document.getElementById('res-headline').textContent = 'Submitted successfully';
    document.getElementById('res-sub').textContent =
      'The hiring team will review your results and follow up via email.';
  }

  /* --------------- BOOT --------------- */
  // Avoid accidental double-submit if user closes the tab mid-test.
  window.addEventListener('beforeunload', (e) => {
    if (document.getElementById('screen-test').classList.contains('active') && !state.submitted) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  bootstrap();
})();
