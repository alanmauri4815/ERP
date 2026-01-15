import pandas as pd
import sqlite3
import os

db_path = 'erp_database.db'
excel_path = '../ERP Universal.xlsx'

# Ensure we are in the backend directory
if os.path.basename(os.getcwd()) != 'backend':
    db_path = 'backend/erp_database.db'

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Create Tables
cursor.executescript('''
CREATE TABLE IF NOT EXISTS raw_materials (
    code TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    unit TEXT,
    cost_net INTEGER,
    stock REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
    code TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    price_net INTEGER,
    price_sale INTEGER,
    cost_unit REAL,
    stock INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipes (
    product_code TEXT,
    mp_code TEXT,
    quantity REAL,
    FOREIGN KEY (product_code) REFERENCES products(code),
    FOREIGN KEY (mp_code) REFERENCES raw_materials(code)
);

CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY,
    name TEXT,
    contact TEXT,
    phone TEXT
);

CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY,
    name TEXT,
    address TEXT
);

CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    provider_id INTEGER,
    mp_code TEXT,
    quantity REAL,
    total INTEGER,
    FOREIGN KEY (mp_code) REFERENCES raw_materials(code)
);

CREATE TABLE IF NOT EXISTS production (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    product_code TEXT,
    quantity REAL,
    mo_cost REAL,
    FOREIGN KEY (product_code) REFERENCES products(code)
);

CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    client_id INTEGER,
    product_code TEXT,
    quantity REAL,
    total INTEGER,
    FOREIGN KEY (product_code) REFERENCES products(code)
);
''')

# 2. Load Data from Excel
xl = pd.ExcelFile(excel_path)

# Products
df_products = pd.read_excel(excel_path, sheet_name='Productos')
for _, row in df_products.iterrows():
    cursor.execute('''
        INSERT OR REPLACE INTO products (code, name, type, price_net, price_sale, cost_unit)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (row['Código'], row['Producto'], row['Tipo'], row['Precio Neto'], row['Precio Venta'], row['Costo Unit']))

# Raw Materials
df_mp = pd.read_excel(excel_path, sheet_name='Materias Primas')
for _, row in df_mp.iterrows():
    cursor.execute('''
        INSERT OR REPLACE INTO raw_materials (code, name, type, unit, cost_net)
        VALUES (?, ?, ?, ?, ?)
    ''', (row['Código'], row['Materia Prima'], row['Tipo'], row['Unidad'], row['Costo Neto']))

# Providers
df_prov = pd.read_excel(excel_path, sheet_name='Proveedores')
for _, row in df_prov.iterrows():
    cursor.execute('''
        INSERT OR REPLACE INTO providers (id, name, contact, phone)
        VALUES (?, ?, ?, ?)
    ''', (row['Codigo'], row['Nombre'], row['Contacto'], row['Teléfono']))

# Clients
df_cli = pd.read_excel(excel_path, sheet_name='Clientes')
for _, row in df_cli.iterrows():
    if pd.notna(row['ID']):
        cursor.execute('''
            INSERT OR REPLACE INTO clients (id, name, address)
            VALUES (?, ?, ?)
        ''', (row['ID'], row['Nombre'], row['Dirección']))

# Recipes
df_receta = pd.read_excel(excel_path, sheet_name='Receta')
for _, row in df_receta.iterrows():
    if pd.notna(row['Código']) and pd.notna(row['M P']):
        cursor.execute('''
            INSERT INTO recipes (product_code, mp_code, quantity)
            VALUES (?, ?, ?)
        ''', (row['Código'], row['M P'], row['Cant MP']))

# Stocks (Calculated or imported)
# Since Stock and Inventario sheets exist, let's use them to set initial stock
df_stock_mp = pd.read_excel(excel_path, sheet_name='Stock')
for _, row in df_stock_mp.iterrows():
    cursor.execute('UPDATE raw_materials SET stock = ? WHERE code = ?', (row['Stock'], row['Código']))

df_stock_pt = pd.read_excel(excel_path, sheet_name='Inventario')
for _, row in df_stock_pt.iterrows():
    cursor.execute('UPDATE products SET stock = ? WHERE code = ?', (row['Stock'], row['MP'])) # In Excel 'Inventario', products are listed under 'MP' column curiously

conn.commit()
conn.close()
print("Database initialized and data migrated successfully.")
