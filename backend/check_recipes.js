require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
    const { data, error } = await s.from('recetas').select('*').limit(1);
    if (error) console.error(error);
    else console.log('Columns:', Object.keys(data[0] || {}));
}
check();
