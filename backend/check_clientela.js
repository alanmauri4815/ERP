const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA (Principal/Env)', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function check() {
    const sb = createClient(p.url, p.key);
    console.log('Checking clientela table...');
    const { data, error } = await sb.from('clientela').select('*').limit(1);
    if (error) console.log('Error:', error);
    else console.log('Success:', data);
}

check();
