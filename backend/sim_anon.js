const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Use the ANON key to simulate a browser request
const supabaseAnon = createClient(process.env.SUPABASE_URL, 'sb_publishable_NudJu-87pyKf2qO-0RUDiA_15SS0WFT');

async function simulateAnon() {
    console.log('--- Simulating Anon Request (Browser Logic) ---');
    const { data, error, count } = await supabaseAnon
        .from('plan_cuentas')
        .select('*', { count: 'exact' });
        
    if (error) {
        console.error('Anon Error:', error.message);
    } else {
        console.log(`Anon visible records: ${count}`);
        if (count > 0) {
            console.log('Sample row:', data[0]);
        } else {
            console.log('PLAN DE CUENTAS IS EMPTY FOR ANON USER!');
            console.log('This confirms RLS is blocking rows with empresa_id = NULL.');
        }
    }
}

simulateAnon();
