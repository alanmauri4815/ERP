require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fixSpecifics(empresaId = 1) {
    // Buscar los asientos de ref 62
    const { data: e62 } = await supabase.from('asientos')
        .select('*')
        .eq('referencia_id', '62')
        .eq('empresa_id', empresaId);
    
    console.log('Asientos Ref 62:', e62);

    // Buscar los asientos de ref 79
    const { data: e79 } = await supabase.from('asientos')
        .select('*')
        .eq('referencia_id', '79')
        .eq('empresa_id', empresaId);
    
    console.log('Asientos Ref 79:', e79);
}

fixSpecifics(1);
