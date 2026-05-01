require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    console.log("Iniciando migración...");
    const sql = `ALTER TABLE empresas ADD COLUMN IF NOT EXISTS plan_categoria text DEFAULT 'completo';`;
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
        console.error("Error en migración:", error.message);
    } else {
        console.log("Migración completada exitosamente.", data);
    }
}
run();
