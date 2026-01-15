import pandas as pd
import os

excel_path = '../ERP Universal.xlsx'
if not os.path.exists(excel_path):
    excel_path = 'ERP Universal.xlsx'

xl = pd.ExcelFile(excel_path)
df_recipe = pd.read_excel(xl, 'Receta')

# Check TO-01
to01 = df_recipe[df_recipe['Código'] == 'TO-01']
print("TO-01 Recipe:")
print(to01[['M P', 'Cant PR', 'Cant MP', 'C R', 'CU']].to_string())
print("\nUnique Cant PR values:", to01['Cant PR'].unique())
print("Sum of CU:", to01['CU'].sum())
print("Sum of CU / max(Cant PR):", to01['CU'].sum() / to01['Cant PR'].max())
