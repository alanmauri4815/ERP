const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function check() {
    const sb = createClient(p.url, p.key);
    console.log('Final Diagnostic - Table Check:');

    const tables = ['productos', 'products', 'ventas', 'sales', 'materias primas', 'raw_materials'];

    for (const t of tables) {
        const { data, error, count } = await sb.from(t).select('*', { count: 'exact', head: true });
        if (error) {
            console.log(`- ${t}: Error (${error.code}) -> ${error.message}`);
        } else {
            console.log(`- ${t}: EXISTS with ${count} rows`);
        }
    }
}

check();
