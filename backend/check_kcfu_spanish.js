const { createClient } = require('@supabase/supabase-js');

const p = { name: 'KCFU (Barbara)', url: 'https://kcfuixvrwbnizspgtmtr.supabase.co', key: 'sb_secret_3vIcG-GKRMJBjC8mg-mw_g_kP1WmqHZ' };

async function checkSpanish() {
    console.log(`Checking Spanish tables in ${p.name}...`);
    const sb = createClient(p.url, p.key);

    // In screenshot: "productos", "ventas", "materias primas" (with space)
    const tables = ['productos', 'ventas', 'compras', 'materias primas', 'usuarios'];

    for (const t of tables) {
        try {
            const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
            if (error) console.log(`- ${t}: Error (${error.message})`);
            else console.log(`- ${t}: ${count} rows`);
        } catch (e) {
            console.log(`- ${t}: Crashed`);
        }
    }
}

checkSpanish();
