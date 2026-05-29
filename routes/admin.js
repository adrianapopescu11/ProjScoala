const express = require('express');
const multer = require('multer');
const supabase = require('../db/database');
const { adminPage, escHtml } = require('../lib/render');
const settings = require('../lib/settings');

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
  created: { type: 'success', msg: 'Adăugat cu succes.' },
  updated: { type: 'success', msg: 'Salvat.' },
  deleted: { type: 'success', msg: 'Șters.' },
};
const flashFor = (req) => FLASH[req.query.flash] || null;

const TYPE_OPTIONS = ['lesson', 'note', 'resource'];
const QTYPE_OPTIONS = ['multiple_choice', 'short_answer', 'grid'];

// Plain-language Romanian labels for the database type values, so non-technical
// editors never see raw enum strings like "multiple_choice" or "lesson".
const TYPE_LABELS = { lesson: 'Lecție', note: 'Notiță', resource: 'Resursă' };
const QTYPE_LABELS = {
  multiple_choice: 'Alegere multiplă (bifezi varianta corectă)',
  short_answer:    'Răspuns scurt (text sau număr)',
  grid:            'Tabel de completat (grilă)',
};
const typeLabel  = (t) => TYPE_LABELS[t]  || t;
const qtypeLabel = (t) => QTYPE_LABELS[t] || t;

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/admin', wrap(async (req, res) => {
  const counts = await Promise.all([
    supabase.from('subjects').select('*', { count: 'exact', head: true }),
    supabase.from('materials').select('*', { count: 'exact', head: true }),
    supabase.from('tests').select('*', { count: 'exact', head: true }),
    supabase.from('test_attempts').select('*', { count: 'exact', head: true }).not('submitted_at', 'is', null),
  ]);
  const [subjCount, matCount, testCount, attemptCount] = counts.map(c => c.count || 0);

  res.send(adminPage('Panou', `
    <div class="page-header">
      <h1 class="page-title">Panou de administrare</h1>
      <p class="page-subtitle">De aici adaugi și modifici materii, materiale și teste. Apasă pe un card pentru a vedea lista.</p>
    </div>

    <div class="admin-stat-grid">
      <a href="/admin/subjects" class="admin-stat-card">
        <span class="admin-stat-num">${subjCount}</span>
        <span class="admin-stat-label">Materii</span>
      </a>
      <a href="/admin/materials" class="admin-stat-card">
        <span class="admin-stat-num">${matCount}</span>
        <span class="admin-stat-label">Materiale</span>
      </a>
      <a href="/admin/tests" class="admin-stat-card">
        <span class="admin-stat-num">${testCount}</span>
        <span class="admin-stat-label">Teste</span>
      </a>
      <div class="admin-stat-card admin-stat-static">
        <span class="admin-stat-num">${attemptCount}</span>
        <span class="admin-stat-label">Teste rezolvate de elevi</span>
      </div>
    </div>

    <div class="admin-quick-actions">
      <a href="/admin/subjects/new" class="btn btn-primary">+ Materie nouă</a>
      <a href="/admin/materials/new" class="btn btn-primary">+ Material nou</a>
      <a href="/admin/tests/new" class="btn btn-primary">+ Test nou</a>
    </div>
  `, { activePath: '/admin', flash: flashFor(req) }));
}));

