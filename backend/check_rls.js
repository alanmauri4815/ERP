const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkRLS() {
    console.log('--- Database Security Audit ---');
    
    // Check if we can see plan_cuentas without filters
    const { data, error, count } = await supabase
        .from('plan_cuentas')
        .select('*', { count: 'exact', head: true });
        
    if (error) {
        console.error('Error accessing plan_cuentas:', error);
    } else {
        console.log(`Total records visible in plan_cuentas: ${count}`);
    }

    // Check specific record with empresa_id = NULL
    const { data: nullRows } = await supabase
        .from('plan_cuentas')
        .select('id, nombre, empresa_id')
        .is('empresa_id', null)
        .limit(5);
    
    console.log('Rows with empresa_id = NULL:', nullRows);

    // List all policies on plan_cuentas
    // Note: This requires high-level permissions or raw SQL
    const { data: policies, error: polErr } = await supabase.rpc('get_policies', { table_name: 'plan_cuentas' });
    if (polErr) {
        console.log('Could not get policies via RPC (expected if not defined). Trying direct SQL check...');
        // Fallback: try to see if we can read one specific known record
    } else {
        console.log('Policies:', policies);
    }
}

checkRLS();
