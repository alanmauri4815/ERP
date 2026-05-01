require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function addProductionColumns() {
    console.log('Attempting to add columns to production table...');
    
    // Since we can't run raw SQL easily via the client without a custom RPC,
    // we'll try to use a trick if the user has a "sql" function or similar.
    // Otherwise, we might have to store this in production_items metadata if possible.
    
    // BUT, first let's check if they REALLY don't exist by trying a specific select.
    const { data, error } = await supabase
        .from('production')
        .select('mo_status, mo_subcontracted, mo_doc_type')
        .limit(1);
        
    if (error) {
        console.log('Columns do not exist. Error:', error.message);
        console.log('You need to add these columns manually in Supabase SQL Editor:');
        console.log(`
            ALTER TABLE production 
            ADD COLUMN IF NOT EXISTS mo_status TEXT DEFAULT 'pending',
            ADD COLUMN IF NOT EXISTS mo_subcontracted TEXT DEFAULT 'direct',
            ADD COLUMN IF NOT EXISTS mo_doc_type TEXT DEFAULT 'none';
        `);
    } else {
        console.log('Columns already exist!');
    }
}

addProductionColumns();
