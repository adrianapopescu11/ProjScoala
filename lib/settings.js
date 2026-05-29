const supabase = require('../db/database');

// Every editable string on the public + admin site. Add a row here and it
// shows up on /admin/settings automatically; the `default` is what renders
// when the admin hasn't overridden it (or the table doesn't exist yet).
const DEFAULTS = {
  // Branding
  site_name:           { group: 'Branding',     label: 'Site name (browser tab + header)',     default: 'EduFlow' },
  site_logo:           { group: 'Branding',     label: 'Logo symbol',                          default: '◈' },
  admin_brand:         { group: 'Branding',     label: 'Admin section brand name',             default: 'Admin' },

  // Sidebar / nav
  nav_home:            { group: 'Navigation',   label: '"Home" link',                          default: 'Home' },
  nav_liceu:           { group: 'Navigation',   label: '"Liceu" link',                         default: 'Liceu' },
  nav_gimnaziu:        { group: 'Navigation',   label: '"Gimnaziu" link',                      default: 'Gimnaziu' },
  nav_subjects:        { group: 'Navigation',   label: '"Subjects" link',                      default: 'Subjects' },
  nav_attempts:        { group: 'Navigation',   label: '"Attempts" link',                      default: 'Attempts' },
  nav_admin:           { group: 'Navigation',   label: '"Admin Dashboard" link',               default: 'Admin Dashboard' },
  nav_back_to_site:    { group: 'Navigation',   label: 'Admin → "Back to Site" link',          default: 'Back to Site' },

  // Home page
  home_title:          { group: 'Home page',    label: 'Page heading',                         default: 'Resurse RED BAC' },
  home_subtitle:       { group: 'Home page',    label: 'Subtitle under heading',               default: 'Browse subjects, read materials, and take tests to track your progress.' },
  home_empty:          { group: 'Home page',    label: 'Empty-state message (no subjects)',    default: 'No subjects yet.' },
  home_section_liceu:    { group: 'Home page',  label: 'Liceu section heading',                default: 'Liceu' },
  home_section_gimnaziu: { group: 'Home page',  label: 'Gimnaziu section heading',             default: 'Gimnaziu' },
  home_section_other:    { group: 'Home page',  label: 'Other-subjects section heading',       default: 'Alte resurse' },
  home_meta_materials: { group: 'Home page',    label: 'Card meta — materials suffix',         default: 'materials' },
  home_meta_tests:     { group: 'Home page',    label: 'Card meta — tests suffix',             default: 'tests' },

  // Liceu page
  liceu_title:         { group: 'Liceu page',   label: 'Page heading',                         default: 'Liceu' },
  liceu_subtitle:      { group: 'Liceu page',   label: 'Subtitle',                             default: 'Materiale și teste pentru liceu.' },
  liceu_empty:         { group: 'Liceu page',   label: 'Empty-state message',                  default: 'Nicio materie de liceu încă.' },

  // Gimnaziu page
  gimnaziu_title:      { group: 'Gimnaziu page', label: 'Page heading',                        default: 'Gimnaziu' },
  gimnaziu_subtitle:   { group: 'Gimnaziu page', label: 'Subtitle',                            default: 'Materiale și teste pentru gimnaziu.' },
  gimnaziu_empty:      { group: 'Gimnaziu page', label: 'Empty-state message',                 default: 'Nicio materie de gimnaziu încă.' },

  // Attempts page
  attempts_title:      { group: 'Attempts',     label: 'Page heading',                         default: 'Attempts' },
  attempts_subtitle:   { group: 'Attempts',     label: 'Subtitle',                             default: 'All submitted test attempts.' },
  attempts_empty:      { group: 'Attempts',     label: 'Empty-state message',                  default: 'No attempts yet — take a test to see history here.' },

  // Test intro / take / submit
  test_begin_btn:      { group: 'Tests',        label: '"Begin Test" button',                  default: 'Begin Test' },
  test_submit_btn:     { group: 'Tests',        label: '"Submit Test" button',                 default: 'Submit Test' },
  test_no_questions:   { group: 'Tests',        label: 'Test has no questions notice',         default: 'This test has no questions yet.' },
  test_pass_msg:       { group: 'Tests',        label: 'Result verdict — pass',                default: 'Well done!' },
  test_fail_msg:       { group: 'Tests',        label: 'Result verdict — fail',                default: 'Keep practicing' },
  test_retake_btn:     { group: 'Tests',        label: '"Retake" button',                      default: 'Retake' },
  test_back_btn:       { group: 'Tests',        label: '"Back to Subject" button',             default: 'Back to Subject' },

  // Error pages
  err_404_title:       { group: 'Error pages',  label: '404 page title',                       default: '404' },
  err_404_msg:         { group: 'Error pages',  label: '404 message',                          default: 'Page not found.' },
  err_500_msg:         { group: 'Error pages',  label: '500 message',                          default: 'Something went wrong. Please try again.' },
  err_go_home_btn:     { group: 'Error pages',  label: '"Go home" button',                     default: 'Go home' },
};

const TTL_MS = 30_000;
let cache = null;
let cacheAt = 0;
let loadInflight = null;

async function _load() {
  try {
    const { data, error } = await supabase.from('site_settings').select('*');
    if (error) throw error;
    cache = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  } catch (e) {
    // Table may not exist yet (schema not applied) — fall back to defaults
    // silently rather than 500-ing every request.
    cache = cache || {};
  }
  cacheAt = Date.now();
}

async function ensureLoaded() {
  if (cache && Date.now() - cacheAt < TTL_MS) return;
  if (!loadInflight) loadInflight = _load().finally(() => { loadInflight = null; });
  await loadInflight;
}

function get(key) {
  const def = DEFAULTS[key];
  const override = cache ? cache[key] : null;
  if (override != null && override !== '') return override;
  return def ? def.default : '';
}

function getDefaults() { return DEFAULTS; }
function getOverrides() { return cache || {}; }
function bust() { cacheAt = 0; }

module.exports = { ensureLoaded, get, getDefaults, getOverrides, bust };
