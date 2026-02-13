
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkQuotations() {
    const { data: q, error } = await supabase.from('quotations').select('*');
    if (error) { console.error(error); return; }
    console.log('--- QUOTATIONS ---');
    console.log('Total:', q.length);
    q.forEach(quote => {
        console.log(`[${quote.id}] ${quote.name} | ${quote.created_at}`);
    });
}
checkQuotations();
