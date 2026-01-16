require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Telegram Helper
async function sendTelegramMessage(message) {
    try {
        const { data: tokenData } = await supabase.from('settings').select('value').eq('key', 'telegram_bot_token').single();
        const { data: chatData } = await supabase.from('settings').select('value').eq('key', 'telegram_chat_id').single();

        const token = tokenData?.value;
        const chatId = chatData?.value;

        if (!token || !chatId) {
            console.log('Telegram not configured');
            return;
        }

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
        });
    } catch (e) {
        console.error('Error sending Telegram alert:', e.message);
    }
}

async function checkLowStockAlerts(mpCode) {
    try {
        const { data: rm } = await supabase.from('raw_materials').select('name, stock').eq('code', mpCode).single();
        const { data: alertConfig } = await supabase.from('alerts_config').select('threshold').eq('mp_code', mpCode).single();

        if (rm && alertConfig && rm.stock <= alertConfig.threshold) {
            await sendTelegramMessage(`⚠️ <b>ALERTA DE STOCK BAJO</b>\n\nEl insumo <b>${rm.name}</b> (${mpCode}) tiene un stock de <b>${rm.stock}</b>, llegando al límite de <b>${alertConfig.threshold}</b>.\n\nFavor revisar stock.`);
        }
    } catch (e) {
        console.error('Error checking alerts:', e.message);
    }
}

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
        req.user = user;
        next();
    });
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { error } = await supabase.from('users').insert({ username, password: hashedPassword });
        if (error) throw error;
        res.json({ success: true, message: 'Usuario registrado exitosamente.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { data: user, error } = await supabase.from('users').select('*').eq('username', username).single();
        if (error || !user) return res.status(401).json({ error: 'Usuario no encontrado.' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta.' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user: { username: user.username, role: user.role } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET Routes
app.get('/api/products', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .neq('code', '')
        .not('code', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/raw-materials', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from('raw_materials')
        .select('*')
        .neq('code', '')
        .not('code', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/providers', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from('providers')
        .select('*')
        .not('id', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/clients', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .not('id', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/recipes/:productCode', authenticateToken, async (req, res) => {
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

app.put('/api/recipes/:productCode', authenticateToken, async (req, res) => {
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

app.get('/api/history/purchases', authenticateToken, async (req, res) => {
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

app.get('/api/history/sales', authenticateToken, async (req, res) => {
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

app.get('/api/history/production', authenticateToken, async (req, res) => {
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

app.post('/api/purchases', authenticateToken, async (req, res) => {
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

                // Alert check is usually done on decrement, but can also be checked here
            }
        }

        res.json({ success: true, message: 'Compra registrada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/sales', authenticateToken, async (req, res) => {
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

app.post('/api/production', authenticateToken, async (req, res) => {
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
                    const newStock = (rm?.stock || 0) - (r.quantity * item.quantity);
                    await supabase.from('raw_materials').update({ stock: newStock }).eq('code', r.mp_code);

                    // Check alert
                    await checkLowStockAlerts(r.mp_code);
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
app.post('/api/products', authenticateToken, async (req, res) => {
    const { code, name, type, price_net, price_sale, cost_unit, color, size, parent_code } = req.body;
    const { error } = await supabase.from('products').insert({ code, name, type, price_net, price_sale, cost_unit, color, size, parent_code });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Producto creado.' });
});

app.put('/api/products/:code', authenticateToken, async (req, res) => {
    const { name, type, price_net, price_sale, cost_unit, color, size, parent_code } = req.body;
    const { error } = await supabase.from('products').update({ name, type, price_net, price_sale, cost_unit, color, size, parent_code }).eq('code', req.params.code);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Producto actualizado.' });
});

app.get('/api/reports/monthly', authenticateToken, async (req, res) => {
    try {
        // Fetch all sales with items and their products' cost_unit
        const { data: sales, error } = await supabase
            .from('sales')
            .select(`
                id,
                date,
                total,
                net,
                sale_items (
                    quantity,
                    subtotal,
                    product_code,
                    products (
                        cost_unit
                    )
                )
            `)
            .order('date', { ascending: true });

        if (error) throw error;

        const monthlyData = {};

        sales.forEach(sale => {
            const date = new Date(sale.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    month: monthKey,
                    revenue: 0,
                    cost: 0,
                    profit: 0,
                    salesCount: 0
                };
            }

            monthlyData[monthKey].revenue += sale.total || 0;
            monthlyData[monthKey].salesCount += 1;

            sale.sale_items.forEach(item => {
                const itemCost = (item.products?.cost_unit || 0) * (item.quantity || 0);
                monthlyData[monthKey].cost += itemCost;
            });

            monthlyData[monthKey].profit = monthlyData[monthKey].revenue - monthlyData[monthKey].cost;
        });

        res.json(Object.values(monthlyData));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const { data: sales } = await supabase.from('sales').select('total, date');
        const revenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);

        const { count: salesCount } = await supabase.from('sales').select('*', { count: 'exact', head: true });

        const { data: prodItems } = await supabase.from('production_items').select('quantity');
        const productionCount = prodItems.reduce((sum, i) => sum + (i.quantity || 0), 0);

        const { count: lowStock } = await supabase.from('raw_materials').select('*', { count: 'exact', head: true }).lt('stock', 2);

        // Weekly sales logic
        const last7Days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
        }).reverse();

        const weeklySales = last7Days.map(date => {
            const daySales = sales.filter(s => s.date === date);
            return {
                date,
                total: daySales.reduce((sum, s) => sum + (s.total || 0), 0)
            };
        });

        res.json({
            totalRevenue: revenue,
            totalSales: salesCount,
            totalProduction: productionCount,
            lowStockItems: lowStock,
            weeklySales: weeklySales
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Settings & Alerts Config
app.get('/api/settings', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) return res.status(500).json({ error: error.message });
    const settings = {};
    data.forEach(s => settings[s.key] = s.value);
    res.json(settings);
});

app.post('/api/settings', authenticateToken, async (req, res) => {
    const { key, value } = req.body;
    const { error } = await supabase.from('settings').upsert({ key, value });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/api/alerts-config', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from('alerts_config').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/alerts-config', authenticateToken, async (req, res) => {
    const { mp_code, threshold } = req.body;
    const { error } = await supabase.from('alerts_config').upsert({ mp_code, threshold });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.post('/api/test-notification', authenticateToken, async (req, res) => {
    await sendTelegramMessage('✅ <b>Prueba de Notificación</b>\n\nSi recibiste este mensaje, tu ERP Universal está correctamente vinculado a tu celular.');
    res.json({ success: true, message: 'Prueba enviada. Revisa tu celular.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`ERP Backend running on port ${PORT} (Connected to Supabase)`);
});
