
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectProd20() {
    console.log('Inspecting Production #20...');
    const { data: prod } = await supabase.from('production').select('*').eq('id', 20).single();
    console.log('Production #20:', prod);
    if (prod?.quotation_id) {
        const { data: quote } = await supabase.from('quotations').select('id, name').eq('id', prod.quotation_id).single();
        console.log('Linked Quotation:', quote);
    }
}

inspectProd20();
