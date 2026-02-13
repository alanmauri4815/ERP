require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fix() {
    const sql = `
    ALTER TABLE compras ADD COLUMN IF NOT EXISTS project_ref text;
    NOTIFY pgrst, 'reload schema';
  `;
    console.log('Running SQL...');
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Success:', data);
    }
}

fix();
