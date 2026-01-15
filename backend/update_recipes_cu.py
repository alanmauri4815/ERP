import sqlite3
import pandas as pd

db_path = 'erp_database.db'
excel_path = '../ERP Universal.xlsx'

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Clear existing recipes
cursor.execute('DELETE FROM recipes')

# Reload recipes with all necessary fields
df_receta = pd.read_excel(excel_path, sheet_name='Receta')
for _, row in df_receta.iterrows():
    if pd.notna(row['Código']) and pd.notna(row['M P']):
        batch_size = row.get('Cant PR', 1)
        if pd.isna(batch_size):
            batch_size = 1
        
        unit_cost = row.get('CU', 0)
        if pd.isna(unit_cost):
            unit_cost = 0
            
        cursor.execute('''
            INSERT INTO recipes (product_code, mp_code, quantity, batch_size, unit_cost)
            VALUES (?, ?, ?, ?, ?)
        ''', (row['Código'], row['M P'], row['Cant MP'], int(batch_size), float(unit_cost)))

conn.commit()
conn.close()
print("Recipes updated with unit_cost successfully.")
