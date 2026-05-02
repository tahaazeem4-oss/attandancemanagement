const db = require('./config/db');

db.query(`CREATE TABLE IF NOT EXISTS staff_notification_reads (
  notification_id INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  user_role       VARCHAR(20) NOT NULL,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_id, user_role)
)`)
.then(() => { console.log('staff_notification_reads table created OK'); process.exit(0); })
.catch(e => { console.error('Error:', e.message); process.exit(1); });
