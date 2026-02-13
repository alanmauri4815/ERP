
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function listTables() {
    // Try to query from pg_catalog if we have permissions, or just check known tables
    const tables = [
        'quotations', 'quotation_items', 'quotation_details', 'cotizaciones', 'cotizacion_items',
        'materias primas', 'clientela', 'ventas', 'compras'
    ];

    for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*').limit(0);
        if (error) {
            console.log(`Table '${t}' NOT FOUND/ERROR: ${error.message}`);
        } else {
            console.log(`Table '${t}' EXISTS.`);
        }
    }
}
listTables();
