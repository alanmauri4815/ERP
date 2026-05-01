
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkHealth() {
    const tables = ['quotation_items', 'production_items', 'purchase_items', 'sale_items'];
    for (const table of tables) {
        const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            .is('empresa_id', null);
        console.log(`Table ${table}: ${count} null empresa_id`);
    }
}

checkHealth();
