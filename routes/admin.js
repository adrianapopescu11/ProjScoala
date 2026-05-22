const express = require('express');
const multer = require('multer');
const supabase = require('../db/database');
const { adminPage, escHtml } = require('../lib/render');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const sb = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

const BUCKET = 'eduflow-uploads';
let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (!data.some(b => b.name === BUCKET)) {
    const { error: ce } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (ce && !/already exists/i.test(ce.message)) throw ce;
  }
  bucketReady = true;
}

const FLASH = {
  created: { type: 'success', msg: 'Created.' },
  updated: { type: 'success', msg: 'Saved.' },
  deleted: { type: 'success', msg: 'Deleted.' },
};
const flashFor = (req) => FLASH[req.query.flash] || null;

const TYPE_OPTIONS = ['lesson', 'note', 'resource'];
const QTYPE_OPTIONS = ['multiple_choice', 'short_answer', 'grid'];

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/admin', wrap(async (req, res) => {
  const counts = await Promise.all([
    supabase.from('subjects').select('*', { count: 'exact', head: true }),
    supabase.from('materials').select('*', { count: 'exact', head: true }),
    supabase.from('tests').select('*', { count: 'exact', head: true }),
    supabase.from('test_attempts').select('*', { count: 'exact', head: true }).not('submitted_at', 'is', null),
  ]);
  const [subjCount, matCount, testCount, attemptCount] = counts.map(c => c.count || 0);

  res.send(adminPage('Dashboard', `
    <div class="page-header">
      <h1 class="page-title">Admin Dashboard</h1>
      <p class="page-subtitle">Manage curriculum content and tests.</p>
    </div>

    <div class="admin-stat-grid">
      <a href="/admin/subjects" class="admin-stat-card">
        <span class="admin-stat-num">${subjCount}</span>
        <span class="admin-stat-label">Subjects</span>
      </a>
      <a href="/admin/materials" class="admin-stat-card">
        <span class="admin-stat-num">${matCount}</span>
        <span class="admin-stat-label">Materials</span>
      </a>
      <a href="/admin/tests" class="admin-stat-card">
        <span class="admin-stat-num">${testCount}</span>
        <span class="admin-stat-label">Tests</span>
      </a>
      <div class="admin-stat-card admin-stat-static">
        <span class="admin-stat-num">${attemptCount}</span>
        <span class="admin-stat-label">Submitted Attempts</span>
      </div>
    </div>

    <div class="admin-quick-actions">
      <a href="/admin/subjects/new" class="btn btn-primary">+ New Subject</a>
      <a href="/admin/materials/new" class="btn btn-primary">+ New Material</a>
      <a href="/admin/tests/new" class="btn btn-primary">+ New Test</a>
    </div>
  `, { activePath: '/admin', flash: flashFor(req) }));
}));

// ─── Subjects ─────────────────────────────────────────────────────────────────
router.get('/admin/subjects', wrap(async (req, res) => {
  const subjects = await sb(
    supabase.from('subjects').select('*').order('order_index').order('created_at')
  );
  const rows = subjects.length === 0
    ? `<tr><td colspan="4" class="empty-td">No subjects yet. <a href="/admin/subjects/new">Add one.</a></td></tr>`
    : subjects.map(s => `
      <tr>
        <td><span class="color-swatch" style="background:${escHtml(s.color)}"></span> ${escHtml(s.title)}</td>
        <td class="cell-muted">${escHtml((s.description || '').slice(0, 80))}${(s.description || '').length > 80 ? '…' : ''}</td>
        <td>${s.order_index}</td>
        <td class="cell-actions">
          <a href="/admin/subjects/${s.id}/edit" class="btn-link">Edit</a>
          <form method="POST" action="/admin/subjects/${s.id}/delete" class="inline-form" onsubmit="return confirm('Delete subject &quot;${escHtml(s.title).replace(/"/g,'\\&quot;')}&quot;? This also deletes its materials and tests.');">
            <button type="submit" class="btn-link btn-link-danger">Delete</button>
          </form>
        </td>
      </tr>
    `).join('');

  res.send(adminPage('Subjects', `
    <div class="page-header page-header-row">
      <div>
        <h1 class="page-title">Subjects</h1>
        <p class="page-subtitle">${subjects.length} total</p>
      </div>
      <a href="/admin/subjects/new" class="btn btn-primary">+ New Subject</a>
    </div>
    <table class="data-table">
      <thead><tr><th>Title</th><th>Description</th><th>Order</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `, { activePath: '/admin/subjects', flash: flashFor(req) }));
}));

