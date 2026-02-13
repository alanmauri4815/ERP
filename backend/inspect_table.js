
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectTable() {
    // This is a trick to get column names in Supabase (if RLS allows)
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'quotation_items' });
    if (error) {
        console.log('RPC failed, trying query...');
        const { data: q, error: qErr } = await supabase.from('quotation_items').select('*').limit(1);
        if (qErr) {
            console.error('Query Error:', qErr);
        } else if (q && q.length > 0) {
            console.log('Columns found:', Object.keys(q[0]));
        } else {
            console.log('Table is empty, trying to find any quotation item...');
            // Maybe check a different table to verify connection
            const { data: mp } = await supabase.from('materias primas').select('*').limit(1);
            console.log('MP sample row columns:', Object.keys(mp[0]));
        }
    } else {
        console.log('RPC Result:', data);
    }
}
inspectTable();
