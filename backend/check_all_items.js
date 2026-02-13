
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkAllItems() {
    const { data: items, error } = await supabase.from('quotation_items').select('*');
    if (error) { console.error(error); return; }
    console.log(`Total items in quotation_items: ${items.length}`);
    items.forEach(it => {
        console.log(`ID: ${it.id}, QuoteID: ${it.quotation_id}, Desc: ${it.description}`);
    });
}
checkAllItems();
