const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectQuote(id) {
    const { data, error } = await supabase
        .from('quotations')
        .select('*, quotation_items(*)')
        .eq('id', id)
        .single();
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    console.log('Quote ID:', data.id);
    console.log('Items:', JSON.stringify(data.quotation_items, null, 2));
}

inspectQuote(15);
