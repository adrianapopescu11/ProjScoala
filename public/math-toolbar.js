(function () {
  'use strict';

  const SYMBOLS = [
    '²', '³', '√', 'π', '∞', '±', '×', '÷',
    '≠', '≤', '≥', '∑', '∫', 'Δ', '°', '½', '¼', '¾',
  ];

  const toolbar = document.createElement('div');
  toolbar.id = 'math-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Math symbols');

  SYMBOLS.forEach(sym => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'math-btn';
    btn.textContent = sym;
    btn.title = 'Insert ' + sym;
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      insertAtCursor(sym);
    });
    toolbar.appendChild(btn);
  });

  document.body.appendChild(toolbar);

  let focused = null;

  function insertAtCursor(sym) {
    if (!focused) return;
    const s = focused.selectionStart ?? focused.value.length;
    const e = focused.selectionEnd   ?? focused.value.length;
    focused.value = focused.value.slice(0, s) + sym + focused.value.slice(e);
    focused.selectionStart = focused.selectionEnd = s + sym.length;
    focused.focus();
  }

  function positionToolbar(el) {
    const r   = el.getBoundingClientRect();
    const tbH = toolbar.offsetHeight || 40;
    const tbW = toolbar.scrollWidth  || 380;

    let top = r.top - tbH - 10;
    if (top < 6) top = r.bottom + 10;

    let left = r.left;
    if (left + tbW > window.innerWidth - 8) left = window.innerWidth - tbW - 8;
    if (left < 8) left = 8;

    toolbar.style.top  = top  + 'px';
    toolbar.style.left = left + 'px';
  }

  function showToolbar(el) {
    focused = el;
    toolbar.style.display = 'flex';
    positionToolbar(el);
  }

  function hideToolbar() {
    toolbar.style.display = 'none';
    focused = null;
  }

  function attach() {
    const sel = [
      '.question-card input[type="text"]',
      '.question-card textarea',
      '.grid-input',
      '.math-input',
    ].join(', ');

    document.querySelectorAll(sel).forEach(inp => {
      if (inp.dataset.mathToolbar) return;
      inp.dataset.mathToolbar = '1';
      inp.addEventListener('focus', () => showToolbar(inp));
      inp.addEventListener('blur', () => {
        setTimeout(() => {
          if (!toolbar.contains(document.activeElement)) hideToolbar();
        }, 160);
      });
    });
  }

  attach();

  // Re-attach when admin JS dynamically adds new inputs
  window.reattachMathToolbar = attach;

  window.addEventListener('scroll', () => {
    if (focused) positionToolbar(focused);
  }, { passive: true });
})();
