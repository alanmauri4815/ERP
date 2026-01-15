import pandas as pd

excel_path = '../ERP Universal.xlsx'
df_recipe = pd.read_excel(excel_path, 'Receta')
df_mp = pd.read_excel(excel_path, 'Materias Primas')

# Get cost for TE-09
te09_cost = df_mp[df_mp['Código'] == 'TE-09']['Costo Neto'].values[0]
print(f"TE-09 Costo Neto from MP table: {te09_cost}")

# Check TO-01 first row
to01 = df_recipe[df_recipe['Código'] == 'TO-01']
first_row = to01.iloc[0]
print(f"\nTO-01 first row (TE-09):")
print(f"  C R: {first_row['C R']}")
print(f"  Cant MP: {first_row['Cant MP']}")
print(f"  CU: {first_row['CU']}")
print(f"  Expected CU = C R × Cant MP = {first_row['C R'] * first_row['Cant MP']}")

# Check row with Cant PR = 8
row_8 = to01[to01['Cant PR'] == 8].iloc[0]
te03_cost = df_mp[df_mp['Código'] == row_8['M P']]['Costo Neto'].values[0]
print(f"\nTE-03 Costo Neto from MP table: {te03_cost}")
print(f"TO-01 row with Cant PR=8 (TE-03):")
print(f"  C R: {row_8['C R']}")
print(f"  Cant MP: {row_8['Cant MP']}")
print(f"  Cant PR: {row_8['Cant PR']}")
print(f"  CU: {row_8['CU']}")
print(f"  C R × Cant MP / Cant PR = {row_8['C R'] * row_8['Cant MP'] / row_8['Cant PR']}")
