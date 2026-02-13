
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSchema() {
    const { data, error } = await supabase.from('quotation_items').select('*').limit(1);
    if (error) {
        console.log('Error:', error.message);
        if (error.message.includes('column')) {
            console.log('Maybe some columns are missing.');
        }
    } else {
        console.log('Success fetching, but maybe table is empty.');
    }

    // Test insert with a dummy item to see specific field errors
    const testItem = {
        quotation_id: 1, // Assumes quotation 1 exists
        type: 'material',
        description: 'Test Piece',
        document_type: 'factura',
        unit_value_net: 1000,
        quantity: 1,
        subtotal_cost: 1000
    };

    const { error: insError } = await supabase.from('quotation_items').insert(testItem);
    if (insError) {
        console.error('Insert Error Detail:', insError);
    } else {
        console.log('Insert successful! Table schema matches testItem.');
    }
}
checkSchema();
