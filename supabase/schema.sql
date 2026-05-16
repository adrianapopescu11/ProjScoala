-- EduFlow database schema
-- Run this in the Supabase SQL Editor (Database → SQL Editor → New query).

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('admin', 'student')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  color       TEXT DEFAULT '#5C7A5C',
  order_index INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS materials (
  id          SERIAL PRIMARY KEY,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT,
  type        TEXT NOT NULL DEFAULT 'lesson' CHECK(type IN ('lesson', 'note', 'resource')),
  order_index INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tests (
  id                 SERIAL PRIMARY KEY,
  subject_id         INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  time_limit_minutes INTEGER,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id            SERIAL PRIMARY KEY,
  test_id       INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'multiple_choice'
                CHECK(type IN ('multiple_choice', 'short_answer', 'grid')),
  order_index   INTEGER DEFAULT 0,
  points        INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS answers (
  id          SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  is_correct  SMALLINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS test_attempts (
  id           SERIAL PRIMARY KEY,
  test_id      INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score        REAL DEFAULT 0,
  max_score    REAL DEFAULT 0,
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id            SERIAL PRIMARY KEY,
  attempt_id    INTEGER NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
  question_id   INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_given  TEXT,
  is_correct    SMALLINT DEFAULT 0,
  points_earned REAL DEFAULT 0
);
