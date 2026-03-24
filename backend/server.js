require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Global debug logger to file
function debugLog(msg, data = null) {
    const time = new Date().toISOString();
    const logMsg = data ? `${time} - ${msg} - ${JSON.stringify(data)}\n` : `${time} - ${msg}\n`;
    const logPath = path.join(__dirname, 'debug_accounting.log');
    try {
        fs.appendFileSync(logPath, logMsg);
    } catch (e) {
        console.error('Failed to write to log file:', e);
    }
    console.log(msg, data || '');
}

debugLog('--- Backend starting and ready for debugging ---');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Global Request Logger
// [Logger moved below express.json]

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
    LOGISTICS: 'logistica',
    LOGISTICS_ITEMS: 'logistica_items',
    // Nuevas Tablas Contabilidad Pro (Compatibles con sistema anterior vía alias)
    PC_PLAN: 'plan_cuentas',
    PC_ASIENTOS: 'asientos',
    PC_MOVIMIENTOS: 'asiento_movimientos',
    COST_CENTERS: 'centros_costo',
    // Aliases para compatibilidad con código antiguo
    ACCOUNTING_ENTRIES: 'asientos',
    ACCOUNTING_LINES: 'asiento_movimientos',
    ACCOUNTING_ACCOUNTS: 'plan_cuentas'
};

// Accounting Helper
async function createAccountingEntry({ date, description, type, document_number, lines, userId, empresaId }) {
    try {
        // Asegurar tipos correctos para la base de datos
        const finalEmpresaId = isNaN(parseInt(empresaId)) ? empresaId : parseInt(empresaId);
        debugLog(`Attempting accounting entry for Empresa: ${finalEmpresaId} (Raw: ${empresaId})`);

        // Helper para asegurar fecha ISO YYYY-MM-DD
        let isoDate = date || new Date().toISOString().split('T')[0];
        if (typeof isoDate === 'string' && isoDate.includes('/')) {
            const parts = isoDate.split('/');
            if (parts[2]?.length === 4) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        
        const periodo = (typeof isoDate === 'string' && isoDate.length >= 7) 
            ? isoDate.substring(0, 7) 
            : new Date().toISOString().substring(0, 7);

        // 1. Crear Cabecera del Asiento (Voucher)
        const headerPayload = {
            fecha: isoDate,
            glosa: description,
            periodo: periodo,
            tipo_origen: type,
            referencia_id: document_number,
            empresa_id: finalEmpresaId
        };
        debugLog('Header Payload:', headerPayload);

        const { data: header, error: hError } = await supabase
            .from(T.PC_ASIENTOS)
            .insert(headerPayload)
            .select()
            .single();

        if (hError) {
            debugLog('Header Error:', hError);
            throw hError;
        }

        // 2. Crear las Líneas de Movimiento
        const journalLines = lines.map(line => ({
            asiento_id: header.id,
            cuenta_codigo: line.account_code,
            debe: line.debit || 0,
            haber: line.credit || 0,
            centro_costo_id: (typeof line.centro_costo_id === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(line.centro_costo_id)) ? line.centro_costo_id : null,
            empresa_id: finalEmpresaId
        }));
        debugLog('Lines Payload:', journalLines);

        const { error: lError } = await supabase.from(T.PC_MOVIMIENTOS).insert(journalLines);
        if (lError) {
            debugLog('Lines Error:', lError);
            throw lError;
        }

        debugLog('Accounting Entry Created Successfully:', header.id);
        return { success: true, id: header.id };
    } catch (e) {
        console.error('Accounting Entry Error Details:', {
            message: e.message,
            stack: e.stack,
            context: { date, description, type, document_number, linesCount: lines?.length, userId, empresaId }
        });
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

// --- Health Check DB ---
async function checkHealth() {
    try {
        const { count: usersCount, error: errU } = await supabase.from(T.USERS).select('*', { count: 'exact', head: true });
        const { count: provCount, error: errP } = await supabase.from(T.PROVIDERS).select('*', { count: 'exact', head: true });
        const { count: prodCount, error: errPr } = await supabase.from(T.PRODUCTS).select('*', { count: 'exact', head: true });

        if (errU) console.error('[DB HEALTH] Error Usuarios:', errU.message);
        if (errP) console.error('[DB HEALTH] Error Proveedores:', errP.message);
        if (errPr) console.error('[DB HEALTH] Error Productos:', errPr.message);

        console.log(`[DB HEALTH] Usuarios: ${usersCount}, Proveedores: ${provCount}, Productos: ${prodCount}`);
    } catch (e) {
        console.error('[DB HEALTH ERROR]', e.message);
    }
}
checkHealth();

// --- CORS: Only allow known origins ---
const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://erp-universal.vercel.app',
    'https://erp-rho-nine.vercel.app',
    'https://erp-git-main-alanmauri4815s-proyectos.vercel.app',
    'https://erp-54l4owhov-alanmauri4815s-proyectos.vercel.app',
    'http://localhost:3001',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://localhost:5178'
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked request from: ${origin}`);
            callback(new Error('CORS no permitido'));
        }
    }
}));
app.use(express.json({ limit: '5mb' }));

// Global Request Logger with parsed body
app.use((req, res, next) => {
    debugLog(`[TRAFFIC] ${req.method} ${req.url}`, {
        headers: req.headers,
        body: req.method !== 'GET' ? req.body : null
    });
    next();
});

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// --- JWT Secret: Fail-fast if not configured ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET is not set in .env. Server cannot start securely.');
    process.exit(1);
}

// --- Rate Limiting for Login (in-memory) ---
const loginAttempts = new Map();
function loginRateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 10;

    if (!loginAttempts.has(ip)) {
        loginAttempts.set(ip, []);
    }
    const attempts = loginAttempts.get(ip).filter(t => now - t < windowMs);
    loginAttempts.set(ip, attempts);

    if (attempts.length >= maxAttempts) {
        return res.status(429).json({ error: 'Demasiados intentos de login. Intente de nuevo en 15 minutos.' });
    }
    attempts.push(now);
    next();
}
// Clean up rate limit map every 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of loginAttempts) {
        const valid = times.filter(t => now - t < 15 * 60 * 1000);
        if (valid.length === 0) loginAttempts.delete(ip);
        else loginAttempts.set(ip, valid);
    }
}, 30 * 60 * 1000);

// Auth Middleware (Multi-Tenant: extrae empresa_id del JWT)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
        req.user = user;
        
        // Robust enterprise ID: Ensure we have a value and avoid issues with numeric vs uuid strings
        let eid = user.empresa_id || 1;
        // Si el valor parece un número pero es string, lo dejamos como tal. 
        // El frontend suele enviar UUIDs si la base de datos los usa.
        req.empresa_id = eid;
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

// --- Multi-Tenant: Lista de Empresas (público, sin auth) ---
app.get('/api/empresas', async (req, res) => {
    const { data, error } = await supabase.from('empresas').select('id, nombre').eq('activa', true).order('nombre');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// --- Empresa Management (Solo Gestor del ERP / superadmin) ---
app.get('/api/empresas/admin', authenticateToken, checkSuperAdmin, async (req, res) => {
    const { data, error } = await supabase.from('empresas').select('*').order('nombre');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/empresas', authenticateToken, checkSuperAdmin, async (req, res) => {
    const { nombre, rut, direccion, telefono, email } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre de la empresa es obligatorio.' });

    try {
        const { data, error } = await supabase.from('empresas')
            .insert({ nombre, rut, direccion, telefono, email, activa: true })
            .select().single();
        if (error) throw error;

        // Crear usuario admin por defecto para la nueva empresa
        const defaultPassword = await bcrypt.hash('admin123', 10);
        const { error: userErr } = await supabase.from(T.USERS).insert({
            username: 'admin',
            password: defaultPassword,
            role: 'admin',
            empresa_id: data.id
        });

        if (userErr) {
            console.warn('No se pudo crear usuario admin para la empresa:', userErr.message);
        }

        res.json({
            success: true,
            message: `Empresa "${nombre}" creada exitosamente. Usuario admin creado (contraseña: admin123).`,
            data
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/empresas/:id', authenticateToken, checkSuperAdmin, async (req, res) => {
    const { nombre, rut, direccion, telefono, email, activa } = req.body;
    const { error } = await supabase.from('empresas')
        .update({ nombre, rut, direccion, telefono, email, activa })
        .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Empresa actualizada.' });
});

app.delete('/api/empresas/:id', authenticateToken, checkSuperAdmin, async (req, res) => {
    // No elimina, solo desactiva
    const { error } = await supabase.from('empresas')
        .update({ activa: false })
        .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Empresa desactivada.' });
});

// Auth Routes
app.post('/api/auth/register', authenticateToken, checkAdmin, async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { error } = await supabase.from(T.USERS).insert({ username, password: hashedPassword, empresa_id: req.empresa_id });
        if (error) throw error;
        res.json({ success: true, message: 'Usuario registrado exitosamente.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    const { username, password, empresa_id } = req.body;
    debugLog(`[LOGIN] Attempt for "${username}" in empresa: ${empresa_id}. Body keys: ${Object.keys(req.body || {})}`);

    try {
        // Multi-Tenant: buscar usuario por username Y empresa_id
        let query = supabase.from(T.USERS).select('*').eq('username', username);
        if (empresa_id) query = query.eq('empresa_id', empresa_id);
        const { data: user, error } = await query.single();

        if (error) {
            debugLog(`[LOGIN] DB Error or User Not Found: ${error.message} (Code: ${error.code})`);
            console.error('Login DB Error:', error.message, 'Code:', error.code);
            return res.status(401).json({ error: 'Usuario no encontrado en esta empresa.', details: error.message, code: error.code });
        }
        if (!user) {
            debugLog('[LOGIN] No user data returned');
            return res.status(401).json({ error: 'Usuario no encontrado.' });
        }

        debugLog(`[LOGIN] User found: ID ${user.id}, Hash length: ${user.password?.length || 0}`);
        
        const validPassword = await bcrypt.compare(password || '', user.password);
        debugLog(`[LOGIN] Password match result: ${validPassword} for user "${username}"`);

        if (!validPassword) {
            debugLog(`[LOGIN] FAILED: Password mismatch. Sent length: ${password?.length || 0}`);
            return res.status(401).json({ error: 'Contraseña incorrecta.' });
        }

        // Multi-Tenant: incluir empresa_id en el JWT
        const userEmpresaId = user.empresa_id || 1;
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, empresa_id: userEmpresaId },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Obtener nombre de la empresa
        const { data: empresa } = await supabase.from('empresas').select('nombre').eq('id', userEmpresaId).single();

        debugLog(`[LOGIN] SUCCESS: User "${username}" logged in. Empresa: ${empresa?.nombre}`);

        res.json({
            success: true,
            token,
            user: {
                username: user.username,
                role: user.role,
                empresa_id: userEmpresaId,
                empresa_nombre: empresa?.nombre || 'Empresa'
            }
        });
    } catch (e) {
        debugLog(`[LOGIN EXCEPTION] ${e.message}`);
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
        .eq('empresa_id', req.empresa_id)
        .neq('code', '')
        .not('code', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/raw-materials', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from(T.MP)
        .select('*')
        .eq('empresa_id', req.empresa_id)
        .neq('code', '')
        .not('code', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/raw-materials', authenticateToken, async (req, res) => {
    const { code, name, unit, cost_net, iva, total, color, size, parent_code, type, batch_size } = req.body;
    const { data, error } = await supabase.from(T.MP).insert({
        code, name, unit, cost_net, iva, total, color, size, parent_code, type: type || 'MP',
        batch_size: batch_size || 1, empresa_id: req.empresa_id
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

app.put('/api/raw-materials/:code', authenticateToken, async (req, res) => {
    const { name, unit, cost_net, iva, total, color, size, parent_code, batch_size } = req.body;
    const { error } = await supabase.from(T.MP).update({
        name, unit, cost_net, iva, total, color, size, parent_code,
        batch_size: batch_size || 1
    }).eq('code', req.params.code).eq('empresa_id', req.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.delete('/api/raw-materials/:code', authenticateToken, async (req, res) => {
    const { error } = await supabase.from(T.MP).delete().eq('code', req.params.code).eq('empresa_id', req.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/api/providers', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.PROVIDERS).select('*').eq('empresa_id', req.empresa_id).order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/providers', authenticateToken, async (req, res) => {
    const { rut, name, address, contact, phone, email, notes } = req.body;
    const { data, error } = await supabase.from(T.PROVIDERS).insert({ rut, name, address, contact, phone, email, notes, empresa_id: req.empresa_id }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Proveedor guardado correctamente', data });
});

app.put('/api/providers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { rut, name, address, contact, phone, email, notes } = req.body;
    const { error } = await supabase.from(T.PROVIDERS).update({ rut, name, address, contact, phone, email, notes }).eq('id', id).eq('empresa_id', req.empresa_id);
    res.json({ success: true, message: 'Proveedor actualizado correctamente' });
});

app.delete('/api/providers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from(T.PROVIDERS).delete().eq('id', id).eq('empresa_id', req.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/api/clients', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.CLIENTS).select('*').eq('empresa_id', req.empresa_id).order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/clients', authenticateToken, async (req, res) => {
    const { name, address, phone, email, rut, notes } = req.body;
    const { data, error } = await supabase.from(T.CLIENTS).insert({ name, address, phone, email, rut, notes, empresa_id: req.empresa_id }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Cliente guardado correctamente', data });
});

app.put('/api/clients/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, address, phone, email, rut, notes } = req.body;
    const { error } = await supabase.from(T.CLIENTS).update({ name, address, phone, email, rut, notes }).eq('id', id).eq('empresa_id', req.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Cliente actualizado correctamente' });
});

app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from(T.CLIENTS).delete().eq('id', id).eq('empresa_id', req.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ========== PAYMENT MACHINES ==========
app.get('/api/payment-machines', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.PAYMENT_MACHINES).select('*').eq('empresa_id', req.empresa_id).order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/payment-machines', authenticateToken, async (req, res) => {
    const { name, provider, commission_percent, account_id, active } = req.body;
    const { data, error } = await supabase.from(T.PAYMENT_MACHINES)
        .insert({ name, provider, commission_percent: commission_percent || 0, account_id, active: active !== false, empresa_id: req.empresa_id })
        .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

app.put('/api/payment-machines/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, provider, commission_percent, account_id, active } = req.body;
    const { error } = await supabase.from(T.PAYMENT_MACHINES)
        .update({ name, provider, commission_percent, account_id, active })
        .eq('id', id)
        .eq('empresa_id', req.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.delete('/api/payment-machines/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from(T.PAYMENT_MACHINES).delete().eq('id', id).eq('empresa_id', req.empresa_id);
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
                batch_size,
                color,
                size
            )
        `)
        .eq('product_code', req.params.productCode)
        .eq('empresa_id', req.empresa_id);

    if (error) return res.status(500).json({ error: error.message });

    // Flatten logic for compatibility with frontend
    const flattened = data.map(r => ({
        ...r,
        mp_name: r.raw_materials?.name,
        unit: r.raw_materials?.unit,
        cost_net: r.raw_materials?.cost_net,
        mp_batch_size: r.raw_materials?.batch_size || 1,
        color: r.raw_materials?.color,
        size: r.raw_materials?.size
    }));

    res.json(flattened);
});

