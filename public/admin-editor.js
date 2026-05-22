(function () {
  'use strict';

  function loadCss(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const textarea = document.getElementById('content-editor');
  if (!textarea) return;

  loadCss('https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css');
  loadScript('https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.js').then(() => {
    const editor = new EasyMDE({
      element: textarea,
      autoDownloadFontAwesome: true,
      spellChecker: false,
      status: ['lines', 'words'],
      minHeight: '420px',
      previewClass: ['editor-preview', 'prose'],
      uploadImage: true,
      imageMaxSize: 8 * 1024 * 1024,
      imageAccept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml',
      imageUploadFunction: async (file, onSuccess, onError) => {
        try {
          const form = new FormData();
          form.append('image', file);
          const res = await fetch('/admin/upload', { method: 'POST', body: form });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return onError(err.error || ('Upload failed: ' + res.status));
          }
          const json = await res.json();
          onSuccess(json.url);
        } catch (e) {
          onError(e.message || 'Upload failed');
        }
      },
      toolbar: [
        'bold', 'italic', 'heading', '|',
        'quote', 'unordered-list', 'ordered-list', '|',
        'link', 'image', 'upload-image', 'table', 'code', '|',
        ...(window.AdminMath ? window.AdminMath.easymdeButtons() : []), '|',
        'preview', 'side-by-side', 'fullscreen', '|', 'guide',
      ],
      renderingConfig: {
        codeSyntaxHighlighting: false,
      },
    });

    // Render KaTeX in the preview when preview opens
    const renderPreviewMath = () => {
      if (typeof renderMathInElement === 'undefined') return;
      document.querySelectorAll('.editor-preview, .editor-preview-side').forEach(el => {
        renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
          ],
          throwOnError: false,
        });
      });
    };
    editor.codemirror.on('update', () => setTimeout(renderPreviewMath, 50));
  });
})();
