require('dotenv').config();
const fs = require('fs');
const vm = require('vm');
const supabase = require('./database');

const sb = async (q) => {
  const { data, error } = await q;
  if (error) throw error;
  return data;
};

// ─── Topics & source mapping ─────────────────────────────────────────────────

const TOPICS = [
  { slug: 'mec', name: 'Mecanică',      subject: 'Fizică Mecanică',      color: '#5C7A5C', order: 1 },
  { slug: 'td',  name: 'Termodinamică', subject: 'Fizică Termodinamică', color: '#A8624A', order: 2 },
  { slug: 'cc',  name: 'Electricitate', subject: 'Fizică Electricitate', color: '#4A6FA8', order: 3 },
  { slug: 'op',  name: 'Optică',        subject: 'Fizică Optică',        color: '#A89A4A', order: 4 },
];

// One row per (topic, paper). `paper` ∈ I | II | III. `file` is the local HTML cache.
// `format` describes the JS data variable shape.
const SOURCES = [
  // Subject I — multiple choice
  { topic: 'mec', paper: 'I',  file: '/tmp/mec-sub-i.html',     format: 'quizData' },
  { topic: 'td',  paper: 'I',  file: '/tmp/td-sub-i.html',      format: 'quizData' },
  { topic: 'cc',  paper: 'I',  file: '/tmp/cc-sub-i.html',      format: 'DATA-mc' },
  { topic: 'op',  paper: 'I',  file: '/tmp/op-sub-i.html',      format: 'quizData' },

  // Subject II — short answer (problems with multiple numerical parts)
  { topic: 'mec', paper: 'II', file: '/tmp/mec-sub-ii.html',    format: 'problemeData' },
  { topic: 'td',  paper: 'II', file: '/tmp/td-sub-ii.html',     format: 'problems' },
  { topic: 'cc',  paper: 'II', file: '/tmp/cc-subii-iii.html',  format: 'DATA-cc', filter: 'II' },
  { topic: 'op',  paper: 'II', file: '/tmp/op-sub-ii.html',     format: 'problemeData' },

  // Subject III — short answer
  { topic: 'mec', paper: 'III', file: '/tmp/mec-sub-iii.html',  format: 'problemeData' },
  { topic: 'td',  paper: 'III', file: '/tmp/td-sub-iii.html',   format: 'problems' },
  { topic: 'cc',  paper: 'III', file: '/tmp/cc-subii-iii.html', format: 'DATA-cc', filter: 'III' },
  { topic: 'op',  paper: 'III', file: '/tmp/op-sub-iii.html',   format: 'problems' },
];

const TIME_LIMIT = { I: 20, II: 45, III: 60 };

// ─── HTML extraction ──────────────────────────────────────────────────────────

function extractArrayLiteral(html, varName) {
  const re = new RegExp('const\\s+' + varName + '\\s*=\\s*');
  const m = html.match(re);
  if (!m) throw new Error(`Could not find "const ${varName}" in source`);
  let i = m.index + m[0].length;
  while (i < html.length && html[i] !== '[') i++;
  if (html[i] !== '[') throw new Error(`No array literal after "const ${varName}"`);
  const start = i;
  let depth = 0, inStr = null, esc = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('Array literal never closed');
}

function evalJsArray(code) {
  try { return JSON.parse(code); } catch (_) { /* fall through */ }
  return vm.runInNewContext('(' + code + ')', {});
}

function stripLeadingNum(s) {
  return String(s).replace(/^\s*[a-zA-Z]?\d+\.\s*/, '').trim();
}

// ─── Numeric formatting ──────────────────────────────────────────────────────

function fmtNum(n) {
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  if (n === 0) return '0';
  const abs = Math.abs(n);
  let s;
  if (abs >= 1e6 || abs < 1e-3) {
    s = n.toExponential(2);
  } else {
    const digits = Math.max(0, 3 - Math.floor(Math.log10(abs)) - 1);
    s = n.toFixed(digits);
  }
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}

function fmtAnswer(vals, unit) {
  const list = Array.isArray(vals) ? vals : [vals];
  return list.map(fmtNum).join('; ');
}

// ─── Normalizers — each returns: { variants: [{ num, title, statement, parts: [{prompt, answer}] }] } ───

function normMC_quizData(arr) {
  return arr.map(b => ({
    num: b.battery,
    title: null,
    statement: null,
    parts: b.questions.map(q => ({
      prompt: stripLeadingNum(q.q),
      options: q.options.map(String),
      correctIndex: q.correct,
    })),
  }));
}

