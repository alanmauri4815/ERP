const { createClient } = require('@supabase/supabase-js');

const projects = [
    { name: 'VSVA (Principal/Env)', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' },
    { name: 'KCFU (Barbara)', url: 'https://kcfuixvrwbnizspgtmtr.supabase.co', key: 'sb_secret_3vIcG-GKRMJBjC8mg-mw_g_kP1WmqHZ' }
];

async function compare() {
    for (const p of projects) {
        console.log(`\nChecking ${p.name}: ${p.url}`);
        const sb = createClient(p.url, p.key);

        try {
            const { count: prods } = await sb.from('products').select('*', { count: 'exact', head: true });
            const { count: sales } = await sb.from('sales').select('*', { count: 'exact', head: true });

            // Check for new tables
            const { error: accError } = await sb.from('accounts').select('count', { count: 'exact', head: true });
            const { error: quoteError } = await sb.from('quotations').select('count', { count: 'exact', head: true });

            console.log(`- Products: ${prods}`);
            console.log(`- Sales: ${sales}`);
            console.log(`- Accounts table exists: ${!accError}`);
            console.log(`- Quotations table exists: ${!quoteError}`);

        } catch (e) {
            console.log(`- Error connecting or querying: ${e.message}`);
        }
    }
}

compare();
