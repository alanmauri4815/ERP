const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fix() {
    const { data: companies } = await supabase.from('empresas').select('id, nombre');
    console.log('--- COMPANIES ---');
    console.table(companies);

    const { data: users } = await supabase.from('usuarios').select('id, username, empresa_id, role');
    console.log('--- USERS ---');
    console.table(users);

    const { error: planError } = await supabase
        .from('plan_cuentas')
        .update({ empresa_id: null })
        .not('id', 'is', null);
    
    if (planError) console.error('Plan update error:', planError);
    else console.log('All plan_cuentas records set to global (empresa_id = NULL)');
}

fix();
