const express = require('express');
const pool = require('../db/database');
const { page, escHtml } = require('../lib/render');

const router = express.Router();

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

const TYPE_LABELS = { lesson: 'Lesson', note: 'Note', resource: 'Resource' };
const TYPE_ICONS = {
  lesson: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  resource: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
};

// ── GET / — Home ──────────────────────────────────────────────────────────────
router.get('/', requireAuth, wrap(async (req, res) => {
  const { rows: subjects } = await pool.query(
    'SELECT * FROM subjects ORDER BY order_index, created_at'
  );
  const { rows: matCounts } = await pool.query(
    'SELECT subject_id, COUNT(*) AS count FROM materials GROUP BY subject_id'
  );
  const { rows: testCounts } = await pool.query(
    'SELECT subject_id, COUNT(*) AS count FROM tests GROUP BY subject_id'
  );

  const countMap = Object.fromEntries(matCounts.map(r => [r.subject_id, parseInt(r.count)]));
  const testMap  = Object.fromEntries(testCounts.map(r => [r.subject_id, parseInt(r.count)]));

  const cardsHtml = subjects.length === 0
    ? `<div class="empty-state">
        <p>No subjects yet.</p>
        ${req.session.user.role === 'admin' ? '<a href="/admin" class="btn btn-primary">Add subjects in Admin</a>' : ''}
       </div>`
    : subjects.map(s => `
      <a href="/subjects/${s.id}" class="subject-card" style="--subject-color: ${escHtml(s.color)}">
        <div class="subject-color-bar"></div>
        <div class="subject-card-body">
          <h2 class="subject-card-title">${escHtml(s.title)}</h2>
          <p class="subject-card-desc">${escHtml(s.description || '')}</p>
          <div class="subject-card-meta">
            <span class="meta-chip">${countMap[s.id] || 0} materials</span>
            <span class="meta-chip">${testMap[s.id] || 0} tests</span>
          </div>
        </div>
      </a>
    `).join('');

  res.send(page('Home', `
    <div class="page-header">
      <h1 class="page-title">Your Curriculum</h1>
      <p class="page-subtitle">Browse subjects, read materials, and take tests to track your progress.</p>
    </div>
    <div class="subjects-grid">${cardsHtml}</div>
  `, req.session.user));
}));

router.get('/subjects', requireAuth, (req, res) => res.redirect('/'));

// ── GET /subjects/:id ─────────────────────────────────────────────────────────
router.get('/subjects/:id', requireAuth, wrap(async (req, res) => {
  const { rows: [subject] } = await pool.query(
    'SELECT * FROM subjects WHERE id = $1', [req.params.id]
  );
  if (!subject) return res.status(404).send(
    page('Not Found', '<div class="empty-state"><p>Subject not found.</p></div>', req.session.user)
  );

  const { rows: materials } = await pool.query(
    'SELECT * FROM materials WHERE subject_id = $1 ORDER BY order_index, created_at',
    [subject.id]
  );
  const { rows: tests } = await pool.query(
    'SELECT * FROM tests WHERE subject_id = $1 ORDER BY created_at', [subject.id]
  );

  const byType = { lesson: [], note: [], resource: [] };
  materials.forEach(m => { (byType[m.type] || byType.lesson).push(m); });

  const renderSection = (label, items, icon) => {
    if (items.length === 0) return '';
    return `
      <div class="material-section">
        <h3 class="section-heading">${icon} ${label}s</h3>
        <ul class="material-list">
          ${items.map(m => `
            <li class="material-item">
              <a href="/materials/${m.id}" class="material-link">
                <span class="material-title">${escHtml(m.title)}</span>
                <svg class="material-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
              </a>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  };

  const testsHtml = tests.length === 0 ? '' : `
    <div class="material-section">
      <h3 class="section-heading">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Tests
      </h3>
      <ul class="material-list">
        ${tests.map(t => `
          <li class="material-item">
            <a href="/tests/${t.id}" class="material-link">
              <span class="material-title">${escHtml(t.title)}</span>
              ${t.time_limit_minutes ? `<span class="time-badge">${t.time_limit_minutes} min</span>` : ''}
              <svg class="material-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
            </a>
          </li>
        `).join('')}
      </ul>
    </div>
  `;

  res.send(page(subject.title, `
    <div class="subject-hero" style="--subject-color: ${escHtml(subject.color)}">
      <div class="subject-hero-bar"></div>
      <div class="subject-hero-content">
        <h1 class="subject-hero-title">${escHtml(subject.title)}</h1>
        ${subject.description ? `<p class="subject-hero-desc">${escHtml(subject.description)}</p>` : ''}
      </div>
    </div>
    <div class="subject-content">
      ${materials.length === 0 && tests.length === 0
        ? '<div class="empty-state"><p>No materials available yet for this subject.</p></div>'
        : `${renderSection('Lesson', byType.lesson, TYPE_ICONS.lesson)}
           ${renderSection('Note', byType.note, TYPE_ICONS.note)}
           ${renderSection('Resource', byType.resource, TYPE_ICONS.resource)}
           ${testsHtml}`
      }
    </div>
  `, req.session.user));
}));

