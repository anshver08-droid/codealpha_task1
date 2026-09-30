const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

// ---------- Database ----------
const db = new Database(path.join(__dirname, 'store.db'));
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  emoji TEXT,
  stock INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total REAL NOT NULL,
  address TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price REAL NOT NULL
);
`);

if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
  const ins = db.prepare('INSERT INTO products (name, description, price, emoji, stock) VALUES (?,?,?,?,?)');
  [
    ['Ceramic Pour-Over Set', 'Hand-glazed dripper and carafe for a clean, bright cup of coffee.', 42.0, '☕', 25],
    ['Linen Tote Bag', 'Heavyweight washed linen with an inner zip pocket. Fits a 14" laptop.', 28.5, '👜', 40],
    ['Desk Plant: Snake Plant', 'Nearly unkillable. Comes in a matte white pot.', 19.0, '🪴', 30],
    ['Wool Beanie', 'Merino wool, ribbed, one size. Available in charcoal.', 24.0, '🧢', 50],
    ['Notebook, Dot Grid', '192 pages of 120gsm paper that handles fountain pens.', 14.0, '📓', 100],
    ['Steel Water Bottle', 'Insulated, 750 ml. Keeps drinks cold 24 hours, hot 12.', 32.0, '🍶', 60],
    ['Wireless Earbuds', 'Bluetooth 5.3, 30 hour case battery, USB-C charging.', 79.0, '🎧', 15],
    ['Scented Candle', 'Soy wax, cedar and fig. Burns for about 45 hours.', 21.0, '🕯️', 35],
  ].forEach(p => ins.run(...p));
}

// ---------- App ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sign = u => jwt.sign({ id: u.id, name: u.name, email: u.email }, SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in to continue.' });
  }
}

// ---------- Auth ----------
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (name, email, password) VALUES (?,?,?)')
      .run(name.trim(), email.trim().toLowerCase(), hash);
    const user = { id: info.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase() };
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'That email is already registered.' });
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!row || !bcrypt.compareSync(password || '', row.password))
    return res.status(401).json({ error: 'Incorrect email or password.' });
  const user = { id: row.id, name: row.name, email: row.email };
  res.json({ token: sign(user), user });
});

// ---------- Products ----------
app.get('/api/products', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare('SELECT * FROM products WHERE name LIKE ? OR description LIKE ? ORDER BY id').all(q, q));
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'Product not found.' });
});

// ---------- Orders ----------
// Prices are always read from the database, never trusted from the client.
app.post('/api/orders', auth, (req, res) => {
  const { items, address } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Your cart is empty.' });
  if (!address || !address.trim()) return res.status(400).json({ error: 'Shipping address is required.' });

  const getP = db.prepare('SELECT * FROM products WHERE id = ?');
  const place = db.transaction(() => {
    let total = 0;
    const lines = items.map(i => {
      const qty = parseInt(i.id && i.quantity, 10);
      const p = getP.get(i.id);
      if (!p || !(qty > 0)) throw new Error('Invalid item in cart.');
      if (p.stock < qty) throw new Error(`Only ${p.stock} left of "${p.name}".`);
      total += p.price * qty;
      return { p, qty };
    });
    const order = db.prepare('INSERT INTO orders (user_id, total, address) VALUES (?,?,?)')
      .run(req.user.id, Math.round(total * 100) / 100, address.trim());
    const addItem = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?,?,?,?)');
    const dec = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    lines.forEach(({ p, qty }) => { addItem.run(order.lastInsertRowid, p.id, qty, p.price); dec.run(qty, p.id); });
    return { id: order.lastInsertRowid, total };
  });

  try {
    res.status(201).json(place());
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/orders', auth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  const itemsStmt = db.prepare(`SELECT oi.quantity, oi.price, p.name, p.emoji FROM order_items oi
                                JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`);
  res.json(orders.map(o => ({ ...o, items: itemsStmt.all(o.id) })));
});

app.listen(PORT, () => console.log(`Store running at http://localhost:${PORT}`));
