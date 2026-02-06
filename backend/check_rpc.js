const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA (Principal/Env)', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function check() {
    const sb = createClient(p.url, p.key);
    console.log('Checking for exec_sql RPC...');
    const { data, error } = await sb.rpc('exec_sql', { sql: 'SELECT 1' });
    if (error) console.log('RPC exec_sql not found or error:', error.message);
    else console.log('RPC exec_sql exists!');
}

check();
