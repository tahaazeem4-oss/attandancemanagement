require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'school_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
});

const db = pool.promise();

// Verify connection on startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    return;
  }
  console.log('Connected to MySQL ✅');
  connection.release();
});

module.exports = db;
