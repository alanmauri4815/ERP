const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function check() {
    const sb = createClient(p.url, p.key);
    console.log('Comprehensive Table Check:');

    const tables = [
        'productos', 'ventas', 'materias primas', 'compras', 'recetas', 'usuarios', 'proveedores', 'clientela',
        'articulos_de_venta', 'articulos_de_compra', 'producción', 'articulos_de_produccion', 'ajustes', 'alertas_config',
        'cuentas', 'cotizaciones', 'articulos_de_cotizacion',
        'sale_items', 'purchase_items', 'production_items', 'production', 'recipes', 'users', 'providers', 'clients', 'settings', 'accounts', 'quotations', 'quotation_items'
    ];

    for (const t of tables) {
        const { data, error, count } = await sb.from(t).select('*', { count: 'exact', head: true });
        if (!error) {
            console.log(`- ${t}: EXISTS (${count} rows)`);
        }
    }
}

check();
