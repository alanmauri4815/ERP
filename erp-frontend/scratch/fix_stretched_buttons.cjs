const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');

// 1. Fix the entire production view HTML structure (Remove messy grids and divs)
const cleanProductionView = `
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="prod-date" value="\${new Date().toISOString().split('T')[0]}">
        </div>

        <div style="background: rgba(var(--primary-rgb), 0.05); padding: 1.2rem; border-radius: 0.8rem; margin-bottom: 1.5rem; border: 1px solid rgba(var(--primary-rgb), 0.2)">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.5rem; margin-bottom: 1.2rem">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 700; color: var(--primary)">Método de Producción</label>
              <select id="prod-category" onchange="window.toggleProdCategory()" style="font-size: 1rem; padding: 0.6rem">
                <option value="push">🚀 Push (fabricar para vender)</option>
                <option value="pull">🔄 Pull (de cotización ganada)</option>
              </select>
            </div>
            <div class="form-group" id="prod-project-group" style="margin:0; display:none">
              <label style="font-weight: 700; color: var(--secondary)">📁 Cotización Asociada</label>
              <select id="prod-quotation" style="border: 2px solid var(--secondary); padding: 0.6rem">
                <option value="">Sin asociar</option>
                \${state.quotations.filter(q => q.status === 'approved' || q.status === 'production').map(q => \`<option value="\${q.id}">📋 \${q.name || ('Cotización #' + q.id)} — 👤 \${q.clients?.name || 'Cliente'}</option>\`).join('')}
              </select>
            </div>
          </div>
          
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1rem; padding: 1rem; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1)">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 700; color: #f59e0b; font-size: 0.8rem; margin-bottom: 0.4rem; display: block">📦 Costo MP / Insumos ($)</label>
              <input type="number" id="prod-material-cost" value="0" style="border-color: #f59e0b44; background: rgba(245,158,11,0.02)">
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 700; color: #3b82f6; font-size: 0.8rem; margin-bottom: 0.4rem; display: block">🧵 Mano de Obra / Confecc. ($)</label>
              <input type="number" id="prod-labor-cost" value="0" style="border-color: #3b82f644; background: rgba(59,130,246,0.02)" oninput="document.getElementById('mo-details-group').style.display = (parseFloat(this.value) > 0 ? 'block' : 'none')">
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 700; color: #6b7280; font-size: 0.8rem; margin-bottom: 0.4rem; display: block">⚙️ Gastos Generales ($)</label>
              <input type="number" id="prod-general-expenses" value="0" style="border-color: rgba(255,255,255,0.1)">
            </div>

            <div id="mo-details-group" style="grid-column: span 3; display: none; background: rgba(59,130,246,0.05); padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(59,130,246,0.1); margin-top: 0.5rem">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem">
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.7rem; text-transform: uppercase; opacity:0.7; font-weight:700">Tipo Pago</label>
                  <select id="prod-mo-subcontracted" style="font-size:0.85rem">
                    <option value="direct">Interno / Directo</option>
                    <option value="subcontracted">Subcontratado</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.7rem; text-transform: uppercase; opacity:0.7; font-weight:700">Documento</label>
                  <select id="prod-mo-doc-type" style="font-size:0.85rem">
                    <option value="none">Sin Documento</option>
                    <option value="boleta">Boleta Honorarios</option>
                    <option value="factura">Factura Servicios</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0">
                  <label style="font-size:0.7rem; text-transform: uppercase; opacity:0.7; font-weight:700">Estado</label>
                  <select id="prod-mo-status" style="font-size:0.85rem">
                    <option value="paid">✅ Pagado</option>
                    <option value="due">⏳ Por Pagar</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <table class="item-table">`;

// I'll replace everything between #prod-date and <table class="item-table">
content = content.replace(
    /<div class="form-group">[\s\S]+?<label>Fecha<\/label>[\s\S]+?<table class="item-table">/,
    cleanProductionView
);

// 2. Fix PULL Mano de Obra logic (More inclusive filtering)
content = content.replace(
    /const extraLabor = quote\.items\s+\.filter\(it => it\.item_type === 'labor' \|\| it\.item_type === 'mo' \|\| it\.type === 'MO'\)/,
    `const extraLabor = quote.items
                  .filter(it => 
                    it.item_type === 'labor' || 
                    it.item_type === 'mo' || 
                    it.type === 'MO' || 
                    (it.description || '').toLowerCase().includes('confección') ||
                    (it.description || '').toLowerCase().includes('mano de obra')
                  )`
);

fs.writeFileSync('main.js', content);
console.log('Production layout and MO logic fixed');
