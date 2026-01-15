import pandas as pd
import os

excel_path = '../ERP Universal.xlsx'
if not os.path.exists(excel_path):
    excel_path = 'ERP Universal.xlsx'

xl = pd.ExcelFile(excel_path)
df_mp = pd.read_excel(xl, 'Materias Primas')
print(df_mp[df_mp['Código'] == 'MO-03'][['Código', 'Materia Prima', 'Costo Neto']])
