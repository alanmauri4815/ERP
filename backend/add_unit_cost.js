const Database = require('better-sqlite3');
const db = new Database('erp_database.db');

try {
    // Add unit_cost column to recipes table (this is the CU from Excel)
    db.exec(`ALTER TABLE recipes ADD COLUMN unit_cost REAL DEFAULT 0;`);
    console.log("Column unit_cost added to recipes table.");
} catch (e) {
    if (e.message.includes("duplicate column name")) {
        console.log("Column unit_cost already exists.");
    } else {
        console.error("Error:", e.message);
    }
}

db.close();