function normMC_DATA(arr) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return arr.map(b => ({
    num: b.num,
    title: null,
    statement: null,
    parts: b.questions.map(q => {
      const present = letters.filter(L => L in q.options);
      const options = present.map(L => String(q.options[L]));
      const correctIndex = present.indexOf(q.answer);
      if (correctIndex < 0) throw new Error(`Unknown answer ${q.answer}`);
      return { prompt: stripLeadingNum(q.text), options, correctIndex };
    }),
  }));
}

function normProblemeData(arr) {
  return arr.map(p => {
    const inputs = p.inputs || [];
    return {
      num: p.id,
      title: p.title || null,
      statement: p.text || '',
      parts: inputs.map(inp => ({
        prompt: stripLeadingNum(inp.label),
        answer: fmtNum(Number(inp.target)),
      })),
    };
  });
}

function normProblems(arr) {
  return arr.map(p => {
    const parts = (p.parts || []).map(part => {
      const promptBase = `${part.label}. ${part.prompt}`;
      const unit = part.unit ? ` (${part.unit})` : '';
      return {
        prompt: promptBase + unit,
        answer: fmtNum(Number(part.answer)),
      };
    });
    return {
      num: p.n,
      title: p.title || null,
      statement: p.enunt || '',
      parts,
    };
  });
}

