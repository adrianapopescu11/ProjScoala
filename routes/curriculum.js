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

const TYPE_LABELS = { lesson: 'Lesson', note: 'Note', resource: 'Resource' };
const TYPE_ICONS = {
  lesson: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  resource: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
};

// ── GET / — Home ──────────────────────────────────────────────────────────────
router.get('/', requireAuth, wrap(async (req, res) => {
  const [subjects, matRows, testRows] = await Promise.all([
    sb(supabase.from('subjects').select('*').order('order_index').order('created_at')),
    sb(supabase.from('materials').select('subject_id')),
    sb(supabase.from('tests').select('subject_id')),
  ]);

  const countMap = {};
  matRows.forEach(r => { countMap[r.subject_id] = (countMap[r.subject_id] || 0) + 1; });
  const testMap = {};
  testRows.forEach(r => { testMap[r.subject_id] = (testMap[r.subject_id] || 0) + 1; });

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
  const subject = await sb(
    supabase.from('subjects').select('*').eq('id', req.params.id).maybeSingle()
  );
  if (!subject) return res.status(404).send(
    page('Not Found', '<div class="empty-state"><p>Subject not found.</p></div>', req.session.user)
  );

  const [materials, tests] = await Promise.all([
    sb(supabase.from('materials').select('*').eq('subject_id', subject.id).order('order_index').order('created_at')),
    sb(supabase.from('tests').select('*').eq('subject_id', subject.id).order('created_at')),
  ]);

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
  const material = await sb(
    supabase.from('materials').select('*').eq('id', req.params.id).maybeSingle()
  );
  if (!material) return res.status(404).send(
    page('Not Found', '<div class="empty-state"><p>Material not found.</p></div>', req.session.user)
  );

  const [subject, siblings] = await Promise.all([
    sb(supabase.from('subjects').select('*').eq('id', material.subject_id).maybeSingle()),
    sb(supabase.from('materials').select('id, title, type, order_index').eq('subject_id', material.subject_id).order('order_index').order('created_at')),
  ]);

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
  const test = await sb(
    supabase.from('tests').select('*').eq('id', req.params.id).maybeSingle()
  );
  if (!test) return res.status(404).send(
    page('Not Found', '<div class="empty-state"><p>Test not found.</p></div>', req.session.user)
  );

  const [subject, questions, pastAttempts] = await Promise.all([
    sb(supabase.from('subjects').select('*').eq('id', test.subject_id).maybeSingle()),
    sb(supabase.from('questions').select('*').eq('test_id', test.id).order('order_index')),
    sb(supabase.from('test_attempts').select('*').eq('test_id', test.id).eq('user_id', req.session.user.id).order('submitted_at', { ascending: false })),
  ]);

  const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);
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
  const test = await sb(
    supabase.from('tests').select('*').eq('id', req.params.id).maybeSingle()
  );
  if (!test) return res.redirect('/');

  const questions = await sb(
    supabase.from('questions').select('*').eq('test_id', test.id)
  );
  if (questions.length === 0) return res.redirect(`/tests/${test.id}`);

  const maxScore = questions.reduce((s, q) => s + (q.points || 1), 0);
  await sb(
    supabase.from('test_attempts').insert({
      test_id: test.id,
      user_id: req.session.user.id,
      score: 0,
      max_score: maxScore,
    })
  );
  res.redirect(`/tests/${test.id}/take`);
}));

// ── Legacy attempt routes ─────────────────────────────────────────────────────

