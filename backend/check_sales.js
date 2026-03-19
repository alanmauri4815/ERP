require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkDateSales(empresaId = 1) {
    const { data: sales } = await supabase.from('ventas')
        .select('*')
        .eq('date', '2026-02-21')
        .eq('empresa_id', empresaId);

    console.log('Ventas 2026-02-21:', sales);
}

checkDateSales(1);
