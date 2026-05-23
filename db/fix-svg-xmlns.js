require('dotenv').config();
const supabase = require('./database');

const BUCKET = 'eduflow-uploads';
const PREFIX = 'physics';

function fixSvg(text) {
  let s = String(text);
  if (/<svg[^>]*\sxmlns=/i.test(s)) return null; // already OK
  // Strip any existing XML prolog
  s = s.replace(/^\s*<\?xml[^>]*\?>\s*/i, '');
  // Inject xmlns on the <svg ...> root tag
  s = s.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + s.trim();
}

async function main() {
  // List all files under physics/
  const { data: files, error } = await supabase.storage.from(BUCKET).list(PREFIX, { limit: 1000 });
  if (error) throw error;
  const svgs = files.filter(f => f.name.endsWith('.svg'));
  console.log(`Found ${svgs.length} SVG files in ${BUCKET}/${PREFIX}/`);

  let fixed = 0, ok = 0, failed = 0;
  for (const f of svgs) {
    const path = `${PREFIX}/${f.name}`;
    const { data, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
    if (dlErr) { console.log(`  ! download fail ${f.name}: ${dlErr.message}`); failed++; continue; }
    const text = await data.text();
    const fixedText = fixSvg(text);
    if (fixedText === null) { ok++; continue; }
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(fixedText, 'utf8'), {
      contentType: 'image/svg+xml',
      upsert: true,
    });
    if (upErr) { console.log(`  ! upload fail ${f.name}: ${upErr.message}`); failed++; continue; }
    console.log(`  [fix] ${f.name}`);
    fixed++;
  }
  console.log(`\nDone. Fixed ${fixed}, already-ok ${ok}, failed ${failed}.`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
