const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function run() {
    console.log('--- Migrating quotation_items table ---');
    const sql = "ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'factura';";
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
        console.error('Migration failed:', error);
    } else {
        console.log('Migration successful!', data);
    }
}
run();
