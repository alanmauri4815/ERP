
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkPurchaseDetailed() {
    const { data, error } = await supabase.from('compras').select('id, payment_method, account_id').eq('id', 3).single();
    console.log('Purchase #3 Detailed:', data);
}

checkPurchaseDetailed();
