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

    console.log('Testing main query...');
    const r1 = await supabase
        .from(T.PURCHASES)
        .select(`*, proveedores:"${T.PROVIDERS}"(name), accounts:"${T.ACCOUNTS}"(name), project:quotations(name)`)
        .order('date', { ascending: false });

    if (r1.error) {
        console.log('Main query failed:', r1.error.message);

        console.log('\nTesting fallback query 1 (without quotations)...');
        const r2 = await supabase
            .from(T.PURCHASES)
            .select(`*, proveedores:"${T.PROVIDERS}"(name), accounts:"${T.ACCOUNTS}"(name)`)
            .order('date', { ascending: false });

        if (r2.error) {
            console.log('Fallback query 1 failed:', r2.error.message);

            console.log('\nTesting fallback query 2 (basic * only)...');
            const r3 = await supabase
                .from(T.PURCHASES)
                .select('*')
                .order('date', { ascending: false });

            if (r3.error) {
                console.log('Fallback query 2 failed:', r3.error.message);
            } else {
                console.log('Fallback query 2 SUCCESS. Records found:', r3.data.length);
            }
        } else {
            console.log('Fallback query 1 SUCCESS. Records found:', r2.data.length);
        }
    } else {
        console.log('Main query SUCCESS. Records found:', r1.data.length);
    }
}

test();
