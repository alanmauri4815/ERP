require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const T = {
    SALES: 'ventas',
    ACCOUNTING_ENTRIES: 'asientos_contables',
    ACCOUNTING_ACCOUNTS: 'accounting_accounts',
    ACCOUNTING_LINES: 'accounting_lines'
};

async function migrateSales() {
    console.log('--- Iniciando Sincronización de Ventas Existentes ---');

    // 1. Obtener Cuentas
    const { data: accounts, error: accError } = await supabase.from(T.ACCOUNTING_ACCOUNTS).select('id, code');
    if (accError) {
        console.error('Error obteniendo cuentas:', accError);
        return;
    }
    const codeMap = {};
    accounts.forEach(a => codeMap[a.code] = a.id);

    // 2. Obtener Ventas con info de máquinas
    const { data: sales, error: salesError } = await supabase
        .from(T.SALES)
        .select('*, payment_machines:machine_id(commission_percent)');

    if (salesError) {
        console.error('Error obteniendo ventas:', salesError);
        return;
    }

    console.log(`Se encontraron ${sales.length} ventas para procesar.`);

    for (const sale of sales) {
        // ... (check existing same as before)
        const { data: existing } = await supabase
            .from(T.ACCOUNTING_ENTRIES)
            .select('id')
            .eq('document_number', sale.id.toString())
            .eq('entry_type', 'venta')
            .single();

        if (existing) {
            console.log(`Venta #${sale.id} ya tiene asiento. Saltando...`);
            continue;
        }

        try {
            // 3. Crear Cabecera
            const { data: header, error: hError } = await supabase
                .from(T.ACCOUNTING_ENTRIES)
                .insert({
                    date: sale.date,
                    description: `Migración: Venta #${sale.id} (${sale.event_name || 'Venta Directa'})`,
                    entry_type: 'venta',
                    document_number: sale.id.toString()
                })
                .select()
                .single();

            if (hError) throw hError;

            // 4. Determinar Cuentas y Comisión
            let paymentAccount = codeMap['1.1.01.01']; // Caja
            let commissionAmount = 0;

            if (sale.payment_method === 'machine') {
                paymentAccount = codeMap['1.1.01.03']; // Fondos por Recaudar
                const commRate = sale.payment_machines?.commission_percent || 0;
                commissionAmount = Math.round(sale.total * commRate / 100);
            } else if (sale.payment_method === 'transfer') {
                paymentAccount = codeMap['1.1.01.02']; // Banco
            }

            // 5. Preparar Líneas (Partida Doble)
            const lines = [
                {
                    asiento_id: header.id,
                    account_id: paymentAccount,
                    debit: sale.total - commissionAmount,
                    credit: 0,
                    glosa: `Ingreso venta #${sale.id} (${sale.payment_method})`
                },
                {
                    asiento_id: header.id,
                    account_id: codeMap['4.1.01.01'],
                    debit: 0,
                    credit: sale.net,
                    glosa: `Ingreso neto venta #${sale.id}`
                }
            ];

            if (commissionAmount > 0) {
                lines.push({
                    asiento_id: header.id,
                    account_id: codeMap['5.1.02.02'],
                    debit: commissionAmount,
                    credit: 0,
                    glosa: `Comisión máquina venta #${sale.id}`
                });
            }

            if (!sale.is_iva_exempt && sale.iva > 0) {
                lines.push({
                    asiento_id: header.id,
                    account_id: codeMap['2.1.02.01'],
                    debit: 0,
                    credit: sale.iva,
                    glosa: `IVA Débito venta #${sale.id}`
                });
            }

            const { error: lError } = await supabase.from(T.ACCOUNTING_LINES).insert(lines);
            if (lError) throw lError;

            console.log(`✅ Asiento sincronizado para Venta #${sale.id} (${sale.payment_method})`);
        } catch (e) {
            console.error(`❌ Error en Venta #${sale.id}:`, e.message);
        }
    }

    console.log('--- Sincronización Finalizada ---');
}

migrateSales();
