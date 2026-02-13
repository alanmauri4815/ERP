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

    const tests = [
        { name: 'Basic *', q: supabase.from(T.PURCHASES).select('*').limit(1) },
        { name: 'Join Providers', q: supabase.from(T.PURCHASES).select('id, proveedores:proveedores(name)').limit(1) },
        { name: 'Join Accounts', q: supabase.from(T.PURCHASES).select('id, accounts:accounts(name)').limit(1) },
        { name: 'Join Items', q: supabase.from(T.PURCHASE_ITEMS).select('id, raw_materials:"materias primas"(name)').limit(1) }
    ];

    for (const t of tests) {
        const r = await t.q;
        if (r.error) console.log(`FAIL: ${t.name} -> ${r.error.message}`);
        else console.log(`SUCCESS: ${t.name}`);
    }
}

test();
