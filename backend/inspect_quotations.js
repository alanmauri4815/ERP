
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectQuotations() {
    const { data, error } = await supabase.from('quotations').select('*').limit(1);
    if (error) { console.error(error); return; }
    if (data && data.length > 0) {
        console.log('Quotations Columns:', Object.keys(data[0]));
    } else {
        console.log('No quotations found.');
    }
}
inspectQuotations();
