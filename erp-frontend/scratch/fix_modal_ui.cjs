const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');

// The problematic block is around line 520-560
const oldBlock = `<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05)">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600; color: var(--accent)">📦 Costo MP / Insumos ($)</label>
              <input type="number" id="prod-material-cost" value="0" style="border-color: var(--accent)44">
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600; color: var(--primary)">🧵 Mano de Obra / Confecc. ($)</label>
              <input type="number" id="prod-labor-cost" value="0" style="border-color: var(--primary)44" oninput="document.getElementById('mo-details-group').style.display = (parseFloat(this.value) > 0 ? 'block' : 'none')">
            </div>
            </div>
            <div id="mo-details-group" style="grid-column: span 3; display: none; background: rgba(var(--primary-rgb), 0.03); padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(var(--primary-rgb), 0.1); margin-top: 0.5rem">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem">
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.8rem; opacity:0.8">Tipo Pago MO</label>
                  <select id="prod-mo-subcontracted" style="font-size:0.9rem">
                    <option value="direct">Interno / Directo</option>
                    <option value="subcontracted">Subcontratado (Externo)</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.8rem; opacity:0.8">Documento MO</label>
                  <select id="prod-mo-doc-type" style="font-size:0.9rem">
                    <option value="none">Sin Documento</option>
                    <option value="boleta">Boleta de Honorarios</option>
                    <option value="factura">Factura de Servicios</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.8rem; opacity:0.8">Estado Pago MO</label>
                  <select id="prod-mo-status" style="font-size:0.9rem">
                    <option value="paid">✅ Pagado</option>
                    <option value="due">⏳ Por Pagar</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600; color: var(--warning)">⚙️ Gastos Generales / Varios ($)</label>
              <input type="number" id="prod-general-expenses" value="0" style="border-color: var(--warning)44">
            </div>`;

// Note: I need to be careful with exact whitespace/CRLF.
// I'll use a regex to find this mess and replace it with a clean version.

const newBlock = `<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05)">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600; color: var(--accent)">📦 Costo MP / Insumos ($)</label>
              <input type="number" id="prod-material-cost" value="0" style="border-color: var(--accent)44">
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600; color: var(--primary)">🧵 Mano de Obra / Confecc. ($)</label>
              <input type="number" id="prod-labor-cost" value="0" style="border-color: var(--primary)44" oninput="document.getElementById('mo-details-group').style.display = (parseFloat(this.value) > 0 ? 'block' : 'none')">
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600; color: var(--warning)">⚙️ Gastos Grales. / Varios ($)</label>
              <input type="number" id="prod-general-expenses" value="0" style="border-color: var(--warning)44">
            </div>

            <div id="mo-details-group" style="grid-column: span 3; display: none; background: rgba(var(--primary-rgb), 0.03); padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(var(--primary-rgb), 0.1); margin-top: 0.5rem">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem">
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.8rem; opacity:0.8">Tipo Pago MO</label>
                  <select id="prod-mo-subcontracted" style="font-size:0.9rem">
                    <option value="direct">Interno / Directo</option>
                    <option value="subcontracted">Subcontratado (Externo)</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.8rem; opacity:0.8">Documento MO</label>
                  <select id="prod-mo-doc-type" style="font-size:0.9rem">
                    <option value="none">Sin Documento</option>
                    <option value="boleta">Boleta de Honorarios</option>
                    <option value="factura">Factura de Servicios</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.8rem; opacity:0.8">Estado Pago MO</label>
                  <select id="prod-mo-status" style="font-size:0.9rem">
                    <option value="paid">✅ Pagado</option>
                    <option value="due">⏳ Por Pagar</option>
                  </select>
                </div>
              </div>
            </div>
          </div>`;

// I'll use a more flexible regex to find the block because of the stray </div>
content = content.replace(
    /<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1rem;[^>]+>[\s\S]+?<input type="number" id="prod-general-expenses"[\s\S]+?<\/div>/,
    newBlock
);

fs.writeFileSync('main.js', content);
console.log('Production modal UI fix complete');
