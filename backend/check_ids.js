
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkIds() {
    const { data: prod } = await supabase.from('production').select('id, quotation_id, empresa_id').eq('id', 20).single();
    const { data: quote } = await supabase.from('quotations').select('id, empresa_id').eq('id', 11).single();
    
    console.log('Production 20:', prod);
    console.log('Quotation 11:', quote);
}

checkIds();
