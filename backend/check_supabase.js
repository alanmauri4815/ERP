require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSchema() {
    const { data, error } = await supabase.from('raw_materials').select('*').limit(1);
    if (error) {
        console.error('Error fetching raw_materials:', error);
    } else {
        console.log('Sample data from raw_materials:', data[0]);
        console.log('Columns found:', Object.keys(data[0] || {}));
    }
}

checkSchema();
