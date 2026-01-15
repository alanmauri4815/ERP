const Database = require('better-sqlite3');
const db = new Database('erp_database.db');

try {
    // Add batch_size column to recipes table
    db.exec(`ALTER TABLE recipes ADD COLUMN batch_size INTEGER DEFAULT 1;`);
    console.log("Column batch_size added to recipes table.");
} catch (e) {
    if (e.message.includes("duplicate column name")) {
        console.log("Column batch_size already exists.");
    } else {
        console.error("Error:", e.message);
    }
}

db.close();
