require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function auditorInventarioMP(empresaId = 1) {
    console.log(`--- Auditoría de Inventario MP para empresa ${empresaId} ---`);

    // 1. Obtener Materias Primas actuales
    const { data: mps } = await supabase.from('materias primas')
        .select('code, name, stock')
        .eq('empresa_id', empresaId);

    // 2. Obtener Compras de MP
    const { data: purchases } = await supabase.from('purchase_items')
        .select('mp_code, quantity')
        .eq('empresa_id', empresaId);
    
    // 3. Obtener Producciones y sus recetas para calcular consumo
    const { data: prodItems } = await supabase.from('production_items')
        .select('product_code, quantity')
        .eq('empresa_id', empresaId);
    
    const { data: recipes } = await supabase.from('recetas')
        .select('product_code, mp_code, quantity')
        .eq('empresa_id', empresaId);

    // Mapear recetas por producto
    const recipeMap = {};
    recipes.forEach(r => {
        if (!recipeMap[r.product_code]) recipeMap[r.product_code] = [];
        recipeMap[r.product_code].push(r);
    });

    // Consolidar compras
    const totalPurchased = {};
    purchases.forEach(p => {
        if (p.mp_code) {
           totalPurchased[p.mp_code] = (totalPurchased[p.mp_code] || 0) + (parseFloat(p.quantity) || 0);
        }
    });

    // Consolidar consumo
    const totalConsumed = {};
    prodItems.forEach(pi => {
        const productRecipes = recipeMap[pi.product_code] || [];
        productRecipes.forEach(r => {
            const consumed = (parseFloat(pi.quantity) || 0) * (parseFloat(r.quantity) || 0);
            totalConsumed[r.mp_code] = (totalConsumed[r.mp_code] || 0) + consumed;
        });
    });

    // 4. Informe final
    console.log('--- REPORTE DE DISCREPANCIAS ---');
    console.log('CODIGO | NOMBRE | STOCK ACTUAL | COMPRAS (+) | CONSUMO (-) | NETO ESPERADO | DIFERENCIA');
    
    mps.forEach(m => {
        const p = totalPurchased[m.code] || 0;
        const c = totalConsumed[m.code] || 0;
        const esperado = p - c;
        const diferencia = m.stock - esperado;
        
        if (Math.abs(diferencia) > 0.01) {
            console.log(`${m.code} | ${m.name.padEnd(20)} | ${m.stock.toFixed(2)} | +${p.toFixed(2)} | -${c.toFixed(2)} | ${esperado.toFixed(2)} | ${diferencia.toFixed(2)}`);
        }
    });
}

auditorInventarioMP(1);