// ── GET /materials/:id ────────────────────────────────────────────────────────
router.get('/materials/:id', requireAuth, wrap(async (req, res) => {
  const { rows: [material] } = await pool.query(
    'SELECT * FROM materials WHERE id = $1', [req.params.id]
  );
  if (!material) return res.status(404).send(
    page('Not Found', '<div class="empty-state"><p>Material not found.</p></div>', req.session.user)
  );

  const { rows: [subject] } = await pool.query(
    'SELECT * FROM subjects WHERE id = $1', [material.subject_id]
  );
  const { rows: siblings } = await pool.query(
    'SELECT id, title, type, order_index FROM materials WHERE subject_id = $1 ORDER BY order_index, created_at',
    [material.subject_id]
  );

  const idx = siblings.findIndex(s => s.id === material.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const typeLabel = TYPE_LABELS[material.type] || 'Material';
  const typeIcon  = TYPE_ICONS[material.type] || TYPE_ICONS.lesson;

  res.send(page(material.title, `
    <div class="breadcrumb">
      <a href="/" class="breadcrumb-link">Home</a>
      <span class="breadcrumb-sep">›</span>
      <a href="/subjects/${subject.id}" class="breadcrumb-link">${escHtml(subject.title)}</a>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${escHtml(material.title)}</span>
    </div>

    <article class="material-article">
      <header class="material-header">
        <div class="material-type-badge">${typeIcon} ${typeLabel}</div>
        <h1 class="material-article-title">${escHtml(material.title)}</h1>
        <div class="material-meta-bar">
          <span>From <a href="/subjects/${subject.id}" class="subject-inline-link">${escHtml(subject.title)}</a></span>
          <span class="meta-dot">·</span>
          <span>${new Date(material.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </header>
      <div class="prose" id="material-content"></div>
    </article>

    <nav class="material-nav">
      ${prev ? `
        <a href="/materials/${prev.id}" class="material-nav-btn prev">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
          <span><small>Previous</small>${escHtml(prev.title)}</span>
        </a>` : '<div></div>'}
      ${next ? `
        <a href="/materials/${next.id}" class="material-nav-btn next">
          <span><small>Next</small>${escHtml(next.title)}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
        </a>` : '<div></div>'}
    </nav>

    <script>
      const raw = ${JSON.stringify(material.content || '')};
      const container = document.getElementById('material-content');
      if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
        container.innerHTML = marked.parse(raw);
      } else {
        container.textContent = raw;
      }
      if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      }
    </script>
  `, req.session.user));
}));

// ── GET /tests/:id ────────────────────────────────────────────────────────────
router.get('/tests/:id', requireAuth, wrap(async (req, res) => {
  const { rows: [test] } = await pool.query(
    'SELECT * FROM tests WHERE id = $1', [req.params.id]
  );
  if (!test) return res.status(404).send(
    page('Not Found', '<div class="empty-state"><p>Test not found.</p></div>', req.session.user)
  );

  const { rows: [subject] } = await pool.query(
    'SELECT * FROM subjects WHERE id = $1', [test.subject_id]
  );
  const { rows: questions } = await pool.query(
    'SELECT * FROM questions WHERE test_id = $1 ORDER BY order_index', [test.id]
  );
  const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);

  const { rows: pastAttempts } = await pool.query(
    'SELECT * FROM test_attempts WHERE test_id = $1 AND user_id = $2 ORDER BY submitted_at DESC',
    [test.id, req.session.user.id]
  );
  const bestScore = pastAttempts.length > 0
    ? Math.max(...pastAttempts.map(a => a.score))
    : null;

  const attemptsHtml = pastAttempts.length === 0 ? '' : `
    <div class="attempts-history">
      <h3 class="section-heading-sm">Your past attempts</h3>
      <table class="data-table">
        <thead><tr><th>Date</th><th>Score</th><th>Result</th></tr></thead>
        <tbody>
          ${pastAttempts.map(a => {
            const pct = a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : 0;
            const passed = pct >= 50;
            return `<tr>
              <td>${new Date(a.submitted_at || a.started_at).toLocaleDateString()}</td>
              <td>${a.score} / ${a.max_score}</td>
              <td><span class="badge ${passed ? 'badge-success' : 'badge-fail'}">${pct}%</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  res.send(page(test.title, `
    <div class="breadcrumb">
      <a href="/" class="breadcrumb-link">Home</a>
      <span class="breadcrumb-sep">›</span>
      <a href="/subjects/${subject.id}" class="breadcrumb-link">${escHtml(subject.title)}</a>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${escHtml(test.title)}</span>
    </div>

    <div class="test-intro">
      <div class="test-intro-header">
        <div class="material-type-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Test
        </div>
        <h1 class="material-article-title">${escHtml(test.title)}</h1>
        ${test.description ? `<p class="test-description">${escHtml(test.description)}</p>` : ''}
      </div>
      <div class="test-stats">
        <div class="stat-box"><span class="stat-value">${questions.length}</span><span class="stat-label">Questions</span></div>
        <div class="stat-box"><span class="stat-value">${totalPoints}</span><span class="stat-label">Total Points</span></div>
        ${test.time_limit_minutes ? `<div class="stat-box"><span class="stat-value">${test.time_limit_minutes}</span><span class="stat-label">Minutes</span></div>` : ''}
        ${bestScore !== null ? `<div class="stat-box"><span class="stat-value">${bestScore}</span><span class="stat-label">Best Score</span></div>` : ''}
      </div>
      ${questions.length > 0
        ? `<form method="POST" action="/tests/${test.id}/start"><button type="submit" class="btn btn-primary btn-lg">Begin Test</button></form>`
        : `<div class="alert alert-info">This test has no questions yet.</div>`
      }
    </div>
    ${attemptsHtml}
  `, req.session.user));
}));

