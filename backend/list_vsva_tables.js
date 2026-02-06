const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA (Principal/Env)', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function listAll() {
    console.log(`Listing all tables in ${p.name}...`);
    const sb = createClient(p.url, p.key);

    // There isn't a direct "list tables" command in the client, but we can try common ones or use rpc if enabled.
    // However, we can use the schema introspection if we have a service key.

    const { data, error } = await sb.rpc('get_tables'); // Custom rpc or just try common ones
    if (error) {
        console.log('RPC get_tables failed. Trying common tables...');
        const common = ['products', 'productos', 'sales', 'ventas', 'raw_materials', 'materias primas', 'purchases', 'compras', 'users', 'usuarios'];
        for (const t of common) {
            const { error: e } = await sb.from(t).select('*', { count: 'exact', head: true });
            console.log(`- ${t}: ${e ? 'Error/Missing' : 'Exists'}`);
        }
    } else {
        console.log('Tables:', data);
    }
}

listAll();
