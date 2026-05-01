
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectProd19() {
    console.log('Inspecting Production #19...');
    const { data: prod, error } = await supabase
        .from('production')
        .select('*')
        .eq('id', 19)
        .single();
        
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    console.log('Production #19:', prod);
    
    if (prod.quotation_id) {
        const { data: quote } = await supabase
            .from('quotations')
            .select('*, clients(name)')
            .eq('id', prod.quotation_id)
            .single();
        console.log('Linked Quotation:', quote);
    }
}

inspectProd19();
