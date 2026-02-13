
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function listAllTablesDetailed() {
    // Querying information_schema.tables using rpc or direct raw query if possible
    // Supabase JS doesn't support raw SQL easily, so we check known tables from the project.
    console.log('--- PROJECT TABLES CHECK ---');
    const projectTables = [
        'materias primas',
        'productos',
        'recetas',
        'proveedores',
        'clientela',
        'ventas',
        'compras',
        'usuarios',
        'quotations',
        'quotation_items'
    ];

    for (const table of projectTables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`[X] ${table}: ${error.message}`);
        } else {
            console.log(`[OK] ${table} - Count: ${data ? data.length : 0}`);
            if (data && data.length > 0) {
                console.log(`    Columns: ${Object.keys(data[0]).join(', ')}`);
            }
        }
    }
}
listAllTablesDetailed();
