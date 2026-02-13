
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkPurchase() {
    const { data, error } = await supabase.from('compras').select('id, payment_method').eq('id', 3).single();
    console.log('Purchase #3 Data:', data);
    const { data: all, error: e2 } = await supabase.from('compras').select('id, payment_method').order('id', { ascending: false }).limit(5);
    console.log('Last 5 purchases:', all);
}

checkPurchase();
