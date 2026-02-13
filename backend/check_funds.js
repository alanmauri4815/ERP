
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkFunds() {
    const { data, error } = await supabase.from('accounts').select('*');
    console.log('Accounts (funds):', data);
}

checkFunds();
