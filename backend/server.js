const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const db = new Database('erp_database.db');

app.use(cors());
app.use(express.json());

// GET Routes
app.get('/api/products', (req, res) => {
    const products = db.prepare("SELECT * FROM products WHERE code IS NOT NULL AND code != ''").all();
    res.json(products);
});

app.get('/api/raw-materials', (req, res) => {
    const materials = db.prepare("SELECT * FROM raw_materials WHERE code IS NOT NULL AND code != ''").all();
    res.json(materials);
});

app.get('/api/providers', (req, res) => {
    const providers = db.prepare('SELECT * FROM providers WHERE id IS NOT NULL').all();
    res.json(providers);
});

app.get('/api/clients', (req, res) => {
    const clients = db.prepare('SELECT * FROM clients WHERE id IS NOT NULL').all();
    res.json(clients);
});

app.get('/api/recipes/:productCode', (req, res) => {
    const recipe = db.prepare(`
        SELECT r.*, rm.name as mp_name, rm.unit, rm.cost_net 
        FROM recipes r 
        JOIN raw_materials rm ON r.mp_code = rm.code 
        WHERE r.product_code = ?
    `).all(req.params.productCode);
    res.json(recipe);
});

app.put('/api/recipes/:productCode', (req, res) => {
    const { items } = req.body;
    const productCode = req.params.productCode;

    try {
        const transaction = db.transaction(() => {
            // Delete old recipe
            db.prepare('DELETE FROM recipes WHERE product_code = ?').run(productCode);

            // Insert new items
            const insertStmt = db.prepare(`
                INSERT INTO recipes (product_code, mp_code, quantity, batch_size, unit_cost) 
                VALUES (?, ?, ?, ?, ?)
            `);

            for (const item of items) {
                // Calculate unit_cost for the recipe row
                const rawMaterial = db.prepare('SELECT cost_net FROM raw_materials WHERE code = ?').get(item.mpCode);
                const mpCostNet = rawMaterial ? rawMaterial.cost_net : 0;
                const batchSize = item.batchSize || 1;
                const unitCost = (item.quantity / batchSize) * mpCostNet;

                insertStmt.run(productCode, item.mpCode, item.quantity, batchSize, unitCost);
            }

            // Recalculate total cost for the product
            const newRecipe = db.prepare('SELECT unit_cost FROM recipes WHERE product_code = ?').all(productCode);
            const totalCost = Math.round(newRecipe.reduce((sum, r) => sum + (r.unit_cost || 0), 0));
            db.prepare('UPDATE products SET cost_unit = ? WHERE code = ?').run(totalCost, productCode);
        });

        transaction();
        res.json({ success: true, message: 'Receta actualizada exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});


app.get('/api/products/:code/calculate-cost', (req, res) => {
    try {
        const recipe = db.prepare(`
            SELECT r.unit_cost
            FROM recipes r 
            WHERE r.product_code = ?
        `).all(req.params.code);

        const totalCost = Math.round(recipe.reduce((sum, item) => sum + (item.unit_cost || 0), 0));

        res.json({ productCode: req.params.code, calculatedCost: totalCost });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/products/recalculate-all-costs', (req, res) => {
    try {
        const products = db.prepare('SELECT code FROM products WHERE code IS NOT NULL AND code != \'\'').all();
        const updateStmt = db.prepare('UPDATE products SET cost_unit = ? WHERE code = ?');

        const transaction = db.transaction(() => {
            for (const product of products) {
                const recipe = db.prepare(`
                    SELECT r.unit_cost
                    FROM recipes r 
                    WHERE r.product_code = ?
                `).all(product.code);

                const totalCost = Math.round(recipe.reduce((sum, item) => sum + (item.unit_cost || 0), 0));

                updateStmt.run(totalCost, product.code);
            }
        });

        transaction();
        res.json({ success: true, message: 'Costos recalculados exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/history/purchases', (req, res) => {
    const history = db.prepare(`
        SELECT p.*, prov.name as provider_name 
        FROM purchases p 
        LEFT JOIN providers prov ON p.provider_id = prov.id
        ORDER BY p.date DESC
    `).all();

    // For each purchase, get its items
    const fullHistory = history.map(p => {
        const items = db.prepare(`
            SELECT pi.*, rm.name as mp_name, rm.color, rm.size
            FROM purchase_items pi
            JOIN raw_materials rm ON pi.mp_code = rm.code
            WHERE pi.purchase_id = ?
        `).all(p.id);
        return { ...p, items };
    });

    res.json(fullHistory);
});

app.get('/api/history/sales', (req, res) => {
    const history = db.prepare(`
        SELECT s.*, c.name as client_name 
        FROM sales s 
        LEFT JOIN clients c ON s.client_id = c.id
        ORDER BY s.date DESC
    `).all();

    // For each sale, get its items
    const fullHistory = history.map(s => {
        const items = db.prepare(`
            SELECT si.*, pr.name as product_name, pr.color, pr.size
            FROM sale_items si
            JOIN products pr ON si.product_code = pr.code
            WHERE si.sale_id = ?
        `).all(s.id);
        return { ...s, items };
    });

    res.json(fullHistory);
});

app.get('/api/history/production', (req, res) => {
    const history = db.prepare(`
        SELECT * FROM production ORDER BY date DESC
    `).all();

    // For each production run, get its items
    const fullHistory = history.map(p => {
        const items = db.prepare(`
            SELECT pi.*, pr.name as product_name, pr.color, pr.size
            FROM production_items pi
            JOIN products pr ON pi.product_code = pr.code
            WHERE pi.production_id = ?
        `).all(p.id);
        return { ...p, items };
    });

    res.json(fullHistory);
});

app.get('/api/stats', (req, res) => {
    const revenue = db.prepare('SELECT SUM(total) as total FROM sales').get()?.total || 0;
    const salesCount = db.prepare('SELECT COUNT(*) as count FROM sales').get()?.count || 0;
    const productionCount = db.prepare('SELECT SUM(quantity) as count FROM production_items').get()?.count || 0;
    const lowStock = db.prepare('SELECT COUNT(*) as count FROM raw_materials WHERE stock < 2').get()?.count || 0;

    // Weekly sales for chart
    const weeklySales = db.prepare(`
        SELECT date, SUM(total) as total 
        FROM sales 
        WHERE date >= date('now', '-7 days')
        GROUP BY date 
        ORDER BY date ASC
    `).all();

    res.json({
        totalRevenue: revenue,
        totalSales: salesCount,
        totalProduction: productionCount,
        lowStockItems: lowStock,
        weeklySales
    });
});

// POST Routes (Masters)
app.post('/api/products', (req, res) => {
    const { code, name, type, price_net, price_sale, cost_unit, color, size, parent_code } = req.body;
    try {
        db.prepare('INSERT INTO products (code, name, type, price_net, price_sale, cost_unit, color, size, parent_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(code, name, type, price_net, price_sale, cost_unit, color || null, size || null, parent_code || null);
        res.json({ success: true, message: 'Producto creado exitosamente.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/raw-materials', (req, res) => {
    const { code, name, type, unit, cost_net, color, size, parent_code } = req.body;
    try {
        db.prepare('INSERT INTO raw_materials (code, name, type, unit, cost_net, color, size, parent_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(code, name, type, unit, cost_net, color || null, size || null, parent_code || null);
        res.json({ success: true, message: 'Insumo creado exitosamente.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/clients', (req, res) => {
    const { name, address } = req.body;
    try {
        db.prepare('INSERT INTO clients (name, address) VALUES (?, ?)')
            .run(name, address);
        res.json({ success: true, message: 'Cliente creado exitosamente.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/providers', (req, res) => {
    const { name, contact, phone } = req.body;
    try {
        db.prepare('INSERT INTO providers (name, contact, phone) VALUES (?, ?, ?)')
            .run(name, contact, phone);
        res.json({ success: true, message: 'Proveedor creado exitosamente.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PUT Routes (Updates)
app.put('/api/products/:code', (req, res) => {
    const { name, type, price_net, price_sale, cost_unit, color, size, parent_code } = req.body;
    try {
        db.prepare(`
            UPDATE products 
            SET name = ?, type = ?, price_net = ?, price_sale = ?, cost_unit = ?, color = ?, size = ?, parent_code = ? 
            WHERE code = ?
        `).run(name, type, price_net, price_sale, cost_unit, color || null, size || null, parent_code || null, req.params.code);
        res.json({ success: true, message: 'Producto actualizado exitosamente.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/raw-materials/:code', (req, res) => {
    const { name, type, unit, cost_net, color, size, parent_code } = req.body;
    try {
        db.prepare(`
            UPDATE raw_materials 
            SET name = ?, type = ?, unit = ?, cost_net = ?, color = ?, size = ?, parent_code = ? 
            WHERE code = ?
        `).run(name, type, unit, cost_net, color || null, size || null, parent_code || null, req.params.code);
        res.json({ success: true, message: 'Insumo actualizado exitosamente.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/purchases', (req, res) => {
    const { providerId, items, net, iva, total } = req.body;
    const date = new Date().toISOString().split('T')[0];

    const transaction = db.transaction(() => {
        const info = db.prepare('INSERT INTO purchases (date, provider_id, net, iva, total) VALUES (?, ?, ?, ?, ?)')
            .run(date, providerId || null, net, iva, total);

        const purchaseId = info.lastInsertRowid;

        const insertItem = db.prepare('INSERT INTO purchase_items (purchase_id, item_number, mp_code, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)');
        const updateStock = db.prepare('UPDATE raw_materials SET stock = stock + ? WHERE code = ?');

        items.forEach((item, index) => {
            if (item.mpCode && item.quantity > 0) {
                insertItem.run(purchaseId, index + 1, item.mpCode, item.quantity, item.unitPrice, item.subtotal);
                updateStock.run(item.quantity, item.mpCode);
            }
        });
    });

    try {
        transaction();
        res.json({ success: true, message: 'Compra registrada y stock de insumos actualizado.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/sales', (req, res) => {
    const { clientId, items, net, iva, total } = req.body;
    const date = new Date().toISOString().split('T')[0];

    const transaction = db.transaction(() => {
        const info = db.prepare('INSERT INTO sales (date, client_id, net, iva, total) VALUES (?, ?, ?, ?, ?)')
            .run(date, clientId || null, net, iva, total);

        const saleId = info.lastInsertRowid;

        const insertItem = db.prepare('INSERT INTO sale_items (sale_id, item_number, product_code, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)');
        const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE code = ?');

        items.forEach((item, index) => {
            if (item.productCode && item.quantity > 0) {
                insertItem.run(saleId, index + 1, item.productCode, item.quantity, item.unitPrice, item.subtotal);
                updateStock.run(item.quantity, item.productCode);
            }
        });
    });

    try {
        transaction();
        res.json({ success: true, message: 'Venta registrada y stock de producto actualizado.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/purchases/:id', (req, res) => {
    const { providerId, items, net, iva, total, date } = req.body;
    const purchaseId = req.params.id;

    const transaction = db.transaction(() => {
        // 1. Revertir stock antiguo
        const oldItems = db.prepare('SELECT mp_code, quantity FROM purchase_items WHERE purchase_id = ?').all(purchaseId);
        for (const item of oldItems) {
            db.prepare('UPDATE raw_materials SET stock = stock - ? WHERE code = ?').run(item.quantity, item.mp_code);
        }

        // 2. Eliminar items antiguos
        db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(purchaseId);

        // 3. Actualizar cabecera de compra
        db.prepare('UPDATE purchases SET date = ?, provider_id = ?, net = ?, iva = ?, total = ? WHERE id = ?')
            .run(date || new Date().toISOString().split('T')[0], providerId || null, net, iva, total, purchaseId);

        // 4. Insertar nuevos items y actualizar stock
        const insertItem = db.prepare('INSERT INTO purchase_items (purchase_id, item_number, mp_code, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)');
        const updateStock = db.prepare('UPDATE raw_materials SET stock = stock + ? WHERE code = ?');

        items.forEach((item, index) => {
            if (item.mpCode && item.quantity > 0) {
                insertItem.run(purchaseId, index + 1, item.mpCode, item.quantity, item.unitPrice, item.subtotal);
                updateStock.run(item.quantity, item.mpCode);
            }
        });
    });

    try {
        transaction();
        res.json({ success: true, message: 'Compra actualizada y stock sincronizado.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/sales/:id', (req, res) => {
    const { clientId, items, net, iva, total, date } = req.body;
    const saleId = req.params.id;

    const transaction = db.transaction(() => {
        // 1. Revertir stock antiguo (devolver al inventario)
        const oldItems = db.prepare('SELECT product_code, quantity FROM sale_items WHERE sale_id = ?').all(saleId);
        for (const item of oldItems) {
            db.prepare('UPDATE products SET stock = stock + ? WHERE code = ?').run(item.quantity, item.product_code);
        }

        // 2. Eliminar items antiguos
        db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(saleId);

        // 3. Actualizar cabecera de venta
        db.prepare('UPDATE sales SET date = ?, client_id = ?, net = ?, iva = ?, total = ? WHERE id = ?')
            .run(date || new Date().toISOString().split('T')[0], clientId || null, net, iva, total, saleId);

        // 4. Insertar nuevos items y actualizar stock (descontar del inventario)
        const insertItem = db.prepare('INSERT INTO sale_items (sale_id, item_number, product_code, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)');
        const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE code = ?');

        items.forEach((item, index) => {
            if (item.productCode && item.quantity > 0) {
                insertItem.run(saleId, index + 1, item.productCode, item.quantity, item.unitPrice, item.subtotal);
                updateStock.run(item.quantity, item.productCode);
            }
        });
    });

    try {
        transaction();
        res.json({ success: true, message: 'Venta actualizada y stock sincronizado.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/production', (req, res) => {
    const { items, date } = req.body;
    const productionDate = date || new Date().toISOString();

    const transaction = db.transaction(() => {
        const info = db.prepare('INSERT INTO production (date) VALUES (?)').run(productionDate);
        const productionId = info.lastInsertRowid;

        const insertItem = db.prepare('INSERT INTO production_items (production_id, item_number, product_code, quantity, mo_cost) VALUES (?, ?, ?, ?, ?)');
        const updateProductStock = db.prepare('UPDATE products SET stock = stock + ? WHERE code = ?');
        const updateMPStock = db.prepare('UPDATE raw_materials SET stock = stock - ? WHERE code = ?');

        items.forEach((item, index) => {
            if (item.productCode && item.quantity > 0) {
                insertItem.run(productionId, index + 1, item.productCode, item.quantity, item.mo_cost || 0);
                updateProductStock.run(item.quantity, item.productCode);

                const recipe = db.prepare('SELECT mp_code, quantity FROM recipes WHERE product_code = ?').all(item.productCode);
                for (const r of recipe) {
                    updateMPStock.run(r.quantity * item.quantity, r.mp_code);
                }
            }
        });
    });

    try {
        transaction();
        res.json({ success: true, message: 'Producción registrada y stock actualizado.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/production/:id', (req, res) => {
    const { items, date } = req.body;
    const productionId = req.params.id;

    const transaction = db.transaction(() => {
        // 1. Revertir stock antiguo
        const oldItems = db.prepare('SELECT product_code, quantity FROM production_items WHERE production_id = ?').all(productionId);
        for (const item of oldItems) {
            // Descontar producto del stock
            db.prepare('UPDATE products SET stock = stock - ? WHERE code = ?').run(item.quantity, item.product_code);

            // Devolver insumos al stock (usando la receta actual)
            const recipe = db.prepare('SELECT mp_code, quantity FROM recipes WHERE product_code = ?').all(item.product_code);
            for (const r of recipe) {
                db.prepare('UPDATE raw_materials SET stock = stock + ? WHERE code = ?').run(r.quantity * item.quantity, r.mp_code);
            }
        }

        // 2. Eliminar items antiguos
        db.prepare('DELETE FROM production_items WHERE production_id = ?').run(productionId);

        // 3. Actualizar cabecera
        db.prepare('UPDATE production SET date = ? WHERE id = ?').run(date || new Date().toISOString(), productionId);

        // 4. Insertar nuevos items y actualizar stock
        const insertItem = db.prepare('INSERT INTO production_items (production_id, item_number, product_code, quantity, mo_cost) VALUES (?, ?, ?, ?, ?)');
        const updateProductStock = db.prepare('UPDATE products SET stock = stock + ? WHERE code = ?');
        const updateMPStock = db.prepare('UPDATE raw_materials SET stock = stock - ? WHERE code = ?');

        items.forEach((item, index) => {
            if (item.productCode && item.quantity > 0) {
                insertItem.run(productionId, index + 1, item.productCode, item.quantity, item.mo_cost || 0);
                updateProductStock.run(item.quantity, item.productCode);

                const recipe = db.prepare('SELECT mp_code, quantity FROM recipes WHERE product_code = ?').all(item.productCode);
                for (const r of recipe) {
                    updateMPStock.run(r.quantity * item.quantity, r.mp_code);
                }
            }
        });
    });

    try {
        transaction();
        res.json({ success: true, message: 'Producción actualizada y stock sincronizado.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`ERP Backend running on http://localhost:${PORT}`);
});
