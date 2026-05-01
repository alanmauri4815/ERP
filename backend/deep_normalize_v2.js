
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function deepNormalization() {
    console.log('--- DEEP NORMALIZATION V2 ---');

    const map = [
        { parent: 'production', child: 'production_items', fk: 'production_id' },
        { parent: 'purchases', child: 'purchase_items', fk: 'purchase_id' },
        { parent: 'sales', child: 'sale_items', fk: 'sale_id' }
    ];

    for (const entry of map) {
        console.log(`Processing ${entry.parent}...`);
        const { data: parents, error } = await supabase.from(entry.parent).select('id, empresa_id');
        if (error) {
            console.error(`Error fetching ${entry.parent}:`, error.message);
            continue;
        }
        if (!parents) continue;

        for (const p of parents) {
            const { error: updError } = await supabase.from(entry.child)
                .update({ empresa_id: p.empresa_id })
                .eq(entry.fk, p.id)
                .is('empresa_id', null);
            
            if (updError) console.error(`Error updating ${entry.child} for parent ${p.id}:`, updError.message);
        }
    }

    console.log('ALL NORMALIZED.');
}

deepNormalization();
