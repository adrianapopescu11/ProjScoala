require('dotenv').config();
const express = require('express');
const path = require('path');
const settings = require('./lib/settings');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load admin-editable text overrides (cached, 30s TTL). Failures fall back
// to defaults silently — settings is a convenience layer, never a hard dep.
app.use(async (req, res, next) => {
  try { await settings.ensureLoaded(); } catch (_) {}
  next();
});

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

app.use('/admin', (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="EduFlow Admin"');
  res.status(401).send('Authentication required.');
});

app.use(require('./routes/admin'));
app.use(require('./routes/curriculum'));
app.use(require('./routes/tests'));

app.use((err, req, res, next) => {
  console.error(err);
  const { page, escHtml } = require('./lib/render');
  res.status(500).send(page('Error', `
    <div class="empty-state">
      <p>${escHtml(settings.get('err_500_msg'))}</p>
      <a href="/" class="btn btn-primary">${escHtml(settings.get('err_go_home_btn'))}</a>
    </div>
  `));
});

app.use((req, res) => {
  const { page, escHtml } = require('./lib/render');
  res.status(404).send(page('Not Found', `
    <div class="not-found">
      <h1 class="not-found-title">${escHtml(settings.get('err_404_title'))}</h1>
      <p class="not-found-subtitle">${escHtml(settings.get('err_404_msg'))}</p>
      <a href="/" class="btn btn-primary">${escHtml(settings.get('err_go_home_btn'))}</a>
    </div>
  `));
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`EduFlow running at http://localhost:${PORT}`));
}

module.exports = app;
