const Database = require('better-sqlite3');
const db = new Database('erp_database.db');

console.log("Testing cost calculation with batch_size...\n");

// Test TO-01
const to01_recipe = db.prepare(`
    SELECT r.quantity, r.batch_size, rm.cost_net, rm.name
    FROM recipes r 
    JOIN raw_materials rm ON r.mp_code = rm.code 
    WHERE r.product_code = 'TO-01'
`).all();

console.log("TO-01 Recipe:");
let totalCost = 0;
to01_recipe.forEach(item => {
    const itemCost = (item.cost_net * item.quantity) / item.batch_size;
    totalCost += itemCost;
    console.log(`  ${item.name}: ${item.cost_net} × ${item.quantity} / ${item.batch_size} = ${itemCost.toFixed(2)}`);
});
console.log(`Total Cost: ${totalCost.toFixed(2)}`);
console.log(`Expected: 6007.185\n`);

// Test TU-01
const tu01_recipe = db.prepare(`
    SELECT r.quantity, r.batch_size, rm.cost_net, rm.name
    FROM recipes r 
    JOIN raw_materials rm ON r.mp_code = rm.code 
    WHERE r.product_code = 'TU-01'
`).all();

console.log("TU-01 Recipe:");
totalCost = 0;
tu01_recipe.forEach(item => {
    const itemCost = (item.cost_net * item.quantity) / item.batch_size;
    totalCost += itemCost;
    console.log(`  ${item.name}: ${item.cost_net} × ${item.quantity} / ${item.batch_size} = ${itemCost.toFixed(2)}`);
});
console.log(`Total Cost: ${totalCost.toFixed(2)}`);
console.log(`Expected: 3316.005`);

db.close();
