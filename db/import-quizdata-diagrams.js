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

const SOURCES = [
  { topic: 'mec', file: '/tmp/mec-sub-i.html', subjectTitle: 'Fizică Mecanică' },
  { topic: 'td',  file: '/tmp/td-sub-i.html',  subjectTitle: 'Fizică Termodinamică' },
  { topic: 'op',  file: '/tmp/op-sub-i.html',  subjectTitle: 'Fizică Optică' },
];

async function ensureColumn() {
  const { error } = await supabase.from('questions').select('image_url').limit(1);
  if (!error) return true;
  console.error('\n!! The "questions.image_url" column does not exist yet.');
  console.error('!! Run this in the Supabase SQL Editor first:\n');
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

  let uploaded = 0, skipped = 0, unmatched = 0;

  for (const src of SOURCES) {
    const html = fs.readFileSync(src.file, 'utf8');
    const arr = vm.runInNewContext('(' + extractArrayLiteral(html, 'quizData') + ')', {});
    const subj = await sb(
      supabase.from('subjects').select('id').eq('title', src.subjectTitle).maybeSingle()
    );
    if (!subj) { console.warn(`! subject "${src.subjectTitle}" missing — skipping`); continue; }

    for (const battery of arr) {
      for (let qi = 0; qi < battery.questions.length; qi++) {
        const q = battery.questions[qi];
        if (!q.diagram || !String(q.diagram).trim()) continue;

        const order = qi + 1;
        const titlePrefix = `Subiectul I — Varianta ${battery.battery}`;
        const tests = await sb(
          supabase.from('tests')
            .select('id,title')
            .eq('subject_id', subj.id)
            .or(`title.eq.${titlePrefix},title.like.${titlePrefix} —%`)
        );
        if (tests.length === 0) {
          console.log(`  ? no test for "${titlePrefix}" in ${src.subjectTitle}`);
          unmatched++;
          continue;
        }
        const test = tests[0];
        const question = await sb(
          supabase.from('questions')
            .select('id,image_url')
            .eq('test_id', test.id)
            .eq('order_index', order)
            .maybeSingle()
        );
        if (!question) {
          console.log(`  ? no question #${order} in "${test.title}"`);
          unmatched++;
          continue;
        }
        if (question.image_url) {
          console.log(`  [skip] ${src.subjectTitle} V${battery.battery} Q${order}`);
          skipped++;
          continue;
        }
        const path = `physics/${src.topic}-sub-i-v${String(battery.battery).padStart(2, '0')}-q${order}.svg`;
        const url = await uploadSvg(path, wrapSvg(q.diagram));
        await sb(supabase.from('questions').update({ image_url: url }).eq('id', question.id));
        console.log(`  [ok]   ${src.subjectTitle} V${battery.battery} Q${order} → ${path}`);
        uploaded++;
      }
    }
  }

  console.log(`\nDone. Uploaded ${uploaded}, skipped ${skipped}, unmatched ${unmatched}.`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { main };