function normDATA_cc(arr, filter) {
  const filtered = arr.filter(e => e.subject === filter);
  return filtered.map(p => {
    // texts: ["Schema / datele circuitului:", "<problem statement>", "a. ...", "b. ...", ...]
    const statement = (p.texts || []).slice(0, 2).filter(t => !/^Schema\s*\//i.test(t)).join('\n\n');
    const requirements = (p.texts || []).slice(2);
    const parts = (p.answers || []).map((a, i) => {
      const reqText = requirements[i] || `Partea ${i + 1}`;
      const unit = a.unit ? ` (${a.unit})` : '';
      const note = a.note ? ` — ${a.note}` : '';
      return {
        prompt: reqText + unit + note,
        answer: fmtAnswer(a.vals, a.unit),
      };
    });
    return {
      num: p.nr,
      title: p.title || null,
      statement,
      parts,
    };
  });
}

function loadSource(src) {
  const html = fs.readFileSync(src.file, 'utf8');
  switch (src.format) {
    case 'quizData':     return normMC_quizData(evalJsArray(extractArrayLiteral(html, 'quizData')));
    case 'DATA-mc':      return normMC_DATA(JSON.parse(extractArrayLiteral(html, 'DATA')));
    case 'problemeData': return normProblemeData(evalJsArray(extractArrayLiteral(html, 'problemeData')));
    case 'problems':     return normProblems(JSON.parse(extractArrayLiteral(html, 'problems')));
    case 'DATA-cc':      return normDATA_cc(JSON.parse(extractArrayLiteral(html, 'DATA')), src.filter);
    default: throw new Error('Unknown format ' + src.format);
  }
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function findSubject(title) {
  const r = await sb(supabase.from('subjects').select('*').eq('title', title).limit(1));
  return r[0] || null;
}

async function ensureTopicSubjects() {
  const out = {};
  for (const t of TOPICS) {
    let s = await findSubject(t.subject);
    if (!s) {
      s = await sb(
        supabase.from('subjects').insert({
          title: t.subject,
          description: `Teste BAC pentru ${t.name} — Subiectul I, II și III. Sursă: prof. Popescu Adriana Cătălina.`,
          color: t.color,
          order_index: t.order + 10,
        }).select('*').single()
      );
      console.log(`+ Created subject "${t.subject}" (id ${s.id})`);
    }
    out[t.slug] = s;
  }
  return out;
}

async function migrateOldFizica(topicSubjects) {
  const old = await findSubject('Fizică');
  if (!old) {
    console.log('No legacy "Fizică" subject to migrate.');
    return;
  }
  const tests = await sb(supabase.from('tests').select('id,title').eq('subject_id', old.id));
  console.log(`Migrating ${tests.length} tests off legacy "Fizică"…`);
  for (const t of tests) {
    let slug = null;
    if (/^Mecanică/i.test(t.title))         slug = 'mec';
    else if (/^Termodinamică/i.test(t.title)) slug = 'td';
    else if (/^Electricitate/i.test(t.title)) slug = 'cc';
    else if (/^Optică/i.test(t.title))      slug = 'op';
    if (!slug) {
      console.log(`  ? unknown topic in title "${t.title}" — leaving in place`);
      continue;
    }
    const newTitle = t.title.replace(/^[^—]+—\s*/, '').trim(); // "Mecanică — Subiectul I — Varianta 1" -> "Subiectul I — Varianta 1"
    await sb(
      supabase.from('tests')
        .update({ subject_id: topicSubjects[slug].id, title: newTitle })
        .eq('id', t.id)
    );
  }
  // Delete the old subject if it is now empty
  const leftover = await sb(supabase.from('tests').select('id').eq('subject_id', old.id).limit(1));
  if (leftover.length === 0) {
    await sb(supabase.from('subjects').delete().eq('id', old.id));
    console.log(`- Deleted legacy subject "Fizică"`);
  } else {
    console.log(`! "Fizică" still has ${leftover.length}+ tests; not deleting`);
  }
}

function stripVariantPrefix(title) {
  return String(title || '')
    .replace(/^\s*(?:Testul|Varianta|Problema)\s*\d+\s*[:.\-—]\s*/i, '')
    .trim();
}

async function importTest(subjectId, paper, variant) {
  const cleanSubtitle = stripVariantPrefix(variant.title);
  const titlePart = cleanSubtitle ? ` — ${cleanSubtitle}` : '';
  const title = `Subiectul ${paper} — Varianta ${variant.num}${titlePart}`;

  const existing = await sb(
    supabase.from('tests').select('id').eq('subject_id', subjectId).eq('title', title).limit(1)
  );
  if (existing.length > 0) {
    return { inserted: false, title };
  }

  const description = variant.statement
    ? variant.statement
    : `${variant.parts.length} întrebări${paper === 'I' ? ' grilă' : ''}.`;

  const test = await sb(
    supabase.from('tests').insert({
      subject_id: subjectId,
      title,
      description,
      time_limit_minutes: TIME_LIMIT[paper],
    }).select('id').single()
  );

  let order = 1;
  for (const part of variant.parts) {
    let questionText = part.prompt;
    if (paper !== 'I' && variant.statement) {
      // Include problem statement at the top so context is visible during test-taking
      questionText = `${variant.statement}\n\n${part.prompt}`;
    }
    const type = paper === 'I' ? 'multiple_choice' : 'short_answer';
    const qRow = await sb(
      supabase.from('questions').insert({
        test_id: test.id,
        question_text: questionText,
        type,
        order_index: order,
        points: 1,
      }).select('id').single()
    );
    if (type === 'multiple_choice') {
      const rows = part.options.map((opt, i) => ({
        question_id: qRow.id,
        answer_text: opt,
        is_correct: i === part.correctIndex ? 1 : 0,
      }));
      await sb(supabase.from('answers').insert(rows));
    } else {
      await sb(supabase.from('answers').insert({
        question_id: qRow.id,
        answer_text: part.answer,
        is_correct: 1,
      }));
    }
    order++;
  }
  return { inserted: true, title };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const topicSubjects = await ensureTopicSubjects();
  await migrateOldFizica(topicSubjects);

  const counts = { inserted: 0, skipped: 0, byPaper: { I: 0, II: 0, III: 0 } };

  for (const src of SOURCES) {
    const topic = TOPICS.find(t => t.slug === src.topic);
    const subj = topicSubjects[src.topic];
    let variants;
    try {
      variants = loadSource(src);
    } catch (e) {
      console.error(`\n✗ ${topic.name} Sub ${src.paper}: failed to load ${src.file}: ${e.message}`);
      continue;
    }
    variants.sort((a, b) => a.num - b.num);
    console.log(`\n${topic.name} — Subiectul ${src.paper}: ${variants.length} variante`);
    for (const v of variants) {
      // Skip variants with zero numerical parts (e.g. all-diagram problems)
      if (!v.parts || v.parts.length === 0) {
        console.log(`  [skip:empty] Varianta ${v.num}`);
        continue;
      }
      const { inserted, title } = await importTest(subj.id, src.paper, v);
      if (inserted) {
        console.log(`  [ok]   ${title} (${v.parts.length} q)`);
        counts.inserted++;
        counts.byPaper[src.paper]++;
      } else {
        console.log(`  [skip] ${title}`);
        counts.skipped++;
      }
    }
  }

  console.log(`\nDone. Inserted ${counts.inserted} tests (I:${counts.byPaper.I} II:${counts.byPaper.II} III:${counts.byPaper.III}), skipped ${counts.skipped} pre-existing.`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { main, extractArrayLiteral, evalJsArray, loadSource, TOPICS, SOURCES };
