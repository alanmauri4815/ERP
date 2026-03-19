const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('backend/.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function test() {
    // Look for quotation with multiple items
    const { data: q } = await supabase.from('quotations').select('*, items:quotation_items(*)').eq('id', 10).single();
    if (q) {
        console.log('Quotation #10 Type check:');
        q.items.forEach(i => console.log(`- ${i.description} | Type: ${i.item_type} | Qty: ${i.quantity}`));
    }
}
test();
