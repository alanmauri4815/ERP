const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function check() {
    const sb = createClient(p.url, p.key);
    console.log('Final Mapping Debug:');

    const tables = [
        'productos', 'ventas', 'materias primas', 'compras', 'recetas', 'usuarios', 'proveedores', 'clientela',
        'production', 'production_items', 'sale_items', 'purchase_items', 'settings', 'accounts', 'quotations'
    ];

    for (const t of tables) {
        const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
        if (error) {
            console.log(`- ${t}: [MISSING/ERROR] ${error.message}`);
        } else {
            console.log(`- ${t}: [EXISTS] ${count} rows`);
        }
    }
}

check();
