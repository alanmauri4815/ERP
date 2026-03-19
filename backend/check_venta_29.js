require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkVenta29(empresaId = 1) {
    const { data: sale } = await supabase.from('ventas')
        .select('*')
        .eq('id', 29)
        .eq('empresa_id', empresaId)
        .single();

    console.log('Venta 29 Data:', sale);
}

checkVenta29(1);
