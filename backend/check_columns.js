const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

async function checkColumns() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    console.log('Checking clientela:');
    const { data: cData, error: cError } = await supabase.from('clientela').select('*').limit(1);
    if (cError) console.error(cError);
    else console.log('Columns:', Object.keys(cData[0] || {}));

    console.log('\nChecking proveedores:');
    const { data: pData, error: pError } = await supabase.from('proveedores').select('*').limit(1);
    if (pError) console.error(pError);
    else console.log('Columns:', Object.keys(pData[0] || {}));
}

checkColumns();
