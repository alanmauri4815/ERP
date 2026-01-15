import pandas as pd
import os

excel_path = '../ERP Universal.xlsx'
if not os.path.exists(excel_path):
    excel_path = 'ERP Universal.xlsx'

xl = pd.ExcelFile(excel_path)

df_products = pd.read_excel(xl, 'Productos')
df_mp = pd.read_excel(xl, 'Materias Primas')
df_recipe = pd.read_excel(xl, 'Receta')

# Clean up data
df_products = df_products[['Código', 'Producto', 'Costo Unit']].dropna(subset=['Código'])
df_mp = df_mp[['Código', 'Materia Prima', 'Costo Neto']].dropna(subset=['Código'])
df_recipe = df_recipe.dropna(subset=['Código', 'M P'])

# Create a mapping for MP costs
mp_costs = df_mp.set_index('Código')['Costo Neto'].to_dict()

# Calculate recipe costs
calculated_costs = {}
for p_code in df_products['Código'].unique():
    recipe_items = df_recipe[df_recipe['Código'] == p_code]
    total_cost = 0
    for _, item in recipe_items.iterrows():
        mp_code = item['M P']
        qty = item['Cant MP']
        cost = mp_costs.get(mp_code, 0)
        total_cost += cost * qty
    calculated_costs[p_code] = total_cost

# Compare
comparison = []
for _, row in df_products.iterrows():
    p_code = row['Código']
    excel_cost = row['Costo Unit']
    calc_cost = calculated_costs.get(p_code, 0)
    comparison.append({
        'Código': p_code,
        'Producto': row['Producto'],
        'Excel Cost': excel_cost,
        'Calc Cost': calc_cost,
        'Diff': calc_cost - excel_cost
    })

df_comp = pd.DataFrame(comparison)
print(df_comp)
print("\nItems with difference > 1:")
print(df_comp[df_comp['Diff'].abs() > 1])
