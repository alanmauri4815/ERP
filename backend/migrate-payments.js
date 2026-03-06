require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function migrate() {
    console.log('Adding paid_amount and payment_status columns...');

    // Try inserting a test row to check if columns exist
    // If they don't exist, we'll add them via a workaround

    // Check compras table
    const { data: testPurchase } = await supabase.from('compras').select('id, paid_amount, payment_status').limit(1);
    if (testPurchase === null) {
        console.log('Columns may not exist yet in compras table. Please add them via Supabase Dashboard SQL Editor:');
        console.log('ALTER TABLE compras ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;');
        console.log('ALTER TABLE compras ADD COLUMN IF NOT EXISTS payment_status text DEFAULT \'pendiente\';');
    } else {
        console.log('compras: paid_amount and payment_status columns already exist!');
    }

    // Check ventas table
    const { data: testSale } = await supabase.from('ventas').select('id, paid_amount, payment_status').limit(1);
    if (testSale === null) {
        console.log('Columns may not exist yet in ventas table. Please add them via Supabase Dashboard SQL Editor:');
        console.log('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;');
        console.log('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS payment_status text DEFAULT \'pendiente\';');
    } else {
        console.log('ventas: paid_amount and payment_status columns already exist!');
    }
}

migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
