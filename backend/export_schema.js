const db = require('better-sqlite3')('erp_database.db');
const tables = [
    'raw_materials', 'products', 'recipes', 'providers',
    'clients', 'sales', 'sale_items', 'purchases',
    'purchase_items', 'production_items', 'production'
];

console.log('-- SQL Schema Export for Supabase');
tables.forEach(t => {
    try {
        const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${t}'`).get();
        if (schema) {
            // Basic conversion from SQLite to PostgreSQL
            let pgSql = schema.sql
                .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
                .replace(/DATETIME/gi, 'TIMESTAMP')
                .replace(/REAL/gi, 'DECIMAL')
                .replace(/TEXT/gi, 'TEXT');
            console.log(pgSql + ';');
        }
    } catch (e) {
        console.error(`Error for table ${t}:`, e.message);
    }
});
