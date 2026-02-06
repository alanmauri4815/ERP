const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA (Principal/Env)', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function checkSpanish() {
    console.log(`Checking ${p.name} for Spanish tables...`);
    const sb = createClient(p.url, p.key);

    const tables = ['productos', 'ventas', 'compras', 'materias_primas', 'usuarios'];

    for (const t of tables) {
        try {
            const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
            if (error) console.log(`- ${t}: Error (${error.message})`);
            else console.log(`- ${t}: ${count} rows`);
        } catch (e) {
            console.log(`- ${t}: Failed`);
        }
    }
}

checkSpanish();