function subjectForm({ subject = {}, action, submitLabel }) {
  return `
    <form method="POST" action="${action}" class="admin-form">
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" name="title" class="form-input" required value="${escHtml(subject.title || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea name="description" class="form-input" rows="3">${escHtml(subject.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Color</label>
          <input type="color" name="color" class="form-input form-input-color" value="${escHtml(subject.color || '#5C7A5C')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Order index</label>
          <input type="number" name="order_index" class="form-input" value="${subject.order_index ?? 0}" />
        </div>
      </div>
      <div class="form-actions">
        <a href="/admin/subjects" class="btn btn-secondary">Cancel</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
  `;
}

router.get('/admin/subjects/new', (req, res) => {
  res.send(adminPage('New Subject', `
    <div class="breadcrumb"><a href="/admin/subjects" class="breadcrumb-link">Subjects</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">New</span></div>
    <h1 class="page-title">New Subject</h1>
    ${subjectForm({ action: '/admin/subjects', submitLabel: 'Create' })}
  `, { activePath: '/admin/subjects' }));
});

router.post('/admin/subjects', wrap(async (req, res) => {
  const { title, description, color, order_index } = req.body;
  await sb(supabase.from('subjects').insert({
    title: title.trim(),
    description: description || null,
    color: color || '#5C7A5C',
    order_index: parseInt(order_index) || 0,
  }));
  res.redirect('/admin/subjects?flash=created');
}));

router.get('/admin/subjects/:id/edit', wrap(async (req, res) => {
  const subject = await sb(supabase.from('subjects').select('*').eq('id', req.params.id).maybeSingle());
  if (!subject) return res.redirect('/admin/subjects');
  res.send(adminPage('Edit Subject', `
    <div class="breadcrumb"><a href="/admin/subjects" class="breadcrumb-link">Subjects</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">${escHtml(subject.title)}</span></div>
    <h1 class="page-title">Edit Subject</h1>
    ${subjectForm({ subject, action: `/admin/subjects/${subject.id}`, submitLabel: 'Save' })}
  `, { activePath: '/admin/subjects' }));
}));

router.post('/admin/subjects/:id', wrap(async (req, res) => {
  const { title, description, color, order_index } = req.body;
  await sb(supabase.from('subjects').update({
    title: title.trim(),
    description: description || null,
    color: color || '#5C7A5C',
    order_index: parseInt(order_index) || 0,
  }).eq('id', req.params.id));
  res.redirect('/admin/subjects?flash=updated');
}));

router.post('/admin/subjects/:id/delete', wrap(async (req, res) => {
  await sb(supabase.from('subjects').delete().eq('id', req.params.id));
  res.redirect('/admin/subjects?flash=deleted');
}));

// ─── Materials ────────────────────────────────────────────────────────────────
router.get('/admin/materials', wrap(async (req, res) => {
  const [materials, subjects] = await Promise.all([
    sb(supabase.from('materials').select('*').order('subject_id').order('order_index')),
    sb(supabase.from('subjects').select('id, title')),
  ]);
  const subjMap = Object.fromEntries(subjects.map(s => [s.id, s.title]));

  const rows = materials.length === 0
    ? `<tr><td colspan="5" class="empty-td">No materials yet. <a href="/admin/materials/new">Add one.</a></td></tr>`
    : materials.map(m => `
      <tr>
        <td>${escHtml(m.title)}</td>
        <td><span class="type-tag type-${m.type}">${m.type}</span></td>
        <td>${escHtml(subjMap[m.subject_id] || '—')}</td>
        <td>${m.order_index}</td>
        <td class="cell-actions">
          <a href="/materials/${m.id}" class="btn-link" target="_blank">View</a>
          <a href="/admin/materials/${m.id}/edit" class="btn-link">Edit</a>
          <form method="POST" action="/admin/materials/${m.id}/delete" class="inline-form" onsubmit="return confirm('Delete material?');">
            <button type="submit" class="btn-link btn-link-danger">Delete</button>
          </form>
        </td>
      </tr>
    `).join('');

  res.send(adminPage('Materials', `
    <div class="page-header page-header-row">
      <div><h1 class="page-title">Materials</h1><p class="page-subtitle">${materials.length} total</p></div>
      <a href="/admin/materials/new" class="btn btn-primary">+ New Material</a>
    </div>
    <table class="data-table">
      <thead><tr><th>Title</th><th>Type</th><th>Subject</th><th>Order</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `, { activePath: '/admin/materials', flash: flashFor(req) }));
}));

