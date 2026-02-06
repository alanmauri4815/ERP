require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fixInventoryData() {
    console.log('--- Iniciando Corrección de Impuestos en Inventario ---');

    // 1. Corregir Productos Terminados
    console.log('Procesando Productos Terminados...');
    const { data: products } = await supabase.from('productos').select('*');
    for (const p of products) {
        const neto = p.price_net || 0;
        const bruto = p.price_sale || 0;
        const iva = bruto - neto;

        if (p.iva === 0 || p.total === 0) {
            await supabase.from('productos')
                .update({ iva: iva, total: bruto })
                .eq('code', p.code);
            console.log(`✅ Producto ${p.code} actualizado.`);
        }
    }

    // 2. Corregir Materias Primas
    console.log('Procesando Materias Primas...');
    const { data: rms } = await supabase.from('materias primas').select('*');
    for (const m of rms) {
        const neto = m.cost_net || 0;
        const iva = Math.round(neto * 0.19);
        const bruto = neto + iva;

        if (m.iva === 0 || m.total === 0) {
            await supabase.from('materias primas')
                .update({ iva: iva, total: bruto })
                .eq('code', m.code);
            console.log(`✅ Materia Prima ${m.code} actualizada.`);
        }
    }

    console.log('--- Corrección Finalizada ---');
}

fixInventoryData();
