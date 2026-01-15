const Database = require('better-sqlite3');
const db = new Database('erp_database.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables);
tables.forEach(t => {
    const info = db.prepare(`PRAGMA table_info(${t.name})`).all();
    console.log(`Schema for ${t.name}:`, info);
});
db.close();
