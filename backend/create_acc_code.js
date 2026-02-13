
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function createAccountingAccount() {
    console.log('Creating accounting account for Credit Cards...');
    const { error } = await supabase.from('accounting_accounts').upsert({
        code: '2.1.01.05',
        name: 'Tarjeta de Crédito',
        type: 'Pasivo',
        category: 'Cuentas por Pagar'
    });
    if (error) console.error('Error creating account:', error);
    else console.log('Account created/updated successfully!');
}

createAccountingAccount();
