require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const username = process.argv[2];
const role = process.argv[3];

async function updateRole() {
    if (!username || !role) {
        console.error('Uso: node update_user_role.js <username> <role>');
        return;
    }

    const { data, error } = await supabase
        .from('users')
        .update({ role })
        .eq('username', username)
        .select();

    if (error) {
        console.error('Error:', error.message);
    } else if (data.length === 0) {
        console.error('Usuario no encontrado');
    } else {
        console.log(`✅ Rol de ${username} actualizado a ${role}`);
    }
}

updateRole();
