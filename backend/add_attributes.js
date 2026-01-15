const Database = require('better-sqlite3');
const db = new Database('erp_database.db');

try {
    db.exec(`
        ALTER TABLE products ADD COLUMN color TEXT;
        ALTER TABLE products ADD COLUMN size TEXT;
        ALTER TABLE products ADD COLUMN parent_code TEXT;

        ALTER TABLE raw_materials ADD COLUMN color TEXT;
        ALTER TABLE raw_materials ADD COLUMN size TEXT;
        ALTER TABLE raw_materials ADD COLUMN parent_code TEXT;
    `);
    console.log("Columns added successfully.");
} catch (e) {
    if (e.message.includes("duplicate column name")) {
        console.log("Columns already exist.");
    } else {
        console.error("Error adding columns:", e.message);
    }
} finally {
    db.close();
}
