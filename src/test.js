(function () {
  'use strict';

  // ── Timer ─────────────────────────────────────────────────────────────────
  const timerPill = document.getElementById('timer-pill');
  if (timerPill) {
    const attemptId  = timerPill.dataset.attemptId;
    const limitSec   = parseInt(timerPill.dataset.limitSeconds, 10);
    const storageKey = 'ef_timer_' + attemptId;

    let startTime = parseInt(sessionStorage.getItem(storageKey), 10);
    if (!startTime) {
      startTime = Date.now();
      sessionStorage.setItem(storageKey, String(startTime));
    }

    const display = document.getElementById('timer-display');

    function tick() {
      const elapsed   = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, limitSec - elapsed);
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;

      if (display) display.textContent = m + ':' + String(s).padStart(2, '0');

      timerPill.classList.toggle('timer-warning', remaining > 30 && remaining <= 120);
      timerPill.classList.toggle('timer-danger',  remaining <= 30);

      if (remaining === 0) {
        clearInterval(iv);
        sessionStorage.removeItem(storageKey);
        doSubmit();
      }
    }

    const iv = setInterval(tick, 1000);
    tick();
  }

  // ── Submit protection ─────────────────────────────────────────────────────
  let submitting = false;

  function doSubmit() {
    if (submitting) return;
    submitting = true;
    const btn  = document.getElementById('submit-btn');
    const form = document.getElementById('test-form');
    if (btn)  { btn.disabled = true; btn.textContent = 'Submitting…'; }
    if (form) form.submit();
  }

  const testForm = document.getElementById('test-form');
  if (testForm) {
    testForm.addEventListener('submit', e => {
      if (submitting) { e.preventDefault(); return; }
      doSubmit();
    });

    window.addEventListener('beforeunload', e => {
      if (!submitting) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ── Grid: Enter moves to next cell ────────────────────────────────────────
  const gridInputs = Array.from(document.querySelectorAll('.grid-input'));
  gridInputs.forEach((inp, i) => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const next = gridInputs[i + 1];
        if (next) next.focus();
      }
    });
  });

  // ── Score circle stroke animation ─────────────────────────────────────────
  const scoreFill = document.querySelector('.score-fill');
  if (scoreFill) {
    const pct = parseFloat(scoreFill.dataset.pct) || 0;
    setTimeout(() => {
      scoreFill.style.strokeDasharray = (pct / 100 * 314.16).toFixed(2) + ' 314.16';
    }, 120);
  }

})();
