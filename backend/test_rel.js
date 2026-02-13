const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function test() {
    const T = {
        MP: 'materias primas',
        PROVIDERS: 'proveedores',
        ACCOUNTS: 'accounts',
        PURCHASES: 'compras',
        PURCHASE_ITEMS: 'purchase_items'
    };

    console.log('Testing join with column names as aliases...');
    const r1 = await supabase
        .from(T.PURCHASES)
        .select(`*, proveedor:provider_id(name), cuenta:account_id(name)`)
        .limit(1);

    if (r1.error) console.log('FAIL col alias:', r1.error.message);
    else console.log('SUCCESS col alias');

    console.log('Testing join without aliases...');
    const r2 = await supabase
        .from(T.PURCHASES)
        .select(`*, proveedores(name), accounts(name)`)
        .limit(1);

    if (r2.error) console.log('FAIL no alias:', r2.error.message);
    else console.log('SUCCESS no alias');
}

test();
