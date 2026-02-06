require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const T = {
    PRODUCTION: 'production',
    PRODUCTION_ITEMS: 'production_items',
    RECIPES: 'recetas',
    MP: 'materias primas',
    ACCOUNTING_ENTRIES: 'asientos_contables',
    ACCOUNTING_ACCOUNTS: 'accounting_accounts',
    ACCOUNTING_LINES: 'accounting_lines'
};

async function syncProduction() {
    console.log('--- Iniciando Sincronización de Producción (Consumos) ---');

    // 1. Obtener Códigos de Cuentas
    const { data: accounts } = await supabase.from(T.ACCOUNTING_ACCOUNTS).select('id, code');
    const codeMap = {};
    accounts.forEach(a => codeMap[a.code] = a.id);

    // 2. Obtener Producciones
    const { data: productions, error: pError } = await supabase.from(T.PRODUCTION).select('*');
    if (pError) {
        console.error('Error obteniendo producciones:', pError);
        return;
    }

    console.log(`Se encontraron ${productions.length} órdenes de producción.`);

    for (const prod of productions) {
        // Evitar duplicados
        const { data: existing } = await supabase
            .from(T.ACCOUNTING_ENTRIES)
            .select('id')
            .eq('document_number', prod.id.toString())
            .eq('entry_type', 'consumo')
            .single();

        if (existing) {
            console.log(`Producción #${prod.id} ya sincronizada. Saltando...`);
            continue;
        }

        try {
            // 3. Obtener Items de esta producción
            const { data: items } = await supabase.from(T.PRODUCTION_ITEMS).select('*').eq('production_id', prod.id);

            let totalConsumptionCost = 0;

            for (const item of items) {
                // Obtener receta del producto
                const { data: recipe } = await supabase.from(T.RECIPES).select('mp_code, quantity').eq('product_code', item.product_code);

                for (const r of recipe) {
                    // Obtener costo neto del insumo
                    const { data: rm } = await supabase.from(T.MP).select('cost_net').eq('code', r.mp_code).single();
                    const consumptionQty = r.quantity * item.quantity;
                    const cost = consumptionQty * (rm?.cost_net || 0);
                    totalConsumptionCost += cost;
                }
            }

            if (totalConsumptionCost > 0) {
                // 4. Crear Cabecera de Asiento
                const { data: header, error: hError } = await supabase
                    .from(T.ACCOUNTING_ENTRIES)
                    .insert({
                        date: prod.date,
                        description: `Consumo Materias Primas - Producción #${prod.id}`,
                        entry_type: 'consumo',
                        document_number: prod.id.toString()
                    })
                    .select()
                    .single();

                if (hError) throw hError;

                // 5. Crear Líneas
                const lines = [
                    {
                        asiento_id: header.id,
                        account_id: codeMap['1.1.02.02'], // Inventario PT
                        debit: Math.round(totalConsumptionCost),
                        credit: 0,
                        glosa: `Shift Valor a PT (Producción #${prod.id})`
                    },
                    {
                        asiento_id: header.id,
                        account_id: codeMap['1.1.02.01'], // Inventario MP
                        debit: 0,
                        credit: Math.round(totalConsumptionCost),
                        glosa: `Rebaja Inventario MP (Producción #${prod.id})`
                    }
                ];

                const { error: lError } = await supabase.from(T.ACCOUNTING_LINES).insert(lines);
                if (lError) throw lError;

                console.log(`✅ Producción #${prod.id} sincronizada. Costo Consumo: $${Math.round(totalConsumptionCost).toLocaleString()}`);
            } else {
                console.log(`⚠️ Producción #${prod.id} sin costo de consumo calculable (¿Sin recetas?).`);
            }
        } catch (e) {
            console.error(`❌ Error en Producción #${prod.id}:`, e.message);
        }
    }

    console.log('--- Sincronización Finalizada ---');
}

syncProduction();
