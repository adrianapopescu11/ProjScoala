require('dotenv').config();
const fs = require('fs');
const vm = require('vm');
const supabase = require('./database');
const { extractArrayLiteral } = require('./import-physics');

const BUCKET = 'eduflow-uploads';

const sb = async (q) => {
  const { data, error } = await q;
  if (error) throw error;
  return data;
};

// (topic, paper) → { file, dataVar, subjectTitle }
const SOURCES = [
  { topic: 'td', paper: 'II',  file: '/tmp/td-sub-ii.html',  dataVar: 'problems', subjectTitle: 'Fizică Termodinamică' },
  { topic: 'td', paper: 'III', file: '/tmp/td-sub-iii.html', dataVar: 'problems', subjectTitle: 'Fizică Termodinamică' },
  { topic: 'op', paper: 'III', file: '/tmp/op-sub-iii.html', dataVar: 'problems', subjectTitle: 'Fizică Optică' },
];

// Extra source files to pull missing diagrams from (when a key referenced in one file is defined in another)
const DIAGRAM_FALLBACKS = ['/tmp/td-sub-ii.html', '/tmp/td-sub-iii.html', '/tmp/op-sub-ii.html', '/tmp/op-sub-iii.html'];

function extractObjectLiteral(html, varName) {
  const re = new RegExp('const\\s+' + varName + '\\s*=\\s*');
  const m = html.match(re);
  if (!m) return null;
  let i = m.index + m[0].length;
  while (i < html.length && html[i] !== '{') i++;
  if (html[i] !== '{') return null;
  let depth = 0, inStr = null, esc = false;
  const s = i;
  for (; i < html.length; i++) {
    const c = html[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return html.slice(s, i + 1);
    }
  }
  return null;
}

function loadObject(code) {
  try { return JSON.parse(code); } catch (_) { /* fall through */ }
  return vm.runInNewContext('(' + code + ')', {});
}

function loadArray(code) {
  try { return JSON.parse(code); } catch (_) { /* fall through */ }
  return vm.runInNewContext('(' + code + ')', {});
}

function wrapSvg(inner) {
  let svg = String(inner).trim();
  // Browsers require xmlns on standalone SVG files served as image/svg+xml.
  if (!/<svg[^>]*\sxmlns=/i.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + svg;
}

async function ensureBucket() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (!data.some(b => b.name === BUCKET)) {
    const { error: ce } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (ce && !/already exists/i.test(ce.message)) throw ce;
  }
}

async function uploadSvg(path, svgText) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(svgText, 'utf8'), {
    contentType: 'image/svg+xml',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function buildDiagramPool() {
  const pool = {};
  for (const f of DIAGRAM_FALLBACKS) {
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, 'utf8');
    const code = extractObjectLiteral(html, 'diagrams');
    if (!code) continue;
    const obj = loadObject(code);
    for (const [k, v] of Object.entries(obj)) {
      if (!(k in pool)) pool[k] = v;
    }
  }
  return pool;
}

async function main() {
  // Verify image_url column exists.
  const colCheck = await supabase.from('tests').select('image_url').limit(1);
  if (colCheck.error) {
    console.error('!! tests.image_url column not found. Run import-images.js first / apply migration.');
    process.exit(1);
  }
  await ensureBucket();

  const pool = buildDiagramPool();
  console.log(`Diagram pool: ${Object.keys(pool).length} unique keys`);

  let uploaded = 0, skipped = 0, missingKey = 0, unmatched = 0;

  for (const src of SOURCES) {
    const html = fs.readFileSync(src.file, 'utf8');
    const arr = loadArray(extractArrayLiteral(html, src.dataVar));
    const subj = await sb(
      supabase.from('subjects').select('id').eq('title', src.subjectTitle).maybeSingle()
    );
    if (!subj) { console.warn(`! subject "${src.subjectTitle}" missing — skipping ${src.file}`); continue; }

    console.log(`\n${src.subjectTitle} — Subiectul ${src.paper}: ${arr.length} probleme`);

    for (const p of arr) {
      if (!p.diagram) continue;
      const svgInner = pool[p.diagram];
      if (!svgInner) {
        console.log(`  ? no diagram in pool for key "${p.diagram}" (Varianta ${p.n || p.id})`);
        missingKey++;
        continue;
      }

      const num = p.n || p.id;
      const titlePrefix = `Subiectul ${src.paper} — Varianta ${num}`;
      const tests = await sb(
        supabase.from('tests')
          .select('id,title,image_url')
          .eq('subject_id', subj.id)
          .or(`title.eq.${titlePrefix},title.like.${titlePrefix} —%`)
      );
      if (tests.length === 0) {
        console.log(`  ? no test for "${titlePrefix}"`);
        unmatched++;
        continue;
      }
      const test = tests[0];
      if (test.image_url) {
        console.log(`  [skip] ${test.title}`);
        skipped++;
        continue;
      }

      const path = `physics/${src.topic}-sub-${src.paper.toLowerCase()}-${String(num).padStart(2, '0')}-${p.diagram}.svg`;
      const url = await uploadSvg(path, wrapSvg(svgInner));
      await sb(supabase.from('tests').update({ image_url: url }).eq('id', test.id));
      console.log(`  [ok]   ${test.title}  →  ${p.diagram}.svg`);
      uploaded++;
    }
  }

  console.log(`\nDone. Uploaded ${uploaded}, skipped ${skipped} (already had image), ${missingKey} missing diagram keys, ${unmatched} tests unmatched.`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { main };
