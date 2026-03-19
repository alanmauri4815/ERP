require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function get29Ids(empresaId = 1) {
    const { data: entries } = await supabase.from('asientos')
        .select('*')
        .eq('referencia_id', '29')
        .eq('empresa_id', empresaId);
    
    console.log('Asientos Ref 29:', entries);
}

get29Ids(1);
