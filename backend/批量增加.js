const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5LCJ1c2VybmFtZSI6ImFudGlncmF2aXR5Iiwicm9sZSI6InN1cGVyYWRtaW4iLCJpYXQiOjE3NDA3NDg1MzR9.v38tf0Y20PnrN6M50JVdScE_G-q_vGz8Sbly35FOisg';
const API_BASE = 'http://localhost:3001/api';

const purchases = [
    {
        providerId: 1,
        date: '2025-09-23',
        items: [
            { mpCode: 'TE-01', quantity: 5.2, unitPrice: 4117.69, subtotal: 21412 },
            { mpCode: 'TE-02', quantity: 0.1, unitPrice: 4120, subtotal: 412 },
            { mpCode: 'TE-03', quantity: 2.9, unitPrice: 4117.58, subtotal: 11941 },
            { mpCode: 'TE-04', quantity: 2.9, unitPrice: 4117.58, subtotal: 11941 },
            { mpCode: 'TE-05', quantity: 0.8, unitPrice: 4117.5, subtotal: 3294 },
            { mpCode: 'TE-06', quantity: 1.6, unitPrice: 4117.5, subtotal: 6588 },
            { mpCode: 'TE-07', quantity: 1.6, unitPrice: 4117.5, subtotal: 6588 },
            { mpCode: 'TE-08', quantity: 0.8, unitPrice: 4117.5, subtotal: 3294 },
            { mpCode: 'TE-09', quantity: 1.6, unitPrice: 4117.5, subtotal: 6588 }
        ],
        net: 72058,
        iva: 13692,
        total: 85750,
        payment_method: 'transfer',
        document_type: 'factura',
        type: 'mp'
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
        document_type: 'factura',
        type: 'mp'
    },
    {
        providerId: 1,
        date: '2025-09-23',
        items: [
            { mpCode: 'TE-04', quantity: 1.3, unitPrice: 4120, subtotal: 5356 },
            { mpCode: 'TE-03', quantity: 1.3, unitPrice: 4120, subtotal: 5356 },
            { mpCode: 'TE-05', quantity: 1.3, unitPrice: 4120, subtotal: 5356 },
            { mpCode: 'TE-01', quantity: 0.7, unitPrice: 3825.71, subtotal: 2678 },
            { mpCode: 'TE-06', quantity: 0.7, unitPrice: 3825.71, subtotal: 2678 },
            { mpCode: 'TE-07', quantity: 0.7, unitPrice: 3825.71, subtotal: 2678 }
        ],
        net: 24102,
        iva: 4581,
        total: 28683,
        payment_method: 'transfer',
        document_type: 'factura',
        type: 'mp'
    },
    {
        providerId: 3,
        date: '2025-11-05',
        items: [
            { mpCode: 'SE-01', quantity: 774, unitPrice: 30.23, subtotal: 23400 }
        ],
        net: 23400,
        iva: 4446,
        total: 27846,
        payment_method: 'transfer',
        document_type: 'factura',
        type: 'mp'
    },
    {
        providerId: 3,
        date: '2025-09-26',
        items: [
            { mpCode: 'SE-01', quantity: 559, unitPrice: 25.41, subtotal: 14202 }
        ],
        net: 14202,
        iva: 2698,
        total: 16900,
        payment_method: 'transfer',
        document_type: 'factura',
        type: 'mp'
    }
];

async function run() {
    for (const p of purchases) {
        try {
            const res = await fetch(`${API_BASE}/purchases`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(p)
            });
            const data = await res.json();
            console.log(`Success: ${p.date} - ${p.net}`, data);
        } catch (e) {
            console.error(`Error: ${p.date}`, e.message);
        }
    }
}

run();
