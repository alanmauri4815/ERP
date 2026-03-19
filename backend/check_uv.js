require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkUVSale(empresaId = 1) {
    const { data: sales } = await supabase.from('ventas')
        .select('*')
        .ilike('client_name', '%Universidad de Valp%')
        .eq('empresa_id', empresaId);

    console.log('Ventas UV found:', sales);

    if (sales && sales.length > 0) {
        const sale = sales[0];
        const { data: ledgerEntries } = await supabase.from('asientos')
            .select('*')
            .eq('referencia_id', sale.id)
            .eq('empresa_id', empresaId);
        
        console.log('Ledger entries for this sale:', ledgerEntries);
    }
}

checkUVSale(1);
