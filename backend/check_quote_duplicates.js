
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkDuplicates() {
    console.log('Checking for duplicates in quotation_items...');
    
    const { data: items, error } = await supabase
        .from('quotation_items')
        .select('*');
        
    if (error) {
        console.error('Error fetching items:', error);
        return;
    }
    
    const groups = {};
    const duplicates = [];
    
    items.forEach(it => {
        // Create a signature excluding id and created_at
        const signature = `${it.quotation_id}|${it.item_type}|${it.calculation_type}|${it.linked_to}|${it.description}|${it.quantity}|${it.unit_cost}|${it.total_cost}|${it.price_gross}|${it.item_code}`;
        
        if (!groups[signature]) {
            groups[signature] = [];
        }
        groups[signature].push(it.id);
    });
    
    for (const sig in groups) {
        if (groups[sig].length > 1) {
            duplicates.push({
                signature: sig,
                ids: groups[sig]
            });
        }
    }
    
    console.log(`Found ${duplicates.length} sets of duplicates.`);
    
    if (duplicates.length > 0) {
        console.log('Sample duplicate set:', duplicates[0]);
    }
}

checkDuplicates();
