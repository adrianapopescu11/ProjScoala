const express = require('express');
const bcrypt = require('bcrypt');
const supabase = require('../db/database');
const { page, escHtml } = require('../lib/render');

const router = express.Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const sb = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');

  const error = req.session.loginError;
  delete req.session.loginError;

  res.send(page('Sign In', `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <span class="login-logo">◈</span>
          <h1 class="login-title">Welcome back</h1>
          <p class="login-subtitle">Sign in to access your curriculum</p>
        </div>
        ${error ? `<div class="alert alert-error">${escHtml(error)}</div>` : ''}
        <form method="POST" action="/login" class="login-form">
          <div class="form-group">
            <label for="username" class="form-label">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              class="form-input"
              placeholder="Enter your username"
              required
              autocomplete="username"
            />
          </div>
          <div class="form-group">
            <label for="password" class="form-label">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              class="form-input"
              placeholder="Enter your password"
              required
              autocomplete="current-password"
            />
          </div>
          <button type="submit" class="btn btn-primary btn-full">Sign in</button>
        </form>
      </div>
    </div>
  `, null));
});

router.post('/login', wrap(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    req.session.loginError = 'Please enter your username and password.';
    return res.redirect('/login');
  }

  const user = await sb(
    supabase.from('users').select('*').eq('username', username.trim()).maybeSingle()
  );

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    req.session.loginError = 'Invalid username or password.';
    return res.redirect('/login');
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.redirect('/');
}));

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
