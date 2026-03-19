require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function cleanupLedger(empresaId = 1) {
    console.log(`--- Iniciando limpieza de Libro Diario para empresa ${empresaId} ---`);
    
    // 1. Obtener todos los asientos de la empresa
    const { data: entries, error } = await supabase
        .from('asientos')
        .select(`
            *,
            lineas:asiento_movimientos!fk_asiento(
                *,
                account:plan_cuentas!asiento_movimientos_cuenta_codigo_fkey(nombre, codigo)
            )
        `)
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false });

    if (error) {
        console.error('Error al obtener asientos:', error);
        return;
    }

    console.log(`Se encontraron ${entries.length} asientos.`);

    const seen = new Map(); // key: "tipo_abstracto_ref_monto_fecha", value: entryId
    const toDelete = [];

    for (const entry of entries) {
        if (!entry.referencia_id) continue;

        // Normalizar tipo
        const typeRaw = (entry.tipo_origen || '').toLowerCase();
        let typeAbstract = 'otro';
        if (typeRaw.includes('compra') && !typeRaw.includes('pago')) typeAbstract = 'compra';
        else if (typeRaw.includes('pago') && typeRaw.includes('compra')) typeAbstract = 'pago_compra';
        else if (typeRaw.includes('venta') && !typeRaw.includes('cobro') && !typeRaw.includes('pago')) typeAbstract = 'venta';
        else if (typeRaw.includes('cobro') || (typeRaw.includes('pago') && typeRaw.includes('venta'))) typeAbstract = 'pago_venta';

        // Calcular magnitud total del asiento (Debe total)
        const totalAmount = (entry.lineas || []).reduce((sum, l) => sum + (l.debe || 0), 0);
        
        const key = `${typeAbstract}_${entry.referencia_id}_${totalAmount}_${entry.fecha}`;

        if (seen.has(key)) {
            console.log(`[DUPLICADO DETECTADO] ID: ${entry.id} (Key: ${key}) - Glosa: ${entry.glosa}`);
            toDelete.push(entry.id);
        } else {
            seen.set(key, entry.id);
        }
    }

    if (toDelete.length === 0) {
        console.log('No se encontraron duplicados exactos.');
        // return;
    } else {
        console.log(`Procediendo a eliminar ${toDelete.length} asientos duplicados...`);
        
        // Eliminar en lotes para evitar problemas
        for (const id of toDelete) {
            // Eliminar líneas primero (por si la FK no tiene cascade)
            await supabase.from('asiento_movimientos').delete().eq('asiento_id', id).eq('empresa_id', empresaId);
            const { error: dErr } = await supabase.from('asientos').delete().eq('id', id).eq('empresa_id', empresaId);
            if (dErr) console.error(`Error al eliminar asiento ${id}:`, dErr.message);
            else console.log(`Asiento ${id} eliminado.`);
        }
    }

    // 2. Especial: Universidad de Valparaíso (Asegurarse que el devengo existe)
    // El usuario dice: "sólo queda una factura por cobrar. Universidad de Valparaíso (BOL 2026-02-21)"
    const uvSaleId = 'universidad_de_valparaiso_id'; // Necesito el ID real o buscar por glosa
    
    console.log('--- Limpieza finalizada ---');
}

cleanupLedger(1);
