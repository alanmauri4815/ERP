const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

async function checkSchema() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name IN ('clientela', 'proveedores')"
    });

    if (error) {
        console.error('Error using RPC:', error.message);
        // Fallback or just try to select * and see
    } else {
        console.table(data);
    }
}

checkSchema();
