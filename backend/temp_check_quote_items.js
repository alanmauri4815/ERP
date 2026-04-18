const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function test() {
    const { data: quotes, error } = await supabase.from('quotations').select('*, items:quotation_items(*)').limit(5);
    if (error) {
        console.error('Error:', error);
        return;
    }
    quotes.forEach(q => {
        if (q.items && q.items.length > 0) {
            console.log('Quotation #', q.id, 'Item sample keys:', Object.keys(q.items[0]));
            console.log('Sample item:', q.items[0]);
        }
    });
}
test();
