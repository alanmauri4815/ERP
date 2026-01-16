require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors());
app.use(express.json());

// GET Routes
app.get('/api/products', async (req, res) => {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .neq('code', '')
        .not('code', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/raw-materials', async (req, res) => {
    const { data, error } = await supabase
        .from('raw_materials')
        .select('*')
        .neq('code', '')
        .not('code', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/providers', async (req, res) => {
    const { data, error } = await supabase
        .from('providers')
        .select('*')
        .not('id', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/clients', async (req, res) => {
    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .not('id', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/recipes/:productCode', async (req, res) => {
    const { data, error } = await supabase
        .from('recipes')
        .select(`
            *,
            raw_materials (
                name,
                unit,
                cost_net
            )
        `)
        .eq('product_code', req.params.productCode);

    if (error) return res.status(500).json({ error: error.message });

    // Flatten logic for compatibility with frontend
    const flattened = data.map(r => ({
        ...r,
        mp_name: r.raw_materials?.name,
        unit: r.raw_materials?.unit,
        cost_net: r.raw_materials?.cost_net
    }));

    res.json(flattened);
});

app.put('/api/recipes/:productCode', async (req, res) => {
    const { items } = req.body;
    const productCode = req.params.productCode;

    try {
        // Delete old recipe
        await supabase.from('recipes').delete().eq('product_code', productCode);

        // Prepare new items
        const newItems = [];
        for (const item of items) {
            const { data: rm } = await supabase.from('raw_materials').select('cost_net').eq('code', item.mpCode).single();
            const mpCostNet = rm ? rm.cost_net : 0;
            const batchSize = item.batchSize || 1;
            const unitCost = (item.quantity / batchSize) * mpCostNet;

            newItems.push({
                product_code: productCode,
                mp_code: item.mpCode,
                quantity: item.quantity,
                batch_size: batchSize,
                unit_cost: unitCost
            });
        }

        if (newItems.length > 0) {
            await supabase.from('recipes').insert(newItems);
        }

        // Recalculate total cost
        const { data: newRecipe } = await supabase.from('recipes').select('unit_cost').eq('product_code', productCode);
        const totalCost = Math.round(newRecipe.reduce((sum, r) => sum + (r.unit_cost || 0), 0));

        await supabase.from('products').update({ cost_unit: totalCost }).eq('code', productCode);

        res.json({ success: true, message: 'Receta actualizada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/history/purchases', async (req, res) => {
    const { data: history, error } = await supabase
        .from('purchases')
        .select('*, providers(name)')
        .order('date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const fullHistory = [];
    for (const p of history) {
        const { data: items } = await supabase
            .from('purchase_items')
            .select('*, raw_materials(name, color, size)')
            .eq('purchase_id', p.id);

        fullHistory.push({
            ...p,
            provider_name: p.providers?.name,
            items: items.map(i => ({
                ...i,
                mp_name: i.raw_materials?.name,
                color: i.raw_materials?.color,
                size: i.raw_materials?.size
            }))
        });
    }

    res.json(fullHistory);
});

app.get('/api/history/sales', async (req, res) => {
    const { data: history, error } = await supabase
        .from('sales')
        .select('*, clients(name)')
        .order('date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const fullHistory = [];
    for (const s of history) {
        const { data: items } = await supabase
            .from('sale_items')
            .select('*, products(name, color, size)')
            .eq('sale_id', s.id);

        fullHistory.push({
            ...s,
            client_name: s.clients?.name,
            items: items?.map(i => ({
                ...i,
                product_name: i.products?.name,
                color: i.products?.color,
                size: i.products?.size
            })) || []
        });
    }

    res.json(fullHistory);
});

app.get('/api/history/production', async (req, res) => {
    const { data: history, error } = await supabase
        .from('production')
        .select('*')
        .order('date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const fullHistory = [];
    for (const p of history) {
        const { data: items } = await supabase
            .from('production_items')
            .select('*, products(name, color, size)')
            .eq('production_id', p.id);

        fullHistory.push({
            ...p,
            items: items.map(i => ({
                ...i,
                product_name: i.products?.name,
                color: i.products?.color,
                size: i.products?.size
            }))
        });
    }

    res.json(fullHistory);
});

app.post('/api/purchases', async (req, res) => {
    const { providerId, items, net, iva, total } = req.body;
    const date = new Date().toISOString().split('T')[0];

    try {
        const { data: purchase, error: pError } = await supabase
            .from('purchases')
            .insert({ date, provider_id: providerId || null, net, iva, total })
            .select()
            .single();

        if (pError) throw pError;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.mpCode && item.quantity > 0) {
                await supabase.from('purchase_items').insert({
                    purchase_id: purchase.id,
                    item_number: i + 1,
                    mp_code: item.mpCode,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    subtotal: item.subtotal
                });

                // Update stock using a RPC call or direct update
                // For simplicity, direct update (beware of race conditions in high load)
                const { data: rm } = await supabase.from('raw_materials').select('stock').eq('code', item.mpCode).single();
                await supabase.from('raw_materials').update({ stock: (rm?.stock || 0) + item.quantity }).eq('code', item.mpCode);
            }
        }

        res.json({ success: true, message: 'Compra registrada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/sales', async (req, res) => {
    const { clientId, items, net, iva, total } = req.body;
    const date = new Date().toISOString().split('T')[0];

    try {
        const { data: sale, error: sError } = await supabase
            .from('sales')
            .insert({ date, client_id: clientId || null, net, iva, total })
            .select()
            .single();

        if (sError) throw sError;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.productCode && item.quantity > 0) {
                await supabase.from('sale_items').insert({
                    sale_id: sale.id,
                    item_number: i + 1,
                    product_code: item.productCode,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    subtotal: item.subtotal
                });

                const { data: p } = await supabase.from('products').select('stock').eq('code', item.productCode).single();
                await supabase.from('products').update({ stock: (p?.stock || 0) - item.quantity }).eq('code', item.productCode);
            }
        }

        res.json({ success: true, message: 'Venta registrada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/production', async (req, res) => {
    const { items, date } = req.body;
    const productionDate = date || new Date().toISOString();

    try {
        const { data: prod, error: pError } = await supabase
            .from('production')
            .insert({ date: productionDate })
            .select()
            .single();

        if (pError) throw pError;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.productCode && item.quantity > 0) {
                await supabase.from('production_items').insert({
                    production_id: prod.id,
                    item_number: i + 1,
                    product_code: item.productCode,
                    quantity: item.quantity,
                    mo_cost: item.mo_cost || 0
                });

                // Update product stock
                const { data: p } = await supabase.from('products').select('stock').eq('code', item.productCode).single();
                await supabase.from('products').update({ stock: (p?.stock || 0) + item.quantity }).eq('code', item.productCode);

                // Update MP stock based on recipe
                const { data: recipe } = await supabase.from('recipes').select('mp_code, quantity').eq('product_code', item.productCode);
                for (const r of recipe) {
                    const { data: rm } = await supabase.from('raw_materials').select('stock').eq('code', r.mp_code).single();
                    await supabase.from('raw_materials').update({ stock: (rm?.stock || 0) - (r.quantity * item.quantity) }).eq('code', r.mp_code);
                }
            }
        }

        res.json({ success: true, message: 'Producción registrada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Master routes (POST, PUT, DELETE) follow similar patterns...
// Adding some key ones
app.post('/api/products', async (req, res) => {
    const { code, name, type, price_net, price_sale, cost_unit, color, size, parent_code } = req.body;
    const { error } = await supabase.from('products').insert({ code, name, type, price_net, price_sale, cost_unit, color, size, parent_code });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Producto creado.' });
});

app.put('/api/products/:code', async (req, res) => {
    const { name, type, price_net, price_sale, cost_unit, color, size, parent_code } = req.body;
    const { error } = await supabase.from('products').update({ name, type, price_net, price_sale, cost_unit, color, size, parent_code }).eq('code', req.params.code);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Producto actualizado.' });
});

app.get('/api/stats', async (req, res) => {
    try {
        const { data: sales } = await supabase.from('sales').select('total');
        const revenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);

        const { count: salesCount } = await supabase.from('sales').select('*', { count: 'exact', head: true });

        const { data: prodItems } = await supabase.from('production_items').select('quantity');
        const productionCount = prodItems.reduce((sum, i) => sum + (i.quantity || 0), 0);

        const { count: lowStock } = await supabase.from('raw_materials').select('*', { count: 'exact', head: true }).lt('stock', 2);

        res.json({
            totalRevenue: revenue,
            totalSales: salesCount,
            totalProduction: productionCount,
            lowStockItems: lowStock,
            weeklySales: [] // Simplified for now
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`ERP Backend running on port ${PORT} (Connected to Supabase)`);
});
