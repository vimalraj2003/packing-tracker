require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'packing_tracker_secret_2024';

// ── DB Connection ─────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Auth Middleware ───────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ── DB Init ───────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'operator',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hourly_logs (
      id SERIAL PRIMARY KEY,
      log_date DATE NOT NULL,
      time_slot VARCHAR(30) NOT NULL,
      slot_order INT NOT NULL,
      picked INT DEFAULT 0,
      packed INT DEFAULT 0,
      dispatched INT DEFAULT 0,
      pending INT DEFAULT 0,
      avg_pick_time NUMERIC(5,1),
      avg_pack_time NUMERIC(5,1),
      errors INT DEFAULT 0,
      picker_name VARCHAR(100),
      packer_name VARCHAR(100),
      supervisor_sign VARCHAR(100),
      notes TEXT,
      created_by INT REFERENCES users(id),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(log_date, time_slot)
    );
  `);

  // Seed default admin user
  const existing = await pool.query("SELECT id FROM users WHERE username='admin'");
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(
      "INSERT INTO users (username, password, role) VALUES ($1,$2,$3)",
      ['admin', hash, 'admin']
    );
    // Seed operator
    const hash2 = await bcrypt.hash('operator123', 10);
    await pool.query(
      "INSERT INTO users (username, password, role) VALUES ($1,$2,$3)",
      ['operator', hash2, 'operator']
    );
    console.log('✅ Default users created: admin/admin123, operator/operator123');
  }

  console.log('✅ Database initialized');
}

// ── Time Slots ────────────────────────────────────────────────────────────────
const TIME_SLOTS = [
  { slot: '08:30 – 09:30', order: 1 },
  { slot: '09:30 – 10:30', order: 2 },
  { slot: '10:30 – 11:30', order: 3 },
  { slot: '11:30 – 12:30', order: 4 },
  { slot: '12:30 – 13:30', order: 5 },
  { slot: '13:30 – 14:30', order: 6 },
  { slot: '14:30 – 15:30', order: 7 },
  { slot: '15:30 – 16:30', order: 8 },
  { slot: '16:30 – 17:30', order: 9 },
];

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LOG ROUTES ────────────────────────────────────────────────────────────────

// GET today's log (or any date)
app.get('/api/logs', auth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      'SELECT * FROM hourly_logs WHERE log_date=$1 ORDER BY slot_order',
      [date]
    );
    // Fill in missing slots with empty rows
    const filled = TIME_SLOTS.map(({ slot, order }) => {
      const existing = result.rows.find(r => r.time_slot === slot);
      return existing || {
        id: null, log_date: date, time_slot: slot, slot_order: order,
        picked: 0, packed: 0, dispatched: 0, pending: 0,
        avg_pick_time: null, avg_pack_time: null, errors: 0,
        picker_name: '', packer_name: '', supervisor_sign: '', notes: ''
      };
    });
    res.json(filled);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPSERT a slot
app.post('/api/logs', auth, async (req, res) => {
  const { log_date, time_slot, slot_order, picked, packed, dispatched, pending,
          avg_pick_time, avg_pack_time, errors, picker_name, packer_name,
          supervisor_sign, notes } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO hourly_logs
        (log_date, time_slot, slot_order, picked, packed, dispatched, pending,
         avg_pick_time, avg_pack_time, errors, picker_name, packer_name,
         supervisor_sign, notes, created_by, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
      ON CONFLICT (log_date, time_slot)
      DO UPDATE SET
        picked=$4, packed=$5, dispatched=$6, pending=$7,
        avg_pick_time=$8, avg_pack_time=$9, errors=$10,
        picker_name=$11, packer_name=$12, supervisor_sign=$13,
        notes=$14, updated_at=NOW()
      RETURNING *
    `, [log_date, time_slot, slot_order, picked||0, packed||0, dispatched||0, pending||0,
        avg_pick_time||null, avg_pack_time||null, errors||0,
        picker_name||'', packer_name||'', supervisor_sign||'', notes||'', req.user.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET daily summary for a date
app.get('/api/summary/daily', auth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as slots_filled,
        SUM(picked) as total_picked,
        SUM(packed) as total_packed,
        SUM(dispatched) as total_dispatched,
        SUM(pending) as total_pending,
        SUM(errors) as total_errors,
        ROUND(AVG(avg_pick_time)::numeric, 1) as avg_pick_time,
        ROUND(AVG(avg_pack_time)::numeric, 1) as avg_pack_time
      FROM hourly_logs WHERE log_date=$1
    `, [date]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET weekly summary
app.get('/api/summary/weekly', auth, async (req, res) => {
  const { from, to } = req.query;
  try {
    const result = await pool.query(`
      SELECT
        log_date,
        SUM(picked) as total_picked,
        SUM(packed) as total_packed,
        SUM(dispatched) as total_dispatched,
        SUM(pending) as total_pending,
        SUM(errors) as total_errors
      FROM hourly_logs
      WHERE log_date BETWEEN $1 AND $2
      GROUP BY log_date
      ORDER BY log_date
    `, [from, to]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET history dates
app.get('/api/history/dates', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT log_date,
        SUM(picked) as picked, SUM(packed) as packed, SUM(dispatched) as dispatched
      FROM hourly_logs
      GROUP BY log_date ORDER BY log_date DESC LIMIT 30
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── USERS (admin only) ────────────────────────────────────────────────────────
app.get('/api/users', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const result = await pool.query('SELECT id, username, role, created_at FROM users ORDER BY id');
  res.json(result.rows);
});

app.post('/api/users', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { username, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password, role) VALUES ($1,$2,$3) RETURNING id, username, role',
      [username, hash, role || 'operator']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Packing Tracker running on port ${PORT}`));
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
