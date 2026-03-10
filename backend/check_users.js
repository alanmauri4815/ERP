const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'C:/Users/javii/Downloads/ERP Universal/backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkUsers() {
    const { data: users, error: uError } = await supabase.from('usuarios').select('id, username, empresa_id');
    const { data: empresas, error: eError } = await supabase.from('empresas').select('id, nombre');

    console.log('--- Usuarios ---');
    console.table(users);
    console.log('--- Empresas ---');
    console.table(empresas);
}

checkUsers();
