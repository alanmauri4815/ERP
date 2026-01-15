import pandas as pd
import os

excel_path = '../ERP Universal.xlsx'
if not os.path.exists(excel_path):
    excel_path = 'ERP Universal.xlsx'

xl = pd.ExcelFile(excel_path)
df_mp = pd.read_excel(xl, 'Materias Primas')
df_recipe = pd.read_excel(xl, 'Receta')

# Inspect TU-01 recipe
print("Recipe for TU-01:")
print(df_recipe[df_recipe['Código'] == 'TU-01'])

print("\nCosts for those MPs:")
mp_codes = df_recipe[df_recipe['Código'] == 'TU-01']['M P'].unique()
print(df_mp[df_mp['Código'].isin(mp_codes)][['Código', 'Materia Prima', 'Costo Neto']])
