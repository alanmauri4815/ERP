
import sqlite3

def clean_raw_materials():
    try:
        conn = sqlite3.connect('erp_database.db')
        cursor = conn.cursor()
        
        # Eliminar registros donde el código sea NULL o esté vacío
        cursor.execute("DELETE FROM raw_materials WHERE code IS NULL OR code = ''")
        deleted = cursor.rowcount
        
        conn.commit()
        conn.close()
        print(f"Limpieza exitosa: se eliminaron {deleted} registros con código nulo o vacío de raw_materials.")
    except Exception as e:
        print(f"Error al limpiar la base de datos: {e}")

if __name__ == '__main__':
    clean_raw_materials()
