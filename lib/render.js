function layout(title, content, user) {
  const isAdmin = user && user.role === 'admin';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)} — EduFlow</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <nav class="sidebar">
    <div class="sidebar-top">
      <a href="/" class="logo">
        <span class="logo-icon">◈</span>
        <span class="logo-text">EduFlow</span>
      </a>
      <ul class="nav-links">
        <li><a href="/" class="nav-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
          Home
        </a></li>
        <li><a href="/subjects" class="nav-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Subjects
        </a></li>
        ${isAdmin ? `<li><a href="/admin" class="nav-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
          Admin Dashboard
        </a></li>` : ''}
      </ul>
    </div>
    <div class="sidebar-bottom">
      ${user ? `
        <div class="user-info">
          <div class="user-avatar">${escHtml(user.username.charAt(0).toUpperCase())}</div>
          <div class="user-details">
            <span class="user-name">${escHtml(user.username)}</span>
            <span class="user-role">${escHtml(user.role)}</span>
          </div>
        </div>
        <a href="/logout" class="logout-link">Sign out</a>
      ` : `
        <a href="/login" class="login-cta">Sign in</a>
      `}
    </div>
  </nav>

  <div class="sidebar-overlay" onclick="closeSidebar()"></div>

  <header class="mobile-header">
    <button class="hamburger" onclick="toggleSidebar()" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
    <a href="/" class="mobile-logo">◈ EduFlow</a>
    ${user ? `<a href="/logout" class="mobile-logout">Sign out</a>` : `<a href="/login" class="mobile-logout">Sign in</a>`}
  </header>

  <main class="main-content">
    <div class="content-wrapper">
      ${content}
    </div>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
  <script>
    function toggleSidebar() {
      document.querySelector('.sidebar').classList.toggle('open');
      document.querySelector('.sidebar-overlay').classList.toggle('active');
    }
    function closeSidebar() {
      document.querySelector('.sidebar').classList.remove('open');
      document.querySelector('.sidebar-overlay').classList.remove('active');
    }
    if (typeof renderMathInElement !== 'undefined') {
      renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    }
  </script>
</body>
</html>`;
}

function page(title, content, user) {
  return layout(title, content, user);
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { layout, page, escHtml };
