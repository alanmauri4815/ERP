const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const purchases = [
    {
        providerId: 1,
        date: '2025-09-23',
        items: [
            { mpCode: 'TE-01', quantity: 5.2, unitPrice: 4118, subtotal: 21412 },
            { mpCode: 'TE-02', quantity: 0.1, unitPrice: 4120, subtotal: 412 },
            { mpCode: 'TE-03', quantity: 2.9, unitPrice: 4118, subtotal: 11941 },
            { mpCode: 'TE-04', quantity: 2.9, unitPrice: 4118, subtotal: 11941 },
            { mpCode: 'TE-05', quantity: 0.8, unitPrice: 4118, subtotal: 3294 },
            { mpCode: 'TE-06', quantity: 1.6, unitPrice: 4118, subtotal: 6588 },
            { mpCode: 'TE-07', quantity: 1.6, unitPrice: 4118, subtotal: 6588 },
            { mpCode: 'TE-08', quantity: 0.8, unitPrice: 4118, subtotal: 3294 },
            { mpCode: 'TE-09', quantity: 1.6, unitPrice: 4118, subtotal: 6588 }
        ],
        net: 72058,
        iva: 13692,
        total: 85750,
        payment_method: 'transfer',
        document_type: 'factura'
    },
    {
        providerId: 1,
        date: '2025-09-23',
        items: [
            { mpCode: 'TE-02', quantity: 2.4, unitPrice: 4120, subtotal: 9888 },
            { mpCode: 'TE-08', quantity: 1.3, unitPrice: 4120, subtotal: 5356 }
        ],
        net: 15244,
        iva: 2897,
        total: 18141,
        payment_method: 'transfer',
        document_type: 'factura'
    },
    {
        providerId: 1,
        date: '2025-09-23',
        items: [
            { mpCode: 'TE-04', quantity: 1.3, unitPrice: 4120, subtotal: 5356 },
            { mpCode: 'TE-03', quantity: 1.3, unitPrice: 4120, subtotal: 5356 },
            { mpCode: 'TE-05', quantity: 1.3, unitPrice: 4120, subtotal: 5356 },
            { mpCode: 'TE-01', quantity: 0.7, unitPrice: 3826, subtotal: 2678 },
            { mpCode: 'TE-06', quantity: 0.7, unitPrice: 3826, subtotal: 2678 },
            { mpCode: 'TE-07', quantity: 0.7, unitPrice: 3826, subtotal: 2678 }
        ],
        net: 24102,
        iva: 4581,
        total: 28683,
        payment_method: 'transfer',
        document_type: 'factura'
    },
    {
        providerId: 3,
        date: '2025-11-05',
        items: [
            { mpCode: 'SE-01', quantity: 774, unitPrice: 30, subtotal: 23400 }
        ],
        net: 23400,
        iva: 4446,
        total: 27846,
        payment_method: 'transfer',
        document_type: 'factura'
    },
    {
        providerId: 3,
        date: '2025-09-26',
        items: [
            { mpCode: 'SE-01', quantity: 559, unitPrice: 25, subtotal: 14202 }
        ],
        net: 14202,
        iva: 2698,
        total: 16900,
        payment_method: 'transfer',
        document_type: 'factura'
    }
];

async function run() {
    console.log('Clearing old entries (IDs 6-11)...');
    await supabase.from('purchase_items').delete().in('purchase_id', [6, 7, 8, 9, 10, 11]);
    await supabase.from('compras').delete().in('id', [6, 7, 8, 9, 10, 11]);

    for (const p of purchases) {
        try {
            console.log(`Inserting purchase: ${p.date} - ${p.net}...`);

            const { data: purchase, error: pError } = await supabase
                .from('compras')
                .insert({
                    date: p.date,
                    provider_id: p.providerId,
                    net: p.net,
                    iva: p.iva,
                    total: p.total,
                    payment_method: p.payment_method,
                    document_type: p.document_type
                })
                .select()
                .single();

            if (pError) throw pError;

            const itemsToInsert = p.items.map((it, idx) => ({
                purchase_id: purchase.id,
                item_number: idx + 1,
                mp_code: it.mpCode,
                quantity: it.quantity,
                unit_price: Math.round(it.unitPrice),
                subtotal: Math.round(it.subtotal)
            }));

            const { error: iError } = await supabase.from('purchase_items').insert(itemsToInsert);
            if (iError) throw iError;

            for (const item of p.items) {
                const { data: rm } = await supabase.from('materias primas').select('stock').eq('code', item.mpCode).single();
                await supabase.from('materias primas').update({ stock: (rm?.stock || 0) + item.quantity }).eq('code', item.mpCode);
            }

            console.log(`Success: #${purchase.id}`);
        } catch (e) {
            console.error(`Error with purchase ${p.date}:`, e.message || e);
        }
    }
}

run();
