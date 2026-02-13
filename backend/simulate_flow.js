
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const T = {
    PURCHASES: 'compras',
    ACCOUNTS: 'accounts',
};

async function createAccountingEntry({ lines }) {
    console.log('[SIMULATION] Accounting Entry Lines:', JSON.stringify(lines, null, 2));
}

async function simulate(purchaseId, payment_method, account_id) {
    console.log(`[SIMULATION] Starting for purchase ${purchaseId}...`);

    // Values from the user's specific case
    const net = 72058;
    const iva = 13692;
    const total = 85750;

    let finalPaymentMethod = payment_method;
    if (account_id) {
        console.log(`[SIMULATION] Fetching account ${account_id} type...`);
        const { data: acc, error } = await supabase.from(T.ACCOUNTS).select('type').eq('id', account_id).single();
        if (error) console.error('[SIMULATION] DB Error:', error);
        console.log(`[SIMULATION] Account found:`, acc);

        if (acc?.type === 'credit') finalPaymentMethod = 'credit';
        else if (acc?.type === 'debit') finalPaymentMethod = 'transfer';
    }

    let paymentAccount = '1.1.01.01'; // Default: Caja
    if (finalPaymentMethod === 'credit') paymentAccount = '2.1.01.05';
    else if (finalPaymentMethod === 'transfer' || finalPaymentMethod === 'debit') paymentAccount = '1.1.01.02';

    console.log(`[SIMULATION] Results:`, { finalPaymentMethod, paymentAccount });

    await createAccountingEntry({
        lines: [
            { account_code: '1.1.02.01', debit: net },
            { account_code: '1.1.03.01', debit: iva },
            { account_code: paymentAccount, credit: total }
        ]
    });
}

// Case 1: Factura #1 (Transferencia + Débito Privada)
simulate(1, 'transfer', 2);
