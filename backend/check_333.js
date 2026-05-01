
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkEmpresaId() {
    const { data: item, error } = await supabase
        .from('quotation_items')
        .select('id, quotation_id, empresa_id')
        .eq('id', 333)
        .single();
        
    console.log('Item 333:', item);
}

checkEmpresaId();
