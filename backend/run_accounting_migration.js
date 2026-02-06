require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function runMigration() {
    const sql = fs.readFileSync('migrations/accounting_system.sql', 'utf8');
    const { data, error } = await supabase.rpc('execute_sql', { query: sql });
    if (error) {
        console.error('Migration Error:', error);
    } else {
        console.log('Migration Success:', data);
    }
}

runMigration();
