require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkLedger42(empresaId = 1) {
    const { data: entries } = await supabase.from('asientos')
        .select('*')
        .eq('referencia_id', '42')
        .eq('empresa_id', empresaId);

    console.log('Ledger entries for ref 42:', entries);
}

checkLedger42(1);
