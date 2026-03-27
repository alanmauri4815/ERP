require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL or SUPABASE_KEY missing in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixStock() {
    console.log('Fixing stock for TU-01...');
    const { data, error } = await supabase
        .from('productos')
        .update({ stock: 2 })
        .eq('code', 'TU-01');
    
    if (error) {
        console.error('Error fixing stock:', error);
    } else {
        console.log('Stock for TU-01 updated to 2 successfully.');
    }
}

fixStock();
