const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const T = {
    SALES: 'ventas',
    ACCOUNTING_ENTRIES: 'asientos_contables',
    ACCOUNTING_ACCOUNTS: 'accounting_accounts',
    ACCOUNTING_LINES: 'accounting_lines'
};

const COMMISSION_RATE = 0.0345; // 3.45%

async function createAccountingEntry({ date, description, type, document_number, lines, userId }) {
    try {
        const { data: header, error: hError } = await supabase
            .from(T.ACCOUNTING_ENTRIES)
            .insert({
                date,
                description,
                entry_type: type,
                document_number,
                created_by: userId
            })
            .select()
            .single();

        if (hError) throw hError;

        const { data: accs } = await supabase.from(T.ACCOUNTING_ACCOUNTS).select('id, code');
        const codeMap = {};
        accs.forEach(a => codeMap[a.code] = a.id);

        const journalLines = lines.map(line => ({
            asiento_id: header.id,
            account_id: codeMap[line.account_code] || line.account_id,
            debit: line.debit || 0,
            credit: line.credit || 0,
            glosa: line.glosa || description
        }));

        const { error: lError } = await supabase.from(T.ACCOUNTING_LINES).insert(journalLines);
        if (lError) throw lError;

        return { success: true, id: header.id };
    } catch (e) {
        console.error('Accounting Entry Error:', e);
        return { success: false, error: e.message };
    }
}

async function fullSalesCleanAndSync() {
    console.log('=== FULL SALES LEDGER REBUILD ===');
    console.log('Deleting ALL existing "venta" entries...');

    // 1. Delete ALL accounting entries of type 'venta'
    const { data: oldEntries } = await supabase.from(T.ACCOUNTING_ENTRIES).select('id').eq('entry_type', 'venta');
    if (oldEntries && oldEntries.length > 0) {
        const ids = oldEntries.map(e => e.id);
        await supabase.from(T.ACCOUNTING_LINES).delete().in('asiento_id', ids);
        await supabase.from(T.ACCOUNTING_ENTRIES).delete().in('id', ids);
        console.log(`Deleted ${ids.length} old entries.`);
    } else {
        console.log('No old entries to delete.');
    }

    // 2. Get all sales
    const { data: sales, error } = await supabase.from(T.SALES).select('*').order('date', { ascending: true });
    if (error) {
        console.error('Error fetching sales:', error);
        return;
    }

    console.log(`Processing ${sales.length} sales...`);
    console.log('---');

    for (const sale of sales) {
        const { id, date, net, iva, total, discount, commission, payment_method, is_iva_exempt, event_name } = sale;

        // Determine payment account
        let paymentAccount = '1.1.01.01'; // Default: Caja
        if (payment_method === 'machine' || payment_method === 'transfer') {
            paymentAccount = '1.1.01.03'; // Tarjeta Débito Privada (Socio)
        }

        const discountAmount = discount || 0;

        // CALCULATE commission for machine sales (use stored value OR calculate at 3.45%)
        let commissionAmount = 0;
        if (payment_method === 'machine') {
            commissionAmount = commission || Math.round(total * COMMISSION_RATE);
        }

        // Build journal lines with ALL 4 accounts
        const journalLines = [];

        // 1. DEBIT: Payment Account (Caja / Tarjeta Privada) - receives NET after commission
        journalLines.push({
            account_code: paymentAccount,
            debit: total - commissionAmount,
            glosa: `Ingreso líquido Venta #${id} (${payment_method})`
        });

        // 2. DEBIT: Commission Expense (only if machine with commission)
        if (commissionAmount > 0) {
            journalLines.push({
                account_code: '5.1.02.02',
                debit: commissionAmount,
                glosa: `Comisión máquina Venta #${id}`
            });
        }

        // 3. CREDIT: Sales Income (Net after discount)
        journalLines.push({
            account_code: '4.1.01.01',
            credit: net - discountAmount,
            glosa: `Ingreso neto Venta #${id}`
        });

        // 4. CREDIT: IVA (only if not cash and not exempt)
        if (payment_method !== 'cash' && !is_iva_exempt && (iva || 0) > 0) {
            journalLines.push({
                account_code: '2.1.02.01',
                credit: iva,
                glosa: `IVA Débito Venta #${id}`
            });
        }

        console.log(`Sale #${id} (${payment_method}): Total=$${total}, Commission=$${commissionAmount}, Lines=${journalLines.length}`);

        await createAccountingEntry({
            date,
            description: `Venta de productos (${event_name || 'General'})`,
            type: 'venta',
            document_number: id.toString(),
            userId: 2,
            lines: journalLines
        });
    }

    console.log('---');
    console.log('=== REBUILD COMPLETE ===');
    console.log('All sales now have proper ledger entries with:');
    console.log('  - Cuenta Bancaria/Caja (Débito)');
    console.log('  - Comisión Máquina (Débito) - when applicable');
    console.log('  - Ingresos por Ventas (Crédito)');
    console.log('  - IVA Débito Fiscal (Crédito) - when applicable');
}

fullSalesCleanAndSync();
