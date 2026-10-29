
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Configure it in Render Environment.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable'
    ? false
    : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
      ON users (LOWER(email));

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      category TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL CHECK (price >= 0),
      stock INTEGER NOT NULL CHECK (stock >= 0),
      icon TEXT NOT NULL DEFAULT '📦'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS products_user_sku_lower_unique
      ON products (user_id, LOWER(sku));

    CREATE INDEX IF NOT EXISTS sessions_user_id_idx
      ON sessions (user_id);
  `);
}

function hashPassword(
  password,
  salt = crypto.randomBytes(16).toString('hex')
) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');

  if (!salt || !expected) return false;

  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');

  return actual.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actual, expectedBuffer);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');

  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [
      tokenHash(token),
      userId,
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ]
  );

  return token;
}

async function auth(req, res, next) {
  try {
    const raw = (req.headers.authorization || '')
      .replace(/^Bearer\s+/i, '');

    if (!raw) {
      return res.status(401).json({ error: 'Please log in.' });
    }

    const result = await pool.query(
      `SELECT s.user_id, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [tokenHash(raw), Date.now()]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        error: 'Session expired. Please log in again.'
      });
    }

    req.user = {
      id: result.rows[0].user_id,
      email: result.rows[0].email
    };

    next();
  } catch (err) {
    next(err);
  }
}

function validate(body) {
  const { name, sku, category, price, stock } = body || {};

  if (
    typeof name !== 'string' || !name.trim() ||
    typeof sku !== 'string' || !sku.trim() ||
    typeof category !== 'string' || !category.trim() ||
    typeof price !== 'number' || !Number.isFinite(price) ||
    price < 0 ||
    typeof stock !== 'number' || !Number.isInteger(stock) ||
    stock < 0
  ) {
    return {
      error: 'Enter valid product details, non-negative price and whole-number stock.'
    };
  }

  return {
    value: {
      name: name.trim(),
      sku: sku.trim(),
      category: category.trim(),
      price,
      stock,
      icon: typeof body.icon === 'string' && body.icon.trim()
        ? body.icon.trim()
        : '📦'
    }
  };
}

// REGISTER
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (name.length < 2) {
      return res.status(400).json({
        error: 'Enter your full name (at least 2 characters).'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: 'Enter a valid email address.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters.'
      });
    }

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, hashPassword(password)]
    );

    const user = result.rows[0];
    const token = await issueSession(user.id);

    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'An account with this email already exists.'
      });
    }

    next(err);
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const result = await pool.query(
      `SELECT id, name, email, password_hash
       FROM users WHERE LOWER(email) = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({
        error: 'Email or password is incorrect.'
      });
    }

    const token = await issueSession(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    next(err);
  }
});

// CURRENT USER
app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// LOGOUT
app.post('/api/auth/logout', async (req, res, next) => {
  try {
    const raw = (req.headers.authorization || '')
      .replace(/^Bearer\s+/i, '');

    if (raw) {
      await pool.query(
        'DELETE FROM sessions WHERE token_hash = $1',
        [tokenHash(raw)]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// HEALTH CHECK
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      status: 'OK',
      message: 'Inventory API is running!',
      database: 'PostgreSQL',
      authentication: true
    });
  } catch (err) {
    console.error('Database health check failed:', err.message);

    res.status(503).json({
      status: 'ERROR',
      message: 'Database connection failed.'
    });
  }
});

// GET PRODUCTS
app.get('/api/products', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, sku, category, price, stock, icon
       FROM products
       WHERE user_id = $1
       ORDER BY id`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ADD PRODUCT
app.post('/api/products', auth, async (req, res, next) => {
  const validated = validate(req.body);

  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }

  try {
    const { name, sku, category, price, stock, icon } = validated.value;

    const result = await pool.query(
      `INSERT INTO products
       (user_id, name, sku, category, price, stock, icon)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, sku, category, price, stock, icon`,
      [req.user.id, name, sku, category, price, stock, icon]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'This SKU already exists in your inventory.'
      });
    }

    next(err);
  }
});

// EDIT PRODUCT
app.put('/api/products/:id', auth, async (req, res, next) => {
  const id = Number(req.params.id);
  const validated = validate(req.body);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }

  try {
    const { name, sku, category, price, stock, icon } = validated.value;

    const result = await pool.query(
      `UPDATE products
       SET name = $1, sku = $2, category = $3,
           price = $4, stock = $5, icon = $6
       WHERE id = $7 AND user_id = $8
       RETURNING id, name, sku, category, price, stock, icon`,
      [name, sku, category, price, stock, icon, id, req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'This SKU already exists in your inventory.'
      });
    }

    next(err);
  }
});

// DELETE PRODUCT
app.delete('/api/products/:id', auth, async (req, res, next) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json({ message: 'Product deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// ERROR HANDLER
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON request body.'
    });
  }

  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

// START SERVER
async function start() {
  await initializeDatabase();

  const server = app.listen(PORT, () => {
    console.log(
      `NEXSTOCK API running on port ${PORT}\n` +
      'Database: PostgreSQL\nAuth: enabled'
    );
  });

  async function shutdown() {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(err => {
  console.error('Could not initialize PostgreSQL:', err);
  process.exit(1);
});
