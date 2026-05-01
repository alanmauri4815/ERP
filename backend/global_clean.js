
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function globalClean() {
    console.log('--- GLOBAL CLEANUP & NORMALIZATION ---');

    // 1. Assign empresa_id to orphan items
    console.log('1. Normalizing empresa_id...');
    const { data: quotes } = await supabase.from('quotations').select('id, empresa_id');
    for (const q of quotes) {
        await supabase.from('quotation_items')
            .update({ empresa_id: q.empresa_id })
            .eq('quotation_id', q.id)
            .is('empresa_id', null);
    }

    // 2. Deep Duplicate Removal
    console.log('2. Removing duplicates...');
    const { data: items } = await supabase.from('quotation_items').select('*');
    const groups = {};
    const toDelete = [];

    items.forEach(it => {
        // Normalize description and other fields for comparison
        const desc = (it.description || '').trim().toLowerCase();
        const sig = `${it.quotation_id}|${it.item_type}|${it.calculation_type}|${it.linked_to}|${desc}|${it.quantity}|${it.unit_cost}`;
        
        if (!groups[sig]) {
            groups[sig] = it.id;
        } else {
            toDelete.push(it.id);
        }
    });

    console.log(`Found ${toDelete.length} duplicates to remove.`);
    if (toDelete.length > 0) {
        for (let i = 0; i < toDelete.length; i += 100) {
            const chunk = toDelete.slice(i, i + 100);
            await supabase.from('quotation_items').delete().in('id', chunk);
        }
    }

    console.log('DONE.');
}

globalClean();
