const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    console.log('--- Adding document_type to ventas table ---');
    const sql = "ALTER TABLE ventas ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'boleta';";
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
        console.error('Migration failed (RPC exec_sql might not exist):', error);
        console.log('If it failed, please run this SQL manually in Supabase Editor:');
        console.log(sql);
    } else {
        console.log('Migration successful!', data);
    }
}

run();
