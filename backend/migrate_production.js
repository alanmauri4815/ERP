const Database = require('better-sqlite3');
const db = new Database('erp_database.db');

db.transaction(() => {
    // 1. Create items table if not exists (already done but safe)
    db.prepare('CREATE TABLE IF NOT EXISTS production_items (id INTEGER PRIMARY KEY AUTOINCREMENT, production_id INTEGER, item_number INTEGER, product_code TEXT, quantity REAL, mo_cost REAL)').run();

    // 2. Check if old schema exists
    const columns = db.prepare("PRAGMA table_info(production)").all();
    const hasProductCode = columns.some(c => c.name === 'product_code');

    if (hasProductCode) {
        console.log('Migrating production table to new schema...');
        db.prepare('ALTER TABLE production RENAME TO production_old').run();
        db.prepare('CREATE TABLE production (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT)').run();

        db.prepare('INSERT INTO production (id, date) SELECT id, date FROM production_old').run();
        db.prepare('INSERT INTO production_items (production_id, item_number, product_code, quantity, mo_cost) SELECT id, 1, product_code, quantity, mo_cost FROM production_old').run();

        db.prepare('DROP TABLE production_old').run();
        console.log('Migration completed.');
    } else {
        console.log('Production table already in new schema or empty.');
    }
})();

db.close();
