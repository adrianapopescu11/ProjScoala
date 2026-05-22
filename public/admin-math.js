(function () {
  'use strict';

  // ── Snippet catalog ────────────────────────────────────────────────────────
  // `|` marks where the cursor lands after insertion; selected text replaces it.
  const SNIPPETS = [
    { group: 'wrap',  label: '$x$',  title: 'Inline math ($…$)',   latex: '$|$' },
    { group: 'wrap',  label: '$$x$$', title: 'Display math ($$…$$)', latex: '$$|$$' },
    { group: 'pow',   label: 'x²',   title: 'Power (^)',           latex: '^{|}' },
    { group: 'pow',   label: 'x₂',   title: 'Subscript (_)',       latex: '_{|}' },
    { group: 'root',  label: '√',    title: 'Square root',         latex: '\\sqrt{|}' },
    { group: 'root',  label: 'ⁿ√',   title: 'Nth root',            latex: '\\sqrt[|]{}' },
    { group: 'frac',  label: 'a/b',  title: 'Fraction',            latex: '\\frac{|}{}' },
    { group: 'big',   label: 'Σ',    title: 'Summation',           latex: '\\sum_{|}^{}' },
    { group: 'big',   label: '∫',    title: 'Integral',            latex: '\\int_{|}^{}' },
    { group: 'big',   label: '∏',    title: 'Product',             latex: '\\prod_{|}^{}' },
    { group: 'big',   label: 'lim',  title: 'Limit',               latex: '\\lim_{|}' },
    { group: 'op',    label: '·',    title: 'Cdot',                latex: '\\cdot ' },
    { group: 'op',    label: '×',    title: 'Times',               latex: '\\times ' },
    { group: 'op',    label: '÷',    title: 'Divide',              latex: '\\div ' },
    { group: 'op',    label: '±',    title: 'Plus / minus',        latex: '\\pm ' },
    { group: 'cmp',   label: '≤',    title: 'Less than or equal',  latex: '\\le ' },
    { group: 'cmp',   label: '≥',    title: 'Greater than or equal', latex: '\\ge ' },
    { group: 'cmp',   label: '≠',    title: 'Not equal',           latex: '\\ne ' },
    { group: 'cmp',   label: '≈',    title: 'Approximately',       latex: '\\approx ' },
    { group: 'cmp',   label: '→',    title: 'Right arrow',         latex: '\\to ' },
    { group: 'sym',   label: 'π',    title: 'Pi',                  latex: '\\pi ' },
    { group: 'sym',   label: '∞',    title: 'Infinity',            latex: '\\infty ' },
    { group: 'sym',   label: '°',    title: 'Degree',              latex: '^{\\circ}' },
    { group: 'gk',    label: 'α',    title: 'Alpha',               latex: '\\alpha ' },
    { group: 'gk',    label: 'β',    title: 'Beta',                latex: '\\beta ' },
    { group: 'gk',    label: 'θ',    title: 'Theta',               latex: '\\theta ' },
    { group: 'gk',    label: 'λ',    title: 'Lambda',              latex: '\\lambda ' },
    { group: 'gk',    label: 'μ',    title: 'Mu',                  latex: '\\mu ' },
    { group: 'gk',    label: 'Δ',    title: 'Delta',               latex: '\\Delta ' },
  ];

  // ── Insertion helpers ──────────────────────────────────────────────────────
  function applyTemplate(latex, selectedText) {
    const cursorMark = '';
    let s = latex;
    const idx = s.indexOf('|');
    if (idx === -1) return { text: s, cursorOffset: s.length };
    if (selectedText) {
      s = s.slice(0, idx) + selectedText + s.slice(idx + 1);
      return { text: s, cursorOffset: idx + selectedText.length };
    }
    s = s.slice(0, idx) + s.slice(idx + 1);
    return { text: s, cursorOffset: idx };
  }

  function insertIntoTextarea(el, latex) {
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const sel   = el.value.slice(start, end);
    const { text, cursorOffset } = applyTemplate(latex, sel);
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const pos = start + cursorOffset;
    el.selectionStart = el.selectionEnd = pos;
    el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertIntoCodeMirror(cm, latex) {
    const sel = cm.getSelection() || '';
    const { text, cursorOffset } = applyTemplate(latex, sel);
    const from = cm.getCursor('from');
    cm.replaceSelection(text);
    // Move cursor to the placeholder spot
    const lines = text.slice(0, cursorOffset).split('\n');
    const newLine = from.line + lines.length - 1;
    const newCh = lines.length === 1
      ? from.ch + lines[0].length
      : lines[lines.length - 1].length;
    cm.setCursor({ line: newLine, ch: newCh });
    cm.focus();
  }

  function insertInto(target, latex) {
    if (target && typeof target.getCursor === 'function') {
      insertIntoCodeMirror(target, latex);
    } else if (target && 'selectionStart' in target) {
      insertIntoTextarea(target, latex);
    }
  }

  // ── Floating palette (for plain textareas/inputs) ──────────────────────────
  let palette = null;
  let currentTarget = null;

  function ensurePalette() {
    if (palette) return palette;
    palette = document.createElement('div');
    palette.id = 'admin-math-palette';
    palette.setAttribute('role', 'toolbar');
    palette.setAttribute('aria-label', 'Math insertion');
    palette.style.display = 'none';

    let lastGroup = null;
    SNIPPETS.forEach(snip => {
      if (lastGroup && snip.group !== lastGroup) {
        const sep = document.createElement('span');
        sep.className = 'amp-sep';
        palette.appendChild(sep);
      }
      lastGroup = snip.group;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'amp-btn';
      btn.textContent = snip.label;
      btn.title = snip.title;
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        if (currentTarget) insertInto(currentTarget, snip.latex);
      });
      palette.appendChild(btn);
    });

    document.body.appendChild(palette);
    return palette;
  }

  function positionPalette(el) {
    const r = el.getBoundingClientRect();
    const p = ensurePalette();
    const pw = p.offsetWidth || 480;
    const ph = p.offsetHeight || 38;
    let top = window.scrollY + r.top - ph - 8;
    if (top < window.scrollY + 6) top = window.scrollY + r.bottom + 8;
    let left = window.scrollX + r.left;
    const maxLeft = window.scrollX + window.innerWidth - pw - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    p.style.top = top + 'px';
    p.style.left = left + 'px';
  }

  function showFor(el) {
    currentTarget = el;
    const p = ensurePalette();
    p.style.display = 'flex';
    positionPalette(el);
  }

  function hide() {
    if (palette) palette.style.display = 'none';
    currentTarget = null;
  }

  function attachFloatingPalette(selector) {
    document.querySelectorAll(selector).forEach(el => {
      if (el.dataset.mathPalette) return;
      el.dataset.mathPalette = '1';
      el.addEventListener('focus', () => showFor(el));
      el.addEventListener('blur', () => {
        setTimeout(() => {
          if (!palette || !palette.contains(document.activeElement)) hide();
        }, 160);
      });
    });
    window.addEventListener('scroll', () => {
      if (currentTarget) positionPalette(currentTarget);
    }, { passive: true });
    window.addEventListener('resize', () => {
      if (currentTarget) positionPalette(currentTarget);
    });
  }

  // ── EasyMDE toolbar helper ─────────────────────────────────────────────────
  function easymdeButtons() {
    let lastGroup = null;
    const items = [];
    SNIPPETS.forEach(snip => {
      if (lastGroup && snip.group !== lastGroup) items.push('|');
      lastGroup = snip.group;
      items.push({
        name: 'math-' + snip.group + '-' + snip.label,
        action: (editor) => insertIntoCodeMirror(editor.codemirror, snip.latex),
        text: snip.label,
        title: snip.title,
        className: 'easymde-math-btn',
      });
    });
    return items;
  }

  window.AdminMath = {
    snippets: SNIPPETS,
    insertInto,
    attachFloatingPalette,
    easymdeButtons,
  };
})();
