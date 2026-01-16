require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'admin123';
const role = process.argv[4] || 'admin';

async function createUser() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        console.error('Error: Faltan SUPABASE_URL o SUPABASE_KEY en el .env');
        return;
    }

    console.log(`Creando usuario: ${username} con rol: ${role}...`);

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { data, error } = await supabase
            .from('users')
            .insert([{ username, password: hashedPassword, role }])
            .select();

        if (error) {
            console.error('Error de Supabase:', error.message);
        } else {
            console.log('✅ Usuario creado exitosamente:', data[0].username);
            console.log('---');
            console.log('Ahora puedes subir los cambios a GitHub para que funcionen en la web:');
            console.log('git add . && git commit -m "Add auth system" && git push');
        }
    } catch (e) {
        console.error('Error inesperado:', e.message);
    }
}

createUser();
