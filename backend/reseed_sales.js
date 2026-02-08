require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const salesData = [
    { id: 1, date: '2025-09-13', pay: 'machine', event: '', items: [{ c: 'TO-06', q: 1, p: 10700 }, { c: 'TU-02', q: 1, p: 5600 }] },
    { id: 2, date: '2025-09-13', pay: 'cash', event: '', items: [{ c: 'TU-01', q: 1, p: 5600 }, { c: 'TU-01', q: 1, p: 5600 }] },
    { id: 3, date: '2025-09-14', pay: 'cash', event: '', items: [{ c: 'TU-04', q: 1, p: 5600 }, { c: 'TU-02', q: 1, p: 5600 }] },
    { id: 4, date: '2025-09-14', pay: 'machine', event: '', items: [{ c: 'TU-02', q: 1, p: 5600 }] },
    { id: 5, date: '2025-09-24', pay: 'cash', event: '', items: [{ c: 'TO-12', q: 1, p: 13200 }] },
    { id: 6, date: '2025-09-29', pay: 'machine', event: '', items: [{ c: 'TU-02', q: 1, p: 5600 }, { c: 'TO-06', q: 1, p: 10700 }, { c: 'Go-01', q: 1, p: 5300 }, { c: 'TU-02', q: 1, p: 5600 }, { c: 'TU-03', q: 1, p: 5600 }] },
    { id: 7, date: '2025-10-01', pay: 'machine', event: '', items: [{ c: 'TU-01', q: 1, p: 5600 }, { c: 'TU-04', q: 1, p: 5600 }, { c: 'TU-02', q: 1, p: 5600 }] },
    { id: 8, date: '2025-10-02', pay: 'cash', event: '', items: [{ c: 'TO-10', q: 1, p: 4500 }] },
    { id: 9, date: '2025-10-02', pay: 'machine', event: '', items: [{ c: 'TU-01', q: 1, p: 5600 }] },
    { id: 10, date: '2025-10-03', pay: 'machine', event: '', items: [{ c: 'TU-01', q: 2, p: 5600 }, { c: 'TO-03', q: 1, p: 10700 }, { c: 'TU-03', q: 1, p: 5600 }] },
    { id: 11, date: '2025-10-04', pay: 'machine', event: '', items: [{ c: 'TU-02', q: 1, p: 5600 }] },
    { id: 12, date: '2025-10-18', pay: 'cash', event: '', items: [{ c: 'TU-02', q: 1, p: 5600 }] },
    { id: 13, date: '2025-10-18', pay: 'machine', event: '', items: [{ c: 'TU-01', q: 1, p: 5600 }] },
    { id: 14, date: '2025-10-19', pay: 'machine', event: '', items: [{ c: 'TU-01', q: 1, p: 5600 }, { c: 'TU-04', q: 1, p: 5600 }, { c: 'TU-03', q: 1, p: 5600 }] },
    { id: 15, date: '2025-11-08', pay: 'machine', event: '', items: [{ c: 'TO-09', q: 1, p: 9301 }] },
    { id: 16, date: '2025-11-08', pay: 'cash', event: '', items: [{ c: 'TO-04', q: 1, p: 10700 }] },
    { id: 17, date: '2025-11-09', pay: 'machine', event: '', items: [{ c: 'TU-05', q: 2, p: 5600 }, { c: 'TU-02', q: 1, p: 5600 }, { c: 'TU-04', q: 1, p: 5600 }] },
    { id: 18, date: '2025-12-01', pay: 'machine', event: '', items: [{ c: 'TU-02', q: 1, p: 5600 }, { c: 'TU-04', q: 1, p: 5600 }] },
    { id: 19, date: '2025-12-02', pay: 'cash', event: '', items: [{ c: 'TO-07', q: 1, p: 10000 }, { c: 'TU-04', q: 1, p: 5600 }] },
    { id: 20, date: '2025-12-04', pay: 'machine', event: '', items: [{ c: 'TU-08', q: 1, p: 5600 }, { c: 'TO-01', q: 1, p: 10700 }, { c: 'TO-08', q: 1, p: 10700 }, { c: 'TO-11', q: 1, p: 13200 }] },
    { id: 21, date: '2025-12-04', pay: 'cash', event: '', items: [{ c: 'TO-10', q: 1, p: 4500 }] },
    { id: 22, date: '2025-12-13', pay: 'cash', event: '', items: [{ c: 'TU-06', q: 1, p: 5600 }, { c: 'TU-01', q: 1, p: 5600 }] },
    { id: 23, date: '2025-12-13', pay: 'machine', event: '', items: [{ c: 'TU-01', q: 1, p: 5600 }, { c: 'TU-03', q: 1, p: 5600 }, { c: 'TU-02', q: 1, p: 5600 }] },
    { id: 24, date: '2025-12-14', pay: 'machine', event: '', items: [{ c: 'TU-05', q: 1, p: 5600 }, { c: 'TU-07', q: 1, p: 5600 }, { c: 'TO-04', q: 1, p: 10700 }, { c: 'TU-03', q: 1, p: 5600 }, { c: 'Go-01', q: 1, p: 5300 }, { c: 'Go-01', q: 1, p: 5300 }, { c: 'TO-02', q: 1, p: 10700 }] },
    { id: 25, date: '2025-12-15', pay: 'machine', event: '', items: [{ c: 'TU-05', q: 1, p: 5600 }] },
    { id: 26, date: '2025-12-17', pay: 'cash', event: '', items: [{ c: 'TU-08', q: 1, p: 5600 }] },
    { id: 27, date: '2025-12-19', pay: 'transfer', event: '', items: [{ c: 'TO-01', q: 1, p: 10700 }] },
    { id: 28, date: '2025-12-19', pay: 'machine', event: '', items: [{ c: 'TO-05', q: 1, p: 10700 }, { c: 'TU-02', q: 1, p: 5600 }, { c: 'TU-05', q: 1, p: 5600 }] },
    { id: 29, date: '2025-12-19', pay: 'cash', event: '', items: [{ c: 'TU-06', q: 1, p: 5600 }, { c: 'TO-01', q: 1, p: 10700 }] },
    { id: 30, date: '2025-12-20', pay: 'machine', event: '', items: [{ c: 'TU-01', q: 1, p: 5600 }, { c: 'TU-02', q: 1, p: 5600 }, { c: 'TU-02', q: 1, p: 5600 }] },
    { id: 31, date: '2025-12-20', pay: 'cash', event: '', items: [{ c: 'TU-01', q: 1, p: 5600 }, { c: 'TU-06', q: 1, p: 5600 }, { c: 'TU-05', q: 1, p: 5600 }, { c: 'TU-02', q: 1, p: 5600 }, { c: 'TO-07', q: 1, p: 10700 }] },
    { id: 32, date: '2025-12-21', pay: 'cash', event: '', items: [{ c: 'TU-03', q: 1, p: 5600 }] },
    { id: 33, date: '2025-12-21', pay: 'machine', event: '', items: [{ c: 'Go-01', q: 1, p: 5300 }, { c: 'TU-08', q: 1, p: 5600 }] },
    { id: 34, date: '2025-12-23', pay: 'cash', event: '', items: [{ c: 'TU-01', q: 1, p: 5600 }] },
    { id: 35, date: '2025-12-23', pay: 'machine', event: '', items: [{ c: 'TU-05', q: 1, p: 5600 }] },
    { id: 36, date: '2025-12-23', pay: 'transfer', event: '', items: [{ c: 'TO-02', q: 1, p: 10700 }, { c: 'TO-05', q: 1, p: 10700 }, { c: 'TO-03', q: 1, p: 10700 }, { c: 'TU-08', q: 1, p: 5600 }] }
];