// ─── Site Settings ────────────────────────────────────────────────────────────
// One form lets admins override every editable string on the site. Defaults
// live in lib/settings.js — blank input = "use default". Empty submissions
// delete the row so the default takes over again.
router.get('/admin/settings', wrap(async (req, res) => {
  await settings.ensureLoaded();
  const defs = settings.getDefaults();
  const overrides = settings.getOverrides();

  const groups = {};
  for (const [key, def] of Object.entries(defs)) {
    (groups[def.group] = groups[def.group] || []).push({ key, ...def });
  }

  const groupsHtml = Object.entries(groups).map(([groupName, items]) => `
    <section class="admin-section">
      <h2 class="section-heading">${escHtml(groupName)}</h2>
      ${items.map(item => {
        const current  = overrides[item.key] ?? '';
        const isLong   = item.default.length > 60;
        const inputTag = isLong
          ? `<textarea name="${escHtml(item.key)}" class="form-input" rows="2" placeholder="${escHtml(item.default)}">${escHtml(current)}</textarea>`
          : `<input type="text" name="${escHtml(item.key)}" class="form-input" placeholder="${escHtml(item.default)}" value="${escHtml(current)}" />`;
        return `
          <div class="form-group">
            <label class="form-label">${escHtml(item.label)}</label>
            ${inputTag}
            <p class="form-help">Implicit: <code>${escHtml(item.default)}</code> · Lasă gol ca să folosești textul implicit.</p>
          </div>
        `;
      }).join('')}
    </section>
  `).join('');

  res.send(adminPage('Texte site', `
    <div class="page-header">
      <h1 class="page-title">Texte de pe site</h1>
      <p class="page-subtitle">Aici poți schimba orice text vizibil pe site (titluri, butoane, mesaje). Modificările apar în ~30 de secunde (imediat pentru tine). Dacă lași un câmp gol, se folosește textul implicit.</p>
    </div>
    <form method="POST" action="/admin/settings" class="admin-form">
      ${groupsHtml}
      <div class="form-actions">
        <a href="/admin" class="btn btn-secondary">Anulează</a>
        <button type="submit" class="btn btn-primary">Salvează tot</button>
      </div>
    </form>
  `, { activePath: '/admin/settings', flash: flashFor(req) }));
}));

router.post('/admin/settings', wrap(async (req, res) => {
  const defs = settings.getDefaults();
  const toUpsert = [];
  const toDelete = [];

  for (const key of Object.keys(defs)) {
    const val = (req.body[key] ?? '').trim();
    if (val === '') toDelete.push(key);
    else toUpsert.push({ key, value: val });
  }

  if (toUpsert.length > 0) {
    await sb(supabase.from('site_settings').upsert(toUpsert, { onConflict: 'key' }));
  }
  if (toDelete.length > 0) {
    await sb(supabase.from('site_settings').delete().in('key', toDelete));
  }

  settings.bust();
  await settings.ensureLoaded();
  res.redirect('/admin/settings?flash=updated');
}));

// ─── Subjects ─────────────────────────────────────────────────────────────────
router.get('/admin/subjects', wrap(async (req, res) => {
  const subjects = await sb(
    supabase.from('subjects').select('*').order('order_index').order('created_at')
  );
  const rows = subjects.length === 0
    ? `<tr><td colspan="5" class="empty-td">Nicio materie încă. <a href="/admin/subjects/new">Adaugă prima materie.</a></td></tr>`
    : subjects.map(s => `
      <tr>
        <td><span class="color-swatch" style="background:${escHtml(s.color)}"></span> ${escHtml(s.title)}</td>
        <td class="cell-muted">${escHtml((s.description || '').slice(0, 80))}${(s.description || '').length > 80 ? '…' : ''}</td>
        <td>${s.level ? escHtml(s.level) : '<span class="cell-muted">—</span>'}</td>
        <td>${s.order_index}</td>
        <td class="cell-actions">
          <a href="/admin/subjects/${s.id}/edit" class="btn-link">Modifică</a>
          <form method="POST" action="/admin/subjects/${s.id}/delete" class="inline-form" onsubmit="return confirm('Ștergi materia &quot;${escHtml(s.title).replace(/"/g,'\\&quot;')}&quot;? Se șterg și materialele și testele ei. Acțiunea nu poate fi anulată.');">
            <button type="submit" class="btn-link btn-link-danger">Șterge</button>
          </form>
        </td>
      </tr>
    `).join('');

  res.send(adminPage('Materii', `
    <div class="page-header page-header-row">
      <div>
        <h1 class="page-title">Materii</h1>
        <p class="page-subtitle">${subjects.length} ${subjects.length === 1 ? 'materie' : 'materii'} în total</p>
      </div>
      <a href="/admin/subjects/new" class="btn btn-primary">+ Materie nouă</a>
    </div>
    <table class="data-table">
      <thead><tr><th>Titlu</th><th>Descriere</th><th>Nivel</th><th>Ordine</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `, { activePath: '/admin/subjects', flash: flashFor(req) }));
}));

const LEVEL_OPTIONS = ['liceu', 'gimnaziu'];