// ── POST /tests/:id/start ─────────────────────────────────────────────────────
router.post('/tests/:id/start', requireAuth, wrap(async (req, res) => {
  const { rows: [test] } = await pool.query(
    'SELECT * FROM tests WHERE id = $1', [req.params.id]
  );
  if (!test) return res.redirect('/');

  const { rows: questions } = await pool.query(
    'SELECT * FROM questions WHERE test_id = $1', [test.id]
  );
  if (questions.length === 0) return res.redirect(`/tests/${test.id}`);

  const maxScore = questions.reduce((s, q) => s + (q.points || 1), 0);
  const { rows: [attempt] } = await pool.query(
    'INSERT INTO test_attempts (test_id, user_id, score, max_score) VALUES ($1, $2, 0, $3) RETURNING id',
    [test.id, req.session.user.id, maxScore]
  );
  res.redirect(`/attempts/${attempt.id}`);
}));

// ── GET /attempts/:id — Take test ─────────────────────────────────────────────
router.get('/attempts/:id', requireAuth, wrap(async (req, res) => {
  const { rows: [attempt] } = await pool.query(
    'SELECT * FROM test_attempts WHERE id = $1 AND user_id = $2',
    [req.params.id, req.session.user.id]
  );
  if (!attempt) return res.redirect('/');
  if (attempt.submitted_at) return res.redirect(`/attempts/${attempt.id}/result`);

  const { rows: [test] } = await pool.query(
    'SELECT * FROM tests WHERE id = $1', [attempt.test_id]
  );
  const { rows: questions } = await pool.query(
    'SELECT * FROM questions WHERE test_id = $1 ORDER BY order_index', [test.id]
  );

  const questionsWithAnswers = await Promise.all(questions.map(async q => ({
    ...q,
    answers: q.type === 'multiple_choice'
      ? (await pool.query('SELECT * FROM answers WHERE question_id = $1', [q.id])).rows
      : [],
  })));

  const timerHtml = test.time_limit_minutes ? `
    <div class="test-timer" id="timer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
      <span id="timer-display">${test.time_limit_minutes}:00</span>
    </div>` : '';

  const renderQuestion = (q, idx) => {
    const inputHtml = q.type === 'multiple_choice'
      ? `<div class="answer-options">
          ${q.answers.map(a => `
            <label class="answer-option">
              <input type="radio" name="q_${q.id}" value="${a.id}" />
              <span class="answer-text">${escHtml(a.answer_text)}</span>
            </label>
          `).join('')}
         </div>`
      : `<textarea name="q_${q.id}" class="short-answer-input" rows="3" placeholder="Write your answer here…"></textarea>`;

    return `
      <div class="question-block" id="q-block-${q.id}">
        <div class="question-header">
          <span class="question-number">Q${idx + 1}</span>
          <span class="question-points">${q.points || 1} pt${(q.points || 1) !== 1 ? 's' : ''}</span>
        </div>
        <p class="question-text">${escHtml(q.question_text)}</p>
        ${inputHtml}
      </div>
    `;
  };

  res.send(page(test.title, `
    <div class="test-take-header">
      <div>
        <h1 class="test-take-title">${escHtml(test.title)}</h1>
        <p class="test-take-meta">${questions.length} questions · ${attempt.max_score} points</p>
      </div>
      ${timerHtml}
    </div>

    <form method="POST" action="/attempts/${attempt.id}/submit" id="test-form">
      <div class="questions-list">
        ${questionsWithAnswers.map((q, i) => renderQuestion(q, i)).join('')}
      </div>
      <div class="test-submit-bar">
        <button type="submit" class="btn btn-primary btn-lg">Submit Test</button>
      </div>
    </form>

    ${test.time_limit_minutes ? `
      <script>
        let seconds = ${test.time_limit_minutes * 60};
        const display = document.getElementById('timer-display');
        const interval = setInterval(() => {
          seconds--;
          if (seconds <= 0) { clearInterval(interval); document.getElementById('test-form').submit(); return; }
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          display.textContent = m + ':' + String(s).padStart(2, '0');
          if (seconds <= 60) display.closest('.test-timer').classList.add('timer-urgent');
        }, 1000);
      </script>` : ''}
  `, req.session.user));
}));

