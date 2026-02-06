const { createClient } = require('@supabase/supabase-js');

const p = { name: 'VSVA (Principal/Env)', url: 'https://vsvaasnddphjlspukpca.supabase.co', key: 'sb_secret_NVdVCf1FfyNEIh38LoH94g_SltyvOtE' };

async function checkUsers() {
    console.log(`Checking users in ${p.name}...`);
    const sb = createClient(p.url, p.key);

    const { data, error } = await sb.from('users').select('*');
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Users found:');
        data.forEach(u => console.log(`- ${u.username} (${u.role})`));
    }
}

checkUsers();
