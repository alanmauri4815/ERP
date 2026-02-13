
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkLedgerDetail(docNum) {
    console.log(`Checking ledger for document # ${docNum}...`);
    const { data: entries, error } = await supabase
        .from('asientos_contables')
        .select(`
            id,
            description,
            lines:accounting_lines(
                account_id,
                debit,
                credit,
                account:accounting_accounts(code, name)
            )
        `)
        .eq('document_number', docNum.toString())
        .eq('entry_type', 'compra');

    console.log('Entries:', JSON.stringify(entries, null, 2));
}

checkLedgerDetail(1);
checkLedgerDetail(3);
