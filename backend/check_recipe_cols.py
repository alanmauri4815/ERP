import pandas as pd
import os

excel_path = '../ERP Universal.xlsx'
if not os.path.exists(excel_path):
    excel_path = 'ERP Universal.xlsx'

xl = pd.ExcelFile(excel_path)
df_recipe = pd.read_excel(xl, 'Receta')
print("Columns:", df_recipe.columns.tolist())
print("\nFirst row of recipe:")
print(df_recipe.iloc[0])

# Better display for TU-01
tu01 = df_recipe[df_recipe['Código'] == 'TU-01']
print("\nTU-01 Recipe Detail (selected columns):")
# Assuming column names from my previous knowledge or logical guessing if they were truncated
cols = [c for c in tu01.columns if 'M' in c or 'Cant' in c or 'Código' in c]
print(tu01[cols])
