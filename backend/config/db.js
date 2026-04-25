require('dotenv').config();
const { Pool, types } = require('pg');

// Parse PostgreSQL bigint (OID 20) as JS number instead of string
types.setTypeParser(20, (val) => parseInt(val, 10));

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'postgres',
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 10,
});

function toPostgresParams(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function query(sql, params = []) {
  const text = toPostgresParams(sql);
  const result = await pool.query(text, params);
  return [result.rows, result];
}

async function getFirstRow(sql, params = []) {
  const [rows] = await query(sql, params);
  return rows[0] || null;
}

async function getClient() {
  return pool.connect();
}

const db = {
  query,
  getFirstRow,
  getClient,
  pool,
};

pool.on('error', (err) => {
  console.warn('[DB pool error]', err.message);
});

pool.connect()
  .then((client) => {
    console.log('Connected to Supabase PostgreSQL ✅');
    client.release();
  })
  .catch((err) => {
    console.error('Database connection failed:', err.message);
  });

module.exports = db;
