
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function deepNormalization() {
    console.log('--- DEEP NORMALIZATION ---');

    // 1. Production Items
    const { data: prods } = await supabase.from('production').select('id, empresa_id');
    for (const p of prods) {
        await supabase.from('production_items').update({ empresa_id: p.empresa_id }).eq('production_id', p.id).is('empresa_id', null);
    }
    console.log('Production Items normalized.');

    // 2. Purchase Items
    const { data: purs } = await supabase.from('purchases').select('id, empresa_id');
    for (const p of purs) {
        await supabase.from('purchase_items').update({ empresa_id: p.empresa_id }).eq('purchase_id', p.id).is('empresa_id', null);
    }
    console.log('Purchase Items normalized.');

    // 3. Sale Items
    const { data: sales } = await supabase.from('sales').select('id, empresa_id');
    for (const s of sales) {
        await supabase.from('sale_items').update({ empresa_id: s.empresa_id }).eq('sale_id', s.id).is('empresa_id', null);
    }
    console.log('Sale Items normalized.');

    console.log('ALL NORMALIZED.');
}

deepNormalization();
