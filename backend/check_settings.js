require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
(async () => {
    const { data, error } = await supabase.from('settings').select('*');
    console.log(data);
})();
