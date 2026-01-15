import pandas as pd
import json

file_path = 'ERP Universal.xlsx'
xl = pd.ExcelFile(file_path)

sheets_to_analyze = [
    'Productos', 'Materias Primas', 'Receta', 'Proveedores', 
    'Compras', 'Producción', 'Consumo', 'Stock', 
    'Ventas', 'Clientes', 'Inventario'
]

analysis = {}

def json_serializable(obj):
    if isinstance(obj, (pd.Timestamp, pd.DatetimeIndex)):
        return obj.isoformat()
    if pd.isna(obj):
        return None
    return str(obj)

for sheet in sheets_to_analyze:
    if sheet in xl.sheet_names:
        df = pd.read_excel(file_path, sheet_name=sheet)
        # Convert all columns to handle NaT and Timestamps
        sheet_data = df.head(5).to_dict(orient='records')
        
        # Clean the data for JSON
        clean_sample = []
        for row in sheet_data:
            clean_row = {k: (v.isoformat() if isinstance(v, pd.Timestamp) else (None if pd.isna(v) else v)) for k, v in row.items()}
            clean_sample.append(clean_row)

        analysis[sheet] = {
            'columns': list(df.columns),
            'dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()},
            'sample': clean_sample,
            'total_rows': len(df)
        }
    else:
        analysis[sheet] = "Sheet not found"

with open('erp_analysis.json', 'w', encoding='utf-8') as f:
    json.dump(analysis, f, indent=4, ensure_ascii=False)

print("Analysis complete. Saved to erp_analysis.json")
