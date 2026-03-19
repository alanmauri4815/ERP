require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkInventoryValue(empresaId = 1) {
    // 1. Calcular valor de Productos Terminados
    const { data: products } = await supabase.from('productos')
        .select('stock, cost_unit')
        .eq('empresa_id', empresaId);
    
    let totalValuePT = 0;
    products.forEach(p => {
        totalValuePT += (parseFloat(p.stock) || 0) * (parseFloat(p.cost_unit) || 0);
    });
    
    console.log(`Valor Total Productos Terminados: $${Math.round(totalValuePT)}`);

    // 2. Verificar Plan de Cuentas
    const { data: accounts } = await supabase.from('plan_cuentas')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('codigo');
    
    console.log('--- Plan de Cuentas actual ---');
    accounts.forEach(a => console.log(`${a.codigo} | ${a.nombre}`));
}

checkInventoryValue(1);
