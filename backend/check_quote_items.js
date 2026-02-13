
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkDetails() {
    const { data: q, error: qErr } = await supabase.from('quotations').select('*');
    if (qErr) { console.error(qErr); return; }

    for (const quote of q) {
        const { data: items, error: iErr } = await supabase.from('quotation_items').select('*').eq('quotation_id', quote.id);
        console.log(`\n--- Quotation ID: ${quote.id} (${quote.name}) ---`);
        if (iErr) {
            console.error(`Error fetching items for ${quote.id}:`, iErr);
        } else {
            console.log(`Items count: ${items.length}`);
            items.forEach(it => {
                console.log(`  - ${it.description}: Qty ${it.quantity}, Cost ${it.unit_value_net}`);
            });
        }
    }
}
checkDetails();
