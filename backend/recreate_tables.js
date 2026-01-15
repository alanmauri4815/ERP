const Database = require('better-sqlite3');
const db = new Database('erp_database.db');

db.exec(`
    -- Drop existing tables to recreate them with new structure
    DROP TABLE IF EXISTS sale_items;
    DROP TABLE IF EXISTS sales;
    DROP TABLE IF EXISTS purchase_items;
    DROP TABLE IF EXISTS purchases;

    -- Create Sales tables
    CREATE TABLE sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        client_id INTEGER,
        net INTEGER,
        iva INTEGER,
        total INTEGER,
        FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER,
        item_number INTEGER,
        product_code TEXT,
        quantity REAL,
        unit_price INTEGER,
        subtotal INTEGER,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (product_code) REFERENCES products(code)
    );

    -- Create Purchases tables
    CREATE TABLE purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        provider_id INTEGER,
        net INTEGER,
        iva INTEGER,
        total INTEGER,
        FOREIGN KEY (provider_id) REFERENCES providers(id)
    );

    CREATE TABLE purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER,
        item_number INTEGER,
        mp_code TEXT,
        quantity REAL,
        unit_price INTEGER,
        subtotal INTEGER,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id),
        FOREIGN KEY (mp_code) REFERENCES raw_materials(code)
    );
`);

console.log("Database schema updated for multiple items in sales and purchases.");
db.close();
