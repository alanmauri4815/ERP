const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('backend/.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function test() {
    const { data: q } = await supabase.from('quotations').select('*').limit(1).single();
    if (q) console.log('Quotation keys:', Object.keys(q));
}
test();
