const { createClient } = require('@supabase/supabase-js');

const p = { name: 'KCFU (Barbara)', url: 'https://kcfuixvrwbnizspgtmtr.supabase.co', key: 'sb_secret_3vIcG-GKRMJBjC8mg-mw_g_kP1WmqHZ' };

async function testFetch() {
    const sb = createClient(p.url, p.key);
    console.log('Testing fetch from productos on KCFU...');

    const { data, error } = await sb.from('productos').select('*').limit(1);

    if (error) {
        console.error('ERROR:', error);
    } else {
        console.log('DATA:', data);
    }
}

testFetch();