function subjectForm({ subject = {}, action, submitLabel }) {
  return `
    <form method="POST" action="${action}" class="admin-form">
      <div class="form-group">
        <label class="form-label">Numele materiei</label>
        <input type="text" name="title" class="form-input" required value="${escHtml(subject.title || '')}" placeholder="ex: Fizică — Mecanică" />
        <p class="form-help">Așa apare materia pe site și în liste.</p>
      </div>
      <div class="form-group">
        <label class="form-label">Descriere scurtă <span class="form-optional">(opțional)</span></label>
        <textarea name="description" class="form-input" rows="3" placeholder="ex: Teste BAC pentru Mecanică — Subiectul I, II și III.">${escHtml(subject.description || '')}</textarea>
        <p class="form-help">Un rând-două afișate sub titlu. Poți lăsa gol.</p>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Unde apare</label>
          <select name="level" class="form-input">
            <option value="" ${!subject.level ? 'selected' : ''}>Doar pe prima pagină</option>
            <option value="liceu" ${subject.level === 'liceu' ? 'selected' : ''}>Liceu</option>
            <option value="gimnaziu" ${subject.level === 'gimnaziu' ? 'selected' : ''}>Gimnaziu</option>
          </select>
          <p class="form-help">Alege pagina pe care apare materia (Liceu sau Gimnaziu).</p>
        </div>
        <div class="form-group">
          <label class="form-label">Culoarea cardului</label>
          <input type="color" name="color" class="form-input form-input-color" value="${escHtml(subject.color || '#5C7A5C')}" />
          <p class="form-help">Culoarea afișată pe cardul materiei.</p>
        </div>
        <div class="form-group">
          <label class="form-label">Poziție în listă</label>
          <input type="number" name="order_index" class="form-input" value="${subject.order_index ?? 0}" />
          <p class="form-help">Numerele mai mici apar primele. Lasă 0 dacă nu contează.</p>
        </div>
      </div>
      <div class="form-actions">
        <a href="/admin/subjects" class="btn btn-secondary">Anulează</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
  `;
}

router.get('/admin/subjects/new', (req, res) => {
  res.send(adminPage('Materie nouă', `
    <div class="breadcrumb"><a href="/admin/subjects" class="breadcrumb-link">Materii</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">Materie nouă</span></div>
    <h1 class="page-title">Materie nouă</h1>
    ${subjectForm({ action: '/admin/subjects', submitLabel: 'Adaugă materia' })}
  `, { activePath: '/admin/subjects' }));
});

router.post('/admin/subjects', wrap(async (req, res) => {
  const { title, description, color, order_index, level } = req.body;
  await sb(supabase.from('subjects').insert({
    title: title.trim(),
    description: description || null,
    color: color || '#5C7A5C',
    order_index: parseInt(order_index) || 0,
    level: LEVEL_OPTIONS.includes(level) ? level : null,
  }));
  res.redirect('/admin/subjects?flash=created');
}));

router.get('/admin/subjects/:id/edit', wrap(async (req, res) => {
  const subject = await sb(supabase.from('subjects').select('*').eq('id', req.params.id).maybeSingle());
  if (!subject) return res.redirect('/admin/subjects');
  res.send(adminPage('Modifică materia', `
    <div class="breadcrumb"><a href="/admin/subjects" class="breadcrumb-link">Materii</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">${escHtml(subject.title)}</span></div>
    <h1 class="page-title">Modifică materia</h1>
    ${subjectForm({ subject, action: `/admin/subjects/${subject.id}`, submitLabel: 'Salvează' })}
  `, { activePath: '/admin/subjects' }));
}));

