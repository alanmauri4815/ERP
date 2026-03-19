require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fix29(empresaId = 1) {
    const toDelete = [
        '37aed4c2-f519-4e70-be25-78cff9e0cc7e', // Wrong Devengo 29
        'abfa908e-d789-42ab-820c-d51e43e9722e'  // Wrong Cobro 29 balance
    ];

    for (const id of toDelete) {
        await supabase.from('asiento_movimientos').delete().eq('asiento_id', id).eq('empresa_id', empresaId);
        await supabase.from('asientos').delete().eq('id', id).eq('empresa_id', empresaId);
        console.log(`Eliminado: ${id}`);
    }
}

fix29(1);
