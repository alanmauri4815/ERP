const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA (Principal/Env)', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function listSchemas() {
    console.log(`Listing schemas in ${p.name}...`);
    const sb = createClient(p.url, p.key);

    // We can't easily list schemas via standard client, but we can try to query pg_namespace if service key
    const { data, error } = await sb.rpc('inspect_schemas'); // Likely doesn't exist
    if (error) {
        console.log('Direct schema inspection failed. Checking for "usuarios" in "public" again very carefully.');
        const { data: d, error: e } = await sb.from('usuarios').select('*').limit(1);
        if (e) console.log('Error for usuarios:', e);
        else console.log('Success for usuarios!', d);
    }
}

listSchemas();