function materialForm({ material = {}, subjects, action, submitLabel }) {
  return `
    <form method="POST" action="${action}" class="admin-form" id="material-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Subject</label>
          <select name="subject_id" class="form-input" required>
            ${subjects.map(s => `<option value="${s.id}" ${material.subject_id == s.id ? 'selected' : ''}>${escHtml(s.title)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select name="type" class="form-input">
            ${TYPE_OPTIONS.map(t => `<option value="${t}" ${material.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Order index</label>
          <input type="number" name="order_index" class="form-input" value="${material.order_index ?? 0}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" name="title" class="form-input" required value="${escHtml(material.title || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Content (Markdown — supports $math$ and image uploads)</label>
        <textarea name="content" id="content-editor" class="form-input" rows="20">${escHtml(material.content || '')}</textarea>
      </div>
      <div class="form-actions">
        <a href="/admin/materials" class="btn btn-secondary">Cancel</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
  `;
}

router.get('/admin/materials/new', wrap(async (req, res) => {
  const subjects = await sb(supabase.from('subjects').select('id, title').order('order_index'));
  if (subjects.length === 0) {
    return res.send(adminPage('New Material', `
      <div class="empty-state"><p>Create a subject first before adding materials.</p><a href="/admin/subjects/new" class="btn btn-primary">+ New Subject</a></div>
    `, { activePath: '/admin/materials' }));
  }
  res.send(adminPage('New Material', `
    <div class="breadcrumb"><a href="/admin/materials" class="breadcrumb-link">Materials</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">New</span></div>
    <h1 class="page-title">New Material</h1>
    ${materialForm({ subjects, action: '/admin/materials', submitLabel: 'Create' })}
  `, { activePath: '/admin/materials', extraScripts: ['/admin-math.js', '/admin-editor.js'] }));
}));

router.post('/admin/materials', wrap(async (req, res) => {
  const { subject_id, type, title, content, order_index } = req.body;
  await sb(supabase.from('materials').insert({
    subject_id: parseInt(subject_id),
    type: TYPE_OPTIONS.includes(type) ? type : 'lesson',
    title: title.trim(),
    content: content || '',
    order_index: parseInt(order_index) || 0,
  }));
  res.redirect('/admin/materials?flash=created');
}));

router.get('/admin/materials/:id/edit', wrap(async (req, res) => {
  const [material, subjects] = await Promise.all([
    sb(supabase.from('materials').select('*').eq('id', req.params.id).maybeSingle()),
    sb(supabase.from('subjects').select('id, title').order('order_index')),
  ]);
  if (!material) return res.redirect('/admin/materials');
  res.send(adminPage('Edit Material', `
    <div class="breadcrumb"><a href="/admin/materials" class="breadcrumb-link">Materials</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">${escHtml(material.title)}</span></div>
    <h1 class="page-title">Edit Material</h1>
    ${materialForm({ material, subjects, action: `/admin/materials/${material.id}`, submitLabel: 'Save' })}
  `, { activePath: '/admin/materials', extraScripts: ['/admin-math.js', '/admin-editor.js'] }));
}));

router.post('/admin/materials/:id', wrap(async (req, res) => {
  const { subject_id, type, title, content, order_index } = req.body;
  await sb(supabase.from('materials').update({
    subject_id: parseInt(subject_id),
    type: TYPE_OPTIONS.includes(type) ? type : 'lesson',
    title: title.trim(),
    content: content || '',
    order_index: parseInt(order_index) || 0,
  }).eq('id', req.params.id));
  res.redirect('/admin/materials?flash=updated');
}));

router.post('/admin/materials/:id/delete', wrap(async (req, res) => {
  await sb(supabase.from('materials').delete().eq('id', req.params.id));
  res.redirect('/admin/materials?flash=deleted');
}));

// ─── Tests ────────────────────────────────────────────────────────────────────
router.get('/admin/tests', wrap(async (req, res) => {
  const [tests, subjects, qCounts] = await Promise.all([
    sb(supabase.from('tests').select('*').order('subject_id').order('created_at')),
    sb(supabase.from('subjects').select('id, title')),
    sb(supabase.from('questions').select('test_id')),
  ]);
  const subjMap = Object.fromEntries(subjects.map(s => [s.id, s.title]));
  const qMap = {};
  qCounts.forEach(q => { qMap[q.test_id] = (qMap[q.test_id] || 0) + 1; });

  const rows = tests.length === 0
    ? `<tr><td colspan="5" class="empty-td">No tests yet. <a href="/admin/tests/new">Add one.</a></td></tr>`
    : tests.map(t => `
      <tr>
        <td>${escHtml(t.title)}</td>
        <td>${escHtml(subjMap[t.subject_id] || '—')}</td>
        <td>${qMap[t.id] || 0}</td>
        <td>${t.time_limit_minutes ? `${t.time_limit_minutes} min` : '—'}</td>
        <td class="cell-actions">
          <a href="/tests/${t.id}" class="btn-link" target="_blank">View</a>
          <a href="/admin/tests/${t.id}/edit" class="btn-link">Edit</a>
          <form method="POST" action="/admin/tests/${t.id}/delete" class="inline-form" onsubmit="return confirm('Delete test and all its questions?');">
            <button type="submit" class="btn-link btn-link-danger">Delete</button>
          </form>
        </td>
      </tr>
    `).join('');

  res.send(adminPage('Tests', `
    <div class="page-header page-header-row">
      <div><h1 class="page-title">Tests</h1><p class="page-subtitle">${tests.length} total</p></div>
      <a href="/admin/tests/new" class="btn btn-primary">+ New Test</a>
    </div>
    <table class="data-table">
      <thead><tr><th>Title</th><th>Subject</th><th>Questions</th><th>Time Limit</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `, { activePath: '/admin/tests', flash: flashFor(req) }));
}));

function testMetaForm({ test = {}, subjects, action, submitLabel }) {
  return `
    <form method="POST" action="${action}" class="admin-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Subject</label>
          <select name="subject_id" class="form-input" required>
            ${subjects.map(s => `<option value="${s.id}" ${test.subject_id == s.id ? 'selected' : ''}>${escHtml(s.title)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Time limit (minutes, optional)</label>
          <input type="number" name="time_limit_minutes" class="form-input" value="${test.time_limit_minutes ?? ''}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" name="title" class="form-input" required value="${escHtml(test.title || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea name="description" class="form-input" rows="3">${escHtml(test.description || '')}</textarea>
      </div>
      <div class="form-actions">
        <a href="/admin/tests" class="btn btn-secondary">Cancel</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
  `;
}

router.get('/admin/tests/new', wrap(async (req, res) => {
  const subjects = await sb(supabase.from('subjects').select('id, title').order('order_index'));
  if (subjects.length === 0) {
    return res.send(adminPage('New Test', `
      <div class="empty-state"><p>Create a subject first before adding tests.</p><a href="/admin/subjects/new" class="btn btn-primary">+ New Subject</a></div>
    `, { activePath: '/admin/tests' }));
  }
  res.send(adminPage('New Test', `
    <div class="breadcrumb"><a href="/admin/tests" class="breadcrumb-link">Tests</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">New</span></div>
    <h1 class="page-title">New Test</h1>
    ${testMetaForm({ subjects, action: '/admin/tests', submitLabel: 'Create' })}
  `, { activePath: '/admin/tests' }));
}));

router.post('/admin/tests', wrap(async (req, res) => {
  const { subject_id, title, description, time_limit_minutes } = req.body;
  const test = await sb(
    supabase.from('tests').insert({
      subject_id: parseInt(subject_id),
      title: title.trim(),
      description: description || null,
      time_limit_minutes: time_limit_minutes ? parseInt(time_limit_minutes) : null,
    }).select('id').single()
  );
  res.redirect(`/admin/tests/${test.id}/edit?flash=created`);
}));

router.get('/admin/tests/:id/edit', wrap(async (req, res) => {
  const [test, subjects, questions] = await Promise.all([
    sb(supabase.from('tests').select('*').eq('id', req.params.id).maybeSingle()),
    sb(supabase.from('subjects').select('id, title').order('order_index')),
    sb(supabase.from('questions').select('*').eq('test_id', req.params.id).order('order_index').order('id')),
  ]);
  if (!test) return res.redirect('/admin/tests');

  // Fetch answer counts for MC questions
  const mcIds = questions.filter(q => q.type === 'multiple_choice').map(q => q.id);
  const ansRows = mcIds.length > 0
    ? await sb(supabase.from('answers').select('question_id').in('question_id', mcIds))
    : [];
  const ansCount = {};
  ansRows.forEach(a => { ansCount[a.question_id] = (ansCount[a.question_id] || 0) + 1; });

  const questionsHtml = questions.length === 0
    ? `<div class="empty-state-sm"><p>No questions yet.</p></div>`
    : `<ol class="admin-question-list">
        ${questions.map(q => {
          let preview = '';
          if (q.type === 'grid') {
            try { preview = JSON.parse(q.question_text).prompt || ''; } catch (_) { preview = '(grid)'; }
          } else {
            preview = q.question_text;
          }
          return `
            <li class="admin-question-item">
              <div class="aqi-main">
                <span class="type-tag type-${q.type.replace('_','-')}">${q.type.replace('_', ' ')}</span>
                <span class="aqi-text">${escHtml(preview.slice(0, 120))}${preview.length > 120 ? '…' : ''}</span>
                <span class="aqi-pts">${q.points || 1} pt${(q.points || 1) !== 1 ? 's' : ''}</span>
                ${q.type === 'multiple_choice' ? `<span class="aqi-meta">${ansCount[q.id] || 0} answers</span>` : ''}
              </div>
              <div class="aqi-actions">
                <a href="/admin/questions/${q.id}/edit" class="btn-link">Edit</a>
                <form method="POST" action="/admin/questions/${q.id}/delete" class="inline-form" onsubmit="return confirm('Delete question?');">
                  <button type="submit" class="btn-link btn-link-danger">Delete</button>
                </form>
              </div>
            </li>`;
        }).join('')}
      </ol>`;

  res.send(adminPage('Edit Test', `
    <div class="breadcrumb"><a href="/admin/tests" class="breadcrumb-link">Tests</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">${escHtml(test.title)}</span></div>
    <h1 class="page-title">Edit Test</h1>

    <section class="admin-section">
      <h2 class="section-heading">Test details</h2>
      ${testMetaForm({ test, subjects, action: `/admin/tests/${test.id}`, submitLabel: 'Save' })}
    </section>

    <section class="admin-section">
      <div class="admin-section-header">
        <h2 class="section-heading">Questions (${questions.length})</h2>
        <a href="/admin/tests/${test.id}/questions/new" class="btn btn-primary">+ Add Question</a>
      </div>
      ${questionsHtml}
    </section>
  `, { activePath: '/admin/tests', flash: flashFor(req) }));
}));

router.post('/admin/tests/:id', wrap(async (req, res) => {
  const { subject_id, title, description, time_limit_minutes } = req.body;
  await sb(supabase.from('tests').update({
    subject_id: parseInt(subject_id),
    title: title.trim(),
    description: description || null,
    time_limit_minutes: time_limit_minutes ? parseInt(time_limit_minutes) : null,
  }).eq('id', req.params.id));
  res.redirect(`/admin/tests/${req.params.id}/edit?flash=updated`);
}));

router.post('/admin/tests/:id/delete', wrap(async (req, res) => {
  await sb(supabase.from('tests').delete().eq('id', req.params.id));
  res.redirect('/admin/tests?flash=deleted');
}));

// ─── Questions ────────────────────────────────────────────────────────────────
function questionForm({ question = {}, answers = [], test, action, submitLabel }) {
  const type = question.type || 'multiple_choice';
  const isMC = type === 'multiple_choice';
  const isSA = type === 'short_answer';
  const isGrid = type === 'grid';

  let gridConfig = { prompt: '', rows: 3, cols: 3, row_headers: [], col_headers: [], locked_cells: [], correct: [] };
  if (isGrid) { try { gridConfig = { ...gridConfig, ...JSON.parse(question.question_text || '{}') }; } catch (_) {} }

  const saCorrect = (isSA && answers[0]) ? answers[0].answer_text : '';

  return `
    <form method="POST" action="${action}" class="admin-form" id="question-form">
      <input type="hidden" name="test_id" value="${test.id}" />

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select name="type" id="qtype-select" class="form-input">
            ${QTYPE_OPTIONS.map(t => `<option value="${t}" ${type === t ? 'selected' : ''}>${t.replace('_', ' ')}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Points</label>
          <input type="number" name="points" class="form-input" min="1" value="${question.points || 1}" />
        </div>
        <div class="form-group">
          <label class="form-label">Order</label>
          <input type="number" name="order_index" class="form-input" value="${question.order_index ?? 0}" />
        </div>
      </div>

      <!-- MC + Short Answer share question_text -->
      <div class="form-group qtype-section" data-show-for="multiple_choice short_answer">
        <label class="form-label">Question</label>
        <textarea name="question_text" class="form-input" rows="3">${escHtml(isGrid ? '' : (question.question_text || ''))}</textarea>
      </div>

      <!-- MC answers -->
      <div class="qtype-section" data-show-for="multiple_choice">
        <label class="form-label">Answers (check the correct one)</label>
        <div id="mc-answers">
          ${(isMC && answers.length > 0 ? answers : [{}, {}]).map((a, i) => `
            <div class="mc-answer-row">
              <input type="checkbox" name="answer_correct_${i}" value="1" ${a.is_correct ? 'checked' : ''} />
              <input type="text" name="answer_text_${i}" class="form-input" placeholder="Answer option" value="${escHtml(a.answer_text || '')}" />
              <button type="button" class="btn-link btn-link-danger remove-mc-answer">Remove</button>
            </div>
          `).join('')}
        </div>
        <button type="button" id="add-mc-answer" class="btn btn-secondary btn-sm">+ Add answer</button>
        <input type="hidden" name="mc_answer_count" id="mc-answer-count" value="${(isMC && answers.length > 0 ? answers.length : 2)}" />
      </div>

      <!-- Short answer correct -->
      <div class="form-group qtype-section" data-show-for="short_answer">
        <label class="form-label">Correct answer (case-insensitive exact match)</label>
        <input type="text" name="sa_correct" class="form-input" value="${escHtml(saCorrect)}" />
      </div>

      <!-- Grid -->
      <div class="qtype-section" data-show-for="grid">
        <div class="form-group">
          <label class="form-label">Prompt</label>
          <input type="text" name="grid_prompt" id="grid-prompt" class="form-input" value="${escHtml(gridConfig.prompt || '')}" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rows</label>
            <input type="number" id="grid-rows" class="form-input" min="1" max="20" value="${gridConfig.rows}" />
          </div>
          <div class="form-group">
            <label class="form-label">Cols</label>
            <input type="number" id="grid-cols" class="form-input" min="1" max="20" value="${gridConfig.cols}" />
          </div>
          <div class="form-group">
            <label class="form-label">&nbsp;</label>
            <button type="button" id="grid-rebuild" class="btn btn-secondary">Resize grid</button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Row headers (one per line, optional)</label>
            <textarea id="grid-row-headers" class="form-input" rows="4">${escHtml((gridConfig.row_headers || []).join('\n'))}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Col headers (one per line, optional)</label>
            <textarea id="grid-col-headers" class="form-input" rows="4">${escHtml((gridConfig.col_headers || []).join('\n'))}</textarea>
          </div>
        </div>
        <p class="form-help">Type the correct value in each cell. Click 🔒 to mark a cell as pre-shown to students.</p>
        <div id="grid-builder"></div>
        <input type="hidden" name="grid_json" id="grid-json" value="${escHtml(JSON.stringify(gridConfig))}" />
      </div>

      <div class="form-actions">
        <a href="/admin/tests/${test.id}/edit" class="btn btn-secondary">Cancel</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
  `;
}

router.get('/admin/tests/:tid/questions/new', wrap(async (req, res) => {
  const test = await sb(supabase.from('tests').select('*').eq('id', req.params.tid).maybeSingle());
  if (!test) return res.redirect('/admin/tests');
  res.send(adminPage('New Question', `
    <div class="breadcrumb">
      <a href="/admin/tests" class="breadcrumb-link">Tests</a><span class="breadcrumb-sep">›</span>
      <a href="/admin/tests/${test.id}/edit" class="breadcrumb-link">${escHtml(test.title)}</a><span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">New Question</span>
    </div>
    <h1 class="page-title">New Question</h1>
    ${questionForm({ test, action: `/admin/tests/${test.id}/questions`, submitLabel: 'Create' })}
  `, { activePath: '/admin/tests', extraScripts: ['/admin-math.js', '/admin-question.js'] }));
}));

async function saveQuestionFromBody(qid, body, isUpdate) {
  const type = QTYPE_OPTIONS.includes(body.type) ? body.type : 'multiple_choice';
  const points = parseInt(body.points) || 1;
  const order_index = parseInt(body.order_index) || 0;
  const test_id = parseInt(body.test_id);

  let question_text;
  if (type === 'grid') {
    question_text = (body.grid_json || '{}').trim();
  } else {
    question_text = (body.question_text || '').trim();
  }

  let id = qid;
  if (isUpdate) {
    await sb(supabase.from('questions').update({ type, points, order_index, question_text }).eq('id', id));
    await sb(supabase.from('answers').delete().eq('question_id', id));
  } else {
    const row = await sb(supabase.from('questions').insert({
      test_id, type, points, order_index, question_text,
    }).select('id').single());
    id = row.id;
  }

  if (type === 'multiple_choice') {
    const count = parseInt(body.mc_answer_count) || 0;
    const rows = [];
    for (let i = 0; i < count; i++) {
      const text = (body[`answer_text_${i}`] || '').trim();
      if (!text) continue;
      rows.push({
        question_id: id,
        answer_text: text,
        is_correct: body[`answer_correct_${i}`] ? 1 : 0,
      });
    }
    if (rows.length > 0) await sb(supabase.from('answers').insert(rows));
  } else if (type === 'short_answer') {
    const correct = (body.sa_correct || '').trim();
    if (correct) {
      await sb(supabase.from('answers').insert({
        question_id: id, answer_text: correct, is_correct: 1,
      }));
    }
  }
  return { id, test_id };
}

router.post('/admin/tests/:tid/questions', wrap(async (req, res) => {
  const { test_id } = await saveQuestionFromBody(null, req.body, false);
  res.redirect(`/admin/tests/${test_id}/edit?flash=created`);
}));

router.get('/admin/questions/:qid/edit', wrap(async (req, res) => {
  const question = await sb(supabase.from('questions').select('*').eq('id', req.params.qid).maybeSingle());
  if (!question) return res.redirect('/admin/tests');
  const [test, answers] = await Promise.all([
    sb(supabase.from('tests').select('*').eq('id', question.test_id).maybeSingle()),
    sb(supabase.from('answers').select('*').eq('question_id', question.id).order('id')),
  ]);
  res.send(adminPage('Edit Question', `
    <div class="breadcrumb">
      <a href="/admin/tests" class="breadcrumb-link">Tests</a><span class="breadcrumb-sep">›</span>
      <a href="/admin/tests/${test.id}/edit" class="breadcrumb-link">${escHtml(test.title)}</a><span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">Edit Question</span>
    </div>
    <h1 class="page-title">Edit Question</h1>
    ${questionForm({ question, answers, test, action: `/admin/questions/${question.id}`, submitLabel: 'Save' })}
  `, { activePath: '/admin/tests', extraScripts: ['/admin-math.js', '/admin-question.js'] }));
}));

router.post('/admin/questions/:qid', wrap(async (req, res) => {
  const { test_id } = await saveQuestionFromBody(parseInt(req.params.qid), req.body, true);
  res.redirect(`/admin/tests/${test_id}/edit?flash=updated`);
}));

router.post('/admin/questions/:qid/delete', wrap(async (req, res) => {
  const question = await sb(supabase.from('questions').select('test_id').eq('id', req.params.qid).maybeSingle());
  await sb(supabase.from('questions').delete().eq('id', req.params.qid));
  res.redirect(question ? `/admin/tests/${question.test_id}/edit?flash=deleted` : '/admin/tests');
}));

// ─── Image upload ─────────────────────────────────────────────────────────────
router.post('/admin/upload', upload.single('image'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  await ensureBucket();

  const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i) || ['.bin'])[0].toLowerCase();
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(key, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: false,
  });
  if (error) return res.status(500).json({ error: error.message });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  res.json({ url: data.publicUrl });
}));

module.exports = router;
