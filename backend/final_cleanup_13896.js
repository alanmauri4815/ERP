require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function finalCleanup(empresaId = 1) {
    const toDelete = [
        '976fb03f-31ae-4104-849c-0ee4e23a91bf', // Ref 62 erp_compra
        '558a0898-4821-44a9-bdaa-9e61b4b6d68f', // Ref 62 erp_compra
        '1a245441-1af0-4db4-aab3-8dfa35daba66'  // Ref 79 erp_compra
    ];

    for (const id of toDelete) {
        await supabase.from('asiento_movimientos').delete().eq('asiento_id', id).eq('empresa_id', empresaId);
        await supabase.from('asientos').delete().eq('id', id).eq('empresa_id', empresaId);
        console.log(`Eliminado: ${id}`);
    }
}

finalCleanup(1);
