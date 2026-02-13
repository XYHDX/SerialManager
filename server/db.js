const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'serials.db');
let db = new Database(dbPath, { verbose: console.log });

const initSchema = () => {
  const initStmt = `
    CREATE TABLE IF NOT EXISTS serials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_number TEXT UNIQUE NOT NULL,
      source_filename TEXT,
      extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'confirmed'
    );
  `;
  db.exec(initStmt);
};

initSchema();

module.exports = {
  get: () => db,
  path: dbPath,
  close: () => {
    if (db && db.open) {
      db.close();
      console.log('Database connection closed.');
    }
  },
  reconnect: () => {
    if (db && db.open) db.close();
    db = new Database(dbPath, { verbose: console.log });
    initSchema();
    console.log('Database connection reopened.');
  }
};