// ── POST /attempts/:id/submit ─────────────────────────────────────────────────
router.post('/attempts/:id/submit', requireAuth, wrap(async (req, res) => {
  const { rows: [attempt] } = await pool.query(
    'SELECT * FROM test_attempts WHERE id = $1 AND user_id = $2',
    [req.params.id, req.session.user.id]
  );
  if (!attempt || attempt.submitted_at) return res.redirect('/');

  const { rows: questions } = await pool.query(
    'SELECT * FROM questions WHERE test_id = $1 ORDER BY order_index', [attempt.test_id]
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let totalScore = 0;

    for (const q of questions) {
      const given = req.body[`q_${q.id}`] || '';
      let isCorrect = 0;
      let pointsEarned = 0;

      if (q.type === 'multiple_choice') {
        const answerId = parseInt(given);
        if (answerId) {
          const { rows: [answer] } = await client.query(
            'SELECT * FROM answers WHERE id = $1 AND question_id = $2', [answerId, q.id]
          );
          if (answer && answer.is_correct) {
            isCorrect = 1;
            pointsEarned = q.points || 1;
          }
        }
      }

      totalScore += pointsEarned;
      await client.query(
        'INSERT INTO attempt_answers (attempt_id, question_id, answer_given, is_correct, points_earned) VALUES ($1,$2,$3,$4,$5)',
        [attempt.id, q.id, given, isCorrect, pointsEarned]
      );
    }

    await client.query(
      'UPDATE test_attempts SET score = $1, submitted_at = NOW() WHERE id = $2',
      [totalScore, attempt.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.redirect(`/attempts/${attempt.id}/result`);
}));

// ── GET /attempts/:id/result ──────────────────────────────────────────────────
router.get('/attempts/:id/result', requireAuth, wrap(async (req, res) => {
  const { rows: [attempt] } = await pool.query(
    'SELECT * FROM test_attempts WHERE id = $1 AND user_id = $2',
    [req.params.id, req.session.user.id]
  );
  if (!attempt) return res.redirect('/');

  const { rows: [test] } = await pool.query('SELECT * FROM tests WHERE id = $1', [attempt.test_id]);
  const { rows: [subject] } = await pool.query('SELECT * FROM subjects WHERE id = $1', [test.subject_id]);
  const { rows: questions } = await pool.query(
    'SELECT * FROM questions WHERE test_id = $1 ORDER BY order_index', [test.id]
  );
  const { rows: attemptAnswers } = await pool.query(
    'SELECT * FROM attempt_answers WHERE attempt_id = $1', [attempt.id]
  );

  const answerMap = Object.fromEntries(attemptAnswers.map(a => [a.question_id, a]));
  const pct = attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0;
  const passed = pct >= 50;

  const reviewHtml = (await Promise.all(questions.map(async (q, i) => {
    const aa = answerMap[q.id];
    let givenText = aa ? aa.answer_given : '—';

    if (q.type === 'multiple_choice' && aa?.answer_given) {
      const { rows: [ans] } = await pool.query(
        'SELECT * FROM answers WHERE id = $1', [parseInt(aa.answer_given)]
      );
      if (ans) givenText = ans.answer_text;
    }

    const correctAnswer = q.type === 'multiple_choice'
      ? (await pool.query('SELECT * FROM answers WHERE question_id = $1 AND is_correct = 1', [q.id])).rows[0]
      : null;

    const correct = aa && aa.is_correct;
    return `
      <div class="result-question ${correct ? 'result-correct' : 'result-wrong'}">
        <div class="result-q-header">
          <span class="question-number">Q${i + 1}</span>
          <span class="result-icon">${correct ? '✓' : '✗'}</span>
          <span class="result-pts">${aa ? aa.points_earned : 0} / ${q.points || 1}</span>
        </div>
        <p class="question-text">${escHtml(q.question_text)}</p>
        <div class="result-answer-row">
          <div class="result-answer-box ${correct ? 'correct' : 'wrong'}">
            <small>Your answer</small>
            <span>${escHtml(givenText || '(no answer)')}</span>
          </div>
          ${!correct && correctAnswer ? `
            <div class="result-answer-box correct">
              <small>Correct answer</small>
              <span>${escHtml(correctAnswer.answer_text)}</span>
            </div>` : ''}
        </div>
      </div>
    `;
  }))).join('');

  res.send(page('Test Result', `
    <div class="breadcrumb">
      <a href="/" class="breadcrumb-link">Home</a>
      <span class="breadcrumb-sep">›</span>
      <a href="/subjects/${subject.id}" class="breadcrumb-link">${escHtml(subject.title)}</a>
      <span class="breadcrumb-sep">›</span>
      <a href="/tests/${test.id}" class="breadcrumb-link">${escHtml(test.title)}</a>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">Result</span>
    </div>

    <div class="result-hero ${passed ? 'result-pass' : 'result-fail'}">
      <div class="result-score-circle">
        <span class="result-pct">${pct}%</span>
        <span class="result-fraction">${attempt.score} / ${attempt.max_score}</span>
      </div>
      <div class="result-verdict">
        <h1>${passed ? 'Well done!' : 'Keep practicing'}</h1>
        <p>${escHtml(test.title)}</p>
      </div>
    </div>

    <div class="result-review">
      <h2 class="section-heading-sm">Question Review</h2>
      ${reviewHtml}
    </div>

    <div class="result-actions">
      <a href="/tests/${test.id}" class="btn btn-secondary">Retake Test</a>
      <a href="/subjects/${subject.id}" class="btn btn-primary">Back to Subject</a>
    </div>
  `, req.session.user));
}));

// ── GET /admin ────────────────────────────────────────────────────────────────
router.get('/admin', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');

  const { rows: subjects } = await pool.query('SELECT * FROM subjects ORDER BY order_index, created_at');
  const [userCount, materialCount, testCount, attemptCount] = await Promise.all([
    pool.query('SELECT COUNT(*) AS count FROM users'),
    pool.query('SELECT COUNT(*) AS count FROM materials'),
    pool.query('SELECT COUNT(*) AS count FROM tests'),
    pool.query('SELECT COUNT(*) AS count FROM test_attempts WHERE submitted_at IS NOT NULL'),
  ]);

  res.send(page('Admin Dashboard', `
    <div class="page-header">
      <h1 class="page-title">Admin Dashboard</h1>
      <p class="page-subtitle">Manage subjects, materials, tests, and users.</p>
    </div>

    <div class="stats-row">
      <div class="stat-card"><span class="stat-card-value">${subjects.length}</span><span class="stat-card-label">Subjects</span></div>
      <div class="stat-card"><span class="stat-card-value">${parseInt(materialCount.rows[0].count)}</span><span class="stat-card-label">Materials</span></div>
      <div class="stat-card"><span class="stat-card-value">${parseInt(testCount.rows[0].count)}</span><span class="stat-card-label">Tests</span></div>
      <div class="stat-card"><span class="stat-card-value">${parseInt(userCount.rows[0].count)}</span><span class="stat-card-label">Users</span></div>
      <div class="stat-card"><span class="stat-card-value">${parseInt(attemptCount.rows[0].count)}</span><span class="stat-card-label">Submissions</span></div>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <h2 class="admin-section-title">Subjects</h2>
        <a href="/admin/subjects/new" class="btn btn-primary btn-sm">+ New Subject</a>
      </div>
      ${subjects.length === 0
        ? '<div class="empty-state"><p>No subjects yet.</p></div>'
        : `<table class="data-table">
            <thead><tr><th>Title</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>
              ${subjects.map(s => `
                <tr>
                  <td><strong>${escHtml(s.title)}</strong></td>
                  <td class="text-muted">${escHtml((s.description || '').slice(0, 80))}${(s.description || '').length > 80 ? '…' : ''}</td>
                  <td class="action-cell">
                    <a href="/admin/subjects/${s.id}/edit" class="btn-link">Edit</a>
                    <a href="/admin/subjects/${s.id}/materials/new" class="btn-link">+ Material</a>
                    <a href="/admin/subjects/${s.id}/tests/new" class="btn-link">+ Test</a>
                    <form method="POST" action="/admin/subjects/${s.id}/delete" style="display:inline" onsubmit="return confirm('Delete subject and all its content?')">
                      <button type="submit" class="btn-link btn-link-danger">Delete</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
      }
    </div>
  `, req.session.user));
}));

// ── Subject CRUD ──────────────────────────────────────────────────────────────
router.get('/admin/subjects/new', requireAuth, (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  res.send(page('New Subject', subjectForm(null, '/admin/subjects', 'Create Subject'), req.session.user));
});

router.post('/admin/subjects', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  const { title, description, color, order_index } = req.body;
  await pool.query(
    'INSERT INTO subjects (title, description, color, order_index) VALUES ($1,$2,$3,$4)',
    [title, description || null, color || '#5C7A5C', parseInt(order_index) || 0]
  );
  res.redirect('/admin');
}));

router.get('/admin/subjects/:id/edit', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  const { rows: [subject] } = await pool.query('SELECT * FROM subjects WHERE id = $1', [req.params.id]);
  if (!subject) return res.redirect('/admin');
  res.send(page('Edit Subject', subjectForm(subject, `/admin/subjects/${subject.id}`, 'Save Changes'), req.session.user));
}));

