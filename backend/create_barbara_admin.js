const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = 'https://kcfuixvrwbnizspgtmtr.supabase.co';
const supabaseKey = 'sb_secret_3vIcG-GKRMJBjC8mg-mw_g_kP1WmqHZ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdmin() {
    console.log('Creando administrador para Bárbara...');
    const hashedPassword = await bcrypt.hash('jabenica4815', 10);
    const { data, error } = await supabase
        .from('users')
        .insert([{ username: 'Mavamudi', password: hashedPassword, role: 'admin' }])
        .select();

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('✅ Administrador creado exitosamente para Bárbara:', data[0].username);
    }
}

createAdmin();
