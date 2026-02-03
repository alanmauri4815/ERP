require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function debug() {
    console.log('--- DEBUG USUARIOS ---');
    const { data, error } = await supabase.from('users').select('id, username, role');
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Listado de usuarios:');
        data.forEach(u => {
            console.log(`ID: ${u.id} | User: "${u.username}" | Role: "${u.role}"`);
        });
    }
}
debug();