router.post('/admin/subjects/:id', wrap(async (req, res) => {
  const { title, description, color, order_index, level } = req.body;
  await sb(supabase.from('subjects').update({
    title: title.trim(),
    description: description || null,
    color: color || '#5C7A5C',
    order_index: parseInt(order_index) || 0,
    level: LEVEL_OPTIONS.includes(level) ? level : null,
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
    ? `<tr><td colspan="5" class="empty-td">Niciun material încă. <a href="/admin/materials/new">Adaugă primul material.</a></td></tr>`
    : materials.map(m => `
      <tr>
        <td>${escHtml(m.title)}</td>
        <td><span class="type-tag type-${m.type}">${escHtml(typeLabel(m.type))}</span></td>
        <td>${escHtml(subjMap[m.subject_id] || '—')}</td>
        <td>${m.order_index}</td>
        <td class="cell-actions">
          <a href="/materials/${m.id}" class="btn-link" target="_blank">Vezi</a>
          <a href="/admin/materials/${m.id}/edit" class="btn-link">Modifică</a>
          <form method="POST" action="/admin/materials/${m.id}/delete" class="inline-form" onsubmit="return confirm('Ștergi acest material? Acțiunea nu poate fi anulată.');">
            <button type="submit" class="btn-link btn-link-danger">Șterge</button>
          </form>
        </td>
      </tr>
    `).join('');

  res.send(adminPage('Materiale', `
    <div class="page-header page-header-row">
      <div><h1 class="page-title">Materiale</h1><p class="page-subtitle">${materials.length} ${materials.length === 1 ? 'material' : 'materiale'} în total</p></div>
      <a href="/admin/materials/new" class="btn btn-primary">+ Material nou</a>
    </div>
    <table class="data-table">
      <thead><tr><th>Titlu</th><th>Tip</th><th>Materie</th><th>Ordine</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `, { activePath: '/admin/materials', flash: flashFor(req) }));
}));

function materialForm({ material = {}, subjects, action, submitLabel }) {
  return `
    <form method="POST" action="${action}" class="admin-form" id="material-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">La ce materie aparține</label>
          <select name="subject_id" class="form-input" required>
            ${subjects.map(s => `<option value="${s.id}" ${material.subject_id == s.id ? 'selected' : ''}>${escHtml(s.title)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tip de material</label>
          <select name="type" class="form-input">
            ${TYPE_OPTIONS.map(t => `<option value="${t}" ${material.type === t ? 'selected' : ''}>${escHtml(typeLabel(t))}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Poziție în listă</label>
          <input type="number" name="order_index" class="form-input" value="${material.order_index ?? 0}" />
          <p class="form-help">Numerele mai mici apar primele.</p>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Titlul materialului</label>
        <input type="text" name="title" class="form-input" required value="${escHtml(material.title || '')}" placeholder="ex: Legile lui Newton" />
      </div>
      <div class="form-group">
        <label class="form-label">Conținut</label>
        <p class="form-help">Scrie aici lecția. Poți folosi butoanele de sus pentru text îngroșat, titluri, liste și imagini. Pentru formule, scrie-le între semnele dolar: <code>$v = d/t$</code>. Folosește butonul cu imagine ca să încarci o poză.</p>
        <textarea name="content" id="content-editor" class="form-input" rows="20">${escHtml(material.content || '')}</textarea>
      </div>
      <div class="form-actions">
        <a href="/admin/materials" class="btn btn-secondary">Anulează</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
  `;
}

router.get('/admin/materials/new', wrap(async (req, res) => {
  const subjects = await sb(supabase.from('subjects').select('id, title').order('order_index'));
  if (subjects.length === 0) {
    return res.send(adminPage('Material nou', `
      <div class="empty-state"><p>Trebuie să ai întâi cel puțin o materie înainte să adaugi materiale.</p><a href="/admin/subjects/new" class="btn btn-primary">+ Materie nouă</a></div>
    `, { activePath: '/admin/materials' }));
  }
  res.send(adminPage('Material nou', `
    <div class="breadcrumb"><a href="/admin/materials" class="breadcrumb-link">Materiale</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">Material nou</span></div>
    <h1 class="page-title">Material nou</h1>
    ${materialForm({ subjects, action: '/admin/materials', submitLabel: 'Adaugă materialul' })}
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
  res.send(adminPage('Modifică materialul', `
    <div class="breadcrumb"><a href="/admin/materials" class="breadcrumb-link">Materiale</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">${escHtml(material.title)}</span></div>
    <h1 class="page-title">Modifică materialul</h1>
    ${materialForm({ material, subjects, action: `/admin/materials/${material.id}`, submitLabel: 'Salvează' })}
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
    ? `<tr><td colspan="5" class="empty-td">Niciun test încă. <a href="/admin/tests/new">Adaugă primul test.</a></td></tr>`
    : tests.map(t => `
      <tr>
        <td>${escHtml(t.title)}</td>
        <td>${escHtml(subjMap[t.subject_id] || '—')}</td>
        <td>${qMap[t.id] || 0}</td>
        <td>${t.time_limit_minutes ? `${t.time_limit_minutes} min` : '—'}</td>
        <td class="cell-actions">
          <a href="/tests/${t.id}" class="btn-link" target="_blank">Vezi</a>
          <a href="/admin/tests/${t.id}/edit" class="btn-link">Modifică</a>
          <form method="POST" action="/admin/tests/${t.id}/delete" class="inline-form" onsubmit="return confirm('Ștergi testul și toate întrebările lui? Acțiunea nu poate fi anulată.');">
            <button type="submit" class="btn-link btn-link-danger">Șterge</button>
          </form>
        </td>
      </tr>
    `).join('');

  res.send(adminPage('Teste', `
    <div class="page-header page-header-row">
      <div><h1 class="page-title">Teste</h1><p class="page-subtitle">${tests.length} ${tests.length === 1 ? 'test' : 'teste'} în total</p></div>
      <a href="/admin/tests/new" class="btn btn-primary">+ Test nou</a>
    </div>
    <table class="data-table">
      <thead><tr><th>Titlu</th><th>Materie</th><th>Întrebări</th><th>Timp limită</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `, { activePath: '/admin/tests', flash: flashFor(req) }));
}));

function testMetaForm({ test = {}, subjects, action, submitLabel }) {
  return `
    <form method="POST" action="${action}" class="admin-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">La ce materie aparține</label>
          <select name="subject_id" class="form-input" required>
            ${subjects.map(s => `<option value="${s.id}" ${test.subject_id == s.id ? 'selected' : ''}>${escHtml(s.title)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Timp limită <span class="form-optional">(opțional)</span></label>
          <input type="number" name="time_limit_minutes" class="form-input" value="${test.time_limit_minutes ?? ''}" placeholder="ex: 30" />
          <p class="form-help">În minute. Lasă gol dacă testul nu are limită de timp.</p>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Titlul testului</label>
        <input type="text" name="title" class="form-input" required value="${escHtml(test.title || '')}" placeholder="ex: Subiectul I — Varianta 1" />
      </div>
      <div class="form-group">
        <label class="form-label">Descriere <span class="form-optional">(opțional)</span></label>
        <textarea name="description" class="form-input" rows="3" placeholder="Un scurt text afișat înainte ca elevul să înceapă testul.">${escHtml(test.description || '')}</textarea>
      </div>
      <div class="form-actions">
        <a href="/admin/tests" class="btn btn-secondary">Anulează</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
  `;
}

router.get('/admin/tests/new', wrap(async (req, res) => {
  const subjects = await sb(supabase.from('subjects').select('id, title').order('order_index'));
  if (subjects.length === 0) {
    return res.send(adminPage('Test nou', `
      <div class="empty-state"><p>Trebuie să ai întâi cel puțin o materie înainte să adaugi teste.</p><a href="/admin/subjects/new" class="btn btn-primary">+ Materie nouă</a></div>
    `, { activePath: '/admin/tests' }));
  }
  res.send(adminPage('Test nou', `
    <div class="breadcrumb"><a href="/admin/tests" class="breadcrumb-link">Teste</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">Test nou</span></div>
    <h1 class="page-title">Test nou</h1>
    <p class="page-subtitle" style="margin-bottom:20px">Întâi completezi detaliile testului. După ce îl salvezi, vei putea adăuga întrebările.</p>
    ${testMetaForm({ subjects, action: '/admin/tests', submitLabel: 'Creează testul' })}
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

  const totalPts = questions.reduce((s, q) => s + (parseFloat(q.points) || 0), 0);
  const ptsRounded = Math.round(totalPts * 100) / 100;

  const questionsHtml = questions.length === 0
    ? `<div class="empty-state-sm"><p>Testul nu are nicio întrebare încă. Apasă „+ Adaugă întrebare” ca să începi.</p></div>`
    : `<ol class="admin-question-list">
        ${questions.map(q => {
          let preview = '';
          if (q.type === 'grid') {
            try { preview = JSON.parse(q.question_text).prompt || ''; } catch (_) { preview = '(tabel)'; }
          } else {
            preview = q.question_text;
          }
          const pts = parseFloat(q.points) || 1;
          const ptsStr = (Math.round(pts * 100) / 100).toString();
          return `
            <li class="admin-question-item">
              <div class="aqi-main">
                <span class="type-tag type-${q.type.replace('_','-')}">${escHtml(qtypeLabel(q.type))}</span>
                <span class="aqi-text">${escHtml(preview.slice(0, 120))}${preview.length > 120 ? '…' : ''}</span>
                <span class="aqi-pts">${ptsStr} ${pts === 1 ? 'punct' : 'puncte'}</span>
                ${q.type === 'multiple_choice' ? `<span class="aqi-meta">${ansCount[q.id] || 0} variante</span>` : ''}
              </div>
              <div class="aqi-actions">
                <a href="/admin/questions/${q.id}/edit" class="btn-link">Modifică</a>
                <form method="POST" action="/admin/questions/${q.id}/delete" class="inline-form" onsubmit="return confirm('Ștergi această întrebare? Acțiunea nu poate fi anulată.');">
                  <button type="submit" class="btn-link btn-link-danger">Șterge</button>
                </form>
              </div>
            </li>`;
        }).join('')}
      </ol>`;

  res.send(adminPage('Modifică testul', `
    <div class="breadcrumb"><a href="/admin/tests" class="breadcrumb-link">Teste</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current">${escHtml(test.title)}</span></div>
    <h1 class="page-title">Modifică testul</h1>

    <section class="admin-section">
      <h2 class="section-heading">Detaliile testului</h2>
      ${testMetaForm({ test, subjects, action: `/admin/tests/${test.id}`, submitLabel: 'Salvează' })}
    </section>

    <section class="admin-section">
      <div class="admin-section-header">
        <h2 class="section-heading">Întrebări (${questions.length}) · ${ptsRounded} ${ptsRounded === 1 ? 'punct' : 'puncte'} în total</h2>
        <a href="/admin/tests/${test.id}/questions/new" class="btn btn-primary">+ Adaugă întrebare</a>
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
          <label class="form-label">Tipul întrebării</label>
          <select name="type" id="qtype-select" class="form-input">
            ${QTYPE_OPTIONS.map(t => `<option value="${t}" ${type === t ? 'selected' : ''}>${escHtml(qtypeLabel(t))}</option>`).join('')}
          </select>
          <p class="form-help">Alegere multiplă = elevul bifează dintr-o listă. Răspuns scurt = elevul scrie un cuvânt/număr. Tabel = elevul completează o grilă.</p>
        </div>
        <div class="form-group">
          <label class="form-label">Câte puncte valorează</label>
          <input type="number" name="points" class="form-input" min="0" step="0.25" value="${question.points || 1}" />
          <p class="form-help">Punctajul acestei întrebări (ex: 3).</p>
        </div>
        <div class="form-group">
          <label class="form-label">Poziție</label>
          <input type="number" name="order_index" class="form-input" value="${question.order_index ?? 0}" />
          <p class="form-help">Ordinea în test. Mai mic = mai sus.</p>
        </div>
      </div>

      <!-- MC + Short Answer share question_text -->
      <div class="form-group qtype-section" data-show-for="multiple_choice short_answer">
        <label class="form-label">Textul întrebării</label>
        <textarea name="question_text" class="form-input" rows="3" placeholder="Scrie aici întrebarea…">${escHtml(isGrid ? '' : (question.question_text || ''))}</textarea>
        <p class="form-help">Pentru formule, scrie-le între semnele dolar, ex: <code>$v = d/t$</code>. Poți folosi paleta de simboluri care apare când scrii.</p>
      </div>

      <!-- MC answers -->
      <div class="qtype-section" data-show-for="multiple_choice">
        <label class="form-label">Variante de răspuns</label>
        <p class="form-help">Scrie fiecare variantă și bifează căsuța din stânga la varianta (sau variantele) corectă.</p>
        <div id="mc-answers">
          ${(isMC && answers.length > 0 ? answers : [{}, {}]).map((a, i) => `
            <div class="mc-answer-row">
              <input type="checkbox" name="answer_correct_${i}" value="1" ${a.is_correct ? 'checked' : ''} title="Bifează dacă este varianta corectă" />
              <input type="text" name="answer_text_${i}" class="form-input" placeholder="Variantă de răspuns" value="${escHtml(a.answer_text || '')}" />
              <button type="button" class="btn-link btn-link-danger remove-mc-answer">Șterge</button>
            </div>
          `).join('')}
        </div>
        <button type="button" id="add-mc-answer" class="btn btn-secondary btn-sm">+ Adaugă variantă</button>
        <input type="hidden" name="mc_answer_count" id="mc-answer-count" value="${(isMC && answers.length > 0 ? answers.length : 2)}" />
      </div>

      <!-- Short answer correct -->
      <div class="form-group qtype-section" data-show-for="short_answer">
        <label class="form-label">Răspunsul corect</label>
        <input type="text" name="sa_correct" class="form-input" value="${escHtml(saCorrect)}" placeholder="ex: 9.8" />
        <p class="form-help">Răspunsul elevului trebuie să fie identic cu acesta. Nu contează majusculele și nici spațiile de la început/sfârșit.</p>
      </div>

      <!-- Grid -->
      <div class="qtype-section" data-show-for="grid">
        <div class="form-group">
          <label class="form-label">Cerința (ce trebuie să facă elevul)</label>
          <input type="text" name="grid_prompt" id="grid-prompt" class="form-input" value="${escHtml(gridConfig.prompt || '')}" placeholder="ex: Completează tabelul cu valorile corecte" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Număr de rânduri</label>
            <input type="number" id="grid-rows" class="form-input" min="1" max="20" value="${gridConfig.rows}" />
          </div>
          <div class="form-group">
            <label class="form-label">Număr de coloane</label>
            <input type="number" id="grid-cols" class="form-input" min="1" max="20" value="${gridConfig.cols}" />
          </div>
          <div class="form-group">
            <label class="form-label">&nbsp;</label>
            <button type="button" id="grid-rebuild" class="btn btn-secondary">Aplică dimensiunile</button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Titluri de rânduri <span class="form-optional">(opțional)</span></label>
            <textarea id="grid-row-headers" class="form-input" rows="4" placeholder="Câte un titlu pe linie">${escHtml((gridConfig.row_headers || []).join('\n'))}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Titluri de coloane <span class="form-optional">(opțional)</span></label>
            <textarea id="grid-col-headers" class="form-input" rows="4" placeholder="Câte un titlu pe linie">${escHtml((gridConfig.col_headers || []).join('\n'))}</textarea>
          </div>
        </div>
        <p class="form-help">Scrie valoarea corectă în fiecare căsuță. Apasă pe lacăt (🔒) ca să arăți deja o căsuță completată elevului (nu o va putea modifica).</p>
        <div id="grid-builder"></div>
        <input type="hidden" name="grid_json" id="grid-json" value="${escHtml(JSON.stringify(gridConfig))}" />
      </div>

      <div class="form-actions">
        <a href="/admin/tests/${test.id}/edit" class="btn btn-secondary">Anulează</a>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
  `;
}

router.get('/admin/tests/:tid/questions/new', wrap(async (req, res) => {
  const test = await sb(supabase.from('tests').select('*').eq('id', req.params.tid).maybeSingle());
  if (!test) return res.redirect('/admin/tests');
  res.send(adminPage('Întrebare nouă', `
    <div class="breadcrumb">
      <a href="/admin/tests" class="breadcrumb-link">Teste</a><span class="breadcrumb-sep">›</span>
      <a href="/admin/tests/${test.id}/edit" class="breadcrumb-link">${escHtml(test.title)}</a><span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">Întrebare nouă</span>
    </div>
    <h1 class="page-title">Întrebare nouă</h1>
    ${questionForm({ test, action: `/admin/tests/${test.id}/questions`, submitLabel: 'Adaugă întrebarea' })}
  `, { activePath: '/admin/tests', extraScripts: ['/admin-math.js', '/admin-question.js'] }));
}));

async function saveQuestionFromBody(qid, body, isUpdate) {
  const type = QTYPE_OPTIONS.includes(body.type) ? body.type : 'multiple_choice';
  const points = parseFloat(body.points) || 1;
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
  res.send(adminPage('Modifică întrebarea', `
    <div class="breadcrumb">
      <a href="/admin/tests" class="breadcrumb-link">Teste</a><span class="breadcrumb-sep">›</span>
      <a href="/admin/tests/${test.id}/edit" class="breadcrumb-link">${escHtml(test.title)}</a><span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">Modifică întrebarea</span>
    </div>
    <h1 class="page-title">Modifică întrebarea</h1>
    ${questionForm({ question, answers, test, action: `/admin/questions/${question.id}`, submitLabel: 'Salvează' })}
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
