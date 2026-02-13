
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function addColumns() {
    console.log('--- ADDING COLUMNS TO quotations TABLE ---');

    // Supabase JS doesn't support ALTER TABLE directly. 
    // We try to trigger an update to see if they exist.
    const { error: testError } = await supabase.from('quotations').update({
        budget: 0,
        success_probability: 0
    }).eq('id', -1); // ID that doesn't exist

    if (testError && testError.message.includes('column')) {
        console.log('\n[!] IMPORTANT: Columns "budget" and "success_probability" are MISSING in Supabase.');
        console.log('Since I cannot run SQL ALTER TABLE via JS client, please run this in your Supabase SQL Editor:');
        console.log('\nALTER TABLE quotations ADD COLUMN budget DOUBLE PRECISION DEFAULT 0;');
        console.log('ALTER TABLE quotations ADD COLUMN success_probability DOUBLE PRECISION DEFAULT 0;');
    } else if (testError) {
        console.error('An unexpected error occurred:', testError.message);
    } else {
        console.log('\n[OK] Columns already exist or were successfully verified.');
    }
}

addColumns();
