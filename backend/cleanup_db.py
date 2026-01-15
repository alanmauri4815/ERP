
import sqlite3

def cleanup_db():
    conn = sqlite3.connect('erp_database.db')
    cursor = conn.cursor()
    
    tables = ['products', 'raw_materials', 'providers', 'clients', 'recipes', 'purchases', 'production', 'sales']
    
    for table in tables:
        try:
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [row[1] for row in cursor.fetchall()]
            
            if not columns:
                continue
                
            # Excluir la columna ID si existe para no fallar el check de "todo vacío"
            check_cols = [c for c in columns if c.lower() != 'id']
            
            if not check_cols:
                continue
                
            # Construir la condición: todas las columnas relevantes deben ser NULL o estar vacías
            conditions = [f"({c} IS NULL OR {c} = '')" for c in check_cols]
            where_clause = " AND ".join(conditions)
            
            cursor.execute(f"DELETE FROM {table} WHERE {where_clause}")
            deleted = cursor.rowcount
            if deleted > 0:
                print(f"Eliminados {deleted} registros vacíos de la tabla '{table}'.")
            else:
                print(f"No se encontraron registros completamente vacíos en '{table}'.")
                
        except Exception as e:
            print(f"Error procesando la tabla {table}: {e}")
            
    conn.commit()
    conn.close()

if __name__ == '__main__':
    cleanup_db()
