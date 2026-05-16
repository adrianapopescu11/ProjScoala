const express = require('express');
const supabase = require('../db/database');
const { page, escHtml } = require('../lib/render');

const router = express.Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const sb = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function getGrade(pct) {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

// ─── Question renderers (take page) ───────────────────────────────────────────

function renderQuestion(q, idx) {
  let prompt, inputHtml;

  if (q.type === 'grid') {
    let config = {};
    try { config = JSON.parse(q.question_text); } catch (_) {}
    prompt    = config.prompt || 'Fill in the grid:';
    inputHtml = renderGridInputs(q, config);
  } else {
    prompt = q.question_text;
    if (q.type === 'multiple_choice') {
      inputHtml = `<div class="answer-options">
        ${(q.answers || []).map(a => `
          <label class="answer-option">
            <input type="radio" name="q_${q.id}" value="${a.id}" />
            <span class="answer-text">${escHtml(a.answer_text)}</span>
          </label>
        `).join('')}
      </div>`;
    } else {
      inputHtml = `<div class="short-answer-wrap">
        <input type="text" name="q_${q.id}" class="short-answer-field"
               placeholder="Type your answer…" autocomplete="off" />
      </div>`;
    }
  }

  return `
    <div class="question-card" id="q-${q.id}">
      <div class="question-card-header">
        <span class="question-number">Q${idx + 1}</span>
        <span class="question-pts-tag">${q.points || 1} pt${(q.points || 1) !== 1 ? 's' : ''}</span>
      </div>
      <div class="question-prompt">${escHtml(prompt)}</div>
      ${inputHtml}
    </div>`;
}

function renderGridInputs(q, config) {
  const { rows = 0, cols = 0, row_headers, col_headers, locked_cells = [], correct = [] } = config;
  const locked = new Set(locked_cells.map(([r, c]) => `${r},${c}`));

  let t = '<div class="grid-wrap"><table class="grid-table">';

  if (col_headers && col_headers.length) {
    t += '<thead><tr>';
    if (row_headers) t += '<th class="grid-corner"></th>';
    col_headers.forEach(h => { t += `<th class="grid-col-header">${escHtml(String(h))}</th>`; });
    t += '</tr></thead>';
  }

  t += '<tbody>';
  for (let r = 0; r < rows; r++) {
    t += '<tr>';
    if (row_headers) t += `<th class="grid-row-header">${escHtml(String(row_headers[r] ?? ''))}</th>`;
    for (let c = 0; c < cols; c++) {
      if (locked.has(`${r},${c}`)) {
        const val = correct[r] ? String(correct[r][c] ?? '') : '';
        t += `<td class="grid-cell grid-cell-locked"><span class="grid-locked-val">${escHtml(val)}</span></td>`;
      } else {
        t += `<td class="grid-cell"><input type="text" name="grid_${q.id}_${r}_${c}" class="grid-input" autocomplete="off" /></td>`;
      }
    }
    t += '</tr>';
  }
  t += '</tbody></table></div>';
  return t;
}

// ─── Result renderers ─────────────────────────────────────────────────────────

async function renderResultQuestion(q, idx, aa) {
  const correct   = !!(aa && aa.is_correct);
  const ptsEarned = aa ? parseFloat(aa.points_earned) : 0;
  const maxPts    = q.points || 1;
  let prompt, bodyHtml;

  if (q.type === 'grid') {
    let config = {};
    try { config = JSON.parse(q.question_text); } catch (_) {}
    prompt   = config.prompt || 'Fill in the grid:';
    bodyHtml = renderGridResult(config, aa);

  } else if (q.type === 'multiple_choice') {
    prompt = q.question_text;
    const answers = await sb(
      supabase.from('answers').select('*').eq('question_id', q.id).order('id')
    );
    const givenId  = aa ? parseInt(aa.answer_given) : null;
    const givenAns = answers.find(a => a.id === givenId);
    const rightAns = answers.find(a => a.is_correct);
    bodyHtml = `
      <div class="result-answer-row">
        <div class="result-answer-box ${correct ? 'box-correct' : 'box-wrong'}">
          <small>Your answer</small>
          <span>${escHtml(givenAns ? givenAns.answer_text : '(no answer)')}</span>
        </div>
        ${!correct && rightAns ? `
          <div class="result-answer-box box-correct">
            <small>Correct answer</small>
            <span>${escHtml(rightAns.answer_text)}</span>
          </div>` : ''}
      </div>`;

  } else {
    prompt = q.question_text;
    const rightAnswers = await sb(
      supabase.from('answers').select('*').eq('question_id', q.id).eq('is_correct', 1).limit(1)
    );
    const rightAns = rightAnswers[0] || null;
    bodyHtml = `
      <div class="result-answer-row">
        <div class="result-answer-box ${correct ? 'box-correct' : 'box-wrong'}">
          <small>Your answer</small>
          <span>${escHtml(aa?.answer_given || '(no answer)')}</span>
        </div>
        ${rightAns ? `
          <div class="result-answer-box box-correct">
            <small>Correct answer</small>
            <span>${escHtml(rightAns.answer_text)}</span>
          </div>` : ''}
      </div>`;
  }

  const ptsStr = ptsEarned % 1 === 0 ? String(ptsEarned) : ptsEarned.toFixed(1);
  return `
    <div class="result-q-card ${correct ? 'rq-correct' : 'rq-wrong'}">
      <div class="result-q-header">
        <span class="question-number">Q${idx + 1}</span>
        <span class="rq-verdict ${correct ? 'rq-ok' : 'rq-fail'}">${correct ? '✓' : '✗'}</span>
        <span class="rq-prompt-preview">${escHtml(prompt.slice(0, 90))}${prompt.length > 90 ? '…' : ''}</span>
        <span class="rq-pts ${correct ? 'rq-pts-ok' : 'rq-pts-fail'}">${ptsStr} / ${maxPts}</span>
      </div>
      <div class="result-q-body">${bodyHtml}</div>
    </div>`;
}

function renderGridResult(config, aa) {
  const { rows = 0, cols = 0, row_headers, col_headers, locked_cells = [], correct = [] } = config;
  const locked = new Set(locked_cells.map(([r, c]) => `${r},${c}`));
  let given = {};
  try { given = JSON.parse(aa?.answer_given || '{}'); } catch (_) {}

  let t = '<div class="grid-wrap"><table class="grid-table">';

  if (col_headers && col_headers.length) {
    t += '<thead><tr>';
    if (row_headers) t += '<th class="grid-corner"></th>';
    col_headers.forEach(h => { t += `<th class="grid-col-header">${escHtml(String(h))}</th>`; });
    t += '</tr></thead>';
  }

  t += '<tbody>';
  for (let r = 0; r < rows; r++) {
    t += '<tr>';
    if (row_headers) t += `<th class="grid-row-header">${escHtml(String(row_headers[r] ?? ''))}</th>`;
    for (let c = 0; c < cols; c++) {
      if (locked.has(`${r},${c}`)) {
        const val = correct[r] ? String(correct[r][c] ?? '') : '';
        t += `<td class="grid-cell grid-cell-locked"><span class="grid-locked-val">${escHtml(val)}</span></td>`;
      } else {
        const cellGiven    = (given[`${r}_${c}`] ?? '').trim();
        const cellExpected = (correct[r] ? String(correct[r][c] ?? '') : '').trim().toLowerCase();
        const cellOk       = cellGiven.toLowerCase() === cellExpected;
        t += `<td class="grid-cell grid-cell-result ${cellOk ? 'cell-correct' : 'cell-wrong'}">
          <span class="cell-given">${escHtml(cellGiven || '—')}</span>
          ${!cellOk ? `<span class="cell-expected">${escHtml(String(correct[r]?.[c] ?? ''))}</span>` : ''}
        </td>`;
      }
    }
    t += '</tr>';
  }
  t += '</tbody></table></div>';
  return t;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /tests/:id/take
router.get('/tests/:id/take', requireAuth, wrap(async (req, res) => {
  const test = await sb(
    supabase.from('tests').select('*').eq('id', req.params.id).maybeSingle()
  );
  if (!test) return res.status(404).send(
    page('Not Found', '<div class="empty-state"><p>Test not found.</p></div>', req.session.user)
  );

  const questions = await sb(
    supabase.from('questions').select('*').eq('test_id', test.id).order('order_index').order('id')
  );
  if (questions.length === 0) return res.redirect(`/tests/${test.id}`);

  const subject = await sb(
    supabase.from('subjects').select('*').eq('id', test.subject_id).maybeSingle()
  );

  // Reuse in-progress attempt (idempotent on refresh)
  const inProgress = await sb(
    supabase.from('test_attempts').select('*')
      .eq('test_id', test.id)
      .eq('user_id', req.session.user.id)
      .is('submitted_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
  );
  let attempt = inProgress[0] || null;

  if (!attempt) {
    const maxScore = questions.reduce((s, qi) => s + (qi.points || 1), 0);
    attempt = await sb(
      supabase.from('test_attempts')
        .insert({ test_id: test.id, user_id: req.session.user.id, score: 0, max_score: maxScore })
        .select('*')
        .single()
    );
  }

  // Attach answer choices for MC questions
  const questionsWithData = await Promise.all(questions.map(async qi => ({
    ...qi,
    answers: qi.type === 'multiple_choice'
      ? await sb(supabase.from('answers').select('*').eq('question_id', qi.id).order('id'))
      : [],
  })));

  const timerHtml = test.time_limit_minutes ? `
    <div id="timer-pill"
         data-attempt-id="${attempt.id}"
         data-limit-seconds="${test.time_limit_minutes * 60}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
      </svg>
      <span id="timer-display">${test.time_limit_minutes}:00</span>
    </div>` : '';

  res.send(page(test.title, `
    <div class="breadcrumb">
      <a href="/" class="breadcrumb-link">Home</a>
      <span class="breadcrumb-sep">›</span>
      <a href="/subjects/${subject.id}" class="breadcrumb-link">${escHtml(subject.title)}</a>
      <span class="breadcrumb-sep">›</span>
      <a href="/tests/${test.id}" class="breadcrumb-link">${escHtml(test.title)}</a>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">Take Test</span>
    </div>

    ${timerHtml}

    <div class="test-take-header">
      <h1 class="test-take-title">${escHtml(test.title)}</h1>
      <p class="test-take-meta">${questions.length} questions · ${attempt.max_score} points total</p>
    </div>

    <form id="test-form" method="POST" action="/tests/${test.id}/submit">
      <input type="hidden" name="attempt_id" value="${attempt.id}" />

      <div class="questions-list">
        ${questionsWithData.map((qi, i) => renderQuestion(qi, i)).join('')}
      </div>

      <div class="test-sticky-bar">
        <span class="sticky-bar-meta">${questions.length} questions · ${attempt.max_score} pts</span>
        <button type="submit" id="submit-btn" class="btn btn-primary btn-lg">Submit Test</button>
      </div>
    </form>
  `, req.session.user, { extraScripts: ['/test.js'] }));
}));

// POST /tests/:id/submit
router.post('/tests/:id/submit', requireAuth, wrap(async (req, res) => {
  const attemptId = parseInt(req.body.attempt_id);
  if (!attemptId) return res.redirect('/');

  const attempt = await sb(
    supabase.from('test_attempts').select('*')
      .eq('id', attemptId)
      .eq('user_id', req.session.user.id)
      .is('submitted_at', null)
      .maybeSingle()
  );
  if (!attempt) return res.redirect('/');

  const questions = await sb(
    supabase.from('questions').select('*').eq('test_id', attempt.test_id).order('order_index').order('id')
  );

  let totalScore = 0;

  for (const q of questions) {
    let given = '';
    let isCorrect = 0;
    let pointsEarned = 0;

    if (q.type === 'multiple_choice') {
      given = req.body[`q_${q.id}`] || '';
      const answerId = parseInt(given);
      if (answerId) {
        const ans = await sb(
          supabase.from('answers').select('*').eq('id', answerId).eq('question_id', q.id).maybeSingle()
        );
        if (ans && ans.is_correct) { isCorrect = 1; pointsEarned = q.points || 1; }
      }

    } else if (q.type === 'short_answer') {
      given = (req.body[`q_${q.id}`] || '').trim();
      const rightAnswers = await sb(
        supabase.from('answers').select('*').eq('question_id', q.id).eq('is_correct', 1).limit(1)
      );
      const rightAns = rightAnswers[0] || null;
      if (rightAns && given.toLowerCase() === rightAns.answer_text.trim().toLowerCase()) {
        isCorrect = 1; pointsEarned = q.points || 1;
      }

    } else if (q.type === 'grid') {
      let config = {};
      try { config = JSON.parse(q.question_text); } catch (_) {}
      const { rows: gridRows = 0, cols: gridCols = 0, locked_cells = [], correct = [] } = config;
      const locked = new Set(locked_cells.map(([r, c]) => `${r},${c}`));
      const givenCells = {};
      let okCells = 0;
      let totalCells = 0;

      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          if (locked.has(`${r},${c}`)) continue;
          totalCells++;
          const cellVal  = (req.body[`grid_${q.id}_${r}_${c}`] || '').trim();
          givenCells[`${r}_${c}`] = cellVal;
          const expected = (correct[r] ? String(correct[r][c] ?? '') : '').trim().toLowerCase();
          if (cellVal.toLowerCase() === expected) okCells++;
        }
      }

      given        = JSON.stringify(givenCells);
      pointsEarned = totalCells > 0
        ? Math.round((okCells / totalCells) * (q.points || 1) * 100) / 100
        : 0;
      isCorrect    = (totalCells > 0 && okCells === totalCells) ? 1 : 0;
    }

    totalScore += pointsEarned;
    await sb(
      supabase.from('attempt_answers').insert({
        attempt_id: attempt.id,
        question_id: q.id,
        answer_given: given,
        is_correct: isCorrect,
        points_earned: pointsEarned,
      })
    );
  }

  await sb(
    supabase.from('test_attempts')
      .update({ score: Math.round(totalScore * 100) / 100, submitted_at: new Date().toISOString() })
      .eq('id', attempt.id)
  );

  res.redirect(`/tests/${req.params.id}/result/${attempt.id}`);
}));

// GET /tests/:id/result/:aid
router.get('/tests/:id/result/:aid', requireAuth, wrap(async (req, res) => {
  const attempt = await sb(
    supabase.from('test_attempts').select('*')
      .eq('id', req.params.aid)
      .eq('user_id', req.session.user.id)
      .maybeSingle()
  );
  if (!attempt) return res.redirect('/');

  const test    = await sb(supabase.from('tests').select('*').eq('id', attempt.test_id).maybeSingle());
  const subject = await sb(supabase.from('subjects').select('*').eq('id', test.subject_id).maybeSingle());
  const [questions, aaRows] = await Promise.all([
    sb(supabase.from('questions').select('*').eq('test_id', test.id).order('order_index').order('id')),
    sb(supabase.from('attempt_answers').select('*').eq('attempt_id', attempt.id)),
  ]);

  const answerMap = Object.fromEntries(aaRows.map(a => [a.question_id, a]));
  const pct   = attempt.max_score > 0
    ? Math.round((attempt.score / attempt.max_score) * 100)
    : 0;
  const grade = getGrade(pct);
  const gradeColor = { A: '#5C7A5C', B: '#27ae60', C: '#d4a017', D: '#e67e22', F: '#e74c3c' }[grade];

  const reviewHtml = (
    await Promise.all(questions.map((q, i) => renderResultQuestion(q, i, answerMap[q.id])))
  ).join('');

  res.send(page('Results — ' + test.title, `
    <div class="breadcrumb">
      <a href="/" class="breadcrumb-link">Home</a>
      <span class="breadcrumb-sep">›</span>
      <a href="/subjects/${subject.id}" class="breadcrumb-link">${escHtml(subject.title)}</a>
      <span class="breadcrumb-sep">›</span>
      <a href="/tests/${test.id}" class="breadcrumb-link">${escHtml(test.title)}</a>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">Results</span>
    </div>

    <div class="results-hero">
      <div class="score-circle-wrap">
        <svg viewBox="0 0 120 120" class="score-svg">
          <circle cx="60" cy="60" r="50" class="score-track" />
          <circle cx="60" cy="60" r="50" class="score-fill"
                  data-pct="${pct}"
                  style="stroke:${gradeColor}" />
        </svg>
        <div class="score-overlay">
          <span class="score-pct-text">${pct}%</span>
          <span class="score-grade-text" style="color:${gradeColor}">${grade}</span>
          <span class="score-fraction-text">${attempt.score} / ${attempt.max_score}</span>
        </div>
      </div>
      <div class="results-hero-right">
        <h1 class="results-verdict">${pct >= 60 ? 'Well done!' : 'Keep practicing'}</h1>
        <p class="results-test-name">${escHtml(test.title)}</p>
        <div class="results-stat-row">
          <div class="stat-box"><span class="stat-value">${questions.length}</span><span class="stat-label">Questions</span></div>
          <div class="stat-box"><span class="stat-value">${aaRows.filter(a => a.is_correct).length}</span><span class="stat-label">Correct</span></div>
          <div class="stat-box"><span class="stat-value">${attempt.score}</span><span class="stat-label">Points</span></div>
        </div>
        <div class="results-actions-inline">
          <a href="/tests/${test.id}" class="btn btn-secondary">Retake</a>
          <a href="/subjects/${subject.id}" class="btn btn-primary">Back to Subject</a>
        </div>
      </div>
    </div>

    <div class="result-review">
      <h2 class="section-heading" style="margin-bottom:16px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        Question Review
      </h2>
      ${reviewHtml}
    </div>
  `, req.session.user, { extraScripts: ['/math-toolbar.js', '/test.js'] }));
}));

// GET /attempts — history
router.get('/attempts', requireAuth, wrap(async (req, res) => {
  const myAttempts = await sb(
    supabase.from('test_attempts').select('*')
      .eq('user_id', req.session.user.id)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false })
  );

  let attempts = [];
  if (myAttempts.length > 0) {
    const testIds = [...new Set(myAttempts.map(a => a.test_id))];
    const tests = await sb(supabase.from('tests').select('id, title, subject_id').in('id', testIds));

    const subjectIds = [...new Set(tests.map(t => t.subject_id))];
    const subjects = await sb(supabase.from('subjects').select('id, title').in('id', subjectIds));

    const testMap    = Object.fromEntries(tests.map(t => [t.id, t]));
    const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]));

    attempts = myAttempts.map(a => ({
      ...a,
      test_title:    testMap[a.test_id]?.title || '',
      subject_id:    testMap[a.test_id]?.subject_id,
      subject_title: subjectMap[testMap[a.test_id]?.subject_id]?.title || '',
    }));
  }

  const rowsHtml = attempts.length === 0
    ? `<tr><td colspan="7" class="empty-td">
         No attempts yet — take a test to see your history here.
       </td></tr>`
    : attempts.map(a => {
        const pct   = a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : 0;
        const grade = getGrade(pct);
        const ok    = pct >= 60;
        return `<tr>
          <td><a href="/tests/${a.test_id}" class="subject-inline-link">${escHtml(a.test_title)}</a></td>
          <td>${escHtml(a.subject_title)}</td>
          <td><strong>${a.score} / ${a.max_score}</strong></td>
          <td><span class="badge ${ok ? 'badge-success' : 'badge-fail'}">${pct}%</span></td>
          <td><span class="grade-chip grade-${grade}">${grade}</span></td>
          <td>${new Date(a.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
          <td><a href="/tests/${a.test_id}/result/${a.id}" class="btn-link">View →</a></td>
        </tr>`;
      }).join('');

  res.send(page('My Attempts', `
    <div class="page-header">
      <h1 class="page-title">My Attempts</h1>
      <p class="page-subtitle">Your complete test history — all submitted attempts.</p>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Test</th><th>Subject</th><th>Score</th>
          <th>%</th><th>Grade</th><th>Date</th><th></th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `, req.session.user));
}));

module.exports = router;
