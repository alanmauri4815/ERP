require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
    const { data, error } = await s.from('recetas').select('*').eq('product_code', 'TQ-001');
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}
check();
