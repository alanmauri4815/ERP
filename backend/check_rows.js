const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function check() {
    const sb = createClient(p.url, p.key);
    console.log('Table Row Counts:');

    const tables = [
        'productos', 'products', 'ventas', 'sales', 'materias primas', 'raw_materials',
        'compras', 'purchases', 'recetas', 'recipes', 'usuarios', 'users',
        'proveedores', 'providers', 'clientela', 'clients',
        'production', 'producción', 'production_items', 'articulos_de_produccion',
        'sale_items', 'articulos_de_venta', 'purchase_items', 'articulos_de_compra',
        'quotations', 'cotizaciones', 'quotation_items', 'articulos_de_cotizacion',
        'settings', 'ajustes', 'accounts', 'cuentas'
    ];

    for (const t of tables) {
        const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
        if (error) {
            // console.log(`- ${t}: Error`);
        } else {
            console.log(`- ${t}: ${count} rows`);
        }
    }
}

check();
