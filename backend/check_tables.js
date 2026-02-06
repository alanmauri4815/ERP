const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL || 'https://kcfuixvrwbnizspgtmtr.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in environment.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTables() {
    console.log('Attempting to create tables via RPC or direct query...');

    // Try to run a raw SQL query if possible (Note: Client SDK doesn't support raw SQL directly usually, 
    // but we will test connection first by trying to read a table).

    // Check if 'accounts' exists
    const { data, error } = await supabase.from('accounts').select('count', { count: 'exact', head: true });

    if (error) {
        console.error('Error accessing accounts table:', error.message);
        console.log('It seems the tables indeed do not exist.');

        // Since we cannot run raw CREATE TABLE via JS client easily without a stored procedure,
        // we must guide the user again or try an insert to see if it triggers an auto-create (unlikely).

        console.log('\n--- DIAGNOSTIC ---');
        console.log('The SQL script was likely not executed or committed.');
    } else {
        console.log('SUCCESS: Table "accounts" exists!');
    }
}

createTables();
