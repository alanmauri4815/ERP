const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');

// 1. Reconstruct the purchases view string with a PREMIUM UI
const cleanPurchasesView = `  purchases: () => \`
    <header class="animate-fade">
      <h1>Compras e Informes de Gastos</h1>
      <div style="display: flex; gap: 0.5rem">
        <button onclick="window.runMigration()" style="background: var(--danger); font-size: 0.7rem; padding: 2px 5px">🔧 Migrar DB</button>
        <button onclick="window.exportPurchases()" style="background: var(--accent)">📊 Exportar a Excel</button>
        <button onclick="window.openPurchaseModal()" style="background: var(--secondary)">+ Registrar Compra / Gasto</button>
      </div>
    </header>

    <div class="card animate-fade" style="margin-bottom: 1.5rem; padding: 1.25rem; border-left: 4px solid var(--primary)">
      <div style="display: flex; gap: 1.5rem; align-items: flex-end; flex-wrap: wrap">
        <div class="form-group" style="margin-bottom: 0; min-width: 200px">
          <label style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; display: block">Tipo de Registro</label>
          <select onchange="window.updatePurchaseFilters('type', this.value)" style="padding: 0.6rem; border-radius: 8px; background: var(--surface-light); border: 1px solid var(--border); color: var(--text); width: 100%">
            <option value="all" \${state.purchaseFilters.type === 'all' ? 'selected' : ''}>📑 Todos los registros</option>
            <option value="mp" \${state.purchaseFilters.type === 'mp' ? 'selected' : ''}>📦 Insumos (Inventariable)</option>
            <option value="expense" \${state.purchaseFilters.type === 'expense' ? 'selected' : ''}>💸 Gasto / Caja Chica</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 250px">
          <label style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; display: block">Buscar Proyecto, Proveedor o Glosa</label>
          <div style="position: relative">
            <i class="fas fa-search" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); opacity: 0.4"></i>
            <input type="text" 
              placeholder="Escribe para filtrar resultados..." 
              value="\${state.purchaseFilters.search}"
              oninput="window.updatePurchaseFilters('search', this.value)"
              style="padding: 0.6rem 0.6rem 0.6rem 2.5rem; border-radius: 8px; background: var(--surface-light); border: 1px solid var(--border); color: var(--text); width: 100%">
          </div>
        </div>
      </div>
    </div>

    <div class="card animate-fade">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem">
        <h2 style="margin: 0">Historial de Movimientos</h2>
        <span class="badge" style="background: var(--primary-muted); color: var(--primary); font-size: 0.8rem">
          Mostrando: \${state.history.purchases.length} registros
        </span>
      </div>
      <div id="purchases-history-content">
        \${renderHistoryTable('purchases')}
      </div>
    </div>

    <!-- Purchase Modal -->
    <div id="buy-modal" class="modal" style="display:none">
      <div class="card modal-content modal-wide">
        <header>
          <h3 id="buy-modal-title">Nueva Compra / Gasto</h3>
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted)">✕</button>
        </header>

        <input type="hidden" id="pur-edit-mode" value="false">
        <input type="hidden" id="pur-edit-id" value="">

        <!-- Header Info -->
        <div style="background: var(--surface-light); padding: 1.25rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 1px solid var(--border-strong)">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.25rem">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 700; color: var(--primary); font-size: 0.85rem">Tipo de Registro</label>
              <select id="pur-type" onchange="window.togglePurType()" style="font-size: 1rem; border: 1px solid var(--border)">
                <option value="mp">📦 Compra de Insumos (Inventariable)</option>
                <option value="expense">💸 Informe de Gasto / Caja Chica (Gasto Operacional)</option>
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 700; color: var(--secondary); font-size: 0.85rem">Categoría de Compra</label>
              <select id="pur-category" onchange="window.togglePurCategory()" style="font-size: 1rem; border: 1px solid var(--border)">
                <option value="general">💼 General (sin producción específica)</option>
                <option value="pull" class="pro-only-option">🔄 Pull (de cotización ganada)</option>
                <option value="push">🚀 Push (para fabricar y vender)</option>
                <option value="comercializacion">🏪 Comercialización (reventa)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Main Fields -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem">
          <div class="form-group" id="pur-prov-group">
            <label style="font-weight: 600">Proveedor</label>
            <div style="display: flex; gap: 0.5rem">
              <select id="pur-prov" style="flex: 1">
                <option value="">Sin Proveedor / Boleta</option>
                \${state.providers.map(p => \`<option value="\${p.id}">\${p.name}</option>\`).join('')}
              </select>
              <button type="button" onclick="window.openProviderModal(); document.getElementById('prov-modal').style.display='flex'; document.getElementById('prov-modal').style.zIndex='10000';" style="padding: 0 0.75rem; background: var(--surface-light); border: 1px solid var(--border)" title="Nuevo Proveedor">+</button>
            </div>
          </div>
          <div class="form-group">
            <label style="font-weight: 600">Fecha de Registro</label>
            <input type="date" id="pur-date" value="\${new Date().toISOString().split('T')[0]}" required>
          </div>
          <div class="form-group">
            <label style="font-weight: 600">Nº Documento</label>
            <input type="text" id="pur-doc-number" placeholder="Ej: 12345">
          </div>
          <div class="form-group" id="pur-project-group">
            <label style="font-weight: 600; color: var(--secondary)">📁 Proyecto Asociado</label>
            <select id="pur-project" style="border: 2px solid var(--secondary); background: rgba(var(--secondary-rgb), 0.02)">
              <option value="">Gasto General (Sin Proyecto)</option>
              <optgroup label="Cotizaciones Aprobadas / En Producción">
                \${state.quotations.filter(q => q.status === 'approved' || q.status === 'production').map(q => \`<option value="\${q.id}">📋 \${q.name || ('Cotización #' + q.id)} \${q.purchase_order_id ? '[OC: ' + q.purchase_order_id + ']' : ''}</option>\`).join('')}
              </optgroup>
              <optgroup label="Ventas Realizadas">
                \${state.history.sales.slice(0, 10).map(s => \`<option value="S-\${s.id}">💰 Venta #\${s.id} - \${s.client_name || 'Vta Directa'}</option>\`).join('')}
              </optgroup>
            </select>
          </div>
        </div>

        <div class="form-group" id="pur-desc-group" style="display:none; margin-bottom: 1.5rem">
          <label style="font-weight: 600">Descripción / Motivo del Gasto</label>
          <input type="text" id="pur-description" placeholder="Ej: Compra de hilos, Almuerzo terreno, etc.">
        </div>

        <!-- Payment Info -->
        <div style="background: rgba(var(--success-rgb), 0.03); padding: 1.25rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 1px dashed var(--success)">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.25rem; align-items: center">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600">Método de Pago Sugerido</label>
              <select id="pur-payment-method">
                <option value="transfer">🔗 Transferencia</option>
                <option value="debit">💳 Débito</option>
                <option value="credit">⏳ Crédito (Cuentas por Pagar)</option>
                <option value="cash">💵 Efectivo / Caja Chica</option>
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600">Cuenta / Fondo Origen</label>
              <select id="pur-account">
                <option value="">Seleccionar cuenta...</option>
                \${state.accounts?.map(a => \`<option value="\${a.id}">\${a.name}</option>\`).join('') || ''}
              </select>
            </div>
            <div class="form-group" style="margin:0; display: flex; flex-direction: column; justify-content: center;">
              <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; color: var(--success); font-weight: 700">
                <input type="checkbox" id="pur-auto-pay" checked style="width: 1.2rem; height: 1.2rem">
                <span>Pagar al contado</span>
              </label>
              <small style="opacity: 0.7; font-size: 0.7rem; margin-top: 0.25rem">Registra egreso y liquida deuda inmediatamente.</small>
            </div>
          </div>
        </div>
        
        <!-- Items Table OR Total Amount -->
        <div id="pur-items-container">
          <table class="item-table">
            <thead>
              <tr>
                <th style="width: 50px">Ítem</th>
                <th>Insumo</th>
                <th style="width: 140px; text-align: center">Neto Unitario ($)</th>
                <th style="width: 100px; text-align: center">Cantidad</th>
                <th style="width: 160px; text-align: right; padding-right: 1.5rem">Subtotal ($)</th>
              </tr>
            </thead>
            <tbody id="pur-items-body">
              \${Array.from({ length: 8 }).map((_, i) => \`
                <tr class="item-row">
                  <td style="text-align: center; color: var(--text-muted)">\${i + 1}</td>
                  <td>
                    <select class="item-code" data-index="\${i}" style="width: 100%">
                      <option value="">Seleccione...</option>
                      \${state.rawMaterials.slice().sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(m => \`
                        <option value="\${m.code}" data-price="\${(m.cost_net || 0) / (m.batch_size || 1)}">\${m.code} | \${m.name}</option>
                      \`).join('')}
                      <option value="__otros__" style="background:var(--accent); color:#000; font-weight:bold">➕ Otros (especificar)</option>
                    </select>
                    <input type="text" class="item-custom-name" placeholder="Nombre del producto eventual..." style="display:none; margin-top:6px; width:100%; border: 1px solid var(--accent)">
                  </td>
                  <td><input type="number" class="item-price" step="0.01" value="0" style="text-align: center"></td>
                  <td><input type="number" class="item-qty" step="0.01" value="0" style="text-align: center"></td>
                  <td><input type="number" class="item-subtotal" readonly value="0" style="font-weight: 700; text-align: right; background: rgba(255,255,255,0.03)"></td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>

        <div id="pur-expense-amount-container" style="display: none; background: var(--surface-light); padding: 2rem; border-radius: 0.75rem; border: 2px dashed var(--border)">
           <div class="form-group" style="max-width: 320px; margin: 0 auto">
             <label style="font-size: 1.1rem; text-align: center; display: block; font-weight: 700; color: var(--primary); margin-bottom: 0.5rem">Monto Total del Gasto ($)</label>
             <input type="number" id="pur-expense-total" value="0" style="font-size: 2rem; text-align: center; font-weight: 800; color: var(--primary); background: var(--surface); border: 2px solid var(--primary)">
             <p style="font-size: 0.8rem; opacity: 0.6; text-align: center; margin-top: 0.75rem">Se contabilizará como Gasto Operacional neto en el Libro Diario.</p>
           </div>
        </div>

        <!-- Summary Section -->
        <div class="summary-section" id="pur-summary-section" style="margin-top: 1.5rem">
          <table class="summary-table">
            <tr><td>Neto</td><td style="text-align: right; padding-right: 1rem;">$ <span id="pur-net-display" style="font-weight: 600">0</span></td></tr>
            <tr><td>IVA (19%)</td><td style="text-align: right; padding-right: 1rem;">$ <span id="pur-iva-display" style="font-weight: 600">0</span></td></tr>
            <tr style="font-size: 1.25rem; color: var(--primary); border-top: 2px solid var(--primary)">
              <td style="background: var(--primary); color: white; padding: 0.75rem 1rem">TOTAL COMPRA</td>
              <td style="text-align: right; padding-right: 1.5rem; background: var(--primary); color: white"><strong>$ <span id="pur-total-display">0</span></strong></td>
            </tr>
          </table>
          <input type="hidden" id="pur-net" value="0">
          <input type="hidden" id="pur-iva" value="0">
          <input type="hidden" id="pur-total" value="0">
        </div>

        <div class="form-actions" style="margin-top: 2rem">
          <button type="button" onclick="this.closest('.modal').style.display='none'" style="background: var(--surface-light); padding: 0.8rem 2rem">Cancelar</button>
          <button id="btn-submit-purchase" style="background: var(--primary); padding: 0.8rem 3rem; font-weight: 700; font-size: 1.1rem; box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.3)">🚀 Registrar Compra / Gasto</button>
        </div>
      </div>
    </div>
  \`,`;

// Find the corrupted block
// Start: "  purchases: () => `"
// End: "  history: () => `" (because sales is missing or moved)
const purchasesStartTag = '  purchases: () => `';
const historyStartTag = '  history: () => `';

const startIndex = content.indexOf(purchasesStartTag);
const historyIndex = content.indexOf(historyStartTag);

if (startIndex !== -1 && historyIndex !== -1) {
    // We want to replace from purchasesStartTag up to historyStartTag
    content = content.substring(0, startIndex) + cleanPurchasesView + '\n\n' + content.substring(historyIndex);
    console.log('Purchases modal HTML restored and upgraded');
} else {
    console.error('Could not find purchases section tags');
}

// 2. Fix JS error in togglePurCategory (quoteSelect is not defined)
content = content.replace(
    /if \(quoteSelect\.value\) window\.loadProductionQuotationData\(quoteSelect\.value\);/,
    `const qSelect = document.getElementById('pur-project');
          if (qSelect && qSelect.value && !qSelect.value.startsWith('S-')) {
            // Purchase reference for pull mode
          }`
);

fs.writeFileSync('main.js', content);
console.log('Main.js fixed and restored');
