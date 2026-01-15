
import sqlite3

def deep_clean():
    conn = sqlite3.connect('erp_database.db')
    cursor = conn.cursor()
    
    tables = ['products', 'raw_materials', 'providers', 'clients', 'recipes', 'purchases', 'production', 'sales']
    
    for table in tables:
        # Panteamos el borrado de cualquier fila donde el campo principal sea nulo, vacio o la cadena "null"
        # Para products y raw_materials el campo es 'code'
        # Para otros puede ser 'name' o 'id'
        pk = 'code'
        if table in ['providers', 'clients', 'purchases', 'production', 'sales']:
            pk = 'id'
            
        try:
            # Borrar si el PK es null, vacio, o literal "null"
            cursor.execute(f"DELETE FROM {table} WHERE {pk} IS NULL OR {pk} = '' OR {pk} = 'null' OR {pk} = 'None'")
            deleted = cursor.rowcount
            if deleted > 0:
                print(f"Tabla {table}: Eliminados {deleted} registros con {pk} inválido.")
            
            # Limpieza agresiva: si Name o Código son "null" (string)
            if table in ['products', 'raw_materials']:
                cursor.execute(f"DELETE FROM {table} WHERE name = 'null' OR name IS NULL OR name = ''")
                deleted_name = cursor.rowcount
                if deleted_name > 0:
                    print(f"Tabla {table}: Eliminados {deleted_name} registros con Nombre inválido.")
                    
        except Exception as e:
            print(f"Error en {table}: {e}")
            
    conn.commit()
    conn.close()
    print("Limpieza profunda completada.")

if __name__ == '__main__':
    deep_clean()
