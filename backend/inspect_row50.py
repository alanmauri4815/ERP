import pandas as pd
import os

excel_path = '../ERP Universal.xlsx'
if not os.path.exists(excel_path):
    excel_path = 'ERP Universal.xlsx'

xl = pd.ExcelFile(excel_path)
df_recipe = pd.read_excel(xl, 'Receta')
print("Row 50 (MO-03 for TU-01):")
print(df_recipe.iloc[50].to_dict())
