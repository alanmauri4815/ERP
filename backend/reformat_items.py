
import sqlite3
import re

def parse_name(full_name, colors):
    # Regex to find size pattern (e.g., 160x80, 180x75x75, 150 cm, or just numbers like 160 if not part of a bigger word)
    # Pattern for numbers-x-numbers
    size_pattern = r'\d+x\d+(?:x\d+)?'
    # Pattern for cm/width
    width_pattern = r'\d+\s*cm'
    
    size_match = re.search(size_pattern, full_name)
    width_match = re.search(width_pattern, full_name)
    
    size = None
    if size_match:
        size = size_match.group()
    elif width_match:
        size = width_match.group()
    elif 'Microfibra Dep' in full_name:
        # Special case for Microfibra Dep 160 -> 160 might be size/weight
        m = re.search(r'Dep\s+(\d+)', full_name)
        if m:
            size = m.group(1)

    # Find color
    color = None
    color_full = None
    # Check if the name ends with a color code
    parts = full_name.split()
    if parts:
        last_part = parts[-1]
        if last_part in colors:
            color = last_part
            color_full = colors[last_part]
    
    # Extract description (first part before size or color)
    # We'll take the first word as the main description as requested
    description = parts[0] if parts else full_name
    
    # If it's something like "Microfibra Dep", let's be smarter
    if full_name.startswith('Microfibra Dep'):
        description = 'Microfibra Dep'
    elif full_name.startswith('Mantel Spandex'):
        description = 'Mantel Spandex'
    elif full_name.startswith('Bistrech'):
        description = 'Bistrech'
    elif full_name.startswith('Gabardina'):
        description = 'Gabardina'

    return description, size, color_full

def update_tables():
    colors_map = {
        'Az': 'Azul',
        'Ro': 'Rojo',
        'Am': 'Amarillo',
        'Vp': 'Verde',
        'Fu': 'Fucsia',
        'Na': 'Naranjo',
        'Ne': 'Negro',
        'Ca': 'Calipso',
        'Li': 'Lila',
        'Bl': 'Blanco',
        'Ve': 'Verde'
    }

    conn = sqlite3.connect('erp_database.db')
    cursor = conn.cursor()

    # Process Products
    cursor.execute('SELECT code, name FROM products')
    products = cursor.fetchall()
    for code, full_name in products:
        desc, size, color = parse_name(full_name, colors_map)
        cursor.execute('''
            UPDATE products 
            SET name = ?, size = ?, color = ? 
            WHERE code = ?
        ''', (desc, size, color, code))
    
    # Process Raw Materials
    cursor.execute('SELECT code, name FROM raw_materials')
    rms = cursor.fetchall()
    for code, full_name in rms:
        desc, size, color = parse_name(full_name, colors_map)
        cursor.execute('''
            UPDATE raw_materials 
            SET name = ?, size = ?, color = ? 
            WHERE code = ?
        ''', (desc, size, color, code))

    conn.commit()
    conn.close()
    print("Base de datos actualizada con descripciones, tamaños y colores.")

if __name__ == '__main__':
    update_tables()
