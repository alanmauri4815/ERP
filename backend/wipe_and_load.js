const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const data = [
    {
        group: '000', date: '2025-09-23', providerId: 1, payment_method: 'cash', items: [
            { mpCode: 'TE-01', quantity: 5.2, net: 21412, iva: 4068, total: 25480 },
            { mpCode: 'TE-02', quantity: 0.1, net: 412, iva: 78, total: 490 },
            { mpCode: 'TE-03', quantity: 2.9, net: 11941, iva: 2269, total: 14210 },
            { mpCode: 'TE-04', quantity: 2.9, net: 11941, iva: 2269, total: 14210 },
            { mpCode: 'TE-05', quantity: 0.8, net: 3294, iva: 626, total: 3920 }
        ]
    },
    {
        group: '001', date: '2025-09-23', providerId: 1, payment_method: 'cash', items: [
            { mpCode: 'TE-06', quantity: 1.6, net: 6588, iva: 1252, total: 7840 },
            { mpCode: 'TE-07', quantity: 1.6, net: 6588, iva: 1252, total: 7840 },
            { mpCode: 'TE-08', quantity: 0.8, net: 3294, iva: 626, total: 3920 },
            { mpCode: 'TE-09', quantity: 1.6, net: 6588, iva: 1252, total: 7840 }
        ]
    },
    {
        group: '002', date: '2025-09-23', providerId: 1, payment_method: 'cash', items: [
            { mpCode: 'TE-02', quantity: 2.4, net: 9888, iva: 1879, total: 11767 },
            { mpCode: 'TE-08', quantity: 1.3, net: 5356, iva: 1018, total: 6374 }
        ]
    },
    {
        group: '003', date: '2025-09-23', providerId: 1, payment_method: 'cash', items: [
            { mpCode: 'TE-04', quantity: 1.3, net: 5356, iva: 1018, total: 6374 },
            { mpCode: 'TE-03', quantity: 1.3, net: 5356, iva: 1018, total: 6374 },
            { mpCode: 'TE-05', quantity: 1.3, net: 5356, iva: 1018, total: 6374 },
            { mpCode: 'TE-01', quantity: 0.7, net: 2678, iva: 509, total: 3187 },
            { mpCode: 'TE-06', quantity: 0.7, net: 2678, iva: 509, total: 3187 },
            { mpCode: 'TE-07', quantity: 0.7, net: 2678, iva: 509, total: 3187 }
        ]
    },
    {
        group: '005', date: '2025-11-05', providerId: 3, payment_method: 'transfer', account_id: 1, items: [
            { mpCode: 'SE-01', quantity: 774, net: 23400, iva: 4446, total: 27846 }
        ]
    },
    {
        group: '004', date: '2025-09-26', providerId: 3, payment_method: 'transfer', account_id: 1, items: [
            { mpCode: 'SE-01', quantity: 559, net: 14202, iva: 2698, total: 16900 }
        ]
    }
];

async function run() {
    console.log('--- Wiping Purchases and Related Accounting Entries ---');

    // 1. Get purchase entries for surgical deletion
    const { data: purchaseEntries } = await supabase.from('asientos_contables').select('id').eq('entry_type', 'compra');
    if (purchaseEntries && purchaseEntries.length > 0) {
        const ids = purchaseEntries.map(e => e.id);
        await supabase.from('accounting_lines').delete().in('asiento_id', ids);
        await supabase.from('asientos_contables').delete().in('id', ids);
        console.log(`Removed ${ids.length} accounting entries.`);
    }

    // 2. Wipe purchase items and compras
    await supabase.from('purchase_items').delete().neq('id', 0);
    await supabase.from('compras').delete().neq('id', 0);
    console.log('Purchases tables wiped.');

    // 3. Reset stocks (setting to 0 before re-applying)
    console.log('Resetting stocks for involved materials...');
    const codes = [...new Set(data.flatMap(g => g.items.map(i => i.mpCode)))];
    for (const code of codes) {
        await supabase.from('materias primas').update({ stock: 0 }).eq('code', code);
    }

    // 4. Load new data
    console.log('Injecting clean data...');
    for (const group of data) {
        const net = group.items.reduce((sum, i) => sum + i.net, 0);
        const iva = group.items.reduce((sum, i) => sum + i.iva, 0);
        const total = group.items.reduce((sum, i) => sum + i.total, 0);

        const { data: purchase, error: pError } = await supabase
            .from('compras')
            .insert({
                date: group.date,
                provider_id: group.providerId,
                net, iva, total,
                payment_method: group.payment_method,
                account_id: group.account_id || null,
                document_type: 'factura',
                type: 'mp'
            })
            .select().single();

        if (pError) {
            console.error(`Group ${group.group} Error:`, pError.message);
            continue;
        }

        const items = group.items.map((it, idx) => ({
            purchase_id: purchase.id,
            item_number: idx + 1,
            mp_code: it.mpCode,
            quantity: it.quantity,
            unit_price: Math.round(it.net / it.quantity),
            subtotal: it.total
        }));

        await supabase.from('purchase_items').insert(items);

        // Update stocks
        for (const item of group.items) {
            const { data: rm } = await supabase.from('materias primas').select('stock').eq('code', item.mpCode).single();
            await supabase.from('materias primas').update({ stock: (rm?.stock || 0) + item.quantity }).eq('code', item.mpCode);
        }
        console.log(`Group ${group.group} -> Purchase #${purchase.id} SUCCESS`);
    }
}

run();
