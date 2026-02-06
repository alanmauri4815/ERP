const Database = require('better-sqlite3');
const db = new Database('backend/erp_database.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables in erp_database.db:');
tables.forEach(t => console.log(`- ${t.name}`));

const counts = {};
tables.forEach(t => {
    const res = db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get();
    counts[t.name] = res.count;
});

console.log('\nRow counts:');
console.log(counts);
