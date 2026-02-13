
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function addCalculationType() {
    console.log('--- ADDING calculation_type TO quotation_items TABLE ---');

    // Test if column exists
    const { error: testError } = await supabase.from('quotation_items').update({
        calculation_type: 'unit'
    }).eq('id', -1);

    if (testError && testError.message.includes('column')) {
        console.log('\n[!] Column "calculation_type" is MISSING in Supabase.');
        console.log('Please run this in your Supabase SQL Editor:');
        console.log('\nALTER TABLE quotation_items ADD COLUMN calculation_type TEXT DEFAULT \'unit\';');
    } else if (testError) {
        console.error('Error:', testError.message);
    } else {
        console.log('\n[OK] Column "calculation_type" exists.');
    }
}
addCalculationType();
