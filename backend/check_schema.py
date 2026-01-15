import sqlite3

conn = sqlite3.connect('erp_database.db')
cursor = conn.cursor()

tables = ['purchases', 'purchase_items', 'sales', 'sale_items']
for table in tables:
    print(f"--- Schema for {table} ---")
    cursor.execute(f"SELECT sql FROM sqlite_master WHERE name='{table}'")
    row = cursor.fetchone()
    if row:
        print(row[0])
    else:
        print("Table not found")

conn.close()
