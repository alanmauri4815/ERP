const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA (Principal/Env)', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function testFetch() {
    const sb = createClient(p.url, p.key);
    console.log('Testing fetch from productos on VSVA...');

    const { data, error } = await sb.from('productos').select('*').limit(1);

    if (error) {
        console.error('ERROR:', error);
    } else {
        console.log('DATA:', data);
    }
}

testFetch();
