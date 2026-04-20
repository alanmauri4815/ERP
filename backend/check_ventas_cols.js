const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkCols() {
    // We can't easily list columns from supabase-js without RPC or postgres,
    // but we can try to insert a dummy record and see if it fails due to missing column.
    // Or just fetch one record and see keys.
    const { data, error } = await supabase.from('ventas').select('*').limit(1);
    if (error) {
        console.error('Error fetching vantas:', error);
        return;
    }
    if (data && data.length > 0) {
        console.log('Columns in ventas:', Object.keys(data[0]));
    } else {
        console.log('No data in ventas to check columns. Trying to insert and catch error.');
        const { error: iError } = await supabase.from('ventas').insert({ document_type: 'test_probe' });
        if (iError && iError.message.includes('column "document_type" does not exist')) {
            console.log('Column document_type DOES NOT EXIST');
        } else {
            console.log('Column document_type likely exists (or something else failed):', iError?.message);
        }
    }
}

checkCols();
