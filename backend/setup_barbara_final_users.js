const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = 'https://kcfuixvrwbnizspgtmtr.supabase.co';
const supabaseKey = 'sb_secret_3vIcG-GKRMJBjC8mg-mw_g_kP1WmqHZ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupUsers() {
    console.log('--- Configurando Usuarios para el ERP de Bárbara ---');

    const users = [
        { username: 'Mavamudi', password: 'jabenica4815', role: 'admin' },
        { username: 'Bárbara', password: '1234', role: 'admin' } // La ponemos como admin también para que pueda gestionar su ERP
    ];

    for (const u of users) {
        console.log(`Procesando usuario: ${u.username}...`);
        const hashedPassword = await bcrypt.hash(u.password, 10);

        // Upsert: Si ya existe lo actualiza, si no lo crea
        const { error } = await supabase
            .from('users')
            .upsert({ username: u.username, password: hashedPassword, role: u.role }, { onConflict: 'username' });

        if (error) {
            console.error(`Error con ${u.username}:`, error.message);
        } else {
            console.log(`✅ Usuario ${u.username} listo.`);
        }
    }
    console.log('--- Configuración finalizada ---');
}

setupUsers();
