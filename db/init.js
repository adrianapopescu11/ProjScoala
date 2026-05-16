require('dotenv').config();
const pool = require('./database');
const bcrypt = require('bcrypt');

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id        SERIAL PRIMARY KEY,
      username  TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role      TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('admin','student')),
      created_at TIMESTAMPTZ DEFAULT NOW()
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
      type        TEXT NOT NULL DEFAULT 'lesson' CHECK(type IN ('lesson','note','resource')),
      order_index INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tests (
      id                  SERIAL PRIMARY KEY,
      subject_id          INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      title               TEXT NOT NULL,
      description         TEXT,
      time_limit_minutes  INTEGER,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS questions (
      id            SERIAL PRIMARY KEY,
      test_id       INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'multiple_choice'
                    CHECK(type IN ('multiple_choice','short_answer','grid')),
      order_index   INTEGER DEFAULT 0,
      points        INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS answers (
      id            SERIAL PRIMARY KEY,
      question_id   INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      answer_text   TEXT NOT NULL,
      is_correct    SMALLINT DEFAULT 0
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
  `);

  const hash = bcrypt.hashSync('admin123', 10);
  await pool.query(`
    INSERT INTO users (username, password_hash, role)
    VALUES ($1, $2, 'admin')
    ON CONFLICT (username) DO NOTHING
  `, ['admin', hash]);

  const { rows } = await pool.query('SELECT COUNT(*) AS count FROM subjects');
  if (parseInt(rows[0].count) > 0) {
    console.log('Database already seeded.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const math = await client.query(
      `INSERT INTO subjects (title, description, color, order_index)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      ['Mathematics',
       'Explore algebra, geometry, calculus, and more. Build a strong foundation in mathematical reasoning and problem-solving.',
       '#7A6C5C', 1]
    );
    const mathId = math.rows[0].id;

    await client.query(
      `INSERT INTO materials (subject_id, title, content, type, order_index)
       VALUES ($1,$2,$3,$4,$5)`,
      [mathId, 'Introduction to Algebra', `# Introduction to Algebra

Algebra is the branch of mathematics dealing with symbols and the rules for manipulating those symbols. In elementary algebra, those symbols (today written as Latin and Greek letters) represent quantities without fixed values, known as *variables*.

## Core Concepts

### Variables and Expressions

A **variable** is a symbol used to represent an unknown or changeable value. For example, in the expression $x + 5$, the letter $x$ is a variable.

An **algebraic expression** combines variables, numbers, and operations:

$$3x^2 + 2x - 7$$

### Equations

An **equation** states that two expressions are equal:

$$2x + 3 = 11$$

To solve, isolate the variable:

$$2x = 11 - 3 = 8$$
$$x = 4$$

## Properties of Real Numbers

| Property | Example |
|----------|---------|
| Commutative (addition) | $a + b = b + a$ |
| Commutative (multiplication) | $a \\cdot b = b \\cdot a$ |
| Associative (addition) | $(a+b)+c = a+(b+c)$ |
| Distributive | $a(b+c) = ab + ac$ |

## Practice Problems

1. Solve for $x$: $3x - 7 = 14$
2. Simplify: $4(x + 2) - 3(x - 1)$
3. Factor: $x^2 + 5x + 6$

> **Tip:** Always check your solution by substituting back into the original equation.

\`\`\`
Solution to problem 1:
3x - 7 = 14
3x = 21
x = 7
\`\`\`
`, 'lesson', 1]
    );

    await client.query(
      `INSERT INTO materials (subject_id, title, content, type, order_index)
       VALUES ($1,$2,$3,$4,$5)`,
      [mathId, 'Geometry Fundamentals', `# Geometry Fundamentals

Geometry is the branch of mathematics concerned with the properties and relations of points, lines, surfaces, and solids.

## Basic Shapes and Formulas

### Circle

A circle with radius $r$ has:
- **Circumference:** $C = 2\\pi r$
- **Area:** $A = \\pi r^2$

### Triangle

For a triangle with base $b$ and height $h$:
- **Area:** $A = \\frac{1}{2}bh$

The **Pythagorean theorem** relates the sides of a right triangle:
$$a^2 + b^2 = c^2$$

where $c$ is the hypotenuse.

### Rectangle and Square

| Shape | Area | Perimeter |
|-------|------|-----------|
| Rectangle | $l \\times w$ | $2(l + w)$ |
| Square | $s^2$ | $4s$ |
| Triangle | $\\frac{1}{2}bh$ | $a + b + c$ |

## Angles

- **Acute angle:** less than 90°
- **Right angle:** exactly 90°
- **Obtuse angle:** between 90° and 180°
- **Straight angle:** exactly 180°

## The Unit Circle

$$\\sin(30°) = \\frac{1}{2}, \\quad \\cos(30°) = \\frac{\\sqrt{3}}{2}$$

$$\\sin(45°) = \\cos(45°) = \\frac{\\sqrt{2}}{2}$$

$$\\sin(60°) = \\frac{\\sqrt{3}}{2}, \\quad \\cos(60°) = \\frac{1}{2}$$
`, 'lesson', 2]
    );

    const phys = await client.query(
      `INSERT INTO subjects (title, description, color, order_index)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      ['Physics',
       'Discover the fundamental laws governing the universe — from classical mechanics to modern quantum theory.',
       '#5C6A7A', 2]
    );
    const physId = phys.rows[0].id;

    await client.query(
      `INSERT INTO materials (subject_id, title, content, type, order_index)
       VALUES ($1,$2,$3,$4,$5)`,
      [physId, "Newton's Laws of Motion", `# Newton's Laws of Motion

Isaac Newton formulated three fundamental laws that describe the relationship between a body and the forces acting on it.

## First Law: Law of Inertia

> *An object at rest stays at rest, and an object in motion stays in motion at constant velocity, unless acted upon by a net external force.*

This means objects resist changes to their state of motion. The measure of this resistance is **mass**.

## Second Law: Force and Acceleration

$$F = ma$$

Where:
- $F$ = net force (Newtons, N)
- $m$ = mass (kilograms, kg)
- $a$ = acceleration (m/s²)

### Example

A 10 kg object accelerates at 3 m/s². What force acts on it?

$$F = 10 \\text{ kg} \\times 3 \\text{ m/s}^2 = 30 \\text{ N}$$

## Third Law: Action and Reaction

> *For every action, there is an equal and opposite reaction.*

$$\\vec{F}_{AB} = -\\vec{F}_{BA}$$

## Equations of Motion (uniform acceleration)

$$v = u + at$$
$$s = ut + \\frac{1}{2}at^2$$
$$v^2 = u^2 + 2as$$

Where $u$ = initial velocity, $v$ = final velocity, $s$ = displacement, $t$ = time.
`, 'lesson', 1]
    );

    await client.query(
      `INSERT INTO materials (subject_id, title, content, type, order_index)
       VALUES ($1,$2,$3,$4,$5)`,
      [physId, 'Energy and Work', `# Energy and Work

Energy is the capacity to do work. It exists in many forms and can be converted from one form to another.

## Work

Work is done when a force causes displacement:

$$W = F \\cdot d \\cdot \\cos\\theta$$

- Units: **Joules (J)** = N·m

## Kinetic Energy

$$KE = \\frac{1}{2}mv^2$$

## Potential Energy

### Gravitational Potential Energy

$$PE = mgh$$

### Elastic Potential Energy (Spring)

$$PE_{spring} = \\frac{1}{2}kx^2$$

## Conservation of Energy

$$KE_1 + PE_1 = KE_2 + PE_2$$

$$\\frac{1}{2}mv_1^2 + mgh_1 = \\frac{1}{2}mv_2^2 + mgh_2$$

## Power

$$P = \\frac{W}{t} = Fv$$

| Quantity | Symbol | Unit |
|----------|--------|------|
| Work | $W$ | Joule (J) |
| Energy | $E$ | Joule (J) |
| Power | $P$ | Watt (W) = J/s |

> **Conservation law:** Energy cannot be created or destroyed, only transformed.
`, 'lesson', 2]
    );

    await client.query('COMMIT');
    console.log('Database seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  initializeDatabase()
    .then(() => { console.log('Done.'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { initializeDatabase };
