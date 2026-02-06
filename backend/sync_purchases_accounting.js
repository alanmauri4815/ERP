require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const T = {
    PURCHASES: 'compras',
    ACCOUNTING_ENTRIES: 'asientos_contables',
    ACCOUNTING_ACCOUNTS: 'accounting_accounts',
    ACCOUNTING_LINES: 'accounting_lines',
    PROVIDERS: 'proveedores'
};

async function syncPurchases() {
    console.log('--- Iniciando Sincronización de Compras ---');

    // 1. Asegurar Cuenta "Débito Privada"
    let { data: privateAcc } = await supabase
        .from(T.ACCOUNTING_ACCOUNTS)
        .select('id, code')
        .eq('name', 'Débito Privada')
        .single();

    if (!privateAcc) {
        console.log('Creando cuenta "Débito Privada"...');
        const { data: newAcc, error: nError } = await supabase
            .from(T.ACCOUNTING_ACCOUNTS)
            .insert({
                code: '1.1.01.04',
                name: 'Débito Privada',
                type: 'Activo',
                category: 'Disponible'
            })
            .select()
            .single();
        if (nError) {
            console.error('Error creando cuenta:', nError);
            return;
        }
        privateAcc = newAcc;
    }

    // 2. Obtener Códigos de Cuentas Necesarias
    const { data: accounts } = await supabase.from(T.ACCOUNTING_ACCOUNTS).select('id, code');
    const codeMap = {};
    accounts.forEach(a => codeMap[a.code] = a.id);

    // 3. Obtener Compras con info de proveedores
    const { data: purchases, error: pError } = await supabase
        .from(T.PURCHASES)
        .select(`*, providers:"${T.PROVIDERS}"(name)`);

    if (pError) {
        console.error('Error obteniendo compras:', pError);
        return;
    }

    console.log(`Se encontraron ${purchases.length} compras para procesar.`);

    for (const pur of purchases) {
        // Evitar duplicados
        const { data: existing } = await supabase
            .from(T.ACCOUNTING_ENTRIES)
            .select('id')
            .eq('document_number', pur.id.toString())
            .eq('entry_type', 'compra')
            .single();

        if (existing) {
            console.log(`Compra #${pur.id} ya sincronizada. Saltando...`);
            continue;
        }

        try {
            // 4. Crear Cabecera
            const { data: header, error: hError } = await supabase
                .from(T.ACCOUNTING_ENTRIES)
                .insert({
                    date: pur.date,
                    description: `Compra: ${pur.providers?.name || 'Proveedor'} (Doc: ${pur.document_type || 'N/A'})`,
                    entry_type: 'compra',
                    document_number: pur.id.toString()
                })
                .select()
                .single();

            if (hError) throw hError;

            // 5. Preparar Líneas (Partida Doble)
            const lines = [
                {
                    asiento_id: header.id,
                    account_id: codeMap['1.1.02.01'], // Inventario MP
                    debit: pur.net,
                    credit: 0,
                    glosa: `Ingreso Insumos Compra #${pur.id}`
                },
                {
                    asiento_id: header.id,
                    account_id: privateAcc.id, // Débito Privada
                    debit: 0,
                    credit: pur.total,
                    glosa: `Pago Compra #${pur.id} (Temporal)`
                }
            ];

            if (pur.iva > 0) {
                lines.push({
                    asiento_id: header.id,
                    account_id: codeMap['1.1.03.01'], // IVA Crédito Fiscal
                    debit: pur.iva,
                    credit: 0,
                    glosa: `IVA Crédito Compra #${pur.id}`
                });
            }

            const { error: lError } = await supabase.from(T.ACCOUNTING_LINES).insert(lines);
            if (lError) throw lError;

            console.log(`✅ Compra #${pur.id} sincronizada con Débito Privada.`);
        } catch (e) {
            console.error(`❌ Error en Compra #${pur.id}:`, e.message);
        }
    }

    console.log('--- Sincronización Finalizada ---');
}

syncPurchases();
