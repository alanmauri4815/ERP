
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function finalDebugInsert() {
    const item = {
        quotation_id: 1,
        item_type: 'material',
        description: 'Final Test Item',
        quantity: 5,
        unit_cost: 1000,
        total_cost: 5000
    };
    console.log('Attempting insert with CORRECT columns:', item);
    const { data, error } = await supabase.from('quotation_items').insert(item).select();
    if (error) {
        console.error('INSERT ERROR:', error);
    } else {
        console.log('INSERT SUCCESS:', data);
    }
}
finalDebugInsert();
