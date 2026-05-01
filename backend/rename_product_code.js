require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const OLD_CODE = 'Manteles';
const NEW_CODE = 'MA-03';

async function renameProductCode() {
    console.log(`\n🔄 Renaming product code: "${OLD_CODE}" → "${NEW_CODE}"\n`);

    // 1. Get the original product
    const { data: product } = await supabase.from('productos').select('*').eq('code', OLD_CODE).single();
    if (!product) {
        console.error(`❌ Product with code "${OLD_CODE}" not found!`);
        return;
    }
    console.log(`✅ Found product:`, product.name, `(stock: ${product.stock}, empresa_id: ${product.empresa_id})`);

    // 2. Check new code doesn't exist
    const { data: existing } = await supabase.from('productos').select('code').eq('code', NEW_CODE);
    if (existing && existing.length > 0) {
        console.error(`❌ Code "${NEW_CODE}" already exists! Aborting.`);
        return;
    }

    // 3. Create new product with new code (copy all fields)
    const newProduct = { ...product, code: NEW_CODE };
    delete newProduct.id; // Let DB assign new id
    delete newProduct.created_at;
    
    const { data: created, error: createErr } = await supabase.from('productos').insert(newProduct).select().single();
    if (createErr) {
        console.error(`❌ Failed to create new product:`, createErr.message);
        return;
    }
    console.log(`✅ Created new product "${NEW_CODE}" (id: ${created.id})`);

    // 4. Update all FK references from OLD to NEW
    const updates = [
        { table: 'production_items', column: 'product_code' },
        { table: 'sale_items', column: 'product_code' },
        { table: 'quotation_items', column: 'item_code' },
    ];

    for (const u of updates) {
        const { data, error } = await supabase.from(u.table).update({ [u.column]: NEW_CODE }).eq(u.column, OLD_CODE).select('id');
        const count = data?.length || 0;
        console.log(`  ${u.table}.${u.column}: ${count} rows updated ${error ? '⚠️ ' + error.message : '✅'}`);
    }

    // 5. Update recipes (has composite key, no id)
    const { count: recipesPK } = await supabase.from('recetas').update({ product_code: NEW_CODE }).eq('product_code', OLD_CODE);
    console.log(`  recetas.product_code: updated ✅`);
    
    const { count: recipesMP } = await supabase.from('recetas').update({ mp_code: NEW_CODE }).eq('mp_code', OLD_CODE);
    console.log(`  recetas.mp_code: updated ✅`);

    // 6. Delete old product
    const { error: delErr } = await supabase.from('productos').delete().eq('code', OLD_CODE).eq('empresa_id', product.empresa_id);
    if (delErr) {
        console.error(`⚠️ Could not delete old product (may still have references):`, delErr.message);
        console.log(`   The new product "${NEW_CODE}" is already active. You can manually delete "${OLD_CODE}" later.`);
    } else {
        console.log(`✅ Old product "${OLD_CODE}" deleted.`);
    }

    console.log(`\n🎉 Migration complete: "${OLD_CODE}" → "${NEW_CODE}"\n`);
}

renameProductCode().catch(console.error);
