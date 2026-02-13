
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkPurchaseOne() {
    console.log('Checking Purchase #1...');
    const { data: p, error } = await supabase.from('compras').select('id, payment_method, account_id').eq('id', 1).single();
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Purchase #1 Data:', p);
}

checkPurchaseOne();