router.post('/admin/subjects/:id', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  const { title, description, color, order_index } = req.body;
  await pool.query(
    'UPDATE subjects SET title=$1, description=$2, color=$3, order_index=$4 WHERE id=$5',
    [title, description || null, color || '#5C7A5C', parseInt(order_index) || 0, req.params.id]
  );
  res.redirect('/admin');
}));

router.post('/admin/subjects/:id/delete', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  await pool.query('DELETE FROM subjects WHERE id = $1', [req.params.id]);
  res.redirect('/admin');
}));

// ── Material CRUD ─────────────────────────────────────────────────────────────
router.get('/admin/subjects/:id/materials/new', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  const { rows: [subject] } = await pool.query('SELECT * FROM subjects WHERE id = $1', [req.params.id]);
  if (!subject) return res.redirect('/admin');
  res.send(page('New Material',
    materialForm(null, subject, `/admin/subjects/${subject.id}/materials`, 'Create Material'),
    req.session.user));
}));

router.post('/admin/subjects/:id/materials', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  const { title, content, type, order_index } = req.body;
  await pool.query(
    'INSERT INTO materials (subject_id, title, content, type, order_index) VALUES ($1,$2,$3,$4,$5)',
    [req.params.id, title, content || '', type || 'lesson', parseInt(order_index) || 0]
  );
  res.redirect(`/subjects/${req.params.id}`);
}));

