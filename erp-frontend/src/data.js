export const products = [
    { id: 'TO-01', name: 'Toalla 160x80 Az', type: 'Toalla', price: 10700, cost: 6007, stock: 15 },
    { id: 'TO-02', name: 'Toalla 160x80 Ro', type: 'Toalla', price: 10700, cost: 5927, stock: 8 },
    { id: 'TO-03', name: 'Toalla 160x80 Am', type: 'Toalla', price: 10700, cost: 5927, stock: 12 },
];

export const recipes = {
    'TO-01': [
        { mp: 'TE-01', name: 'Microfibra Dep 160 Na', quantity: 0.8 },
        { mp: 'HI-01', name: 'Hilo Overlock Verde', quantity: 0.04 },
        { mp: 'HI-02', name: 'Hilo Recta Verde', quantity: 0.04 },
    ],
    'TO-02': [
        { mp: 'TE-03', name: 'Microfibra Dep 160 Fu', quantity: 0.8 },
        { mp: 'HI-01', name: 'Hilo Overlock Verde', quantity: 0.04 },
    ]
};

export const rawMaterials = [
    { id: 'TE-01', name: 'Microfibra Dep 160 Na', type: 'MP', stock: 2.58, unit: 'Mts', cost: 4900 },
    { id: 'TE-02', name: 'Microfibra Dep 160 Li', type: 'MP', stock: 1.17, unit: 'Mts', cost: 4900 },
    { id: 'HI-01', name: 'Hilo Overlock Verde', type: 'IN', stock: 5, unit: 'Uni', cost: 1200 },
];

export const sales = [
    { id: 1, date: '2025-09-13', customer: 'Venta Directa', product: 'Toalla 160x80 Fu', amount: 8992, status: 'Pagado' },
    { id: 2, date: '2025-09-14', customer: 'Venta Directa', product: 'Turbante Fu', amount: 4706, status: 'Pagado' },
];

export const stats = {
    totalRevenue: 15420000,
    totalSales: 204,
    activeOrders: 12,
    lowStockItems: 5
};
