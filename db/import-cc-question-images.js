require('dotenv').config();
const fs = require('fs');
const supabase = require('./database');

const BUCKET = 'eduflow-uploads';
const SOURCE_FILE = '/tmp/cc-sub-i.html';

const sb = async (q) => {
  const { data, error } = await q;
  if (error) throw error;
  return data;
};

async function ensureColumn() {
  const { error } = await supabase.from('questions').select('image_url').limit(1);
  if (!error) return true;
  console.error('\n!! The "questions.image_url" column does not exist yet.');
  console.error('!! Run this in the Supabase SQL Editor, then re-run this script:\n');
  console.error('   ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;\n');
  return false;
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

// Scan HTML for each `<div class="diagram"><svg ...>...</svg></div>` block,
// and pair it with the most recent preceding `name="s{B}_q{Q}"` radio-button.
function extractQuestionDiagrams(html) {
  const radioRe = /name="s(\d+)_q(\d+)"/g;
  const diagramRe = /<div class="diagram">\s*(<svg[\s\S]*?<\/svg>)\s*<\/div>/g;

  const radios = [];
  let r;
  while ((r = radioRe.exec(html)) !== null) {
    radios.push({ offset: r.index, battery: parseInt(r[1]), qnum: parseInt(r[2]) });
  }

  const out = [];
  let m;
  while ((m = diagramRe.exec(html)) !== null) {
    const svg = m[1];
    const offset = m.index;
    // Walk back through radios — last one before this diagram
    let last = null;
    for (const rb of radios) {
      if (rb.offset < offset) last = rb;
      else break;
    }
    if (!last) continue;
    out.push({ battery: last.battery, qnum: last.qnum, svg, offset });
  }
  return out;
}

function wrapSvg(inner) {
  let svg = String(inner).trim();
  if (!/<svg[^>]*\sxmlns=/i.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + svg;
}

async function main() {
  if (!(await ensureColumn())) process.exit(1);
  await ensureBucket();

  const subj = await sb(
    supabase.from('subjects').select('id').eq('title', 'Fizică Electricitate').maybeSingle()
  );
  if (!subj) throw new Error('Subject "Fizică Electricitate" not found.');

  const html = fs.readFileSync(SOURCE_FILE, 'utf8');
  const pairs = extractQuestionDiagrams(html);
  console.log(`Found ${pairs.length} (question, diagram) pairs in ${SOURCE_FILE}`);

  let uploaded = 0, skipped = 0, unmatched = 0;
  for (const p of pairs) {
    const titlePrefix = `Subiectul I — Varianta ${p.battery}`;
    const tests = await sb(
      supabase.from('tests')
        .select('id,title')
        .eq('subject_id', subj.id)
        .or(`title.eq.${titlePrefix},title.like.${titlePrefix} —%`)
    );
    if (tests.length === 0) {
      console.log(`  ? no test for "${titlePrefix}"`);
      unmatched++;
      continue;
    }
    const test = tests[0];
    const question = await sb(
      supabase.from('questions')
        .select('id,order_index,image_url')
        .eq('test_id', test.id)
        .eq('order_index', p.qnum)
        .maybeSingle()
    );
    if (!question) {
      console.log(`  ? no question #${p.qnum} in "${test.title}"`);
      unmatched++;
      continue;
    }
    if (question.image_url) {
      console.log(`  [skip] V${p.battery} Q${p.qnum} (already has image)`);
      skipped++;
      continue;
    }
    const path = `physics/cc-sub-i-v${String(p.battery).padStart(2, '0')}-q${p.qnum}.svg`;
    const url = await uploadSvg(path, wrapSvg(p.svg));
    await sb(supabase.from('questions').update({ image_url: url }).eq('id', question.id));
    console.log(`  [ok]   V${p.battery} Q${p.qnum} → ${path}`);
    uploaded++;
  }

  console.log(`\nDone. Uploaded ${uploaded}, skipped ${skipped} (already had image), ${unmatched} unmatched.`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { main };
