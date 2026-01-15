import pandas as pd

excel_path = '../ERP Universal.xlsx'
df_recipe = pd.read_excel(excel_path, 'Receta')

# Check TO-01 in detail
to01 = df_recipe[df_recipe['Código'] == 'TO-01']
print("TO-01 Full Recipe:")
print(to01[['M P', 'Nombre', 'Cant PR', 'Cant MP', 'C R', 'CU']].to_string())
print("\nSum of CU:", to01['CU'].sum())
print("\nFormula check for first row:")
first = to01.iloc[0]
print(f"C R = {first['C R']}")
print(f"Cant MP = {first['Cant MP']}")
print(f"CU = {first['CU']}")
print(f"C R × Cant MP = {first['C R'] * first['Cant MP']}")
