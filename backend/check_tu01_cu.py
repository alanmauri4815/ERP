import pandas as pd
import os

excel_path = '../ERP Universal.xlsx'
if not os.path.exists(excel_path):
    excel_path = 'ERP Universal.xlsx'

xl = pd.ExcelFile(excel_path)
df_recipe = pd.read_excel(xl, 'Receta')

tu01 = df_recipe[df_recipe['Código'] == 'TU-01']
print("TU-01 Recipe Detail (all columns):")
print(tu01[['M P', 'Cant PR', 'Cant MP', 'CU']].to_string())
print("\nTotal Sum of CU for TU-01:", tu01['CU'].sum())
