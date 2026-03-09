const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
    console.log("Checking for 'document_number' in 'ventas'...");
    const { data, error } = await supabase.from('ventas').select('document_number').limit(1);

    if (error) {
        console.error("Error detected:", error.message);
        if (error.message.includes("column \"document_number\" does not exist")) {
            console.log("CONFIRMED: Column 'document_number' is missing.");
        }
    } else {
        console.log("SUCCESS: Column 'document_number' exists.");
        console.log("Sample data:", data);
    }
}

check();
