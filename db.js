const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', // XAMPP default is EMPTY
  database: 'school_db'
});

db.connect((err) => {
  if (err) {
    console.error('Connection failed:', err);
    return;
  }
  console.log('Connected to MySQL ✅');
});

module.exports = db;