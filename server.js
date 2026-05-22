require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  const { page } = require('./lib/render');
  res.status(500).send(page('Error', `
    <div class="empty-state">
      <p>Something went wrong. Please try again.</p>
      <a href="/" class="btn btn-primary">Go home</a>
    </div>
  `));
});

app.use((req, res) => {
  const { page } = require('./lib/render');
  res.status(404).send(page('Not Found', `
    <div class="not-found">
      <h1 class="not-found-title">404</h1>
      <p class="not-found-subtitle">Page not found.</p>
      <a href="/" class="btn btn-primary">Go home</a>
    </div>
  `));
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`EduFlow running at http://localhost:${PORT}`));
}

module.exports = app;
