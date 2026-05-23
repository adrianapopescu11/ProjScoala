require('dotenv').config();
const fs = require('fs');
const supabase = require('./database');
const { extractArrayLiteral } = require('./import-physics');

const BUCKET = 'eduflow-uploads';

const sb = async (q) => {
  const { data, error } = await q;
  if (error) throw error;
  return data;
};

async function ensureColumn() {
  const { error } = await supabase.from('tests').select('image_url').limit(1);
  if (!error) return true;
  console.error('\n!! The "tests.image_url" column does not exist yet.');
  console.error('!! Run this in the Supabase SQL Editor, then re-run this script:\n');
  console.error('   ALTER TABLE tests ADD COLUMN IF NOT EXISTS image_url TEXT;\n');
  return false;
}

async function ensureBucket() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (!data.some(b => b.name === BUCKET)) {
    const { error: ce } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (ce && !/already exists/i.test(ce.message)) throw ce;
    console.log(`Created public bucket "${BUCKET}"`);
  }
}

function parseDataUri(uri) {
  const m = uri.match(/^data:([^;,]+)(?:;base64)?,([\s\S]*)$/);
  if (!m) throw new Error('not a data URI');
  const mime = m[1];
  const buf = Buffer.from(m[2], 'base64');
  const ext = (mime.split('/')[1] || 'bin').replace(/^x-/, '').split('+')[0];
  return { mime, buf, ext };
}

async function uploadImage(path, mime, buf) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function main() {
  if (!(await ensureColumn())) process.exit(1);
  await ensureBucket();

  const subj = await sb(
    supabase.from('subjects').select('id').eq('title', 'Fizică Electricitate').maybeSingle()
  );
  if (!subj) throw new Error('Subject "Fizică Electricitate" not found — run import-physics.js first.');

  const html = fs.readFileSync('/tmp/cc-subii-iii.html', 'utf8');
  const arr = JSON.parse(extractArrayLiteral(html, 'DATA'));

  let uploaded = 0, skipped = 0, unmatched = 0;
  for (const p of arr) {
    if (!p.image) continue;
    const paper = p.subject;          // "II" or "III"
    const num = p.nr;
    const titlePrefix = `Subiectul ${paper} — Varianta ${num}`;
    const tests = await sb(
      supabase.from('tests')
        .select('id,title,image_url')
        .eq('subject_id', subj.id)
        .or(`title.eq.${titlePrefix},title.like.${titlePrefix} —%`)
    );
    if (tests.length === 0) {
      console.log(`  ? no test found for "${titlePrefix}"`);
      unmatched++;
      continue;
    }
    const test = tests[0];
    if (test.image_url) {
      console.log(`  [skip] ${test.title}`);
      skipped++;
      continue;
    }
    const { mime, buf, ext } = parseDataUri(p.image);
    const path = `physics/cc-sub-${paper.toLowerCase()}-${String(num).padStart(2, '0')}.${ext}`;
    const url = await uploadImage(path, mime, buf);
    await sb(supabase.from('tests').update({ image_url: url }).eq('id', test.id));
    console.log(`  [ok]   ${test.title}  →  ${path}  (${(buf.length / 1024).toFixed(1)} KB)`);
    uploaded++;
  }
  console.log(`\nDone. Uploaded ${uploaded}, skipped ${skipped} (already had image), ${unmatched} unmatched.`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { main };
