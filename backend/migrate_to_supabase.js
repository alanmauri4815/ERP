const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');

const supabaseUrl = 'https://vsvaasnddphjlspukpca.supabase.co';
const supabaseKey = 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE';

const supabase = createClient(supabaseUrl, supabaseKey);
const db = new Database('erp_database.db');

async function migrate() {
    const tables = [
        'raw_materials', 'products', 'recipes', 'providers',
        'clients', 'production', 'sales', 'purchases',
        'sale_items', 'purchase_items', 'production_items'
    ];

    for (const table of tables) {
        console.log(`Migrating table: ${table}...`);
        const data = db.prepare(`SELECT * FROM ${table}`).all();

        if (data.length === 0) {
            console.log(`Table ${table} is empty, skipping.`);
            continue;
        }

        const { error } = await supabase.from(table).insert(data);
        if (error) {
            console.error(`Error migrating ${table}:`, error.message);
        } else {
            console.log(`Successfully migrated ${data.length} rows to ${table}.`);
        }
    }
    console.log('Migration finished!');
}

migrate();
