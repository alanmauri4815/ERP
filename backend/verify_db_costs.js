const Database = require('better-sqlite3');
const db = new Database('erp_database.db');

console.log("Calculating costs for all products...\n");

const products = db.prepare("SELECT code, name, cost_unit FROM products WHERE code IS NOT NULL AND code != ''").all();

for (const product of products) {
    const recipe = db.prepare(`
        SELECT r.quantity, rm.cost_net, rm.name as mp_name
        FROM recipes r 
        JOIN raw_materials rm ON r.mp_code = rm.code 
        WHERE r.product_code = ?
    `).all(product.code);

    const calculatedCost = recipe.reduce((sum, item) => {
        return sum + (item.cost_net * item.quantity);
    }, 0);

    const diff = Math.abs(calculatedCost - (product.cost_unit || 0));

    if (diff > 1) {
        console.log(`${product.code} - ${product.name}`);
        console.log(`  Excel Cost: ${product.cost_unit}`);
        console.log(`  Calculated: ${calculatedCost.toFixed(2)}`);
        console.log(`  Difference: ${diff.toFixed(2)}`);
        console.log(`  Recipe items: ${recipe.length}`);
        console.log('');
    }
}

db.close();
