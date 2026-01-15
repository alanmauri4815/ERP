import pandas as pd
import os

excel_path = '../ERP Universal.xlsx'
if not os.path.exists(excel_path):
    excel_path = 'ERP Universal.xlsx'

xl = pd.ExcelFile(excel_path)
df_recipe = pd.read_excel(xl, 'Receta')
row = df_recipe.iloc[50]
for col, val in row.items():
    print(f"{col}: {val}")
