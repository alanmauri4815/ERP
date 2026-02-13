
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSchemaVerbose() {
    // Try to insert a dummy item with ONLY the quotation_id to see what other fields are required
    console.log('Testing minimal insert...');
    const { error: minError } = await supabase.from('quotation_items').insert({ quotation_id: 1 });
    if (minError) {
        console.log('Minimal Insert Error:', minError.message);
        console.log('Full Error:', JSON.stringify(minError, null, 2));
    } else {
        console.log('Minimal Insert success!');
    }

    // Try a full insert with my assumed fields
    console.log('\nTesting full insert...');
    const testItem = {
        quotation_id: 1,
        type: 'material',
        description: 'Test Item',
        document_type: 'factura',
        unit_value_net: 100,
        quantity: 1,
        subtotal_cost: 100
    };
    const { error: fullError } = await supabase.from('quotation_items').insert(testItem);
    if (fullError) {
        console.log('Full Insert Error:', fullError.message);
        console.log('Full Error Detail:', JSON.stringify(fullError, null, 2));
    } else {
        console.log('Full Insert success!');
    }
}
checkSchemaVerbose();
