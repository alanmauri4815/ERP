require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
    try {
        console.log('Connecting to:', process.env.SUPABASE_URL);
        const { data, error } = await supabase.from('users').select('username, role');
        if (error) {
            console.log('Supabase Error:', error);
        } else {
            console.log('Usuarios encontrados:', data);
        }
    } catch (e) {
        console.error('Fatal Error:', e);
    }
}
check();
