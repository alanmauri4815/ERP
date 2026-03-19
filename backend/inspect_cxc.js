require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectCxc(empresaId = 1) {
    console.log(`--- Inspección de Cuentas por Cobrar (1.1.03) para empresa ${empresaId} ---`);
    
    // 1. Obtener todos los movimientos de la cuenta 1.1.03
    const { data: lines, error } = await supabase
        .from('asiento_movimientos')
        .select(`
            *,
            asiento:asientos!fk_asiento(*)
        `)
        .eq('cuenta_codigo', '1.1.03')
        .eq('empresa_id', empresaId);

    if (error) {
        console.error('Error:', error);
        return;
    }

    // 2. Agrupar por referencia_id para ver saldos por documento
    const balances = {};
    
    for (const l of lines) {
        const ref = l.asiento?.referencia_id || 'manual';
        if (!balances[ref]) balances[ref] = { debe: 0, haber: 0, asientos: [] };
        
        balances[ref].debe += (l.debe || 0);
        balances[ref].haber += (l.haber || 0);
        balances[ref].asientos.push({
            id: l.asiento_id,
            fecha: l.asiento?.fecha,
            glosa: l.asiento?.glosa,
            tipo: l.asiento?.tipo_origen,
            debe: l.debe,
            haber: l.haber
        });
    }

    console.log('--- Resumen por Documento ---');
    for (const [ref, b] of Object.entries(balances)) {
        const saldo = b.debe - b.haber;
        if (Math.abs(saldo) > 0) {
            console.log(`Ref: ${ref} | Debe: ${b.debe} | Haber: ${b.haber} | SALDO: ${saldo}`);
            // if (ref === '42') { // UV Sale
                b.asientos.forEach(a => {
                    console.log(`   - ${a.fecha} | ${a.tipo} | ${a.glosa} | D:${a.debe} H:${a.haber}`);
                });
            // }
        }
    }
}

inspectCxc(1);
