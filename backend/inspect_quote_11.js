
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectQuote11() {
    console.log('Inspecting items for Quotation #11...');
    
    const { data: items, error } = await supabase
        .from('quotation_items')
        .select('*')
        .eq('quotation_id', 11);
        
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    console.log(`Found ${items.length} items.`);
    items.forEach(it => {
        console.log(`ID: ${it.id} | Desc: "${it.description}" | Qty: ${it.quantity} | Total: ${it.total_cost}`);
    });
}

inspectQuote11();
