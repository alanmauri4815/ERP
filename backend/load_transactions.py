import pandas as pd
import sqlite3
import os

db_path = 'erp_database.db'
excel_path = '../ERP Universal.xlsx'

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Clear existing history
print("Cleaning old history...")
cursor.execute("DELETE FROM purchase_items")
cursor.execute("DELETE FROM purchases")
cursor.execute("DELETE FROM sale_items")
cursor.execute("DELETE FROM sales")
conn.commit()

# 2. Map providers by name
cursor.execute("SELECT id, name FROM providers")
providers_map = {str(name).strip().lower(): id for id, name in cursor.fetchall()}

# 3. Import Compras
print("Importing Compras...")
try:
    df_compras = pd.read_excel(excel_path, sheet_name='Compras')
    # Filter valid rows
    df_compras = df_compras[df_compras['ID'].notna()]
    
    for trans_id, group in df_compras.groupby('ID'):
        first_row = group.iloc[0]
        
        # Date logic
        date_val = first_row['Fecha']
        if pd.isna(date_val):
            date_str = "2025-01-01"
        else:
            date_str = str(date_val)[:10]
            
        prov_name = str(first_row['Proveedor']).strip().lower()
        prov_id = providers_map.get(prov_name)
        
        # Sometimes providers aren't exactly the same, try partial match if needed
        if not prov_id:
            for name, pid in providers_map.items():
                if name in prov_name or prov_name in name:
                    prov_id = pid
                    break
        
        net_total = int(group['Neto'].sum())
        iva_total = int(group['IVA'].sum())
        total_total = int(group['Total'].sum())
        
        cursor.execute("""
            INSERT INTO purchases (id, date, provider_id, net, iva, total)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (int(trans_id) + 1, date_str, prov_id, net_total, iva_total, total_total))
        
        purchase_db_id = cursor.lastrowid
        
        for i, (_, row) in enumerate(group.iterrows()):
            mp_code = str(row['MP']).strip()
            qty = float(row['Cantidad'])
            # CU Base seems to be the unit price
            price = int(row['CU Base']) if pd.notna(row['CU Base']) else 0
            subtotal = int(row['Total'])
            
            cursor.execute("""
                INSERT INTO purchase_items (purchase_id, item_number, mp_code, quantity, unit_price, subtotal)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (purchase_db_id, i + 1, mp_code, qty, price, subtotal))

    print(f"Purchases imported: {len(df_compras['ID'].unique())} transactions")
except Exception as e:
    print(f"Error importing Compras: {e}")

# 4. Import Ventas
print("Importing Ventas...")
try:
    df_ventas = pd.read_excel(excel_path, sheet_name='Ventas')
    df_ventas = df_ventas[df_ventas['ID'].notna()]
    
    for trans_id, group in df_ventas.groupby('ID'):
        first_row = group.iloc[0]
        
        date_val = first_row['Fecha']
        if pd.isna(date_val):
            date_str = "2025-01-01"
        else:
            date_str = str(date_val)[:10]
            
        # We don't have client IDs mapped yet, let's just use NULL
        client_id = None
        
        net_total = int(group['Neto'].sum())
        iva_total = int(group['IVA'].sum())
        # The sum of 'Total' (which includes Propina/Maquina)
        total_col = 'Total' if 'Total' in group.columns else ('Subtotal' if 'Subtotal' in group.columns else 'Neto')
        total_total = int(group[total_col].sum())
        
        cursor.execute("""
            INSERT INTO sales (id, date, client_id, net, iva, total)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (int(trans_id), date_str, client_id, net_total, iva_total, total_total))
        
        sale_db_id = cursor.lastrowid
        
        for i, (_, row) in enumerate(group.iterrows()):
            prod_code = str(row['Producto']).strip()
            qty = float(row['Cantidad'])
            price = int(row['Precio']) if pd.notna(row['Precio']) else 0
            subtotal = int(row[total_col])
            
            cursor.execute("""
                INSERT INTO sale_items (sale_id, item_number, product_code, quantity, unit_price, subtotal)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (sale_db_id, i + 1, prod_code, qty, price, subtotal))

    print(f"Sales imported: {len(df_ventas['ID'].unique())} transactions")
except Exception as e:
    print(f"Error importing Ventas: {e}")

conn.commit()
conn.close()
print("Migration completed.")
