
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkAccounts() {
    const { data: all, error: e2 } = await supabase.from('accounting_accounts').select('code, name').order('code');
    console.log('All accounts:', all);
}

checkAccounts();
