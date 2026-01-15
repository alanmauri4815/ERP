const Database = require('better-sqlite3');
const db = new Database('erp_database.db');

console.log("Testing cost calculation with unit_cost...\n");

// Test TO-01
const to01_recipe = db.prepare(`
    SELECT r.unit_cost, rm.name
    FROM recipes r 
    JOIN raw_materials rm ON r.mp_code = rm.code 
    WHERE r.product_code = 'TO-01'
`).all();

console.log("TO-01 Recipe:");
let totalCost = to01_recipe.reduce((sum, item) => sum + item.unit_cost, 0);
console.log(`Total Cost: ${totalCost.toFixed(3)}`);
console.log(`Expected: 6007.185\n`);

// Test TU-01
const tu01_recipe = db.prepare(`
    SELECT r.unit_cost, rm.name
    FROM recipes r 
    JOIN raw_materials rm ON r.mp_code = rm.code 
    WHERE r.product_code = 'TU-01'
`).all();

console.log("TU-01 Recipe:");
totalCost = tu01_recipe.reduce((sum, item) => sum + item.unit_cost, 0);
console.log(`Total Cost: ${totalCost.toFixed(3)}`);
console.log(`Expected: 3316.005`);

db.close();