router.get('/attempts/:id', requireAuth, wrap(async (req, res) => {
  const attempt = await sb(
    supabase.from('test_attempts').select('*').eq('id', req.params.id).eq('user_id', req.session.user.id).maybeSingle()
  );
  if (!attempt) return res.redirect('/');
  if (attempt.submitted_at) return res.redirect(`/attempts/${attempt.id}/result`);

  const test = await sb(supabase.from('tests').select('*').eq('id', attempt.test_id).maybeSingle());
  const questions = await sb(supabase.from('questions').select('*').eq('test_id', test.id).order('order_index'));

  const questionsWithAnswers = await Promise.all(questions.map(async q => ({
    ...q,
    answers: q.type === 'multiple_choice'
      ? await sb(supabase.from('answers').select('*').eq('question_id', q.id))
      : [],
  })));

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
    <form method="POST" action="/attempts/${attempt.id}/submit" id="test-form">
      <div class="questions-list">
        ${questionsWithAnswers.map((q, i) => renderQuestion(q, i)).join('')}
      </div>
      <div class="test-submit-bar">
        <button type="submit" class="btn btn-primary btn-lg">Submit Test</button>
      </div>
    </form>
  `, req.session.user));
}));

router.post('/attempts/:id/submit', requireAuth, wrap(async (req, res) => {
  const attempt = await sb(
    supabase.from('test_attempts').select('*').eq('id', req.params.id).eq('user_id', req.session.user.id).maybeSingle()
  );
  if (!attempt || attempt.submitted_at) return res.redirect('/');

  const questions = await sb(supabase.from('questions').select('*').eq('test_id', attempt.test_id).order('order_index'));

  let totalScore = 0;
  for (const q of questions) {
    const given = req.body[`q_${q.id}`] || '';
    let isCorrect = 0, pointsEarned = 0;
    if (q.type === 'multiple_choice') {
      const answerId = parseInt(given);
      if (answerId) {
        const ans = await sb(supabase.from('answers').select('*').eq('id', answerId).eq('question_id', q.id).maybeSingle());
        if (ans && ans.is_correct) { isCorrect = 1; pointsEarned = q.points || 1; }
      }
    }
    totalScore += pointsEarned;
    await sb(supabase.from('attempt_answers').insert({ attempt_id: attempt.id, question_id: q.id, answer_given: given, is_correct: isCorrect, points_earned: pointsEarned }));
  }
  await sb(supabase.from('test_attempts').update({ score: totalScore, submitted_at: new Date().toISOString() }).eq('id', attempt.id));
  res.redirect(`/attempts/${attempt.id}/result`);
}));

router.get('/attempts/:id/result', requireAuth, wrap(async (req, res) => {
  const attempt = await sb(supabase.from('test_attempts').select('*').eq('id', req.params.id).eq('user_id', req.session.user.id).maybeSingle());
  if (!attempt) return res.redirect('/');
  const test    = await sb(supabase.from('tests').select('*').eq('id', attempt.test_id).maybeSingle());
  const subject = await sb(supabase.from('subjects').select('*').eq('id', test.subject_id).maybeSingle());
  const [questions, attemptAnswers] = await Promise.all([
    sb(supabase.from('questions').select('*').eq('test_id', test.id).order('order_index')),
    sb(supabase.from('attempt_answers').select('*').eq('attempt_id', attempt.id)),
  ]);
  const answerMap = Object.fromEntries(attemptAnswers.map(a => [a.question_id, a]));
  const pct = attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0;
  const passed = pct >= 50;

  const reviewHtml = (await Promise.all(questions.map(async (q, i) => {
    const aa = answerMap[q.id];
    let givenText = aa ? aa.answer_given : '—';
    if (q.type === 'multiple_choice' && aa?.answer_given) {
      const ans = await sb(supabase.from('answers').select('*').eq('id', parseInt(aa.answer_given)).maybeSingle());
      if (ans) givenText = ans.answer_text;
    }
    const correct = aa && aa.is_correct;
    const correctAnswers = await sb(supabase.from('answers').select('*').eq('question_id', q.id).eq('is_correct', 1));
    const ca = correctAnswers[0] || null;
    return `<div class="result-question ${correct ? 'result-correct' : 'result-wrong'}">
      <div class="result-q-header">
        <span class="question-number">Q${i + 1}</span>
        <span class="result-icon">${correct ? '✓' : '✗'}</span>
        <span class="result-pts">${aa ? aa.points_earned : 0} / ${q.points || 1}</span>
      </div>
      <p class="question-text">${escHtml(q.question_text)}</p>
      <div class="result-answer-row">
        <div class="result-answer-box ${correct ? 'correct' : 'wrong'}">
          <small>Your answer</small><span>${escHtml(givenText || '(no answer)')}</span>
        </div>
        ${!correct && ca ? `<div class="result-answer-box correct"><small>Correct answer</small><span>${escHtml(ca.answer_text)}</span></div>` : ''}
      </div>
    </div>`;
  }))).join('');

  res.send(page('Test Result', `
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
    <div class="result-review"><h2 class="section-heading-sm">Question Review</h2>${reviewHtml}</div>
    <div class="result-actions">
      <a href="/tests/${test.id}" class="btn btn-secondary">Retake Test</a>
      <a href="/subjects/${subject.id}" class="btn btn-primary">Back to Subject</a>
    </div>
  `, req.session.user));
}));

module.exports = router;
