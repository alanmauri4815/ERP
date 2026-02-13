
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function debugInsert() {
    const item = {
        quotation_id: 1,
        type: 'material',
        description: 'Debug Item',
        document_type: 'factura',
        unit_value_net: 500,
        quantity: 2,
        subtotal_cost: 1000
    };
    console.log('Attempting insert into quotation_items:', item);
    const { data, error } = await supabase.from('quotation_items').insert(item).select();
    if (error) {
        console.error('INSERT ERROR:', error);
    } else {
        console.log('INSERT SUCCESS:', data);
    }
}
debugInsert();
