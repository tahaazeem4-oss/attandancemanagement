const db = require('./db');

db.query('SELECT * FROM students', (err, results) => {
  if (err) throw err;
  console.log(results);
});