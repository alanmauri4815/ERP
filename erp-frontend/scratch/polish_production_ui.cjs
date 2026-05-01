const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');

// 1. Round values in editProduction
content = content.replace(
    /rows\[i\]\.querySelector\('\.prod-item-mp'\)\.value = item\.material_cost \|\| 0;/,
    "rows[i].querySelector('.prod-item-mp').value = Math.round(item.material_cost || 0);"
);
content = content.replace(
    /rows\[i\]\.querySelector\('\.prod-item-mo'\)\.value = item\.mo_cost \|\| 0;/,
    "rows[i].querySelector('.prod-item-mo').value = Math.round(item.mo_cost || 0);"
);

// 2. Improve Modal UI (3 columns grid and better styling)
const cleanModalCosts = `<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1.2rem; margin-top: 1rem; padding: 1.2rem; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1)">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 700; color: #f59e0b; display: flex; align-items: center; gap: 4px; font-size: 0.85rem">
                <span>📦</span> Costo MP / Insumos
              </label>
              <input type="number" id="prod-material-cost" value="0" style="border-color: #f59e0b44; background: rgba(245,158,11,0.02); font-weight: 700">
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 700; color: #3b82f6; display: flex; align-items: center; gap: 4px; font-size: 0.85rem">
                <span>🧵</span> Mano de Obra / Confecc.
              </label>
              <input type="number" id="prod-labor-cost" value="0" style="border-color: #3b82f644; background: rgba(59,130,246,0.02); font-weight: 700" oninput="document.getElementById('mo-details-group').style.display = (parseFloat(this.value) > 0 ? 'block' : 'none')">
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 700; color: #6b7280; display: flex; align-items: center; gap: 4px; font-size: 0.85rem">
                <span>⚙️</span> Gastos Generales
              </label>
              <input type="number" id="prod-general-expenses" value="0" style="border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.02); font-weight: 700">
            </div>

            <div id="mo-details-group" style="grid-column: span 3; display: none; background: rgba(59,130,246,0.05); padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(59,130,246,0.1); margin-top: 0.2rem">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem">
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.75rem; text-transform: uppercase; opacity:0.7; font-weight:700">Tipo Pago MO</label>
                  <select id="prod-mo-subcontracted" style="font-size:0.85rem">
                    <option value="direct">Interno / Directo</option>
                    <option value="subcontracted">Subcontratado (Externo)</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.75rem; text-transform: uppercase; opacity:0.7; font-weight:700">Documento MO</label>
                  <select id="prod-mo-doc-type" style="font-size:0.85rem">
                    <option value="none">Sin Documento</option>
                    <option value="boleta">Boleta de Honorarios</option>
                    <option value="factura">Factura de Servicios</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.75rem; text-transform: uppercase; opacity:0.7; font-weight:700">Estado Pago MO</label>
                  <select id="prod-mo-status" style="font-size:0.85rem">
                    <option value="paid">✅ Pagado</option>
                    <option value="due">⏳ Por Pagar</option>
                  </select>
                </div>
              </div>
            </div>
          </div>`;

content = content.replace(
    /<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1rem;[^>]+>[\s\S]+?<\/div>\s+<\/div>/,
    cleanModalCosts
);

// 3. Fix History Row "Cliente" column to show more info
content = content.replace(
    /const q = p\.quotation_id \? state\.quotations\.find\(quote => quote\.id == p\.quotation_id\) : null;\s+const cName = q\?\.clients\?\.name \|\| q\?\.name \|\| p\.client_name \|\| '-';\s+return `<strong>\$\{cName\}<\/strong>`;/,
    `const q = p.quotation_id ? state.quotations.find(quote => quote.id == p.quotation_id) : null;
                    const cName = q?.clients?.name || q?.name || p.client_name || '-';
                    const cLabel = q?.clients?.name ? \`👤 \${q.clients.name}\` : cName;
                    return \`<strong>\${cLabel}</strong>\`;`
);

fs.writeFileSync('main.js', content);
console.log('UI and rounding fixes complete');