app.put('/api/recipes/:productCode', authenticateToken, async (req, res) => {
    const { items } = req.body;
    const productCode = req.params.productCode;

    try {
        // Delete old recipe (only for current company)
        await supabase.from(T.RECIPES).delete().eq('product_code', productCode).eq('empresa_id', req.empresa_id);

        // Prepare new items
        const newItems = [];
        for (const item of items) {
            const { data: rm } = await supabase.from(T.MP).select('cost_net, batch_size').eq('code', item.mpCode).eq('empresa_id', req.empresa_id).single();
            const mpCostNetTotal = rm ? rm.cost_net : 0;
            const mpBatchSize = rm ? (rm.batch_size || 1) : 1;
            const mpUnitPrice = mpCostNetTotal / mpBatchSize;

            const recipeBatchSize = item.batchSize || 1;
            const unitCost = (item.quantity / recipeBatchSize) * mpUnitPrice;

            newItems.push({
                product_code: productCode,
                mp_code: item.mpCode,
                quantity: item.quantity,
                batch_size: recipeBatchSize,
                unit_cost: unitCost,
                empresa_id: req.empresa_id
            });
        }

        if (newItems.length > 0) {
            await supabase.from(T.RECIPES).insert(newItems);
        }

        // Recalculate total cost (only for current company)
        const { data: newRecipe } = await supabase.from(T.RECIPES).select('unit_cost').eq('product_code', productCode).eq('empresa_id', req.empresa_id);
        const totalCost = Math.round(newRecipe.reduce((sum, r) => sum + (r.unit_cost || 0), 0));

        await supabase.from(T.PRODUCTS).update({ cost_unit: totalCost }).eq('code', productCode).eq('empresa_id', req.empresa_id);

        res.json({ success: true, message: 'Receta actualizada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/admin/migrate-purchases', async (req, res) => {
    try {
        // Since we can't run raw SQL via RPC easily, we'll try to use the ALTER TABLE command via a custom RPC if it exists, 
        // otherwise this serves as documentation.
        // Actually, I'll try to use the 'exec_sql' RPC which is often present.
        const sql = `
            ALTER TABLE compras ADD COLUMN IF NOT EXISTS description text;
            ALTER TABLE compras ADD COLUMN IF NOT EXISTS type text DEFAULT 'mp';
            ALTER TABLE compras ADD COLUMN IF NOT EXISTS quotation_id int8 REFERENCES quotations(id);
            ALTER TABLE compras ADD COLUMN IF NOT EXISTS project_ref text;
            ALTER TABLE compras ADD COLUMN IF NOT EXISTS purchase_category text DEFAULT 'general';
            ALTER TABLE production ADD COLUMN IF NOT EXISTS production_category text DEFAULT 'push';
            ALTER TABLE production ADD COLUMN IF NOT EXISTS quotation_id int8 REFERENCES quotations(id);
            ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS custom_name text;
            ALTER TABLE quotations ADD COLUMN IF NOT EXISTS external_quote_id text;
            ALTER TABLE quotations ADD COLUMN IF NOT EXISTS purchase_order_id text;
            ALTER TABLE ventas ADD COLUMN IF NOT EXISTS commission numeric DEFAULT 0;
            ALTER TABLE ventas ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;
            ALTER TABLE ventas ADD COLUMN IF NOT EXISTS category text;
            ALTER TABLE compras ADD COLUMN IF NOT EXISTS document_number text;
            ALTER TABLE ventas ADD COLUMN IF NOT EXISTS document_number text;
            ALTER TABLE compras ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'factura';
            -- Nuevas Tablas Contabilidad Pro
            CREATE TABLE IF NOT EXISTS plan_cuentas (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                codigo TEXT UNIQUE NOT NULL,
                nombre TEXT NOT NULL,
                tipo TEXT NOT NULL,
                nivel INTEGER DEFAULT 1,
                padre_id TEXT REFERENCES plan_cuentas(codigo),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                empresa_id UUID 
            );

            -- Asegurar que las columnas existan y tengan el tipo correcto en las tablas originales
            ALTER TABLE asientos ADD COLUMN IF NOT EXISTS empresa_id TEXT;
            ALTER TABLE asientos ADD COLUMN IF NOT EXISTS usuario_id TEXT;
            ALTER TABLE asiento_movimientos ADD COLUMN IF NOT EXISTS empresa_id TEXT;
            
            -- No forzamos el tipo si ya existe para evitar errores de casting complejos
            -- Pero para tablas nuevas, el código de arriba ya las crea bien.
            -- Para las existentes, intentaremos asegurar el periodo si falta
            ALTER TABLE asientos ALTER COLUMN periodo SET NOT NULL; 
            
            -- Tablas de respaldo por si acaso (v2)
            CREATE TABLE IF NOT EXISTS asientos_v2 (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                fecha DATE NOT NULL,
                glosa TEXT NOT NULL,
                periodo TEXT,
                tipo_origen TEXT DEFAULT 'manual', 
                referencia_id TEXT, 
                numero TEXT, 
                usuario_id TEXT, 
                empresa_id TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            -- Plan de Cuentas Extendido
            INSERT INTO plan_cuentas (codigo, nombre, tipo, nivel) VALUES 
            ('1', 'ACTIVO', 'activo', 1), 
            ('1.1', 'Activo Circulante', 'activo', 2), 
            ('1.1.01', 'Caja', 'activo', 3), 
            ('1.1.02', 'Banco', 'activo', 3), 
            ('1.1.03', 'Tarjeta Débito (Socio)', 'activo', 3),
            ('1.1.04', 'Cuentas x Cobrar', 'activo', 3), 
            ('1.1.05', 'Anticipos Sueldo', 'activo', 3),
            ('1.1.06', 'IVA Crédito Fiscal', 'activo', 3),
            ('1.1.09', 'Inventario MP/Mercaderías', 'activo', 3),
            ('2', 'PASIVO', 'pasivo', 1), 
            ('2.1', 'Pasivo Circulante', 'pasivo', 2), 
            ('2.1.01', 'Cuentas x Pagar', 'pasivo', 3), 
            ('2.1.02', 'IVA Débito Fiscal', 'pasivo', 3),
            ('2.1.03', 'Retenciones x Pagar', 'pasivo', 3),
            ('3', 'PATRIMONIO', 'patrimonio', 1),
            ('3.1', 'Capital', 'patrimonio', 2),
            ('3.1.01', 'Capital Social', 'patrimonio', 3),
            ('4', 'INGRESOS', 'ingreso', 1), 
            ('4.1', 'Ventas', 'ingreso', 2), 
            ('4.1.01', 'Ingresos x Ventas', 'ingreso', 3),
            ('5', 'COSTOS Y GASTOS', 'gasto', 1), 
            ('5.1', 'Costos de Venta', 'costo', 2), 
            ('5.1.01', 'Costo Mercaderías / Comisión', 'costo', 3), 
            ('5.2', 'Gastos Adm.', 'gasto', 2), 
            ('5.2.01', 'Gastos Generales', 'gasto', 3),
            ('5.2.02', 'Honorarios Profesionales', 'gasto', 3),
            ('5.1.02', 'Costo de Insumos / Producción', 'costo', 3)
            ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre;
        `;
        const { error } = await supabase.rpc('exec_sql', { sql });
        if (error) throw error;
        res.json({ success: true, message: 'Migration successful' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== MIGRATE "OTROS" ITEM TO RAW MATERIALS ==========
app.post('/api/purchase-items/migrate-to-mp', authenticateToken, async (req, res) => {
    const { item_id, custom_name, unit_price } = req.body;
    try {
        // Generate code for eventual item: EVT-XXX
        const { data: existing } = await supabase.from(T.MP).select('code').like('code', 'EVT-%').order('code', { ascending: false }).limit(1);
        let nextNum = 1;
        if (existing && existing.length > 0) {
            const lastCode = existing[0].code;
            const num = parseInt(lastCode.replace('EVT-', ''));
            if (!isNaN(num)) nextNum = num + 1;
        }
        const newCode = `EVT-${String(nextNum).padStart(3, '0')}`;

        // Create the raw material
        const { error: mpError } = await supabase.from(T.MP).insert({
            code: newCode,
            name: custom_name || 'Producto Eventual',
            unit: 'UN',
            cost_net: unit_price || 0,
            stock: 0
        });
        if (mpError) throw mpError;

        // Update the purchase item to point to the new code
        if (item_id) {
            await supabase.from(T.PURCHASE_ITEMS).update({ mp_code: newCode }).eq('id', item_id);
        }

        res.json({ success: true, message: `Migrado como ${newCode}: ${custom_name}`, code: newCode });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get(['/api/history/purchases', '/api/purchases'], authenticateToken, async (req, res) => {
    try {
        const { data: history, error } = await supabase
            .from(T.PURCHASES)
            .select('*')
            .eq('empresa_id', req.empresa_id)
            .order('date', { ascending: false });

        if (error) throw error;

        // Fetch lookup tables
        const [provs, accs, quotes] = await Promise.all([
            supabase.from(T.PROVIDERS).select('id, name, rut').eq('empresa_id', req.empresa_id),
            supabase.from(T.ACCOUNTS).select('id, name').eq('empresa_id', req.empresa_id),
            supabase.from(T.QUOTATIONS).select(`id, name, purchase_order_id, clients:${T.CLIENTS}(name)`).eq('empresa_id', req.empresa_id).limit(1000)
        ]);

        const provMap = {}; provs.data?.forEach(p => provMap[p.id] = { name: p.name, rut: p.rut });
        const accMap = {}; accs.data?.forEach(a => accMap[a.id] = a.name);
        const quoteMap = {}; quotes.data?.forEach(q => {
            const clientName = Array.isArray(q.clients) ? q.clients[0]?.name : q.clients?.name;
            quoteMap[q.id] = {
                name: q.name,
                oc: q.purchase_order_id,
                client: clientName
            };
        });

        const fullHistory = [];
        for (const p of history) {
            const provInfo = provMap[p.provider_id] || { name: '?', rut: '76.000.000-1' };
            let items = [];
            const { data: itemData } = await supabase
                .from(T.PURCHASE_ITEMS)
                .select(`*, raw_materials:"${T.MP}"(name, color, size)`)
                .eq('purchase_id', p.id);

            if (itemData) {
                items = itemData.map(i => ({
                    ...i,
                    mp_name: i.raw_materials?.name || '?',
                    color: i.raw_materials?.color,
                    size: i.raw_materials?.size
                }));
            }

            const qData = quoteMap[p.quotation_id];
            let projectName = p.project_ref || 'N/A';
            if (qData) {
                projectName = qData.name;
                if (qData.client) projectName += ` — 👤 ${qData.client}`;
            }

            fullHistory.push({
                ...p,
                provider_name: provInfo.name,
                provider_rut: provInfo.rut,
                account_name: accMap[p.account_id] || 'N/A',
                project_name: projectName,
                purchase_order_id: qData?.oc || null,
                items: items
            });
        }
        res.json(fullHistory);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get(['/api/history/sales', '/api/sales'], authenticateToken, async (req, res) => {
    const { data: history, error } = await supabase
        .from(T.SALES)
        .select(`*, clients:"${T.CLIENTS}"(name, rut)`)
        .eq('empresa_id', req.empresa_id)
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
            client_rut: s.clients?.rut,
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
        .eq('empresa_id', req.empresa_id)
        .order('date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Build quotation lookup for project names and totals
    const { data: quotes } = await supabase.from(T.QUOTATIONS).select('id, name, purchase_order_id, total_price_gross').eq('empresa_id', req.empresa_id).limit(1000);
    const quoteMap = {};
    quotes?.forEach(q => quoteMap[q.id] = { name: q.name, oc: q.purchase_order_id, total: q.total_price_gross });

    const fullHistory = [];
    for (const p of history) {
        const { data: items } = await supabase
            .from(T.PRODUCTION_ITEMS)
            .select(`*, products:"${T.PRODUCTS}"(name, color, size)`)
            .eq('production_id', p.id);

        fullHistory.push({
            ...p,
            project_name: quoteMap[p.quotation_id]?.name || null,
            purchase_order_id: quoteMap[p.quotation_id]?.oc || null,
            quotation_total: quoteMap[p.quotation_id]?.total || 0,
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
    const { providerId, items, net, iva, total, payment_method, account_id, document_type, type, description, quotation_id, project_ref, purchase_category, document_number, centro_costo_id, auto_pay } = req.body;
    const date = req.body.date || new Date().toISOString().split('T')[0];

    try {
        // Base object with guaranteed columns
        const purchaseData = {
            date,
            provider_id: providerId || null,
            net, iva, total,
            document_number: document_number || null,
            empresa_id: req.empresa_id,
            paid_amount: auto_pay ? total : 0,
            payment_status: auto_pay ? 'pagado' : 'pendiente'
        };

        // Try to insert with ALL columns first
        const fullData = {
            ...purchaseData,
            type: type || 'mp',
            description: description || null,
            quotation_id: (quotation_id && !isNaN(quotation_id)) ? quotation_id : null,
            project_ref: project_ref || null,
            purchase_category: purchase_category || 'general',
            centro_costo_id: centro_costo_id || null
        };

        let result = await supabase.from(T.PURCHASES).insert(fullData).select().single();

        if (result.error && result.error.message.includes('column')) {
            console.warn("Retrying purchase insert without new columns...", result.error.message);
            const { project_ref: _p, purchase_category: _c, document_number: _dn, quotation_id: _qid, centro_costo_id: _cc, ...fallbackData } = fullData;
            result = await supabase.from(T.PURCHASES).insert({ ...fallbackData, empresa_id: req.empresa_id }).select().single();
        }

        if (result.error) throw result.error;
        const purchase = result.data;

        if (type === 'mp' && items && items.length > 0) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.mpCode && item.quantity > 0) {
                    const insertItem = {
                        purchase_id: purchase.id,
                        item_number: i + 1,
                        mp_code: item.mpCode,
                        quantity: item.quantity,
                        unit_price: item.unitPrice,
                        subtotal: item.subtotal
                    };

                    // For "Otros" items, store custom name and skip stock
                    if (item.mpCode === '__otros__') {
                        insertItem.custom_name = item.customName || 'Producto Eventual';
                        insertItem.mp_code = '__otros__';
                        try {
                            await supabase.from(T.PURCHASE_ITEMS).insert(insertItem);
                        } catch (e) {
                            // If custom_name column doesn't exist yet, retry without it
                            delete insertItem.custom_name;
                            await supabase.from(T.PURCHASE_ITEMS).insert(insertItem);
                        }
                    } else {
                        await supabase.from(T.PURCHASE_ITEMS).insert(insertItem);

                        // Update stock only for real raw materials
                        const { data: rm } = await supabase.from(T.MP).select('stock').eq('code', item.mpCode).single();
                        await supabase.from(T.MP).update({ stock: (rm?.stock || 0) + item.quantity }).eq('code', item.mpCode);
                    }
                }
            }
        }

        // Create Accounting Entry
        let finalPaymentMethod = payment_method;
        if (account_id) {
            const { data: acc } = await supabase.from(T.ACCOUNTS).select('type').eq('id', account_id).single();
            if (acc?.type === 'credit') finalPaymentMethod = 'credit';
            else if (acc?.type === 'debit') finalPaymentMethod = 'transfer';
        }

        // SIEMPRE usar 2.1.01 (Cuentas por Pagar) para el asiento original (Devengo)
        const paymentAccount = '2.1.01';

        const docRef = document_number || purchase.id;
        const glosa = type === 'expense' ? `Gasto: ${description} (Doc #${docRef})` : `Compra a proveedor (Doc #${docRef})`;
        const inventoryAccount = type === 'expense' ? '5.1.02' : '1.1.09'; 

        let centroCostoId = centro_costo_id || null;
        if (!centroCostoId && type === 'mp') {
            const { data: cc } = await supabase.from(T.COST_CENTERS).select('id').eq('codigo', 'OPER').single();
            centroCostoId = cc?.id || null;
        }

        const journalLines = [
            { account_code: inventoryAccount, debit: net, glosa: glosa, centro_costo_id: centroCostoId },
            { account_code: paymentAccount, credit: total, glosa: glosa }
        ];

        if (iva > 0) {
            journalLines.push({ account_code: '1.1.06', debit: iva, glosa: `IVA Crédito #${docRef}`, centro_costo_id: centroCostoId });
        }

        await createAccountingEntry({
            date,
            description: glosa,
            type: type === 'expense' ? 'gasto' : ((quotation_id || project_ref) ? 'compra_pull' : 'compra_push'),
            document_number: purchase.id.toString(),
            userId: req.user.id,
            empresaId: req.empresa_id,
            lines: journalLines
        });

        // 2. Si se marcó AUTO_PAY, crear el asiento de PAGO inmediatamente
        if (auto_pay) {
            let realPaymentAccount = '1.1.01'; // Caja
            if (finalPaymentMethod === 'transfer' || finalPaymentMethod === 'debit' || finalPaymentMethod === 'transferencia') {
                realPaymentAccount = '1.1.02'; // Bancos
            }

            await createAccountingEntry({
                date,
                description: `Pago automático al contado (Doc #${docRef})`,
                type: 'pago_compra_auto',
                document_number: purchase.id.toString(),
                userId: req.user.id,
                empresaId: req.empresa_id,
                lines: [
                    { account_code: '2.1.01', debit: total, glosa: `Limpieza pasivo Doc #${docRef}` },
                    { account_code: realPaymentAccount, credit: total, glosa: `Pago efectivo Doc #${docRef}` }
                ]
            });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== REGISTER PAYMENT / ABONO ON PURCHASE ==========
app.post('/api/purchases/:id/payment', authenticateToken, async (req, res) => {
    const purchaseId = req.params.id;
    const { amount, payment_method, date, description } = req.body;
    const paymentDate = date || new Date().toISOString().split('T')[0];

    try {
        if (!amount || amount <= 0) throw new Error('El monto del abono debe ser mayor a 0');

        // Get current purchase
        const { data: purchase, error: fetchErr } = await supabase
            .from(T.PURCHASES).select('*').eq('id', purchaseId).single();
        if (fetchErr || !purchase) throw new Error('Compra no encontrada');

        const currentPaid = parseFloat(purchase.paid_amount || 0);
        const total = parseFloat(purchase.total || 0);
        const newPaid = currentPaid + parseFloat(amount);
        const remaining = total - newPaid;

        if (remaining < -1) throw new Error(`El abono ($${amount}) excede el saldo pendiente ($${total - currentPaid})`);

        const newStatus = remaining <= 0 ? 'pagado' : (newPaid > 0 ? 'parcial' : 'pendiente');

        // Update purchase
        const { error: updateErr } = await supabase.from(T.PURCHASES).update({
            paid_amount: newPaid,
            payment_status: newStatus
        }).eq('id', purchaseId);
        if (updateErr) throw updateErr;

        // Determine accounting account based on payment method
        let paymentAccount = '1.1.01'; // Default: Caja
        if (payment_method === 'transferencia' || payment_method === 'transfer' || payment_method === 'debit') {
            paymentAccount = '1.1.02'; // Bancos
        }

        // Get provider name for glosa
        let provName = 'Proveedor';
        if (purchase.provider_id) {
            const { data: prov } = await supabase.from(T.PROVIDERS).select('name').eq('id', purchase.provider_id).single();
            if (prov) provName = prov.name;
        }

        const docRef = purchase.document_number || purchaseId;
        const abonoNum = remaining <= 0 ? '(Pago Total)' : `(Abono $${parseInt(amount).toLocaleString()})`;

        // Create accounting entry — Debit CxP, Credit Bank/Cash
        await createAccountingEntry({
            date: paymentDate,
            description: `Pago Compra ${abonoNum} — ${provName} Doc #${docRef}${description ? ' — ' + description : ''}`,
            type: 'pago_compra',
            document_number: purchaseId.toString(),
            userId: req.user.id,
            empresaId: req.empresa_id,
            lines: [
                { account_code: '2.1.01', debit: parseFloat(amount), glosa: `Abono a factura ${docRef}` },
                { account_code: paymentAccount, credit: parseFloat(amount), glosa: `Pago a ${provName}` }
            ]
        });

        res.json({
            success: true,
            message: remaining <= 0 ? 'Compra pagada completamente' : `Abono registrado. Saldo pendiente: $${Math.max(0, remaining).toLocaleString()}`,
            payment_status: newStatus,
            paid_amount: newPaid,
            remaining: Math.max(0, remaining)
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== REGISTER PAYMENT / ABONO ON SALE ==========
app.post('/api/sales/:id/payment', authenticateToken, async (req, res) => {
    const saleId = req.params.id;
    const { amount, payment_method, date, description } = req.body;
    const paymentDate = date || new Date().toISOString().split('T')[0];

    try {
        if (!amount || amount <= 0) throw new Error('El monto del abono debe ser mayor a 0');

        const { data: sale, error: fetchErr } = await supabase
            .from(T.SALES).select(`*, clients:"${T.CLIENTS}"(name)`).eq('id', saleId).single();
        if (fetchErr || !sale) throw new Error('Venta no encontrada');

        const currentPaid = parseFloat(sale.paid_amount || 0);
        const total = parseFloat(sale.total || 0);
        const newPaid = currentPaid + parseFloat(amount);
        const remaining = total - newPaid;

        if (remaining < -1) throw new Error(`El cobro ($${amount}) excede el saldo pendiente ($${total - currentPaid})`);

        const newStatus = remaining <= 0 ? 'pagado' : (newPaid > 0 ? 'parcial' : 'pendiente');

        const { error: updateErr } = await supabase.from(T.SALES).update({
            paid_amount: newPaid,
            payment_status: newStatus
        }).eq('id', saleId);
        if (updateErr) throw updateErr;

        let paymentAccount = '1.1.01';
        if (payment_method === 'transferencia' || payment_method === 'transfer' || payment_method === 'debit') {
            paymentAccount = '1.1.02';
        }

        const clientName = sale.clients?.name || 'Cliente';
        const docRef = sale.document_number || saleId;
        const abonoNum = remaining <= 0 ? '(Cobro Total)' : `(Cobro $${parseInt(amount).toLocaleString()})`;

        await createAccountingEntry({
            date: paymentDate,
            description: `Cobro Venta ${abonoNum} — ${clientName} Doc #${docRef}${description ? ' — ' + description : ''}`,
            type: 'cobro_venta',
            document_number: saleId.toString(),
            userId: req.user.id,
            empresaId: req.empresa_id,
            lines: [
                { account_code: paymentAccount, debit: parseFloat(amount), glosa: `Cobro de ${clientName}` },
                { account_code: '1.1.03', credit: parseFloat(amount), glosa: `Abono a cuenta por cobrar ${docRef}` }
            ]
        });

        res.json({
            success: true,
            message: remaining <= 0 ? 'Venta cobrada completamente' : `Cobro registrado. Saldo pendiente: $${Math.max(0, remaining).toLocaleString()}`,
            payment_status: newStatus,
            paid_amount: newPaid,
            remaining: Math.max(0, remaining)
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});


// ========== UPDATE PURCHASE (with accounting recalculation) ==========
app.put('/api/purchases/:id', authenticateToken, async (req, res) => {
    const purchaseId = req.params.id;
    debugLog(`--- HIT: PUT /api/purchases/${purchaseId} ---`);
    const { providerId, items, net, iva, total, payment_method, account_id, document_type, type, description, quotation_id, project_ref, purchase_category, centro_costo_id, auto_pay } = req.body;
    const date = req.body.date || new Date().toISOString().split('T')[0];

    try {
        // 1. Get old items to reverse stock
        const { data: oldItems } = await supabase.from(T.PURCHASE_ITEMS).select('*').eq('purchase_id', purchaseId);
        if (oldItems) {
            for (const it of oldItems) {
                const { data: rm } = await supabase.from(T.MP).select('stock').eq('code', it.mp_code).single();
                if (rm) {
                    const oldQty = Number(it.quantity) || 0;
                    await supabase.from(T.MP).update({ stock: Math.max(0, (rm.stock || 0) - oldQty) }).eq('code', it.mp_code);
                }
            }
        }

        // 2. Update purchase record (Robustly)
        const purchaseData = {
            provider_id: providerId || req.body.provider_id || null,
            date: date || new Date().toISOString().split('T')[0],
            net, iva, total,
            paid_amount: auto_pay ? total : 0,
            payment_status: auto_pay ? 'pagado' : 'pendiente',
            payment_method: payment_method || null,
            account_id: account_id || null,
            document_type: document_type || 'factura',
            document_number: req.body.document_number || null
        };

        const fullUpdate = {
            ...purchaseData,
            type: type || 'mp',
            description: description || null,
            quotation_id: (quotation_id && !isNaN(Number(quotation_id))) ? Number(quotation_id) : null,
            project_ref: project_ref || null,
            purchase_category: purchase_category || 'general',
            centro_costo_id: (typeof centro_costo_id === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(centro_costo_id)) ? centro_costo_id : null,
            net: Number(net) || 0,
            iva: Number(iva) || 0,
            total: Number(total) || 0
        };

        let result = await supabase.from(T.PURCHASES).update(fullUpdate).eq('id', purchaseId).eq('empresa_id', req.empresa_id);

        if (result.error && result.error.message.includes('column')) {
            console.warn("Retrying purchase update without new columns...");
            const { project_ref: _p, purchase_category: _c, centro_costo_id: _cc, ...fallbackUpdate } = fullUpdate;
            result = await supabase.from(T.PURCHASES).update(fallbackUpdate).eq('id', purchaseId).eq('empresa_id', req.empresa_id);
        }
        if (result.error) throw result.error;

        // 3. Delete & Re-insert items + Add back to stock
        await supabase.from(T.PURCHASE_ITEMS).delete().eq('purchase_id', purchaseId);

        if (type === 'mp' && items && items.length > 0) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.mpCode && item.quantity > 0) {
                    const insertItem = {
                        purchase_id: purchaseId,
                        item_number: i + 1,
                        mp_code: item.mpCode,
                        quantity: item.quantity,
                        unit_price: item.unitPrice,
                        subtotal: item.subtotal
                    };

                    if (item.mpCode === '__otros__') {
                        insertItem.custom_name = item.customName || 'Producto Eventual';
                        insertItem.mp_code = '__otros__';
                        try {
                            await supabase.from(T.PURCHASE_ITEMS).insert(insertItem);
                        } catch (e) {
                            delete insertItem.custom_name;
                            await supabase.from(T.PURCHASE_ITEMS).insert(insertItem);
                        }
                    } else {
                        await supabase.from(T.PURCHASE_ITEMS).insert(insertItem);
                        const { data: rm } = await supabase.from(T.MP).select('stock').eq('code', item.mpCode).single();
                        if (rm) {
                            const newQty = Number(item.quantity) || 0;
                            await supabase.from(T.MP).update({ stock: (rm.stock || 0) + newQty }).eq('code', item.mpCode);
                        }
                    }
                }
            }
        }

        // 4. ELIMINAR asiento contable Pro antiguo para esta compra
        const { data: oldEntriesPro } = await supabase
            .from(T.PC_ASIENTOS)
            .select('id')
            .eq('referencia_id', purchaseId.toString())
            .in('tipo_origen', ['compra', 'compra_push', 'compra_pull', 'gasto', 'erp_compra', 'pago_compra_auto']);

        if (oldEntriesPro && oldEntriesPro.length > 0) {
            const proIds = oldEntriesPro.map(e => e.id);
            await supabase.from(T.PC_MOVIMIENTOS).delete().in('asiento_id', proIds).eq('empresa_id', req.empresa_id);
            await supabase.from(T.PC_ASIENTOS).delete().in('id', proIds).eq('empresa_id', req.empresa_id);
        }

        // Create accounting entry
        debugLog(`Processing accounting for purchase ${purchaseId}...`, { type, payment_method, account_id, total, net, iva });
        
        let finalPaymentMethod = payment_method;
        if (account_id) {
            const { data: acc } = await supabase.from(T.ACCOUNTS).select('type').eq('id', account_id).single();
            if (acc?.type === 'credit') finalPaymentMethod = 'credit';
            else if (acc?.type === 'debit') finalPaymentMethod = 'transfer';
            debugLog('Detected payment account type:', acc?.type);
        }

        // SIEMPRE usar 2.1.01 para el Devengo
        const paymentAccount = '2.1.01';

        // Obtener Centro de Costos "Operaciones" si es producción y no se envió uno
        let centroCostoId = centro_costo_id || null;
        const isUUID = (str) => typeof str === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
        if (centroCostoId && !isUUID(centroCostoId)) {
            centroCostoId = null;
        }

        if (!centroCostoId && type === 'mp') {
            const { data: cc } = await supabase.from(T.COST_CENTERS).select('id').eq('codigo', 'OPER').single();
            centroCostoId = cc?.id || null;
            debugLog('Using default cost center Operaciones:', centroCostoId);
        }

        const docRef = req.body.document_number || purchaseId;
        const glosa = type === 'expense' ? `Gasto: ${description} (Doc #${docRef})` : `Compra a proveedor (Doc #${docRef})`;
        const inventoryAccount = type === 'expense' ? '5.1.02' : '1.1.09';

        const journalLines = [
            { account_code: inventoryAccount, debit: Number(net) || 0, glosa: glosa, centro_costo_id: centroCostoId },
            { account_code: paymentAccount, credit: Number(total) || 0, glosa: glosa }
        ];

        if (Number(iva) > 0) {
            journalLines.push({ account_code: '1.1.06', debit: Number(iva) || 0, glosa: `IVA Crédito #${docRef}`, centro_costo_id: centroCostoId });
        }

        debugLog('Ready to create accounting entry with lines:', journalLines);

        const acResult = await createAccountingEntry({
            date,
            description: glosa,
            type: type === 'expense' ? 'gasto' : ((quotation_id || project_ref) ? 'compra_pull' : 'compra_push'),
            document_number: purchaseId.toString(),
            userId: req.user.id,
            empresaId: req.empresa_id,
            lines: journalLines
        });

        if (!acResult.success) {
            debugLog('Accounting Entry Fail in Purchase Endpoint:', acResult.error);
            throw new Error(`Contabilidad: ${acResult.error}`);
        }

        // 5. Si se marcó AUTO_PAY, crear el asiento de PAGO inmediatamente
        if (auto_pay) {
            let realPaymentAccount = '1.1.01'; // Caja
            if (finalPaymentMethod === 'transfer' || finalPaymentMethod === 'debit' || finalPaymentMethod === 'transferencia') {
                realPaymentAccount = '1.1.02'; // Bancos
            }

            const cleanTotal = Number(total) || 0;
            await createAccountingEntry({
                date,
                description: `Pago automático al contado (Doc #${docRef})`,
                type: 'pago_compra_auto',
                document_number: purchaseId.toString(),
                userId: req.user.id,
                empresaId: req.empresa_id,
                lines: [
                    { account_code: '2.1.01', debit: cleanTotal, glosa: `Limpieza pasivo Doc #${docRef}` },
                    { account_code: realPaymentAccount, credit: cleanTotal, glosa: `Pago efectivo Doc #${docRef}` }
                ]
            });

            // Asegurar que el registro de compra quede como PAGADA en el ERP
            await supabase.from(T.PURCHASES).update({
                paid_amount: cleanTotal,
                payment_status: 'pagado'
            }).eq('id', purchaseId);
        }

        debugLog('Accounting Entry SUCCESS for Purchase:', purchaseId);
        res.json({ success: true, message: 'Compra actualizada y contabilidad recalculada exitosamente.' });
    } catch (e) {
        debugLog(`ERROR in PUT /api/purchases/${req.params.id}:`, e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/purchases/:id', authenticateToken, async (req, res) => {
    const purchaseId = req.params.id;
    debugLog(`--- HIT: DELETE /api/purchases/${purchaseId} ---`);

    try {
        // 1. Get purchase info to reverse stock
        const { data: purchase } = await supabase.from(T.PURCHASES).select('*').eq('id', purchaseId).eq('empresa_id', req.empresa_id).single();
        if (!purchase) return res.status(404).json({ success: false, error: 'Compra no encontrada' });

        // 2. Reverse stock for items
        const { data: items } = await supabase.from(T.PURCHASE_ITEMS).select('*').eq('purchase_id', purchaseId);
        if (items) {
            for (const it of items) {
                if (it.mp_code && it.mp_code !== '__otros__') {
                    const { data: rm } = await supabase.from(T.MP).select('stock').eq('code', it.mp_code).single();
                    if (rm) {
                        const qty = Number(it.quantity) || 0;
                        await supabase.from(T.MP).update({ stock: Math.max(0, (rm.stock || 0) - qty) }).eq('code', it.mp_code);
                    }
                }
            }
        }

        // 3. Delete Accounting Entries
        const { data: entries } = await supabase
            .from(T.PC_ASIENTOS)
            .select('id')
            .eq('referencia_id', purchaseId.toString())
            .in('tipo_origen', ['compra', 'compra_push', 'compra_pull', 'gasto', 'erp_compra', 'pago_compra_auto']);

        if (entries && entries.length > 0) {
            const ids = entries.map(e => e.id);
            await supabase.from(T.PC_MOVIMIENTOS).delete().in('asiento_id', ids).eq('empresa_id', req.empresa_id);
            await supabase.from(T.PC_ASIENTOS).delete().in('id', ids).eq('empresa_id', req.empresa_id);
        }

        // 4. Delete Purchase Items & Header
        await supabase.from(T.PURCHASE_ITEMS).delete().eq('purchase_id', purchaseId);
        const { error: delErr } = await supabase.from(T.PURCHASES).delete().eq('id', purchaseId).eq('empresa_id', req.empresa_id);
        
        if (delErr) throw delErr;

        res.json({ success: true, message: 'Compra eliminada y stock revertido correctamente.' });
    } catch (e) {
        debugLog(`ERROR in DELETE /api/purchases/${purchaseId}:`, e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/sales/:id', authenticateToken, async (req, res) => {
    const saleId = req.params.id;
    debugLog(`--- HIT: DELETE /api/sales/${saleId} ---`);

    try {
        // 1. Get sale info and items to reverse stock
        const { data: sale } = await supabase.from(T.SALES).select('*').eq('id', saleId).eq('empresa_id', req.empresa_id).single();
        if (!sale) return res.status(404).json({ success: false, error: 'Venta no encontrada' });

        const { data: items } = await supabase.from(T.SALE_ITEMS).select('*').eq('sale_id', saleId);
        if (items) {
            for (const it of items) {
                if (it.product_code) {
                    const { data: p } = await supabase.from(T.PRODUCTS).select('stock').eq('code', it.product_code).single();
                    if (p) {
                        const qty = Number(it.quantity) || 0;
                        await supabase.from(T.PRODUCTS).update({ stock: (p.stock || 0) + qty }).eq('code', it.product_code);
                    }
                }
            }
        }

        // 2. Delete Accounting Entries
        const { data: entries } = await supabase
            .from(T.PC_ASIENTOS)
            .select('id')
            .eq('referencia_id', saleId.toString())
            .in('tipo_origen', ['venta_push', 'venta_pull', 'pago_venta_auto']);

        if (entries && entries.length > 0) {
            const entryIds = entries.map(e => e.id);
            await supabase.from(T.PC_MOVIMIENTOS).delete().in('asiento_id', entryIds).eq('empresa_id', req.empresa_id);
            await supabase.from(T.PC_ASIENTOS).delete().in('id', entryIds).eq('empresa_id', req.empresa_id);
        }

        // 3. Delete sale items and sale record
        await supabase.from(T.SALE_ITEMS).delete().eq('sale_id', saleId);
        const { error: delErr } = await supabase.from(T.SALES).delete().eq('id', saleId).eq('empresa_id', req.empresa_id);
        
        if (delErr) throw delErr;

        res.json({ success: true, message: 'Venta eliminada y stock revertido correctamente.' });
    } catch (e) {
        debugLog(`ERROR in DELETE /api/sales/${saleId}:`, e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/sales', authenticateToken, async (req, res) => {
    const { clientId, items, net, iva, total, discount, commission, payment_method, account_id, is_iva_exempt, machine_id, event_name, category, quotation_id, document_number, document_type, auto_collect } = req.body;
    const date = req.body.date || new Date().toISOString().split('T')[0];

    try {
        let payload = {
            date,
            client_id: clientId || null,
            net, iva, total,
            discount: discount || 0,
            commission: commission || 0,
            payment_method: payment_method || null,
            account_id: account_id || null,
            is_iva_exempt: is_iva_exempt || false,
            machine_id: machine_id || null,
            event_name: event_name || null,
            transferred: false,
            document_number: document_number || null,
            paid_amount: auto_collect ? total : 0,
            payment_status: auto_collect ? 'pagado' : 'pendiente'
        };

        let { data: sale, error: sError } = await supabase.from(T.SALES).insert({ ...payload, category, quotation_id, empresa_id: req.empresa_id }).select().single();

        // If some columns are missing, retry without them
        if (sError && sError.message.includes('column')) {
            console.warn("Retrying sale insert without extended columns...", sError.message);
            const { category: _cat, quotation_id: _qid, commission: _comm, discount: _disc, document_number: _dn, ...fallbackPayload } = payload;
            const retryReq = await supabase.from(T.SALES).insert({ ...fallbackPayload, empresa_id: req.empresa_id }).select().single();
            sale = retryReq.data;
            sError = retryReq.error;
        }

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
        debugLog('Processing accounting for new SALE...', { total, net, iva, payment_method });
        // SIEMPRE usar 1.1.03 (Cuentas por Cobrar) para el Devengo de Venta
        const mainDebitAccount = '1.1.03';
        const commissionAmount = commission || 0;
        const discountAmount = discount || 0;
        
        const docRef = document_number || sale.id;
        const journalLines = [
            { account_code: mainDebitAccount, debit: total - commissionAmount, glosa: `Venta #${docRef} (${payment_method})` },
            { account_code: '4.1.01', credit: net - discountAmount, glosa: `Ingreso neto venta #${docRef}` }
        ];

        if (commissionAmount > 0) {
            journalLines.push({ account_code: '5.1.01', debit: commissionAmount, glosa: `Comisión máquina venta #${docRef}` });
        }

        if (!is_iva_exempt && iva > 0) {
            journalLines.push({ account_code: '2.1.02', credit: iva, glosa: `IVA Débito venta #${docRef}` });
        }

        debugLog('Sale accounting lines ready:', journalLines);

        const acResult = await createAccountingEntry({
            date,
            description: `Venta de productos (${event_name || 'General'})`,
            type: 'venta_' + (category || 'push'),
            document_number: sale.id.toString(),
            userId: req.user.id,
            empresaId: req.empresa_id,
            lines: journalLines
        });

        // 2. Si se marcó AUTO_COLLECT, crear el asiento de COBRO inmediatamente
        if (auto_collect) {
            let realCashAccount = '1.1.01'; // Caja
            if (['transfer', 'machine', 'debit', 'transferencia', 'tarjeta'].includes(payment_method)) {
                realCashAccount = '1.1.02'; // Bancos
            }

            await createAccountingEntry({
                date,
                description: `Cobro automático al contado (Doc #${docRef})`,
                type: 'pago_venta_auto',
                document_number: sale.id.toString(),
                userId: req.user.id,
                empresaId: req.empresa_id,
                lines: [
                    { account_code: realCashAccount, debit: total, glosa: `Ingreso efectivo Doc #${docRef}` },
                    { account_code: '1.1.03', credit: total, glosa: `Limpieza CxC Doc #${docRef}` }
                ]
            });
        }

        if (!acResult.success) {
            debugLog('Accounting Entry Fail in Create SALE Endpoint:', acResult.error);
        } else {
            debugLog('Accounting Entry SUCCESS for new SALE');
        }

        res.json({ success: true, message: 'Venta registrada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== UPDATE SALE (with accounting recalculation) ==========
app.put('/api/sales/:id', authenticateToken, async (req, res) => {
    const saleId = req.params.id;
    debugLog(`--- HIT: PUT /api/sales/${saleId} ---`);
    const { clientId, items, net, iva, total, discount, commission, payment_method, account_id, is_iva_exempt, machine_id, event_name, category, quotation_id, document_number, document_type } = req.body;
    const dateFromBody = req.body.date || req.body.fecha;

    try {
        // 1. Get current sale date for accounting fallback if not provided in body
        const { data: existingSale } = await supabase.from(T.SALES).select('date').eq('id', saleId).single();
        const targetDate = dateFromBody || (existingSale?.date ? existingSale.date.split('T')[0] : new Date().toISOString().split('T')[0]);

        // 2. Update sale record
        let updatePayload = {
            date: targetDate,
            client_id: clientId || req.body.client_id || null,
            net, iva, total,
            discount: discount || 0,
            commission: commission || 0,
            payment_method: payment_method || null,
            account_id: account_id || null,
            is_iva_exempt: is_iva_exempt || false,
            machine_id: machine_id || null,
            event_name: event_name || null,
            document_number: document_number || null,
            paid_amount: (payment_method && payment_method !== 'credit') ? total : 0,
            payment_status: (payment_method && payment_method !== 'credit') ? 'pagado' : 'pendiente'
        };

        let { error: updateError } = await supabase.from(T.SALES).update({ ...updatePayload, category, quotation_id }).eq('id', saleId).eq('empresa_id', req.empresa_id);

        if (updateError && updateError.message.includes('column')) {
            console.warn("Retrying sale update without extended columns...", updateError.message);
            const { category: _cat, quotation_id: _qid, commission: _comm, discount: _disc, ...fallbackUpdate } = updatePayload;
            const retryReq = await supabase.from(T.SALES).update(fallbackUpdate).eq('id', saleId).eq('empresa_id', req.empresa_id);
            updateError = retryReq.error;
        }

        if (updateError) throw updateError;

        // 3. Delete existing sale items and insert new ones
        await supabase.from(T.SALE_ITEMS).delete().eq('sale_id', saleId);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.productCode && item.quantity > 0) {
                await supabase.from(T.SALE_ITEMS).insert({
                    sale_id: saleId,
                    item_number: i + 1,
                    product_code: item.productCode,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    subtotal: item.subtotal
                });
            }
        }

        // 4. ELIMINAR asiento contable Pro antiguo para esta venta
        const { data: oldEntriesPro } = await supabase
            .from(T.PC_ASIENTOS)
            .select('id')
            .eq('referencia_id', saleId.toString())
            .in('tipo_origen', ['venta', 'venta_push', 'venta_pull', 'erp_venta', 'pago_venta_auto']);

        if (oldEntriesPro && oldEntriesPro.length > 0) {
            const proIds = oldEntriesPro.map(e => e.id);
            await supabase.from(T.PC_MOVIMIENTOS).delete().in('asiento_id', proIds).eq('empresa_id', req.empresa_id);
            await supabase.from(T.PC_ASIENTOS).delete().in('id', proIds).eq('empresa_id', req.empresa_id);
        }

        // 5. CREATE new accounting entry with updated values
        debugLog(`Processing accounting for updated SALE ${saleId}...`, { total, net, iva, payment_method });
        // SIEMPRE usar 1.1.03 (Cuentas por Cobrar) para el Devengo de Venta
        const mainDebitAccount = '1.1.03';
        
        const docRef = document_number || saleId;
        const journalLines = [
            { account_code: mainDebitAccount, debit: total - commissionAmount, glosa: `Venta #${docRef} (${payment_method})` },
            { account_code: '4.1.01', credit: net - discountAmount, glosa: `Ingreso neto Venta #${docRef}` }
        ];

        if (commissionAmount > 0) {
            journalLines.push({ account_code: '5.1.01', debit: commissionAmount, glosa: `Comisión máquina Venta #${docRef}` });
        }

        if (!is_iva_exempt && (iva || 0) > 0) {
            journalLines.push({ account_code: '2.1.02', credit: iva, glosa: `IVA Débito Venta #${docRef}` });
        }

        debugLog('Updated sale accounting lines ready:', journalLines);

        const acResult = await createAccountingEntry({
            date: targetDate,
            description: `Venta de productos (${event_name || 'General'})`,
            type: 'venta_' + (category || 'push'),
            document_number: saleId.toString(),
            userId: req.user.id,
            empresaId: req.empresa_id,
            lines: journalLines
        });

        if (!acResult.success) {
            debugLog('Accounting Entry Fail in Update SALE Endpoint:', acResult.error);
            throw new Error(`Contabilidad: ${acResult.error}`);
        }

        debugLog('Accounting Entry SUCCESS for updated SALE:', saleId);

        // 6. Si NO es crédito, crear el asiento de COBRO inmediatamente
        if (payment_method && payment_method !== 'credit') {
            let realCashAccount = '1.1.01'; // Caja
            if (['transfer', 'machine', 'debit', 'transferencia', 'tarjeta'].includes(payment_method)) {
                realCashAccount = '1.1.02'; // Bancos
            }

            await createAccountingEntry({
                date: targetDate,
                description: `Cobro automático al contado (Doc #${docRef})`,
                type: 'pago_venta_auto',
                document_number: saleId.toString(),
                userId: req.user.id,
                empresaId: req.empresa_id,
                lines: [
                    { account_code: realCashAccount, debit: total, glosa: `Ingreso efectivo Doc #${docRef}` },
                    { account_code: '1.1.03', credit: total, glosa: `Limpieza CxC Doc #${docRef}` }
                ]
            });
        }

        res.json({ success: true, message: 'Venta actualizada y contabilidad recalculada exitosamente.' });
    } catch (e) {
        debugLog(`ERROR in PUT /api/sales/${req.params.id}:`, e.message);
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
            .eq('empresa_id', req.empresa_id)
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
            empresaId: req.empresa_id,
            lines: [
                { account_code: '1.1.02', debit: totalNetTransfer },      // Entra al Banco
                { account_code: '1.1.03', credit: totalNetTransfer }     // Sale de Fondos por Recaudar (ya neto)
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
    // Redirigir a la lógica unificada en /api/accounting/ledger preservando compatibilidad
    try {
        const { data: entries, error: eError } = await supabase
            .from(T.PC_ASIENTOS)
            .select('*')
            .eq('empresa_id', req.empresa_id)
            .order('fecha', { ascending: false });

        if (eError) throw eError;
        res.json(entries || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/production', authenticateToken, async (req, res) => {
    const { items, date, production_category, quotation_id, material_cost, general_expenses } = req.body;
    const productionDate = date || new Date().toISOString();

    try {
        const insertData = { date: productionDate, empresa_id: req.empresa_id };
        if (production_category) insertData.production_category = production_category;
        if (quotation_id && !isNaN(quotation_id)) insertData.quotation_id = parseInt(quotation_id);
        insertData.material_cost = material_cost || 0;
        insertData.general_expenses = general_expenses || 0;

        let result = await supabase
            .from(T.PRODUCTION)
            .insert(insertData)
            .select()
            .single();

        // Fallback if new columns don't exist yet
        if (result.error && result.error.message.includes('column')) {
            console.warn('Retrying production insert without new columns...', result.error.message);
            result = await supabase
                .from(T.PRODUCTION)
                .insert({ date: productionDate, empresa_id: req.empresa_id })
                .select()
                .single();
        }

        if (result.error) throw result.error;
        const prod = result.data;

        let totalProductionCost = 0;

        // --- PULL MODE: Subtract materials from linked quotation ---
        if (quotation_id && !isNaN(quotation_id)) {
            debugLog(`[PROD] PULL Production detected for Quote #${quotation_id}. Processing custom materials.`);
            const { data: quoteItems } = await supabase.from(T.QUOTE_ITEMS)
                .select('*')
                .eq('quotation_id', quotation_id)
                .eq('empresa_id', req.empresa_id);

            if (quoteItems) {
                for (const qItem of quoteItems) {
                    if (qItem.item_type === 'material') {
                        const code = qItem.item_code || qItem.description;
                        const qty = parseFloat(qItem.quantity) || 0;
                        const cost = parseFloat(qItem.total_cost) || 0;
                        
                        // Subtract from stock if we have a match in MP table
                        const { data: rm } = await supabase.from(T.MP).select('stock').eq('code', code).eq('empresa_id', req.empresa_id).maybeSingle();
                        if (rm) {
                            await supabase.from(T.MP).update({ stock: (parseFloat(rm.stock) || 0) - qty }).eq('code', code).eq('empresa_id', req.empresa_id);
                            await checkLowStockAlerts(code);
                        }
                        totalProductionCost += cost;
                    }
                }
            }
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const code = item.productCode;
            const qty = parseFloat(item.quantity) || 0;
            
            if (code && qty > 0) {
                const { error: itemError } = await supabase.from(T.PRODUCTION_ITEMS).insert({
                    production_id: prod.id,
                    item_number: i + 1,
                    product_code: code,
                    quantity: qty,
                    mo_cost: item.mo_cost || 0,
                    material_cost: item.material_cost || 0
                });
                if (itemError) throw new Error(`Error en ítem ${i + 1} (${code}): ${itemError.message}`);

                // --- STOCK IMPACT (ONLY IF NOT HANDLED BY QUOTE) ---
                
                // 1. Products (Add PT Stock)
                const { data: p } = await supabase.from(T.PRODUCTS).select('stock').eq('code', code).eq('empresa_id', req.empresa_id).maybeSingle();
                if (p) {
                    debugLog(`[PROD] Finished Product: ${code}. Adding ${qty}`);
                    await supabase.from(T.PRODUCTS).update({ stock: (parseFloat(p.stock) || 0) + qty }).eq('code', code).eq('empresa_id', req.empresa_id);

                    // If NOT in Pull mode, or if project items didn't cover it, use standard recipe
                    if (!quotation_id) {
                        const { data: recipes } = await supabase.from(T.RECIPES).select('mp_code, quantity, unit_cost').eq('product_code', code).eq('empresa_id', req.empresa_id);
                        if (recipes && recipes.length > 0) {
                            for (const r of recipes) {
                                const cQty = (parseFloat(r.quantity) || 0) * qty;
                                const cCost = (parseFloat(r.unit_cost) || 0) * qty;
                                totalProductionCost += cCost;
                                const { data: rmComp } = await supabase.from(T.MP).select('stock').eq('code', r.mp_code).eq('empresa_id', req.empresa_id).maybeSingle();
                                if (rmComp) {
                                    await supabase.from(T.MP).update({ stock: (parseFloat(rmComp.stock) || 0) - cQty }).eq('code', r.mp_code).eq('empresa_id', req.empresa_id).maybeSingle();
                                    await checkLowStockAlerts(r.mp_code);
                                }
                            }
                        }
                    }
                }
                
                // 2. Direct Materials (Only if not in Pull mode, to avoid double subtraction)
                if (!quotation_id) {
                    const { data: rmDir } = await supabase.from(T.MP).select('stock, type, cost_net').eq('code', code).eq('empresa_id', req.empresa_id).maybeSingle();
                    if (rmDir && rmDir.type === 'MP') {
                        await supabase.from(T.MP).update({ stock: (parseFloat(rmDir.stock) || 0) - qty }).eq('code', code).eq('empresa_id', req.empresa_id);
                        totalProductionCost += (parseFloat(rmDir.cost_net) || 0) * qty;
                        await checkLowStockAlerts(code);
                    }
                }
            }
        }

        // Create Accounting Entry for Consumption/Transformation
        if (totalProductionCost > 0) {
            await createAccountingEntry({
                date,
                description: `Consumo/Transformación Producción #${prod.id}`,
                type: 'consumo',
                userId: req.user.id,
                empresaId: req.empresa_id,
                lines: [
                    { account_code: '1.1.08', debit: Math.round(totalProductionCost) }, // Inventario PT (Activo +)
                    { account_code: '1.1.09', credit: Math.round(totalProductionCost) } // Inventario MP (Activo -)
                ]
            });
        }

        res.json({ success: true, message: 'Producción registrada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.put('/api/production/:id', authenticateToken, async (req, res) => {
    const prodId = req.params.id;
    const { items, date, production_category, quotation_id, material_cost, general_expenses } = req.body;
    const productionDate = date || new Date().toISOString();

    try {
        // 0. REVERSE OLD ACCOUNTING ENTRY
        await supabase.from(T.PC_ASIENTOS).delete()
            .eq('empresa_id', req.empresa_id)
            .ilike('description', `%Producción #${prodId}%`);

        // 1. REVERSE OLD STOCK IMPACT
        const { data: prodHeader } = await supabase.from(T.PRODUCTION).select('production_category, quotation_id').eq('id', prodId).single();
        const { data: oldItems } = await supabase.from(T.PRODUCTION_ITEMS).select('*').eq('production_id', prodId);

        // A. Reverse Quotation Materials (if PULL)
        if (prodHeader && prodHeader.production_category === 'pull' && prodHeader.quotation_id) {
            const { data: oldQuoteItems } = await supabase.from(T.QUOTE_ITEMS)
                .select('*').eq('quotation_id', prodHeader.quotation_id).eq('empresa_id', req.empresa_id);
            if (oldQuoteItems) {
                for (const qItem of oldQuoteItems) {
                    if (qItem.item_type === 'material') {
                        const code = qItem.item_code || qItem.description;
                        const qty = parseFloat(qItem.quantity) || 0;
                        const { data: rm } = await supabase.from(T.MP).select('stock').eq('code', code).eq('empresa_id', req.empresa_id).maybeSingle();
                        if (rm) {
                            await supabase.from(T.MP).update({ stock: (parseFloat(rm.stock) || 0) + qty }).eq('code', code).eq('empresa_id', req.empresa_id);
                        }
                    }
                }
            }
        }

        if (oldItems) {
            for (const item of oldItems) {
                const code = item.product_code;
                const qty = parseFloat(item.quantity) || 0;

                // B. Reverse Product/PT Impact (ONLY PT STOCK ADDITION)
                const { data: p } = await supabase.from(T.PRODUCTS).select('stock').eq('code', code).eq('empresa_id', req.empresa_id).maybeSingle();
                if (p) {
                    await supabase.from(T.PRODUCTS).update({ stock: (parseFloat(p.stock) || 0) - qty }).eq('code', code).eq('empresa_id', req.empresa_id);
                    
                    // IF NOT PULL: Reverse Recipe components
                    if (!prodHeader || prodHeader.production_category !== 'pull') {
                        const { data: recipes } = await supabase.from(T.RECIPES).select('mp_code, quantity').eq('product_code', code).eq('empresa_id', req.empresa_id);
                        if (recipes && recipes.length > 0) {
                            for (const r of recipes) {
                                const cQty = (parseFloat(r.quantity) || 0) * qty;
                                const { data: rmComp } = await supabase.from(T.MP).select('stock').eq('code', r.mp_code).eq('empresa_id', req.empresa_id).maybeSingle();
                                if (rmComp) {
                                    await supabase.from(T.MP).update({ stock: (parseFloat(rmComp.stock) || 0) + cQty }).eq('code', r.mp_code).eq('empresa_id', req.empresa_id);
                                }
                            }
                        }
                    }
                }

                // C. Reverse Direct Material Impact (IF NOT PULL)
                if (!prodHeader || prodHeader.production_category !== 'pull') {
                    const { data: rmDir } = await supabase.from(T.MP).select('stock, type').eq('code', code).eq('empresa_id', req.empresa_id).maybeSingle();
                    if (rmDir && rmDir.type === 'MP') {
                         await supabase.from(T.MP).update({ stock: (parseFloat(rmDir.stock) || 0) + qty }).eq('code', code).eq('empresa_id', req.empresa_id);
                    }
                }
            }
        }

        // 2. DELETE OLD ITEMS
        await supabase.from(T.PRODUCTION_ITEMS).delete().eq('production_id', prodId);

        // 3. UPDATE PRODUCTION HEADER
        const updateData = { date: productionDate, material_cost: material_cost || 0, general_expenses: general_expenses || 0 };
        if (production_category) updateData.production_category = production_category;
        if (quotation_id && !isNaN(quotation_id)) updateData.quotation_id = parseInt(quotation_id);

        let updateResult = await supabase.from(T.PRODUCTION).update(updateData).eq('id', prodId).eq('empresa_id', req.empresa_id);
        if (updateResult.error && updateResult.error.message.includes('column')) {
             delete updateData.material_cost;
             delete updateData.general_expenses;
             updateResult = await supabase.from(T.PRODUCTION).update(updateData).eq('id', prodId).eq('empresa_id', req.empresa_id);
        }
        if (updateResult.error) throw updateResult.error;

        // 4. INSERT NEW ITEMS AND APPLY NEW SMART IMPACT
        let totalProductionCost = 0;

        // --- PULL MODE: Subtract materials from linked quotation (New state) ---
        const finalQuoteId = parseInt(updateData.quotation_id || quotation_id);
        if ((updateData.production_category === 'pull' || production_category === 'pull') && finalQuoteId) {
            const { data: quoteItems } = await supabase.from(T.QUOTE_ITEMS)
                .select('*')
                .eq('quotation_id', finalQuoteId)
                .eq('empresa_id', req.empresa_id);

            if (quoteItems) {
                for (const qItem of quoteItems) {
                    if (qItem.item_type === 'material') {
                        const code = qItem.item_code || qItem.description;
                        const qty = parseFloat(qItem.quantity) || 0;
                        const cost = parseFloat(qItem.total_cost) || 0;
                        const { data: rm } = await supabase.from(T.MP).select('stock').eq('code', code).eq('empresa_id', req.empresa_id).maybeSingle();
                        if (rm) {
                            await supabase.from(T.MP).update({ stock: (parseFloat(rm.stock) || 0) - qty }).eq('code', code).eq('empresa_id', req.empresa_id);
                            await checkLowStockAlerts(code);
                        }
                        totalProductionCost += cost;
                    }
                }
            }
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const code = item.productCode;
            const qty = parseFloat(item.quantity) || 0;

            if (code && qty > 0) {
                const { error: itemError } = await supabase.from(T.PRODUCTION_ITEMS).insert({
                    production_id: prodId,
                    item_number: i + 1,
                    product_code: code,
                     quantity: qty,
                    mo_cost: item.mo_cost || 0,
                    material_cost: item.material_cost || 0
                });
                if (itemError) throw itemError;

                // --- NEW IMPACT ---
                
                // 1. Products (Add PT Stock)
                const { data: p } = await supabase.from(T.PRODUCTS).select('stock').eq('code', code).eq('empresa_id', req.empresa_id).maybeSingle();
                if (p) {
                    await supabase.from(T.PRODUCTS).update({ stock: (parseFloat(p.stock) || 0) + qty }).eq('code', code).eq('empresa_id', req.empresa_id);

                    // If NOT in Pull mode, or if project items didn't cover it, use standard recipe
                    if (updateData.production_category !== 'pull' && production_category !== 'pull') {
                        const { data: recipes } = await supabase.from(T.RECIPES).select('mp_code, quantity, unit_cost').eq('product_code', code).eq('empresa_id', req.empresa_id);
                        if (recipes && recipes.length > 0) {
                            for (const r of recipes) {
                                const cQty = (parseFloat(r.quantity) || 0) * qty;
                                const cCost = (parseFloat(r.unit_cost) || 0) * qty;
                                totalProductionCost += cCost;
                                const { data: rmComp } = await supabase.from(T.MP).select('stock').eq('code', r.mp_code).eq('empresa_id', req.empresa_id).maybeSingle();
                                if (rmComp) {
                                    await supabase.from(T.MP).update({ stock: (parseFloat(rmComp.stock) || 0) - cQty }).eq('code', r.mp_code).eq('empresa_id', req.empresa_id);
                                    await checkLowStockAlerts(r.mp_code);
                                }
                            }
                        }
                    }
                }
                
                // 2. Direct Materials (Only if not in Pull mode)
                if (updateData.production_category !== 'pull' && production_category !== 'pull') {
                    const { data: rmDir } = await supabase.from(T.MP).select('stock, type, cost_net').eq('code', code).eq('empresa_id', req.empresa_id).maybeSingle();
                    if (rmDir && rmDir.type === 'MP') {
                        await supabase.from(T.MP).update({ stock: (parseFloat(rmDir.stock) || 0) - qty }).eq('code', code).eq('empresa_id', req.empresa_id);
                        totalProductionCost += (parseFloat(rmDir.cost_net) || 0) * qty;
                        await checkLowStockAlerts(code);
                    }
                }
            }
        }

        // Create New Accounting Entry
        if (totalProductionCost > 0) {
            await createAccountingEntry({
                date: productionDate.split('T')[0],
                description: `Consumo/Transformación Producción #${prodId} (Editado)`,
                type: 'consumo',
                userId: req.user.id,
                empresaId: req.empresa_id,
                lines: [
                    { account_code: '1.1.08', debit: Math.round(totalProductionCost) }, // + PT
                    { account_code: '1.1.09', credit: Math.round(totalProductionCost) } // - MP
                ]
            });
        }

        res.json({ success: true, message: 'Producción actualizada con éxito (Stock Re-calculado)' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/production/:id', authenticateToken, async (req, res) => {
    const prodId = req.params.id;

    try {
        // 1. REVERSE STOCK IMPACT (Same logic as PUT)
        const { data: oldItems } = await supabase.from(T.PRODUCTION_ITEMS).select('*').eq('production_id', prodId);

        if (oldItems) {
            for (const item of oldItems) {
                // Subtract from PT stock
                const { data: p } = await supabase.from(T.PRODUCTS).select('stock').eq('code', item.product_code).single();
                if (p) {
                    await supabase.from(T.PRODUCTS).update({ stock: Math.max(0, (p.stock || 0) - item.quantity) }).eq('code', item.product_code);
                }

                // Add back to MP stock based on recipe (multi-tenant)
                const { data: recipe } = await supabase.from(T.RECIPES).select('mp_code, quantity').eq('product_code', item.product_code).eq('empresa_id', req.empresa_id);
                if (recipe) {
                    for (const r of recipe) {
                        const consumptionQty = (r.quantity * item.quantity);
                        const { data: rm } = await supabase.from(T.MP).select('stock').eq('code', r.mp_code).eq('empresa_id', req.empresa_id).single();
                        if (rm) {
                            await supabase.from(T.MP).update({ stock: (rm.stock || 0) + consumptionQty }).eq('code', r.mp_code).eq('empresa_id', req.empresa_id);
                        }
                    }
                }
            }
        }

        // 2. DELETE FROM PRODUCTION_ITEMS (Supabase should handle with CASCADE, but let's be explicit)
        await supabase.from(T.PRODUCTION_ITEMS).delete().eq('production_id', prodId);

        // 3. DELETE ACCOUNTING ENTRIES
        const { data: entries } = await supabase
            .from(T.ACCOUNTING_ENTRIES)
            .select('id')
            .eq('description', `Consumo de Materias Primas - Producción #${prodId}`)
            .eq('entry_type', 'consumo');

        if (entries && entries.length > 0) {
            const entryIds = entries.map(e => e.id);
            await supabase.from(T.ACCOUNTING_LINES).delete().in('asiento_id', entryIds).eq('empresa_id', req.empresa_id);
            await supabase.from(T.ACCOUNTING_ENTRIES).delete().in('id', entryIds).eq('empresa_id', req.empresa_id);
        }

        // 4. DELETE PRODUCTION HEADER (multi-tenant)
        const { error: deleteError } = await supabase.from(T.PRODUCTION).delete().eq('id', prodId).eq('empresa_id', req.empresa_id);
        if (deleteError) throw deleteError;

        res.json({ success: true, message: 'Producción eliminada y stock revertido correctamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- Logistics Routes ---
app.get('/api/logistics', authenticateToken, async (req, res) => {
    try {
        // Fetch logistics and include the purchase type if transaction_type matches 'compra'
        const { data, error } = await supabase
            .from(T.LOGISTICS)
            .select(`*, ${T.PURCHASES}(type)`)
            .eq('empresa_id', req.empresa_id)
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        // Filter: Only show if it's not a 'compra' OR if the source purchase is of type 'mp'
        const filteredData = (data || []).filter(l => {
            if (l.transaction_type === 'compra') {
                return l.compras?.type === 'mp';
            }
            return true; // Keep sales and other types
        });

        const fullHistory = [];
        for (const l of filteredData) {
            const { data: items } = await supabase
                .from(T.LOGISTICS_ITEMS)
                .select('*')
                .eq('logistics_id', l.id);
            fullHistory.push({ ...l, items: items || [] });
        }
        res.json(fullHistory);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/logistics', authenticateToken, async (req, res) => {
    const { type, transaction_type, transaction_id, entity_name, carrier_name, tracking_id, transport_cost, handling_cost, estimated_arrival, observations, items } = req.body;

    try {
        const { data: log, error: lError } = await supabase
            .from(T.LOGISTICS)
            .insert({
                type,
                transaction_type,
                transaction_id,
                entity_name,
                carrier_name,
                tracking_id,
                transport_cost,
                handling_cost,
                estimated_arrival,
                observations,
                empresa_id: req.empresa_id
            })
            .select()
            .single();

        if (lError) throw lError;

        if (items && items.length > 0) {
            const logisticsItems = items.map(it => ({
                logistics_id: log.id,
                item_code: it.item_code,
                quantity: it.quantity
            }));
            const { error: iError } = await supabase.from(T.LOGISTICS_ITEMS).insert(logisticsItems);
            if (iError) throw iError;
        }

        // Create Accounting Entry for Logistics Costs if any
        const totalLogisticsCost = (parseFloat(transport_cost) || 0) + (parseFloat(handling_cost) || 0);
        if (totalLogisticsCost > 0) {
            const desc = `Gastos de Logística ${type === 'inbound' ? 'Entrada' : 'Salida'} - Doc #${log.id}`;
            await createAccountingEntry({
                date: new Date().toISOString().split('T')[0],
                description: desc,
                type: 'gasto',
                userId: req.user.id,
                empresaId: req.empresa_id,
                lines: [
                    { account_code: '4.1.01', debit: totalLogisticsCost, glosa: desc }, // Gasto Transporte (Assume code)
                    { account_code: '1.1.01', credit: totalLogisticsCost, glosa: desc } // Caja/Banco
                ]
            });
        }

        res.json({ success: true, id: log.id });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.put('/api/logistics/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    const items = body.items;
    delete body.items;

    try {
        const { error: uError } = await supabase.from(T.LOGISTICS).update(body).eq('id', id).eq('empresa_id', req.empresa_id);
        if (uError) throw uError;

        if (items) {
            await supabase.from(T.LOGISTICS_ITEMS).delete().eq('logistics_id', id);
            const logisticsItems = items.map(it => ({
                logistics_id: id,
                item_code: it.item_code,
                quantity: it.quantity
            }));
            await supabase.from(T.LOGISTICS_ITEMS).insert(logisticsItems);
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/logistics/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from(T.LOGISTICS).delete().eq('id', id).eq('empresa_id', req.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/api/logistics/pending', authenticateToken, async (req, res) => {
    try {
        // Fetch all logistics to know which transactions are already covered
        const { data: logs } = await supabase.from(T.LOGISTICS).select('transaction_type, transaction_id').eq('empresa_id', req.empresa_id);
        const covered = { compra: new Set(), venta: new Set(), produccion: new Set() };
        logs?.forEach(l => {
            if (l.transaction_type && l.transaction_id) {
                covered[l.transaction_type].add(l.transaction_id);
            }
        });

        // Pending Purchases (Only tangible Raw Materials, excluding broad expenses)
        const { data: purchases } = await supabase
            .from(T.PURCHASES)
            .select('id, date, type, proveedores(name)')
            .eq('type', 'mp')
            .eq('empresa_id', req.empresa_id)
            .order('date', { ascending: false })
            .limit(50);

        const pendingPurchases = (purchases || []).filter(p => !covered.compra.has(p.id)).map(p => ({
            id: p.id,
            date: p.date,
            entity: p.proveedores?.name,
            type: 'inbound',
            transaction_type: 'compra'
        }));

        // Pending Sales
        const { data: sales } = await supabase.from(T.SALES).select('id, date, clientela(name)').eq('empresa_id', req.empresa_id).order('date', { ascending: false }).limit(50);
        const pendingSales = (sales || []).filter(s => !covered.venta.has(s.id)).map(s => ({
            id: s.id,
            date: s.date,
            entity: s.clientela?.name,
            type: 'outbound',
            transaction_type: 'venta'
        }));

        res.json([...pendingPurchases, ...pendingSales]);
    } catch (e) {
        res.status(500).json({ error: e.message });
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

    const { error } = await supabase.from(T.PRODUCTS).insert({ code, name, type, price_net, price_sale, cost_unit, color, size, parent_code, iva, total, empresa_id: req.empresa_id });
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

    const { error } = await supabase.from(T.PRODUCTS).update({ name, type, price_net, price_sale, cost_unit, color, size, parent_code, iva, total }).eq('code', req.params.code).eq('empresa_id', req.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Producto actualizado.' });
});

app.post('/api/products/recalculate-all-costs', authenticateToken, async (req, res) => {
    try {
        const { data: products } = await supabase.from(T.PRODUCTS).select('code').eq('empresa_id', req.empresa_id);
        for (const p of products) {
            const { data: recipe } = await supabase.from(T.RECIPES).select('*').eq('product_code', p.code).eq('empresa_id', req.empresa_id);

            // Si no hay receta, no sobreescribimos el costo manual (si existe)
            if (!recipe || recipe.length === 0) continue;

            let totalCost = 0;
            for (const r of recipe) {
                const { data: rm } = await supabase.from(T.MP).select('cost_net, batch_size').eq('code', r.mp_code).eq('empresa_id', req.empresa_id).single();
                const mpCostNet = rm ? rm.cost_net : 0;
                const mpBatchSize = rm ? (rm.batch_size || 1) : 1;
                const unitCost = (r.quantity / (r.batch_size || 1)) * (mpCostNet / mpBatchSize);

                await supabase.from(T.RECIPES).update({ unit_cost: unitCost }).eq('product_code', p.code).eq('mp_code', r.mp_code).eq('empresa_id', req.empresa_id);
                totalCost += unitCost;
            }
            await supabase.from(T.PRODUCTS).update({ cost_unit: Math.round(totalCost) }).eq('code', p.code).eq('empresa_id', req.empresa_id);
        }
        res.json({ success: true, message: 'Costos recalculados exitosamente.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
            .eq('empresa_id', req.empresa_id)
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
        const { data: sales } = await supabase.from(T.SALES).select('total, date').eq('empresa_id', req.empresa_id);
        const revenue = sales?.reduce((sum, s) => sum + (s.total || 0), 0) || 0;

        const { count: salesCount } = await supabase.from(T.SALES).select('*', { count: 'exact', head: true }).eq('empresa_id', req.empresa_id);

        const { data: prodItems } = await supabase.from(T.PRODUCTION_ITEMS).select('quantity, production!inner(empresa_id)').eq('production.empresa_id', req.empresa_id);
        const productionCount = prodItems?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;

        const { count: lowStock } = await supabase.from(T.MP).select('*', { count: 'exact', head: true }).eq('empresa_id', req.empresa_id).lt('stock', 2);

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
    const { data, error } = await supabase.from(T.USERS)
        .select('id, username, role, empresa_id, empresas:empresas(nombre)')
        .order('empresa_id');
    if (error) return res.status(500).json({ error: error.message });
    // Flatten empresa name
    const users = (data || []).map(u => ({
        ...u,
        empresa_nombre: u.empresas?.nombre || 'Sin empresa'
    }));
    res.json(users);
});

app.post('/api/users', authenticateToken, checkSuperAdmin, async (req, res) => {
    const { username, password, role, empresa_id } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const insertData = { username, password: hashedPassword, role };
        if (empresa_id) insertData.empresa_id = parseInt(empresa_id);
        const { error } = await supabase.from(T.USERS).insert(insertData);
        if (error) throw error;
        res.json({ success: true, message: 'Usuario creado exitosamente.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/users/:id', authenticateToken, checkSuperAdmin, async (req, res) => {
    const { id } = req.params;
    const { username, password, role, empresa_id } = req.body;
    const updateData = { username, role };
    if (empresa_id) updateData.empresa_id = parseInt(empresa_id);

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
    const { data, error } = await supabase.from(T.ACCOUNTS).select('*').eq('empresa_id', req.empresa_id).order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/accounts', authenticateToken, checkAdmin, async (req, res) => {
    const { name, type, current_balance } = req.body;
    const { error } = await supabase.from(T.ACCOUNTS).insert({ name, type, current_balance: current_balance || 0, empresa_id: req.empresa_id });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.put('/api/accounts/:id', authenticateToken, checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, type, current_balance } = req.body;
    const { error } = await supabase.from(T.ACCOUNTS).update({ name, type, current_balance }).eq('id', id).eq('empresa_id', req.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// --- Quotations Routes ---
app.get('/api/quotations', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from(T.QUOTATIONS)
        .select(`*, clients:"${T.CLIENTS}"(name, rut, address)`)
        .eq('empresa_id', req.empresa_id)
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    const formatted = (data || []).map(q => ({
        ...q,
        clients: Array.isArray(q.clients) ? q.clients[0] : q.clients
    }));
    res.json(formatted);
});

app.get('/api/quotations/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { data: quotation, error: qError } = await supabase
        .from(T.QUOTATIONS)
        .select(`*, clients:"${T.CLIENTS}"(name, rut, address)`)
        .eq('id', id)
        .eq('empresa_id', req.empresa_id)
        .single();
    if (qError) return res.status(500).json({ error: qError.message });

    const [itemsRes, salesRes, purchasesRes, productionRes] = await Promise.all([
        supabase.from(T.QUOTE_ITEMS).select('*').eq('quotation_id', id),
        supabase.from(T.SALES).select('*').eq('quotation_id', id),
        supabase.from(T.PURCHASES).select('*').eq('quotation_id', id),
        supabase.from(T.PRODUCTION).select(`*, items:${T.PRODUCTION_ITEMS}(*)`).eq('quotation_id', id)
    ]);

    if (itemsRes.error) return res.status(500).json({ error: itemsRes.error.message });

    const clientData = Array.isArray(quotation.clients) ? quotation.clients[0] : quotation.clients;
    res.json({
        ...quotation,
        clients: clientData,
        items: itemsRes.data,
        related_sales: salesRes.data || [],
        related_purchases: purchasesRes.data || [],
        related_productions: productionRes.data || []
    });
});

// --- Accounting System Endpoints ---

app.get('/api/accounting/accounts', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.ACCOUNTING_ACCOUNTS).select('*').order('codigo');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});
app.get(['/api/accounting/ledger', '/api/accounting-entries'], authenticateToken, async (req, res) => {
    const periodo = req.query.periodo; 
    console.log(`[LEDGER] Request for period: ${periodo} (Empresa: ${req.empresa_id})`);
    
    try {
        console.log(`[LEDGER] Querying ${T.PC_ASIENTOS} for empresa: ${req.empresa_id}`);
        
        let query = supabase
            .from(T.PC_ASIENTOS)
            .select(`
                *,
                lineas:${T.PC_MOVIMIENTOS}!fk_asiento(
                    *,
                    account:${T.ACCOUNTING_ACCOUNTS}!asiento_movimientos_cuenta_codigo_fkey(nombre, codigo)
                )
            `);

        if (req.empresa_id) {
            query = query.eq('empresa_id', req.empresa_id);
        }

        if (periodo && periodo !== 'all' && periodo !== 'force') {
            query = query.eq('periodo', periodo);
        }

        const { data: entries, error: eError } = await query.order('fecha', { ascending: false });

        if (eError) {
            console.error('[LEDGER] DB Error:', eError);
            throw eError;
        }
        console.log(`[LEDGER] Found ${entries?.length || 0} entries`);
        if (entries && entries.length > 0) {
            console.log('[LEDGER] First Entry Structure:', JSON.stringify(entries[0], null, 2));
        }

        // Map it to the format the frontend expects (compatibilidad)
        const formattedLedger = entries.map(entry => ({
            ...entry,
            lineas: (entry.lineas || []).map(l => ({
                ...l,
                account_name: l.account?.nombre,
                account_code: l.account?.codigo
            }))
        }));

        res.json(formattedLedger);
    } catch (e) {
        console.error('Ledger error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/cost-centers', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from(T.COST_CENTERS).select('*').eq('empresa_id', req.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});


app.post('/api/accounting/expenses', authenticateToken, async (req, res) => {
    const { date, description, amount, account_origin_code, category_code } = req.body;

    const result = await createAccountingEntry({
        date,
        description,
        type: 'gasto',
        userId: req.user.id,
        empresaId: req.empresa_id,
        lines: [
            { account_code: category_code || '5.1.02', debit: amount }, // Gasto Operacional
            { account_code: account_origin_code || '1.1.01', credit: amount } // Pago (Caja)
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
        empresaId: req.empresa_id,
        lines: [
            { account_code: to_account_code, debit: amount },
            { account_code: from_account_code, credit: amount }
        ]
    });

    res.json(result);
});

app.post('/api/accounting/entries', authenticateToken, async (req, res) => {
    const { fecha, glosa, lineas, tipo_origen, referencia_id } = req.body;

    try {
        const result = await createAccountingEntry({
            date: fecha,
            description: glosa,
            type: tipo_origen || 'manual',
            document_number: referencia_id,
            userId: req.user.id,
            empresaId: req.empresa_id,
            lines: (lineas || []).map(l => ({
                account_code: l.cuenta_codigo,
                debit: l.debe || 0,
                credit: l.haber || 0,
                glosa: glosa
            }))
        });

        res.json(result);
    } catch (e) {
        console.error('Error creating manual entry:', e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/accounting/entries/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        // Multi-tenant delete: ensure it belongs to the empresa
        // 1. Delete lines first (Supabase should have cascade, but better to be safe)
        await supabase.from(T.PC_MOVIMIENTOS).delete().eq('asiento_id', id).eq('empresa_id', req.empresa_id);
        
        // 2. Delete main entry
        const { error } = await supabase.from(T.PC_ASIENTOS).delete().eq('id', id).eq('empresa_id', req.empresa_id);
        
        if (error) throw error;
        res.json({ success: true, message: 'Asiento eliminado con éxito' });
    } catch (e) {
        console.error('Error deleting accounting entry:', e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/inventory/takes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Get take data
        const { data: take, error: takeError } = await supabase
            .from('inventory_takes')
            .select('*')
            .eq('id', id)
            .eq('empresa_id', req.empresa_id)
            .single();

        if (takeError) throw takeError;

        const { data: items, error: itemsError } = await supabase
            .from('inventory_take_items')
            .select('*')
            .eq('take_id', id);

        if (itemsError) throw itemsError;

        // 2. Revert Stock Updates
        const targetTable = take.category === 'mp' ? T.MP : T.PRODUCTS;
        for (const item of items) {
             const { data: currentItem } = await supabase.from(targetTable).select('stock').eq('code', item.item_code).eq('empresa_id', req.empresa_id).single();
             if (currentItem) {
                 const restoredStock = (parseFloat(currentItem.stock) || 0) - (parseFloat(item.difference) || 0);
                 await supabase.from(targetTable).update({ stock: restoredStock }).eq('code', item.item_code).eq('empresa_id', req.empresa_id);
             }
        }

        // 3. Delete Accounting Entry
        const docRef = 'INV-' + take.id.toString().slice(-6);
        const { data: entry } = await supabase.from('asientos').select('id').eq('referencia_id', id).eq('empresa_id', req.empresa_id).limit(1).maybeSingle();
        // Fallback search by glosa or document number
        let entryId = entry?.id;
        if (!entryId) {
             const { data: entry2 } = await supabase.from('asientos').select('id').ilike('glosa', `%#${take.id.toString().slice(-4)}%`).eq('empresa_id', req.empresa_id).limit(1).maybeSingle();
             entryId = entry2?.id;
        }

        if (entryId) {
            await supabase.from('asiento_movimientos').delete().eq('asiento_id', entryId).eq('empresa_id', req.empresa_id);
            await supabase.from('asientos').delete().eq('id', entryId).eq('empresa_id', req.empresa_id);
        }

        // 4. Delete Take Records
        await supabase.from('inventory_take_items').delete().eq('take_id', id);
        await supabase.from('inventory_takes').delete().eq('id', id);

        res.json({ success: true, message: 'Toma revertida y eliminada con éxito.' });
    } catch (e) {
        console.error('Error reverting inventory take:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/inventory/takes', authenticateToken, async (req, res) => {
    try {
        const { data: takes, error: takesError } = await supabase
            .from('inventory_takes')
            .select('*')
            .eq('empresa_id', req.empresa_id)
            .order('date', { ascending: false });

        if (takesError) throw takesError;

        // Fetch items for each take
        const { data: items, error: itemsError } = await supabase
            .from('inventory_take_items')
            .select('*')
            .eq('empresa_id', req.empresa_id);

        if (itemsError) throw itemsError;

        const result = takes.map(t => ({
            ...t,
            items: items.filter(i => i.take_id === t.id)
        }));

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/inventory/adjust', authenticateToken, async (req, res) => {
    const { items, category, date } = req.body;
    debugLog(`[INV-ADJUST] Processing ${items?.length} items for category ${category}`);

    try {
        let totalVariationValue = 0;
        const targetTable = category === 'mp' ? T.MP : T.PRODUCTS;
        const targetAccount = category === 'mp' ? '1.1.09' : '1.1.08';

        // 1. Crear Registro de Toma de Inventario (Header)
        const { data: takeHeader, error: headerError } = await supabase
            .from('inventory_takes')
            .insert({
                date: date || new Date().toISOString().split('T')[0],
                category,
                total_items: items.length,
                total_variation_value: totalVariationValue,
                user_id: req.user.id,
                empresa_id: req.empresa_id
            })
            .select()
            .single();

        if (headerError) throw headerError;

        // 2. Procesar cada ítem
        for (const item of items) {
            const diffValue = item.difference * item.unit_cost;

            // Guardar detalle de la toma
            await supabase.from('inventory_take_items').insert({
                take_id: takeHeader.id,
                item_code: item.code,
                item_name: item.name,
                system_stock: item.old_stock,
                physical_stock: item.new_stock,
                difference: item.difference,
                unit_cost: item.unit_cost,
                empresa_id: req.empresa_id
            });

            // Actualizar stock real
            const { error: updateError } = await supabase
                .from(targetTable)
                .update({ stock: item.new_stock })
                .eq('code', item.code)
                .eq('empresa_id', req.empresa_id);

            if (updateError) throw updateError;
        }

        // 3. Crear Asiento Contable
        if (Math.abs(totalVariationValue) > 0.1) {
            const description = `Ajuste Toma de Inventario Físico #${takeHeader.id.toString().slice(-4)}`;
            
            await createAccountingEntry({
                date: date || new Date().toISOString().split('T')[0],
                description,
                type: 'ajuste_inventario',
                document_number: 'INV-' + takeHeader.id.toString().slice(-6),
                userId: req.user.id,
                empresaId: req.empresa_id,
                lines: [
                    { 
                        account_code: targetAccount, 
                        debit: totalVariationValue > 0 ? Math.abs(totalVariationValue) : 0, 
                        credit: totalVariationValue < 0 ? Math.abs(totalVariationValue) : 0 
                    },
                    { 
                        account_code: '5.1.01', 
                        debit: totalVariationValue < 0 ? Math.abs(totalVariationValue) : 0, 
                        credit: totalVariationValue > 0 ? Math.abs(totalVariationValue) : 0 
                    }
                ]
            });
        }

        res.json({ success: true, message: 'Ajuste y Registro procesado correctamente.' });
    } catch (e) {
        console.error('Error adjusting inventory:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/quotations', authenticateToken, async (req, res) => {
    const {
        client_id, name, quantity, utility_percentage,
        total_net_cost, total_price_net, total_iva, total_price_gross,
        budget, success_probability, products_list,
        items, rut, address, description_proposal, images,
        external_quote_id, purchase_order_id,
        delivery_time, quote_date
    } = req.body;

    console.log('--- CREATE QUOTATION ---');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    try {

        // 1. Create Quotation Header
        const insertData = {
            client_id, name, quantity, utility_percentage,
            total_net_cost, total_price_net, total_iva, total_price_gross,
            budget, success_probability, products_list,
            rut, address, description_proposal, images,
            external_quote_id, purchase_order_id,
            delivery_time, quote_date,
            status: 'draft',
            empresa_id: req.empresa_id
        };

        let { data: quote, error: qError } = await supabase.from(T.QUOTATIONS).insert(insertData).select().single();

        // Fallback if columns don't exist
        if (qError && qError.message.includes('column') && (qError.message.includes('external_quote_id') || qError.message.includes('purchase_order_id'))) {
            console.warn('Fallback: Columns missing. Retrying without external_quote_id and purchase_order_id');
            delete insertData.external_quote_id;
            delete insertData.purchase_order_id;
            const retry = await supabase.from(T.QUOTATIONS).insert(insertData).select().single();
            quote = retry.data;
            qError = retry.error;
        }

        if (qError) {
            console.error('Header Error:', qError);
            throw qError;
        }
        console.log('Header created:', quote.id);

        // 2. Insert Items
        if (items && items.length > 0) {
            const itemsWithId = items.map(item => ({
                ...item,
                quotation_id: quote.id
            }));
            const { error: iError } = await supabase.from(T.QUOTE_ITEMS).insert(itemsWithId);
            if (iError) {
                console.error('Items Error:', iError);
                throw iError;
            }
            console.log('Items inserted successfully');
        }

        res.json({ success: true, message: 'Cotización guardada exitosamente', id: quote.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/quotations/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    console.log('--- UPDATE QUOTATION ---', id);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const {
        client_id, name, quantity, utility_percentage,
        total_net_cost, total_price_net, total_iva, total_price_gross,
        budget, success_probability, products_list,
        items, rut, address, description_proposal, images,
        external_quote_id, purchase_order_id,
        delivery_time, quote_date
    } = req.body;

    try {
        // 1. Update Header
        const updateData = {
            client_id, name, quantity, utility_percentage,
            total_net_cost, total_price_net, total_iva, total_price_gross,
            budget, success_probability, products_list,
            rut, address, description_proposal, images,
            external_quote_id, purchase_order_id,
            delivery_time, quote_date
        };

        let { error: qError } = await supabase.from(T.QUOTATIONS).update(updateData).eq('id', id).eq('empresa_id', req.empresa_id);

        // Fallback if columns don't exist
        if (qError && qError.message.includes('column') && (qError.message.includes('external_quote_id') || qError.message.includes('purchase_order_id'))) {
            console.warn('Fallback: Columns missing. Retrying without external_quote_id and purchase_order_id');
            delete updateData.external_quote_id;
            delete updateData.purchase_order_id;
            const retry = await supabase.from(T.QUOTATIONS).update(updateData).eq('id', id).eq('empresa_id', req.empresa_id);
            qError = retry.error;
        }

        if (qError) {
            console.error('Update Header Error:', qError);
            throw qError;
        }

        // 2. Replace Items (Delete then Insert)
        const { error: dError } = await supabase.from(T.QUOTE_ITEMS).delete().eq('quotation_id', id);
        if (dError) {
            console.error('Delete Items Error:', dError);
            throw dError;
        }

        if (items && items.length > 0) {
            const itemsWithId = items.map(item => ({
                ...item,
                quotation_id: id
            }));
            const { error: iError } = await supabase.from(T.QUOTE_ITEMS).insert(itemsWithId);
            if (iError) {
                console.error('Insert Items Error:', iError);
                throw iError;
            }
            console.log('Items updated successfully');
        }

        res.json({ success: true, message: 'Cotización actualizada exitosamente' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== QUOTATION STATUS WORKFLOW ==========
const QUOTE_TRANSITIONS = {
    draft: ['sent', 'cancelled'],
    sent: ['approved', 'rejected', 'cancelled'],
    approved: ['production', 'cancelled'],
    rejected: [],
    production: ['cancelled'],
    cancelled: []
};

app.patch('/api/quotations/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status: newStatus } = req.body;

    if (!newStatus || !QUOTE_TRANSITIONS[newStatus] && !Object.keys(QUOTE_TRANSITIONS).includes(newStatus)) {
        return res.status(400).json({ error: `Estado inválido: ${newStatus}` });
    }

    try {
        // Get current status
        const { data: quote, error: fetchErr } = await supabase
            .from(T.QUOTATIONS)
            .select('id, status')
            .eq('id', id)
            .eq('empresa_id', req.empresa_id)
            .single();

        if (fetchErr || !quote) {
            return res.status(404).json({ error: 'Cotización no encontrada' });
        }

        const currentStatus = quote.status || 'draft';
        const allowed = QUOTE_TRANSITIONS[currentStatus] || [];

        if (!allowed.includes(newStatus)) {
            return res.status(400).json({
                error: `Transición no permitida: ${currentStatus} → ${newStatus}. Permitidas: ${allowed.join(', ') || 'ninguna (estado terminal)'}`
            });
        }

        const { error: updateErr } = await supabase
            .from(T.QUOTATIONS)
            .update({ status: newStatus })
            .eq('id', id)
            .eq('empresa_id', req.empresa_id);

        if (updateErr) throw updateErr;

        res.json({ success: true, message: `Estado actualizado a: ${newStatus}`, newStatus });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Health Check ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.get('/api/debug-db', async (req, res) => {
    try {
        const fetchTest = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usuarios?select=count`, {
            headers: { 'apikey': process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_KEY}` }
        }).then(r => r.status).catch(e => e.message);

        const { data, error } = await supabase.from(T.USERS).select('count', { count: 'exact', head: true });
        res.json({
            url: process.env.SUPABASE_URL,
            rawFetchStatus: fetchTest,
            connected: !error,
            table: T.USERS,
            error: error ? error.message : null,
            count: data
        });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`ERP Backend running on port ${PORT} (Connected to Supabase)`);
    console.log(`CORS origins: ${allowedOrigins.join(', ')}`);
});