async function run() {
    console.log("Cleaning old sales...");
    await supabase.from('sale_items').delete().neq('id', 0);
    await supabase.from('ventas').delete().neq('id', 0);

    // Add default machine if missing
    const { data: machines } = await supabase.from('payment_machines').select('id').eq('name', 'SumUp');
    let machineId = null;
    if (!machines || machines.length === 0) {
        const { data: newM } = await supabase.from('payment_machines').insert({ name: 'SumUp', commission_percent: 3.34, active: true }).select().single();
        machineId = newM.id;
    } else {
        machineId = machines[0].id;
    }

    for (const s of salesData) {
        console.log(`Inserting Sale ID ${s.id}...`);
        let total = 0;
        let net = 0;
        let iva = 0;

        for (const item of s.items) {
            const lineTotal = item.p * item.q;
            total += lineTotal;
            if (s.pay === 'cash') {
                net += lineTotal;
            } else if (s.pay === 'machine' || s.pay === 'transfer') {
                const lineNet = Math.round(lineTotal / 1.19);
                iva += (lineTotal - lineNet);
                net += lineNet;
            }
        }

        const { data: sale, error } = await supabase.from('ventas').insert({
            id: s.id,
            date: s.date,
            client_id: null,
            total,
            net,
            iva,
            payment_method: s.pay,
            is_iva_exempt: s.pay === 'cash',
            machine_id: s.pay === 'machine' ? machineId : null,
            event_name: s.event
        }).select().single();

        if (error) {
            console.error(`Error inserting Sale ${s.id}:`, error);
            continue;
        }

        const itemsToInsert = s.items.map((item, idx) => ({
            sale_id: sale.id,
            item_number: idx + 1,
            product_code: item.c,
            quantity: item.q,
            unit_price: item.p,
            subtotal: item.p * item.q
        }));

        await supabase.from('sale_items').insert(itemsToInsert);
    }
    console.log("Finished reseeding sales.");
}

run();
