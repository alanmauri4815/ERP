const { createClient } = require('@supabase/supabase-js');

const p = { name: 'KCFU (Barbara)', url: 'https://kcfuixvrwbnizspgtmtr.supabase.co', key: 'sb_secret_3vIcG-GKRMJBjC8mg-mw_g_kP1WmqHZ' };

async function checkUsers() {
    console.log(`Checking users in ${p.name}...`);
    const sb = createClient(p.url, p.key);

    // Check if table is 'users' or 'usuarios'
    const { data: usersE, error: errE } = await sb.from('users').select('*');
    if (errE) console.log('English table error:', errE.message);
    else {
        console.log('English users found:');
        usersE.forEach(u => console.log(`- ${u.username} (${u.role})`));
    }

    const { data: usersS, error: errS } = await sb.from('usuarios').select('*');
    if (errS) console.log('Spanish table error:', errS.message);
    else {
        console.log('Spanish users found:');
        usersS.forEach(u => console.log(`- ${u.username} (${u.role})` || `- ${u.nombre_de_usuario} (${u.role})`));
    }
}

checkUsers();
