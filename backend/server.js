require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const T = {
    MP: 'materias primas',
    PRODUCTS: 'productos',
    RECIPES: 'recetas',
    PROVIDERS: 'proveedores',
    CLIENTS: 'clientela',
    SALES: 'ventas',
    SALE_ITEMS: 'sale_items',
    PURCHASES: 'compras',
    PURCHASE_ITEMS: 'purchase_items',
    PRODUCTION: 'production',
    PRODUCTION_ITEMS: 'production_items',
    USERS: 'usuarios',
    SETTINGS: 'settings',
    ALERTS: 'alerts_config',
    ACCOUNTS: 'accounts',
    QUOTATIONS: 'quotations',
    QUOTE_ITEMS: 'quotation_items',
    PAYMENT_MACHINES: 'payment_machines',
    ACCOUNTING_ENTRIES: 'asientos_contables',
    ACCOUNTING_ACCOUNTS: 'accounting_accounts',
    ACCOUNTING_LINES: 'accounting_lines'
};

// Accounting Helper
async function createAccountingEntry({ date, description, type, document_number, lines, userId }) {
    try {
        // 1. Create Header
        const { data: header, error: hError } = await supabase
            .from(T.ACCOUNTING_ENTRIES)
            .insert({
                date: date || new Date().toISOString().split('T')[0],
                description,
                entry_type: type,
                document_number,
                created_by: userId
            })
            .select()
            .single();

        if (hError) throw hError;

        // 2. Resolve account codes to IDs (Utility)
        const { data: accs } = await supabase.from(T.ACCOUNTING_ACCOUNTS).select('id, code');
        const codeMap = {};
        accs.forEach(a => codeMap[a.code] = a.id);

        // 3. Create Lines
        const journalLines = lines.map(line => ({
            asiento_id: header.id,
            account_id: codeMap[line.account_code] || line.account_id,
            debit: line.debit || 0,
            credit: line.credit || 0,
            glosa: line.glosa || description
        }));

        const { error: lError } = await supabase.from(T.ACCOUNTING_LINES).insert(journalLines);
        if (lError) throw lError;

        return { success: true, id: header.id };
    } catch (e) {
        console.error('Accounting Entry Error:', e);
        return { success: false, error: e.message };
    }
}

// Telegram Helper
async function sendTelegramMessage(message) {
    try {
        const { data: tokenData } = await supabase.from(T.SETTINGS).select('value').eq('key', 'telegram_bot_token').single();
        const { data: chatData } = await supabase.from(T.SETTINGS).select('value').eq('key', 'telegram_chat_id').single();

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
    const { data: rm } = await supabase.from(T.MP).select('stock, name').eq('code', mpCode).single();
    const { data: config } = await supabase.from(T.ALERTS).select('threshold').eq('mp_code', mpCode).single();
    if (config && rm && rm.stock < config.threshold) {
        await sendTelegramMessage(
            `⚠️ <b>ALERTA DE STOCK BAJO</b>\n\n` +
            `Insumo: <b>${rm.name}</b> (${mpCode})\n` +
            `Stock actual: ${rm.stock.toFixed(2)}\n` +
            `Límite configurado: ${config.threshold}`
        );
    }
}

// Tax calculation helper
function calculateTax(netPrice, taxRate = 0.19) {
    const iva = Math.round(netPrice * taxRate * 100) / 100;
    const total = Math.round((netPrice + iva) * 100) / 100;
    return { iva, total };
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

const checkAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        next();
    } else {
        res.status(403).json({ error: 'Acceso restringido. Se requieren permisos de administrador.' });
    }
};

const checkSuperAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'superadmin') {
        next();
    } else {
        res.status(403).json({ error: 'Acceso restringido. Se requieren permisos de Gestor del ERP.' });
    }
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { error } = await supabase.from(T.USERS).insert({ username, password: hashedPassword });
        if (error) throw error;
        res.json({ success: true, message: 'Usuario registrado exitosamente.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { data: user, error } = await supabase.from(T.USERS).select('*').eq('username', username).single();
        if (error) return res.status(401).json({ error: 'Error de base de datos', details: error.message, code: error.code });
        if (!user) return res.status(401).json({ error: 'Usuario no encontrado.' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta.' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user: { username: user.username, role: user.role } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    try {
        const { data: user, error } = await supabase.from(T.USERS).select('*').eq('id', userId).single();
        if (error || !user) return res.status(404).json({ error: 'Usuario no encontrado.' });

        const validPassword = await bcrypt.compare(oldPassword, user.password);
        if (!validPassword) return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        const { error: updateError } = await supabase.from(T.USERS).update({ password: hashedNewPassword }).eq('id', userId);

        if (updateError) throw updateError;
        res.json({ success: true, message: 'Contraseña actualizada exitosamente.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET Routes
app.get('/api/products', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from(T.PRODUCTS)
        .select('*')
        .neq('code', '')
        .not('code', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/raw-materials', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from(T.MP)
        .select('*')
        .neq('code', '')
        .not('code', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/providers', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.PROVIDERS).select('*').order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/providers', authenticateToken, async (req, res) => {
    const { rut, name, address, contact, phone, email, notes } = req.body;
    const { data, error } = await supabase.from(T.PROVIDERS).insert({ rut, name, address, contact, phone, email, notes }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

app.put('/api/providers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { rut, name, address, contact, phone, email, notes } = req.body;
    const { error } = await supabase.from(T.PROVIDERS).update({ rut, name, address, contact, phone, email, notes }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.delete('/api/providers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from(T.PROVIDERS).delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/api/clients', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.CLIENTS).select('*').order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/clients', authenticateToken, async (req, res) => {
    const { name, address, phone, email, rut, notes } = req.body;
    const { data, error } = await supabase.from(T.CLIENTS).insert({ name, address, phone, email, rut, notes }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

app.put('/api/clients/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, address, phone, email, rut, notes } = req.body;
    const { error } = await supabase.from(T.CLIENTS).update({ name, address, phone, email, rut, notes }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from(T.CLIENTS).delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ========== PAYMENT MACHINES ==========
app.get('/api/payment-machines', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.PAYMENT_MACHINES).select('*').order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/payment-machines', authenticateToken, async (req, res) => {
    const { name, provider, commission_percent, account_id, active } = req.body;
    const { data, error } = await supabase.from(T.PAYMENT_MACHINES)
        .insert({ name, provider, commission_percent: commission_percent || 0, account_id, active: active !== false })
        .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

app.put('/api/payment-machines/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, provider, commission_percent, account_id, active } = req.body;
    const { error } = await supabase.from(T.PAYMENT_MACHINES)
        .update({ name, provider, commission_percent, account_id, active })
        .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.delete('/api/payment-machines/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from(T.PAYMENT_MACHINES).delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/api/recipes', authenticateToken, async (req, res) => {
    // Return an empty object to satisfy the frontend pre-load
    // Individual recipes will still be fetched by productCode
    res.json({});
});

app.get('/api/recipes/:productCode', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from(T.RECIPES)
        .select(`
            *,
            raw_materials:"${T.MP}" (
                name,
                unit,
                cost_net,
                color,
                size
            )
        `)
        .eq('product_code', req.params.productCode);

    if (error) return res.status(500).json({ error: error.message });

    // Flatten logic for compatibility with frontend
    const flattened = data.map(r => ({
        ...r,
        mp_name: r.raw_materials?.name,
        unit: r.raw_materials?.unit,
        cost_net: r.raw_materials?.cost_net,
        color: r.raw_materials?.color,
        size: r.raw_materials?.size
    }));

    res.json(flattened);
});

app.put('/api/recipes/:productCode', authenticateToken, async (req, res) => {
    const { items } = req.body;
    const productCode = req.params.productCode;

    try {
        // Delete old recipe
        await supabase.from(T.RECIPES).delete().eq('product_code', productCode);

        // Prepare new items
        const newItems = [];
        for (const item of items) {
            const { data: rm } = await supabase.from(T.MP).select('cost_net').eq('code', item.mpCode).single();
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
            await supabase.from(T.RECIPES).insert(newItems);
        }

        // Recalculate total cost
        const { data: newRecipe } = await supabase.from(T.RECIPES).select('unit_cost').eq('product_code', productCode);
        const totalCost = Math.round(newRecipe.reduce((sum, r) => sum + (r.unit_cost || 0), 0));

        await supabase.from(T.PRODUCTS).update({ cost_unit: totalCost }).eq('code', productCode);

        res.json({ success: true, message: 'Receta actualizada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get(['/api/history/purchases', '/api/purchases'], authenticateToken, async (req, res) => {
    const { data: history, error } = await supabase
        .from(T.PURCHASES)
        .select(`*, proveedores:"${T.PROVIDERS}"(name)`)
        .order('date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const fullHistory = [];
    for (const p of history) {
        const { data: items } = await supabase
            .from(T.PURCHASE_ITEMS)
            .select(`*, raw_materials:"${T.MP}"(name, color, size)`)
            .eq('purchase_id', p.id);

        fullHistory.push({
            ...p,
            provider_name: p.providers?.name,
            items: items?.map(i => ({
                ...i,
                mp_name: i.raw_materials?.name,
                color: i.raw_materials?.color,
                size: i.raw_materials?.size
            })) || []
        });
    }

    res.json(fullHistory);
});

app.get(['/api/history/sales', '/api/sales'], authenticateToken, async (req, res) => {
    const { data: history, error } = await supabase
        .from(T.SALES)
        .select(`*, clients:"${T.CLIENTS}"(name)`)
        .order('date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const fullHistory = [];
    for (const s of history) {
        const { data: items } = await supabase
            .from(T.SALE_ITEMS)
            .select(`*, products:"${T.PRODUCTS}"(name, color, size)`)
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

app.get(['/api/history/production', '/api/production'], authenticateToken, async (req, res) => {
    const { data: history, error } = await supabase
        .from(T.PRODUCTION)
        .select('*')
        .order('date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const fullHistory = [];
    for (const p of history) {
        const { data: items } = await supabase
            .from(T.PRODUCTION_ITEMS)
            .select(`*, products:"${T.PRODUCTS}"(name, color, size)`)
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
    const { providerId, items, net, iva, total, payment_method, account_id, document_type } = req.body;
    const date = new Date().toISOString().split('T')[0];

    try {
        const { data: purchase, error: pError } = await supabase
            .from(T.PURCHASES)
            .insert({
                date,
                provider_id: providerId || null,
                net, iva, total,
                payment_method: payment_method || null,
                account_id: account_id || null,
                document_type: document_type || 'factura'
            })
            .select()
            .single();

        if (pError) throw pError;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.mpCode && item.quantity > 0) {
                await supabase.from(T.PURCHASE_ITEMS).insert({
                    purchase_id: purchase.id,
                    item_number: i + 1,
                    mp_code: item.mpCode,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    subtotal: item.subtotal
                });

                // Update stock
                const { data: rm } = await supabase.from(T.MP).select('stock').eq('code', item.mpCode).single();
                await supabase.from(T.MP).update({ stock: (rm?.stock || 0) + item.quantity }).eq('code', item.mpCode);
            }
        }

        // Create Accounting Entry
        await createAccountingEntry({
            date,
            description: `Compra a proveedor (Factura #${purchase.id})`,
            type: 'compra',
            document_number: purchase.id.toString(),
            userId: req.user.id,
            lines: [
                { account_code: '1.1.02.01', debit: net },         // Inventario MP (Neto)
                { account_code: '1.1.03.01', debit: iva },         // IVA Crédito Fiscal
                { account_code: '1.1.01.01', credit: total }       // Pago desde Caja/Banco (Total)
            ]
        });

        res.json({ success: true, message: 'Compra registrada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/sales', authenticateToken, async (req, res) => {
    const { clientId, items, net, iva, total, payment_method, account_id, is_iva_exempt, machine_id, event_name } = req.body;
    const date = new Date().toISOString().split('T')[0];

    try {
        const { data: sale, error: sError } = await supabase
            .from(T.SALES)
            .insert({
                date,
                client_id: clientId || null,
                net, iva, total,
                payment_method: payment_method || null,
                account_id: account_id || null,
                is_iva_exempt: is_iva_exempt || false,
                machine_id: machine_id || null,
                event_name: event_name || null,
                transferred: false
            })
            .select()
            .single();

        if (sError) throw sError;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.productCode && item.quantity > 0) {
                await supabase.from(T.SALE_ITEMS).insert({
                    sale_id: sale.id,
                    item_number: i + 1,
                    product_code: item.productCode,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    subtotal: item.subtotal
                });

                const { data: p } = await supabase.from(T.PRODUCTS).select('stock').eq('code', item.productCode).single();
                await supabase.from(T.PRODUCTS).update({ stock: (p?.stock || 0) - item.quantity }).eq('code', item.productCode);
            }
        }

        // Create Accounting Entry
        let paymentAccount = '1.1.01.01'; // Default: Caja
        let commissionAmount = 0;

        if (payment_method === 'machine') {
            paymentAccount = '1.1.01.03'; // Fondos por Recaudar
            if (machine_id) {
                const { data: machine } = await supabase.from(T.PAYMENT_MACHINES).select('commission_percent').eq('id', machine_id).single();
                if (machine && machine.commission_percent) {
                    commissionAmount = Math.round(total * machine.commission_percent / 100);
                }
            }
        } else if (payment_method === 'transfer') {
            paymentAccount = '1.1.01.02'; // Banco
        }

        const journalLines = [
            { account_code: paymentAccount, debit: total - commissionAmount, glosa: `Venta #${sale.id} (${payment_method})` },
            { account_code: '4.1.01.01', credit: net, glosa: `Ingreso neto venta #${sale.id}` }
        ];

        if (commissionAmount > 0) {
            journalLines.push({ account_code: '5.1.02.02', debit: commissionAmount, glosa: `Comisión máquina venta #${sale.id}` });
        }

        if (!is_iva_exempt && iva > 0) {
            journalLines.push({ account_code: '2.1.02.01', credit: iva, glosa: `IVA Débito venta #${sale.id}` });
        }

        await createAccountingEntry({
            date,
            description: `Venta de productos (${event_name || 'General'})`, // Reverted to original as the provided change was syntactically incorrect.
            type: 'venta',
            document_number: sale.id.toString(),
            userId: req.user.id,
            lines: journalLines
        });

        res.json({ success: true, message: 'Venta registrada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== DIRECT SALES TRANSFERS ==========
app.get('/api/sales/pending-transfer', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from(T.SALES)
            .select('*, payment_machines:machine_id(name, commission_percent)')
            .is('client_id', null)
            .eq('transferred', false)
            .order('date', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sales/bulk-transfer', authenticateToken, async (req, res) => {
    const { sale_ids, destination_account_id } = req.body;
    const transferDate = new Date().toISOString().split('T')[0];

    try {
        // Get sales with machine info
        const { data: sales, error: sError } = await supabase
            .from(T.SALES)
            .select('*, payment_machines:machine_id(commission_percent)')
            .in('id', sale_ids);
        if (sError) throw sError;

        let totalGross = 0, totalIva = 0, totalCommission = 0;

        for (const sale of sales) {
            const gross = sale.total || 0;
            const commissionRate = sale.payment_machines?.commission_percent || 0;
            const commission = Math.round(gross * commissionRate / 100);
            const actualTransfer = gross - commission;

            totalGross += gross;
            totalCommission += commission;

            // Update sale as transferred
            await supabase.from(T.SALES).update({
                transferred: true,
                transferred_date: transferDate,
                transferred_to_account_id: destination_account_id,
                transfer_amount: actualTransfer
            }).eq('id', sale.id);
        }

        const totalNetTransfer = totalGross - totalCommission;

        // Create Simplified Accounting Entry for Transfer (Since commission was already recorded at sale)
        await createAccountingEntry({
            date: transferDate,
            description: `Liquidación masiva Transbank (${sales.length} ventas)`,
            type: 'transferencia',
            userId: req.user.id,
            lines: [
                { account_code: '1.1.01.02', debit: totalNetTransfer },      // Entra al Banco
                { account_code: '1.1.01.03', credit: totalNetTransfer }     // Sale de Fondos por Recaudar (ya neto)
            ]
        });

        res.json({
            success: true,
            summary: { totalGross, totalIva, totalCommission, totalNet, salesCount: sales.length }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/accounting-entries', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.ACCOUNTING_ENTRIES).select('*').order('date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/production', authenticateToken, async (req, res) => {
    const { items, date } = req.body;
    const productionDate = date || new Date().toISOString();

    try {
        const { data: prod, error: pError } = await supabase
            .from(T.PRODUCTION)
            .insert({ date: productionDate })
            .select()
            .single();

        if (pError) throw pError;

        let totalProductionCost = 0;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.productCode && item.quantity > 0) {
                await supabase.from(T.PRODUCTION_ITEMS).insert({
                    production_id: prod.id,
                    item_number: i + 1,
                    product_code: item.productCode,
                    quantity: item.quantity,
                    mo_cost: item.mo_cost || 0
                });

                // Update product stock
                const { data: p } = await supabase.from(T.PRODUCTS).select('stock').eq('code', item.productCode).single();
                await supabase.from(T.PRODUCTS).update({ stock: (p?.stock || 0) + item.quantity }).eq('code', item.productCode);

                // Update MP stock based on recipe
                const { data: recipe } = await supabase.from(T.RECIPES).select('mp_code, quantity').eq('product_code', item.productCode);
                for (const r of recipe) {
                    const { data: rm } = await supabase.from(T.MP).select('stock, cost_net').eq('code', r.mp_code).single();
                    const consumptionQty = (r.quantity * item.quantity);
                    const consumptionCost = consumptionQty * (rm?.cost_net || 0);
                    totalProductionCost += consumptionCost;

                    const newStock = (rm?.stock || 0) - consumptionQty;
                    await supabase.from(T.MP).update({ stock: newStock }).eq('code', r.mp_code);

                    // Check alert
                    await checkLowStockAlerts(r.mp_code);
                }
            }
        }

        // Create Accounting Entry for Consumption
        if (totalProductionCost > 0) {
            await createAccountingEntry({
                date,
                description: `Consumo de Materias Primas - Producción #${prod.id}`,
                type: 'consumo',
                userId: req.user.id,
                lines: [
                    { account_code: '1.1.02.02', debit: totalProductionCost }, // Inventario PT
                    { account_code: '1.1.02.01', credit: totalProductionCost } // Inventario MP
                ]
            });
        }

        res.json({ success: true, message: 'Producción registrada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Master routes (POST, PUT, DELETE) follow similar patterns...
// Adding some key ones
app.post('/api/products', authenticateToken, async (req, res) => {
    let { code, name, type, price_net, price_sale, cost_unit, color, size, parent_code, iva, total } = req.body;

    // Auto-calculate tax if not provided
    if (price_sale && (!iva || !total)) {
        const tax = calculateTax(price_sale);
        iva = tax.iva;
        total = tax.total;
    }

    const { error } = await supabase.from(T.PRODUCTS).insert({ code, name, type, price_net, price_sale, cost_unit, color, size, parent_code, iva, total });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Producto creado.' });
});

app.put('/api/products/:code', authenticateToken, async (req, res) => {
    let { name, type, price_net, price_sale, cost_unit, color, size, parent_code, iva, total } = req.body;

    // Auto-calculate tax if not provided but price changed
    if (price_sale && (!iva || !total)) {
        const tax = calculateTax(price_sale);
        iva = tax.iva;
        total = tax.total;
    }

    const { error } = await supabase.from(T.PRODUCTS).update({ name, type, price_net, price_sale, cost_unit, color, size, parent_code, iva, total }).eq('code', req.params.code);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Producto actualizado.' });
});

app.get('/api/reports/monthly', authenticateToken, async (req, res) => {
    try {
        // Fetch all sales with items and their products' cost_unit
        const { data: sales, error } = await supabase
            .from(T.SALES)
            .select(`
                id,
                date,
                total,
                net,
                sale_items:${T.SALE_ITEMS} (
                    quantity,
                    subtotal,
                    product_code,
                    products:${T.PRODUCTS} (
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
        const { data: sales } = await supabase.from(T.SALES).select('total, date');
        const revenue = sales?.reduce((sum, s) => sum + (s.total || 0), 0) || 0;

        const { count: salesCount } = await supabase.from(T.SALES).select('*', { count: 'exact', head: true });

        const { data: prodItems } = await supabase.from(T.PRODUCTION_ITEMS).select('quantity');
        const productionCount = prodItems?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;

        const { count: lowStock } = await supabase.from(T.MP).select('*', { count: 'exact', head: true }).lt('stock', 2);

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
    const { data, error } = await supabase.from(T.SETTINGS).select('*');
    if (error) return res.status(500).json({ error: error.message });
    const settings = {};
    data?.forEach(s => settings[s.key] = s.value);
    res.json(settings);
});

app.post('/api/settings', authenticateToken, async (req, res) => {
    const { key, value } = req.body;
    const { error } = await supabase.from(T.SETTINGS).upsert({ key, value });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/api/alerts-config', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.ALERTS).select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/alerts-config', authenticateToken, async (req, res) => {
    const { mp_code, threshold } = req.body;
    const { error } = await supabase.from(T.ALERTS).upsert({ mp_code, threshold });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.post('/api/test-notification', authenticateToken, async (req, res) => {
    await sendTelegramMessage('✅ <b>Prueba de Notificación</b>\n\nSi recibiste este mensaje, tu ERP Universal está correctamente vinculado a tu celular.');
    res.json({ success: true, message: 'Prueba enviada. Revisa tu celular.' });
});

// User Management Routes (Admin Only)
app.get('/api/users', authenticateToken, checkSuperAdmin, async (req, res) => {
    const { data, error } = await supabase.from(T.USERS).select('id, username, role');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/users', authenticateToken, checkSuperAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { error } = await supabase.from(T.USERS).insert({ username, password: hashedPassword, role });
        if (error) throw error;
        res.json({ success: true, message: 'Usuario creado exitosamente.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/users/:id', authenticateToken, checkSuperAdmin, async (req, res) => {
    const { id } = req.params;
    const { username, password, role } = req.body;
    const updateData = { username, role };

    if (password && password.trim() !== '') {
        updateData.password = await bcrypt.hash(password, 10);
    }

    try {
        const { error } = await supabase.from(T.USERS).update(updateData).eq('id', id);
        if (error) throw error;
        res.json({ success: true, message: 'Usuario actualizado exitosamente.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/users/:id', authenticateToken, checkSuperAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase.from(T.USERS).delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true, message: 'Usuario eliminado.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Accounts Management Routes ---
app.get('/api/accounts', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.ACCOUNTS).select('*').order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/accounts', authenticateToken, checkAdmin, async (req, res) => {
    const { name, type, current_balance } = req.body;
    const { error } = await supabase.from(T.ACCOUNTS).insert({ name, type, current_balance });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.put('/api/accounts/:id', authenticateToken, checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, type, current_balance } = req.body;
    const { error } = await supabase.from(T.ACCOUNTS).update({ name, type, current_balance }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// --- Quotations Routes ---
app.get('/api/quotations', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from(T.QUOTATIONS)
        .select(`*, clients:"${T.CLIENTS}"(name)`)
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/quotations/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { data: quotation, error: qError } = await supabase
        .from(T.QUOTATIONS)
        .select(`*, clients:"${T.CLIENTS}"(name)`)
        .eq('id', id)
        .single();
    if (qError) return res.status(500).json({ error: qError.message });

    const { data: items, error: iError } = await supabase.from(T.QUOTE_ITEMS).select('*').eq('quotation_id', id);
    if (iError) return res.status(500).json({ error: iError.message });

    res.json({ ...quotation, items });
});

// --- Accounting System Endpoints ---

app.get('/api/accounting/accounts', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.ACCOUNTING_ACCOUNTS).select('*').order('code');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/accounting/ledger', authenticateToken, async (req, res) => {
    try {
        const { data: entries, error: eError } = await supabase
            .from(T.ACCOUNTING_ENTRIES)
            .select(`
                *,
                lines:accounting_lines(
                    *,
                    account:accounting_accounts(name, code)
                )
            `)
            .order('date', { ascending: false });

        if (eError) throw eError;

        // Map it to the format the frontend expects
        const formattedLedger = entries.map(entry => ({
            ...entry,
            lines: (entry.lines || []).map(l => ({
                ...l,
                account_name: l.account?.name,
                account_code: l.account?.code
            }))
        }));

        res.json(formattedLedger);
    } catch (e) {
        console.error('Ledger error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/accounting/expenses', authenticateToken, async (req, res) => {
    const { date, description, amount, account_origin_code, category_code } = req.body;

    const result = await createAccountingEntry({
        date,
        description,
        type: 'gasto',
        userId: req.user.id,
        lines: [
            { account_code: category_code || '5.1.02.01', debit: amount }, // Gasto Operacional
            { account_code: account_origin_code || '1.1.01.01', credit: amount } // Pago (Caja)
        ]
    });

    res.json(result);
});

app.post('/api/accounting/transfers', authenticateToken, async (req, res) => {
    const { date, description, amount, from_account_code, to_account_code } = req.body;

    const result = await createAccountingEntry({
        date,
        description: description || 'Transferencia entre cuentas',
        type: 'transferencia',
        userId: req.user.id,
        lines: [
            { account_code: to_account_code, debit: amount },
            { account_code: from_account_code, credit: amount }
        ]
    });

    res.json(result);
});

app.post('/api/quotations', authenticateToken, async (req, res) => {
    const {
        client_id, name, quantity, utility_percentage,
        total_net_cost, total_price_net, total_iva, total_price_gross,
        items
    } = req.body;

    try {
        // 1. Create Quotation Header
        const { data: quote, error: qError } = await supabase.from(T.QUOTATIONS).insert({
            client_id, name, quantity, utility_percentage,
            total_net_cost, total_price_net, total_iva, total_price_gross,
            status: 'draft'
        }).select().single();

        if (qError) throw qError;

        // 2. Insert Items
        if (items && items.length > 0) {
            const itemsWithId = items.map(item => ({
                ...item,
                quotation_id: quote.id
            }));
            const { error: iError } = await supabase.from(T.QUOTE_ITEMS).insert(itemsWithId);
            if (iError) throw iError;
        }

        res.json({ success: true, id: quote.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`ERP Backend running on port ${PORT} (Connected to Supabase)`);
});
