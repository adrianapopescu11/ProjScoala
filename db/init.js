require('dotenv').config();
const supabase = require('./database');

const sb = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

async function seed() {
  const existing = await sb(supabase.from('subjects').select('id').limit(1));
  if (existing.length > 0) {
    console.log('Database already seeded.');
    return;
  }

  // Mathematics
  const { id: mathId } = await sb(
    supabase.from('subjects').insert({
      title: 'Mathematics',
      description: 'Explore algebra, geometry, calculus, and more. Build a strong foundation in mathematical reasoning and problem-solving.',
      color: '#7A6C5C',
      order_index: 1,
    }).select('id').single()
  );

  await sb(supabase.from('materials').insert({
    subject_id: mathId,
    title: 'Introduction to Algebra',
    type: 'lesson',
    order_index: 1,
    content: `# Introduction to Algebra

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
`,
  }));

  await sb(supabase.from('materials').insert({
    subject_id: mathId,
    title: 'Geometry Fundamentals',
    type: 'lesson',
    order_index: 2,
    content: `# Geometry Fundamentals

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
`,
  }));

  // Physics
  const { id: physId } = await sb(
    supabase.from('subjects').insert({
      title: 'Physics',
      description: 'Discover the fundamental laws governing the universe — from classical mechanics to modern quantum theory.',
      color: '#5C6A7A',
      order_index: 2,
    }).select('id').single()
  );

  await sb(supabase.from('materials').insert({
    subject_id: physId,
    title: "Newton's Laws of Motion",
    type: 'lesson',
    order_index: 1,
    content: `# Newton's Laws of Motion

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
`,
  }));

  await sb(supabase.from('materials').insert({
    subject_id: physId,
    title: 'Energy and Work',
    type: 'lesson',
    order_index: 2,
    content: `# Energy and Work

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
`,
  }));

  console.log('Database seeded successfully.');
}

if (require.main === module) {
  seed()
    .then(() => { console.log('Done.'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { seed };
