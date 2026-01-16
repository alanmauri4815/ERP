require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function setupAuth() {
    console.log('Setting up Auth Table...');

    // Note: Creating tables via JS client is not supported (need SQL Editor).
    // But I can check if I can insert. 
    // Since I can't create tables via JS, I'll ask the user to run the SQL.

    const sql = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user'
    );
    `;

    console.log('POR FAVOR, ejecuta este código en el SQL Editor de Supabase:');
    console.log('---------------------------------------------------------');
    console.log(sql);
    console.log('---------------------------------------------------------');
}

setupAuth();