// ── Test CRUD ─────────────────────────────────────────────────────────────────
router.get('/admin/subjects/:id/tests/new', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  const { rows: [subject] } = await pool.query('SELECT * FROM subjects WHERE id = $1', [req.params.id]);
  if (!subject) return res.redirect('/admin');
  res.send(page('New Test',
    testForm(null, subject, `/admin/subjects/${subject.id}/tests`, 'Create Test'),
    req.session.user));
}));

router.post('/admin/subjects/:id/tests', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  const { title, description, time_limit_minutes } = req.body;
  const { rows: [test] } = await pool.query(
    'INSERT INTO tests (subject_id, title, description, time_limit_minutes) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.params.id, title, description || null, time_limit_minutes ? parseInt(time_limit_minutes) : null]
  );
  res.redirect(`/admin/tests/${test.id}/questions`);
}));

// ── Question management ───────────────────────────────────────────────────────
router.get('/admin/tests/:id/questions', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  const { rows: [test] } = await pool.query('SELECT * FROM tests WHERE id = $1', [req.params.id]);
  if (!test) return res.redirect('/admin');
  const { rows: [subject] } = await pool.query('SELECT * FROM subjects WHERE id = $1', [test.subject_id]);
  const { rows: questions } = await pool.query(
    'SELECT * FROM questions WHERE test_id = $1 ORDER BY order_index', [test.id]
  );

  const questionsWithAnswers = await Promise.all(questions.map(async q => ({
    ...q,
    answers: (await pool.query('SELECT * FROM answers WHERE question_id = $1', [q.id])).rows,
  })));

  res.send(page('Manage Questions', `
    <div class="page-header">
      <div class="breadcrumb">
        <a href="/admin" class="breadcrumb-link">Admin</a>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">Questions: ${escHtml(test.title)}</span>
      </div>
      <h1 class="page-title">${escHtml(test.title)}</h1>
      <p class="page-subtitle">Subject: ${escHtml(subject.title)}</p>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <h2 class="admin-section-title">Questions (${questions.length})</h2>
      </div>
      ${questionsWithAnswers.map((q, i) => `
        <div class="question-admin-block">
          <div class="question-admin-header">
            <strong>Q${i + 1}: ${escHtml(q.question_text)}</strong>
            <span class="meta-chip">${q.type}</span>
            <span class="meta-chip">${q.points} pt${q.points !== 1 ? 's' : ''}</span>
            <form method="POST" action="/admin/questions/${q.id}/delete" style="display:inline">
              <button class="btn-link btn-link-danger" type="submit">Delete</button>
            </form>
          </div>
          ${q.type === 'multiple_choice'
            ? `<ul class="answer-admin-list">
                ${q.answers.map(a => `<li class="${a.is_correct ? 'answer-correct' : ''}">${escHtml(a.answer_text)} ${a.is_correct ? '✓' : ''}</li>`).join('')}
               </ul>`
            : '<p class="text-muted"><em>Short answer — manually graded</em></p>'}
        </div>
      `).join('')}
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <h2 class="admin-section-title">Add Question</h2>
      </div>
      <form method="POST" action="/admin/tests/${test.id}/questions" class="admin-form">
        <div class="form-group">
          <label class="form-label">Question Text</label>
          <textarea name="question_text" class="form-input" rows="3" required placeholder="Enter the question…"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select name="type" class="form-input" onchange="toggleAnswers(this.value)">
              <option value="multiple_choice">Multiple Choice</option>
              <option value="short_answer">Short Answer</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Points</label>
            <input type="number" name="points" class="form-input" value="1" min="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Order</label>
            <input type="number" name="order_index" class="form-input" value="${questions.length}" min="0" />
          </div>
        </div>
        <div id="answers-section">
          <label class="form-label">Answer Options (mark the correct one)</label>
          ${[1,2,3,4].map(n => `
            <div class="answer-input-row">
              <input type="radio" name="correct_answer" value="${n}" ${n === 1 ? 'required' : ''} />
              <input type="text" name="answer_${n}" class="form-input" placeholder="Option ${n}" />
            </div>
          `).join('')}
        </div>
        <button type="submit" class="btn btn-primary">Add Question</button>
      </form>
    </div>

    <div class="result-actions">
      <a href="/tests/${test.id}" class="btn btn-secondary">Preview Test</a>
      <a href="/admin" class="btn btn-primary">Done</a>
    </div>
    <script>
      function toggleAnswers(type) {
        document.getElementById('answers-section').style.display =
          type === 'multiple_choice' ? 'block' : 'none';
      }
    </script>
  `, req.session.user));
}));

