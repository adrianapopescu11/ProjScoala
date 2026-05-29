(function () {
  'use strict';

  const form = document.getElementById('question-form');
  if (!form) return;

  // ── Type switching ───────────────────────────────────────────────────────
  const typeSelect = document.getElementById('qtype-select');
  const sections = form.querySelectorAll('.qtype-section');

  function applyType() {
    const t = typeSelect.value;
    sections.forEach(sec => {
      const showFor = (sec.dataset.showFor || '').split(/\s+/);
      sec.style.display = showFor.includes(t) ? '' : 'none';
    });
  }
  typeSelect.addEventListener('change', applyType);
  applyType();

  // ── MC answers: add / remove ─────────────────────────────────────────────
  const mcContainer = document.getElementById('mc-answers');
  const mcCount = document.getElementById('mc-answer-count');
  const addBtn = document.getElementById('add-mc-answer');

  function renumberMc() {
    const rows = mcContainer.querySelectorAll('.mc-answer-row');
    rows.forEach((row, i) => {
      const cb = row.querySelector('input[type=checkbox]');
      const txt = row.querySelector('input[type=text]');
      cb.name = `answer_correct_${i}`;
      txt.name = `answer_text_${i}`;
    });
    mcCount.value = rows.length;
  }

  addBtn?.addEventListener('click', () => {
    const idx = mcContainer.querySelectorAll('.mc-answer-row').length;
    const row = document.createElement('div');
    row.className = 'mc-answer-row';
    row.innerHTML = `
      <input type="checkbox" name="answer_correct_${idx}" value="1" title="Bifează dacă este varianta corectă" />
      <input type="text" name="answer_text_${idx}" class="form-input" placeholder="Variantă de răspuns" />
      <button type="button" class="btn-link btn-link-danger remove-mc-answer">Șterge</button>
    `;
    mcContainer.appendChild(row);
    renumberMc();
  });

  mcContainer?.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-mc-answer')) {
      if (mcContainer.querySelectorAll('.mc-answer-row').length <= 1) return;
      e.target.closest('.mc-answer-row').remove();
      renumberMc();
    }
  });

  // ── Grid builder ─────────────────────────────────────────────────────────
  const gridJsonInput = document.getElementById('grid-json');
  const gridBuilder = document.getElementById('grid-builder');
  const rowsInput = document.getElementById('grid-rows');
  const colsInput = document.getElementById('grid-cols');
  const rebuildBtn = document.getElementById('grid-rebuild');
  const rowHeadersTa = document.getElementById('grid-row-headers');
  const colHeadersTa = document.getElementById('grid-col-headers');
  const promptInput = document.getElementById('grid-prompt');

  let gridState = { prompt: '', rows: 3, cols: 3, row_headers: [], col_headers: [], locked_cells: [], correct: [] };
  try { gridState = { ...gridState, ...JSON.parse(gridJsonInput.value || '{}') }; } catch (_) {}

  function ensureCorrectShape() {
    while (gridState.correct.length < gridState.rows) gridState.correct.push([]);
    gridState.correct.length = gridState.rows;
    for (let r = 0; r < gridState.rows; r++) {
      const row = gridState.correct[r] || [];
      while (row.length < gridState.cols) row.push('');
      row.length = gridState.cols;
      gridState.correct[r] = row;
    }
  }

  function renderGrid() {
    ensureCorrectShape();
    const lockedSet = new Set(gridState.locked_cells.map(([r, c]) => `${r},${c}`));
    let html = '<table class="grid-builder-table"><thead><tr><th></th>';
    for (let c = 0; c < gridState.cols; c++) {
      html += `<th>${escAttr(gridState.col_headers[c] ?? '')}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (let r = 0; r < gridState.rows; r++) {
      html += `<tr><th>${escAttr(gridState.row_headers[r] ?? '')}</th>`;
      for (let c = 0; c < gridState.cols; c++) {
        const v = gridState.correct[r][c] ?? '';
        const locked = lockedSet.has(`${r},${c}`);
        html += `
          <td class="gb-cell ${locked ? 'gb-locked' : ''}">
            <input type="text" class="gb-input" data-r="${r}" data-c="${c}" value="${escAttr(v)}" />
            <button type="button" class="gb-lock" data-r="${r}" data-c="${c}" title="Apasă ca să arăți/ascunzi această căsuță deja completată elevului">${locked ? '🔒' : '🔓'}</button>
          </td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    gridBuilder.innerHTML = html;
    syncJson();
  }

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function syncJson() {
    gridState.prompt = promptInput.value;
    gridState.row_headers = rowHeadersTa.value.split(/\r?\n/).map(s => s.trim()).filter((_, i) => i < gridState.rows);
    gridState.col_headers = colHeadersTa.value.split(/\r?\n/).map(s => s.trim()).filter((_, i) => i < gridState.cols);
    gridJsonInput.value = JSON.stringify(gridState);
  }

  rebuildBtn?.addEventListener('click', () => {
    const newRows = Math.max(1, parseInt(rowsInput.value) || 1);
    const newCols = Math.max(1, parseInt(colsInput.value) || 1);
    gridState.rows = newRows;
    gridState.cols = newCols;
    gridState.locked_cells = gridState.locked_cells.filter(([r, c]) => r < newRows && c < newCols);
    renderGrid();
  });

  gridBuilder?.addEventListener('input', (e) => {
    if (e.target.classList.contains('gb-input')) {
      const r = +e.target.dataset.r, c = +e.target.dataset.c;
      gridState.correct[r][c] = e.target.value;
      syncJson();
    }
  });

  gridBuilder?.addEventListener('click', (e) => {
    if (e.target.classList.contains('gb-lock')) {
      const r = +e.target.dataset.r, c = +e.target.dataset.c;
      const key = `${r},${c}`;
      const idx = gridState.locked_cells.findIndex(([rr, cc]) => rr === r && cc === c);
      if (idx >= 0) gridState.locked_cells.splice(idx, 1);
      else gridState.locked_cells.push([r, c]);
      renderGrid();
    }
  });

  [promptInput, rowHeadersTa, colHeadersTa].forEach(el => {
    el?.addEventListener('input', () => { syncJson(); renderGrid(); });
  });

  // Initial render for grid section (only meaningful when grid is selected)
  if (gridBuilder) renderGrid();

  // Final sync on submit (in case of any pending edits)
  form.addEventListener('submit', () => { if (gridBuilder) syncJson(); });

  // ── Math palette on text fields ──────────────────────────────────────────
  function attachMath() {
    if (window.AdminMath) {
      window.AdminMath.attachFloatingPalette(
        '#question-form textarea[name="question_text"], ' +
        '#question-form input[name="sa_correct"], ' +
        '#question-form #grid-prompt, ' +
        '#question-form #mc-answers input[type="text"], ' +
        '#question-form .gb-input'
      );
    }
  }
  attachMath();
  // Re-attach after dynamic content (new MC answer rows, grid rebuild)
  const observer = new MutationObserver(attachMath);
  observer.observe(form, { childList: true, subtree: true });
})();
