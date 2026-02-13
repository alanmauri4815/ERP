
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function cleanup() {
    console.log('Cleaning up duplicate quotations...');
    const duplicateIds = [2, 3, 4]; // Found in previous check
    const { error: iError } = await supabase.from('quotation_items').delete().in('quotation_id', duplicateIds);
    if (iError) {
        console.error('Error deleting items:', iError);
        return;
    }
    const { error: qError } = await supabase.from('quotations').delete().in('id', duplicateIds);
    if (qError) {
        console.error('Error deleting headers:', qError);
        return;
    }
    console.log('Cleanup successful!');
}

cleanup();