router.post('/admin/tests/:id/questions', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/');
  const { question_text, type, points, order_index, correct_answer, answer_1, answer_2, answer_3, answer_4 } = req.body;

  const { rows: [q] } = await pool.query(
    'INSERT INTO questions (test_id, question_text, type, order_index, points) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [req.params.id, question_text, type || 'multiple_choice', parseInt(order_index) || 0, parseInt(points) || 1]
  );

  if (!type || type === 'multiple_choice') {
    const correctNum = parseInt(correct_answer) || 1;
    const opts = [answer_1, answer_2, answer_3, answer_4];
    for (let i = 0; i < opts.length; i++) {
      if (opts[i] && opts[i].trim()) {
        await pool.query(
          'INSERT INTO answers (question_id, answer_text, is_correct) VALUES ($1,$2,$3)',
          [q.id, opts[i].trim(), (i + 1) === correctNum ? 1 : 0]
        );
      }
    }
  }

  res.redirect(`/admin/tests/${req.params.id}/questions`);
}));

router.post('/admin/questions/:id/delete', requireAuth, wrap(async (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/admin');
  const { rows: [q] } = await pool.query('SELECT * FROM questions WHERE id = $1', [req.params.id]);
  if (q) {
    await pool.query('DELETE FROM questions WHERE id = $1', [q.id]);
    return res.redirect(`/admin/tests/${q.test_id}/questions`);
  }
  res.redirect('/admin');
}));

