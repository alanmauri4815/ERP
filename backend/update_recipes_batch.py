import sqlite3
import pandas as pd

db_path = 'erp_database.db'
excel_path = '../ERP Universal.xlsx'

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Clear existing recipes
cursor.execute('DELETE FROM recipes')

# Reload recipes with batch_size
df_receta = pd.read_excel(excel_path, sheet_name='Receta')
for _, row in df_receta.iterrows():
    if pd.notna(row['Código']) and pd.notna(row['M P']):
        batch_size = row.get('Cant PR', 1)
        if pd.isna(batch_size):
            batch_size = 1
        cursor.execute('''
            INSERT INTO recipes (product_code, mp_code, quantity, batch_size)
            VALUES (?, ?, ?, ?)
        ''', (row['Código'], row['M P'], row['Cant MP'], int(batch_size)))

conn.commit()
conn.close()
print("Recipes updated with batch_size successfully.")
