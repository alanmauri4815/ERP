const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA (Principal/Env)', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function compare() {
    const sb = createClient(p.url, p.key);

    const pairs = [
        ['products', 'productos'],
        ['sales', 'ventas'],
        ['raw_materials', 'materias primas'],
        ['purchases', 'compras']
    ];

    for (const [eng, esp] of pairs) {
        const { count: cEng } = await sb.from(eng).select('*', { count: 'exact', head: true });
        const { count: cEsp } = await sb.from(esp).select('*', { count: 'exact', head: true });
        console.log(`${eng}: ${cEng} rows | ${esp}: ${cEsp} rows`);
    }
}

compare();