// ── Template helpers ──────────────────────────────────────────────────────────
function subjectForm(subject, action, submitLabel) {
  return `
    <div class="page-header">
      <h1 class="page-title">${subject ? 'Edit Subject' : 'New Subject'}</h1>
    </div>
    <form method="POST" action="${action}" class="admin-form">
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" name="title" class="form-input" value="${escHtml(subject?.title || '')}" required placeholder="Subject title" />
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea name="description" class="form-input" rows="3" placeholder="Brief description…">${escHtml(subject?.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Accent Color</label>
          <div class="color-input-row">
            <input type="color" name="color" class="color-picker" value="${escHtml(subject?.color || '#5C7A5C')}" />
            <input type="text" id="color-text" class="form-input" value="${escHtml(subject?.color || '#5C7A5C')}" placeholder="#5C7A5C" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Order Index</label>
          <input type="number" name="order_index" class="form-input" value="${subject?.order_index ?? 0}" min="0" />
        </div>
      </div>
      <div class="form-actions">
        <a href="/admin" class="btn btn-secondary">Cancel</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
    <script>
      const cp = document.querySelector('.color-picker');
      const ct = document.getElementById('color-text');
      cp.addEventListener('input', () => { ct.value = cp.value; });
      ct.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(ct.value)) cp.value = ct.value; });
      document.querySelector('form').addEventListener('submit', () => {
        if (/^#[0-9A-Fa-f]{6}$/.test(ct.value)) cp.value = ct.value;
        ct.name = '';
      });
    </script>
  `;
}

function materialForm(material, subject, action, submitLabel) {
  return `
    <div class="page-header">
      <div class="breadcrumb">
        <a href="/admin" class="breadcrumb-link">Admin</a>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">${material ? 'Edit Material' : 'New Material'}</span>
      </div>
      <h1 class="page-title">${material ? 'Edit Material' : 'New Material'}</h1>
      <p class="page-subtitle">Subject: ${escHtml(subject.title)}</p>
    </div>
    <form method="POST" action="${action}" class="admin-form">
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" name="title" class="form-input" value="${escHtml(material?.title || '')}" required placeholder="Material title" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select name="type" class="form-input">
            <option value="lesson" ${(!material || material.type === 'lesson') ? 'selected' : ''}>Lesson</option>
            <option value="note" ${material?.type === 'note' ? 'selected' : ''}>Note</option>
            <option value="resource" ${material?.type === 'resource' ? 'selected' : ''}>Resource</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Order Index</label>
          <input type="number" name="order_index" class="form-input" value="${material?.order_index ?? 0}" min="0" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Content (Markdown + LaTeX supported)</label>
        <textarea name="content" class="form-input content-editor" rows="20" placeholder="# Heading&#10;&#10;Write your content in Markdown…">${escHtml(material?.content || '')}</textarea>
      </div>
      <div class="form-actions">
        <a href="/subjects/${subject.id}" class="btn btn-secondary">Cancel</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
  `;
}

function testForm(test, subject, action, submitLabel) {
  return `
    <div class="page-header">
      <div class="breadcrumb">
        <a href="/admin" class="breadcrumb-link">Admin</a>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">New Test</span>
      </div>
      <h1 class="page-title">New Test</h1>
      <p class="page-subtitle">Subject: ${escHtml(subject.title)}</p>
    </div>
    <form method="POST" action="${action}" class="admin-form">
      <div class="form-group">
        <label class="form-label">Test Title</label>
        <input type="text" name="title" class="form-input" value="${escHtml(test?.title || '')}" required placeholder="e.g. Chapter 1 Quiz" />
      </div>
      <div class="form-group">
        <label class="form-label">Description (optional)</label>
        <textarea name="description" class="form-input" rows="2" placeholder="Brief instructions for students…">${escHtml(test?.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Time Limit (minutes, leave blank for unlimited)</label>
        <input type="number" name="time_limit_minutes" class="form-input" value="${test?.time_limit_minutes || ''}" min="1" placeholder="e.g. 30" style="max-width:200px" />
      </div>
      <div class="form-actions">
        <a href="/admin" class="btn btn-secondary">Cancel</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
  `;
}

module.exports = router;
