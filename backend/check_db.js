const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkConstraints() {
    const { data, error } = await supabase.rpc('get_constraints', { t_name: 'usuarios' });
    if (error) {
        // Fallback to direct query if RPC doesn't exist
        const { data: rawData, error: rawError } = await supabase.from('usuarios').select('username').limit(1);
        console.log('User model check:', rawData?.[0]);
        
        // Let's try to just run a drop and add again with the CORRECT column name
        console.log('Please run the exact SQL provided in the response.');
    }
}
checkConstraints();
