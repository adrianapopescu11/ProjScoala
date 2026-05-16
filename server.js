require('dotenv').config();
const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const path = require('path');
const pool = require('./db/database');

const PgStore = connectPgSimple(session);
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
}));

app.use(require('./routes/auth'));
app.use(require('./routes/curriculum'));

app.use((err, req, res, next) => {
  console.error(err);
  const { page } = require('./lib/render');
  res.status(500).send(page('Error', `
    <div class="empty-state">
      <p>Something went wrong. Please try again.</p>
      <a href="/" class="btn btn-primary">Go home</a>
    </div>
  `, req.session?.user));
});

app.use((req, res) => {
  const { page } = require('./lib/render');
  res.status(404).send(page('Not Found', `
    <div class="not-found">
      <h1 class="not-found-title">404</h1>
      <p class="not-found-subtitle">Page not found.</p>
      <a href="/" class="btn btn-primary">Go home</a>
    </div>
  `, req.session?.user));
});

// Local development: start the server directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`EduFlow running at http://localhost:${PORT}`));
}

// Vercel: export the Express app as a serverless function
module.exports = app;
