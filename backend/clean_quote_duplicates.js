
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function cleanDuplicates() {
    console.log('Cleaning duplicates in quotation_items...');
    
    const { data: items, error } = await supabase
        .from('quotation_items')
        .select('*');
        
    if (error) {
        console.error('Error fetching items:', error);
        return;
    }
    
    const groups = {};
    const toDelete = [];
    
    items.forEach(it => {
        const signature = `${it.quotation_id}|${it.item_type}|${it.calculation_type}|${it.linked_to}|${it.description}|${it.quantity}|${it.unit_cost}|${it.total_cost}|${it.price_gross}|${it.item_code}`;
        
        if (!groups[signature]) {
            groups[signature] = it.id; // Keep the first one
        } else {
            toDelete.push(it.id); // Add others to delete list
        }
    });
    
    console.log(`Found ${toDelete.length} duplicate items to delete.`);
    
    if (toDelete.length > 0) {
        // Delete in chunks of 50 to avoid URL length issues or RLS limits
        for (let i = 0; i < toDelete.length; i += 50) {
            const chunk = toDelete.slice(i, i + 50);
            const { error: delError } = await supabase
                .from('quotation_items')
                .delete()
                .in('id', chunk);
            
            if (delError) {
                console.error(`Error deleting chunk ${i}:`, delError);
            } else {
                console.log(`Deleted chunk ${i} to ${i + chunk.length}`);
            }
        }
    }
    
    console.log('Cleanup complete.');
}

cleanDuplicates();
