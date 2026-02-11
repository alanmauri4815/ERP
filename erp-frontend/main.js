import './style.css'
import Chart from 'chart.js/auto'
import {
  exportToExcel,
  formatProductsForExport,
  formatMaterialsForExport,
  formatSalesForExport,
  formatPurchasesForExport,
  formatProductionForExport,
  formatLedgerForExport
} from './export-utils.js'

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : 'https://erp-backend-0fis.onrender.com/api';

const mainContent = document.getElementById('main-content');
const navItems = document.querySelectorAll('.nav-item');

let token = localStorage.getItem('erp_token');
let currentUser = JSON.parse(localStorage.getItem('erp_user') || 'null');

async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
      if (token) {
        token = null;
        localStorage.removeItem('erp_token');
        localStorage.removeItem('erp_user');
        renderView('login');
      }
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      console.error(`API Error (${endpoint}):`, data);
      return null;
    }
    return data;
  } catch (err) {
    console.error(`Fetch Error (${endpoint}):`, err);
    return null;
  }
}

let state = {
  products: [],
  rawMaterials: [],
  providers: [],
  clients: [],
  stats: {
    totalRevenue: 0,
    totalSales: 0,
    totalProduction: 0,
    lowStockItems: 0,
    weeklySales: []
  },
  history: {
    purchases: [],
    sales: [],
    production: []
  },
  recipes: {},
  users: [],
  paymentMachines: [],
  pendingTransfers: [],
  accountingEntries: [],
  accountingAccounts: [],
  ledger: [],
  ledgerFilter: {
    type: 'all',
    order: 'asc'
  }
};

async function fetchUsers() {
  if (currentUser?.role !== 'superadmin') return;
  state.users = await apiFetch('/users');
  if (document.querySelector('.nav-item.active')?.dataset.view === 'user_management') {
    renderView('user_management');
  }
}

async function fetchData() {
  if (!token) return renderView('login');

  // Mostrar estado de carga brevemente
  mainContent.innerHTML = `
    <div style="height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 1rem; opacity: 0.6">
      <div class="spinner"></div>
      <p>Sincronizando datos...</p>
    </div>
  `;

  try {
    const [prods, rms, provs, hSales, hPurch, hProd, st, usrs, recipes, accs, quotes, clis, pmachines, aAccounts, aLedger] = await Promise.all([
      apiFetch('/products'),
      apiFetch('/raw-materials'),
      apiFetch('/providers'),
      apiFetch('/sales'),
      apiFetch('/purchases'),
      apiFetch('/production'),
      apiFetch('/stats'),
      (currentUser.role === 'superadmin') ? apiFetch('/users') : Promise.resolve([]),
      apiFetch('/recipes'),
      apiFetch('/accounts'),
      apiFetch('/quotations'),
      apiFetch('/clients'),
      apiFetch('/payment-machines'),
      apiFetch('/accounting/accounts'),
      apiFetch('/accounting/ledger')
    ]);

    // Data assignments with default empty arrays/objects to prevent crashes if an endpoint fails
    state.products = Array.isArray(prods) ? prods : [];
    state.rawMaterials = Array.isArray(rms) ? rms : [];
    state.providers = Array.isArray(provs) ? provs : [];
    state.history.sales = Array.isArray(hSales) ? hSales : [];
    state.history.purchases = Array.isArray(hPurch) ? hPurch : [];
    state.history.production = Array.isArray(hProd) ? hProd : [];
    state.stats = st || {};
    state.users = Array.isArray(usrs) ? usrs : [];
    state.recipes = recipes || {};
    state.accounts = Array.isArray(accs) ? accs : [];
    state.quotations = Array.isArray(quotes) ? quotes : [];
    state.clients = Array.isArray(clis) ? clis : [];
    state.paymentMachines = Array.isArray(pmachines) ? pmachines : [];
    state.accountingAccounts = Array.isArray(aAccounts) ? aAccounts : [];
    state.ledger = Array.isArray(aLedger) ? aLedger : [];
    state.pendingTransfersLoaded = false; // Reset flag to allow reload


    const activeView = document.querySelector('.nav-item.active')?.dataset.view || 'dashboard';
    renderView(activeView);
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

async function getRecipe(pid) {
  if (state.recipes[pid]) return state.recipes[pid];
  const recipe = await apiFetch(`/recipes/${pid}`);
  state.recipes[pid] = recipe;
  return recipe;
}

const views = {
  dashboard: () => `
    <header class="animate-fade">
      <h1>Panel de Control</h1>
      <div class="date-display">${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </header>
    
    <div class="stats-grid animate-fade">
      <div class="card stat-card">
        <div class="label">Ingresos Totales</div>
        <div class="value">$${state.stats.totalRevenue.toLocaleString()}</div>
        <div class="trend up">Actualizado</div>
      </div>
      <div class="card stat-card">
        <div class="label">Ventas Realizadas</div>
        <div class="value">${state.stats.totalSales}</div>
      </div>
      <div class="card stat-card">
        <div class="label">Producción Total</div>
        <div class="value">${state.stats.totalProduction}</div>
      </div>
      <div class="card stat-card">
        <div class="label">Stock Crítico MP</div>
        <div class="value" style="color: var(--danger)">${state.stats.lowStockItems} Items</div>
      </div>
    </div>

    <div class="grid-2 animate-fade">
      <div class="card">
        <h2>Ventas Últimos 7 Días</h2>
        <canvas id="salesChart" style="max-height: 300px;"></canvas>
      </div>
      <div class="card">
        <h2>Acciones Rápidas</h2>
        <div style="display: grid; gap: 1rem; margin-top: 1rem;">
          <button onclick="document.querySelector('[data-view=\'sales\']').click()" style="background: var(--secondary)">Nueva Venta</button>
          <button onclick="document.querySelector('[data-view=\'production\']').click()">Iniciar Producción</button>
          <button onclick="document.querySelector('[data-view=\'purchases\']').click()" style="background: var(--accent)">Registrar Compra</button>
        </div>
      </div>
    </div>
  `,

  inventory_products: () => `
    <header class="animate-fade">
      <h1>Inventario de Productos</h1>
      <div style="display: flex; gap: 0.5rem">
        <button onclick="window.exportProducts()" style="background: var(--secondary)">📊 Exportar a Excel</button>
        <button onclick="window.recalculateAllCosts()" style="background: var(--accent)">🔄 Recalcular Costos</button>
        <button onclick="document.getElementById('new-prod-modal').style.display='flex'">+ Nuevo Producto</button>
      </div>
    </header>

    <div class="card animate-fade">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Atributo</th>
              <th>Tamaño</th>
              <th>Stock</th>
              <th>Costo Unit.</th>
              <th>Neto</th>
              <th>IVA (19%)</th>
              <th>P. Venta (Bruto)</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${state.products.map(p => `
              <tr>
                <td><strong>${p.code}</strong></td>
                <td>${p.name}</td>
                <td>${p.color || '-'}</td>
                <td>${p.size || '-'}</td>
                <td><span class="badge ${p.stock < 5 ? 'badge-warning' : 'badge-success'}">${p.stock}</span></td>
                <td style="font-weight: 600; color: var(--accent)">$${(p.cost_unit || 0).toLocaleString('es-CL')}</td>
                <td>$${(p.price_net || 0).toLocaleString('es-CL')}</td>
                <td style="color: var(--accent)">$${(p.iva || 0).toLocaleString('es-CL')}</td>
                <td style="font-weight: 600; color: var(--secondary)">$${(p.price_sale || 0).toLocaleString('es-CL')}</td>
                <td><button class="btn-sm" onclick="window.editItem('product', '${p.code}')" title="Editar producto">✏️</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- New Product Modal -->
    <div id="new-prod-modal" class="modal" style="display:none">
      <div class="card modal-content">
        <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h3><span id="prod-modal-title">Nuevo Producto Terminado</span></h3>
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted); border:none; font-size: 1.2rem; cursor:pointer">✕</button>
        </header>
        <form id="new-prod-form">
          <input type="hidden" id="np-edit-mode" value="false">
          <input type="hidden" id="np-original-code" value="">
          <div class="form-group"><label>Código</label><input type="text" id="np-code" required placeholder="PT-001"></div>
          <div class="form-group"><label>Nombre del Producto</label><input type="text" id="np-name" required></div>
          <div class="form-group"><label>Tipo</label><input type="text" id="np-type" placeholder="Textil, etc."></div>
          
          <div style="background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 0.5rem; margin: 1rem 0; border: 1px solid var(--primary)">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem">
              <input type="checkbox" id="np-incluye-iva" style="width: 18px; height: 18px; cursor: pointer">
              <label for="np-incluye-iva" style="cursor: pointer; font-weight: 600; color: var(--primary)">El precio ingresado INCLUYE IVA (19%)</label>
            </div>
            <div class="form-group" style="margin-bottom: 0.5rem">
              <label>Precio Ingresado ($)</label>
              <input type="number" id="np-precio-input" required placeholder="Ingrese el precio" style="font-size: 1.1rem">
            </div>
            <div class="grid-3" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin-top: 0.75rem; padding: 0.5rem; background: var(--surface-light); border-radius: 0.25rem">
              <div style="text-align: center">
                <small style="opacity: 0.7">Neto</small><br>
                <strong id="np-neto-display">$0</strong>
                <input type="hidden" id="np-pnet" value="0">
              </div>
              <div style="text-align: center">
                <small style="opacity: 0.7">IVA (19%)</small><br>
                <strong id="np-iva-display" style="color: var(--accent)">$0</strong>
                <input type="hidden" id="np-iva" value="0">
              </div>
              <div style="text-align: center">
                <small style="opacity: 0.7">Precio Venta</small><br>
                <strong id="np-total-display" style="color: var(--secondary)">$0</strong>
                <input type="hidden" id="np-psale" value="0">
              </div>
            </div>
          </div>
          
          <div class="grid-2">
            <div class="form-group"><label>Atributo</label><input type="text" id="np-color" placeholder="Ej: Sabor, Material"></div>
            <div class="form-group"><label>Tamaño</label><input type="text" id="np-size" placeholder="Ej: XL"></div>
          </div>
          <div class="form-group"><label>Costo Estimado ($)</label><input type="number" id="np-cost" value="0"></div>
          <div class="form-group"><label>Es Variante de (Código Base)</label><input type="text" id="np-parent" placeholder="Ej: TOALLA-BASE"></div>
          <div class="form-actions">
            <button type="button" onclick="this.closest('.modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `,

  inventory_rm: () => `
    <header class="animate-fade">
      <h1>Inventario de Insumos</h1>
      <div style="display: flex; gap: 0.5rem">
        <button onclick="window.exportRawMaterials()" style="background: var(--secondary)">📊 Exportar a Excel</button>
        <button onclick="document.getElementById('new-rm-modal').style.display='flex'">+ Nuevo Insumo</button>
      </div>
    </header>

    <div class="card animate-fade">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Insumo</th>
              <th>Atributo</th>
              <th>Tamaño</th>
              <th>Stock</th>
              <th style="text-align: center">Lote</th>
              <th>Unidad</th>
              <th>Neto</th>
              <th>Precio Unit.</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${state.rawMaterials.map(m => `
              <tr>
                <td><strong>${m.code}</strong></td>
                <td>${m.name}</td>
                <td>${m.color || '-'}</td>
                <td>${m.size || '-'}</td>
                <td><span class="badge ${m.stock < 1 ? 'badge-danger' : 'badge-success'}">${(m.stock || 0).toFixed(2)}</span></td>
                <td style="text-align: center">${m.batch_size || 1}</td>
                <td>${m.unit}</td>
                <td>$${(m.cost_net || 0).toLocaleString('es-CL')}</td>
                <td style="font-weight: 600; color: var(--accent)">$${Math.round((m.cost_net || 0) / (m.batch_size || 1)).toLocaleString('es-CL')}</td>
                <td><button class="btn-sm" onclick="window.editItem('rm', '${m.code}')" title="Editar insumo">✏️</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- New RM Modal -->
    <div id="new-rm-modal" class="modal" style="display:none">
      <div class="card modal-content">
        <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h3><span id="rm-modal-title">Nuevo Insumo / Materia Prima</span></h3>
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted); border:none; font-size: 1.2rem; cursor:pointer">✕</button>
        </header>
        <form id="new-rm-form">
          <input type="hidden" id="nrm-edit-mode" value="false">
          <input type="hidden" id="nrm-original-code" value="">
          <div class="form-group"><label>Código</label><input type="text" id="nrm-code" required placeholder="MP-001"></div>
          <div class="form-group"><label>Nombre del Insumo</label><input type="text" id="nrm-name" required></div>
          <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 1rem">
            <div class="form-group"><label>Lote (Cant. Precio)</label><input type="number" id="nrm-batch-size" value="1" step="0.001" required></div>
            <div class="form-group"><label>Unidad de Medida</label><input type="text" id="nrm-unit" required placeholder="Mts, Kg, Uni"></div>
          </div>
          
          <div style="background: rgba(16, 185, 129, 0.1); padding: 1rem; border-radius: 0.5rem; margin: 1rem 0; border: 1px solid var(--success)">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem">
              <input type="checkbox" id="nrm-incluye-iva" style="width: 18px; height: 18px; cursor: pointer">
              <label for="nrm-incluye-iva" style="cursor: pointer; font-weight: 600; color: var(--success)">El precio ingresado INCLUYE IVA (19%)</label>
            </div>
            <div class="form-group" style="margin-bottom: 0.5rem">
              <label>Costo Unitario ($)</label>
              <input type="number" id="nrm-precio-input" required placeholder="Ingrese el costo" style="font-size: 1.1rem">
            </div>
            <div class="grid-3" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin-top: 0.75rem; padding: 0.5rem; background: var(--surface-light); border-radius: 0.25rem">
              <div style="text-align: center">
                <small style="opacity: 0.7">Precio Unitario</small><br>
                <strong id="nrm-unit-price-display" style="color: var(--accent); font-size: 1.1rem">$0</strong>
              </div>
              <div style="text-align: center">
                <small style="opacity: 0.7">Neto</small><br>
                <strong id="nrm-neto-display">$0</strong>
                <input type="hidden" id="nrm-cost" value="0">
              </div>
              <div style="text-align: center">
                <small style="opacity: 0.7">Costo Total (c/IVA)</small><br>
                <strong id="nrm-total-display" style="color: var(--success)">$0</strong>
                <input type="hidden" id="nrm-total" value="0">
                <input type="hidden" id="nrm-iva" value="0">
              </div>
            </div>
          </div>

          <div class="grid-2">
            <div class="form-group"><label>Atributo</label><input type="text" id="nrm-color" placeholder="Ej: Sabor, Material"></div>
            <div class="form-group"><label>Tamaño</label><input type="text" id="nrm-size" placeholder="Ej: XL"></div>
          </div>
          <div class="form-group"><label>Es Variante de (Código Base)</label><input type="text" id="nrm-parent" placeholder="Ej: TELA-BASE"></div>
          <div class="form-actions">
            <button type="button" onclick="this.closest('.modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `,

  design: () => `
    <header class="animate-fade">
      <h1>Diseño (Recetas)</h1>
    </header>
    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 1.5rem">
      <div class="card animate-fade">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h2>Productos</h2>
        </div>
        <div class="nav-links" style="max-height: 500px; overflow-y: auto;">
          ${state.products.map(p => `
            <div class="nav-item recipe-item" data-pid="${p.code}" style="border: 1px solid var(--border); margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 1rem;">
              <div>
                <strong>${p.name}</strong><br>
                <small style="opacity: 0.7">${p.color || '-'} | ${p.size || '-'}</small>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card animate-fade" id="recipe-details">
        <p style="text-align: center; padding: 4rem; opacity: 0.5">Selecciona un producto para ver/editar su receta.</p>
      </div>
    </div>
  `,

  production: () => `
    <header class="animate-fade">
      <h1>Producción</h1>
      <div style="display: flex; gap: 0.5rem">
        <button onclick="window.exportProduction()" style="background: var(--accent)">📊 Exportar a Excel</button>
        <button onclick="window.openProductionModal()" style="background: var(--secondary)">+ Registrar Producción</button>
      </div>
    </header>

    <div class="card animate-fade">
      <h2>Historial Detallado de Producción</h2>
      <div id="production-history-content">
        ${renderHistoryTable('production')}
      </div>
    </div>

    <!-- Production Modal -->
    <div id="production-modal" class="modal" style="display:none">
      <div class="card modal-content modal-wide">
        <header>
          <h3 id="prod-modal-title">Nueva Orden de Producción</h3>
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted)">✕</button>
        </header>

        <input type="hidden" id="prod-edit-mode" value="false">
        <input type="hidden" id="prod-edit-id" value="">

        <div class="form-group" style="margin-bottom: 1rem">
          <label>Fecha</label>
          <input type="date" id="prod-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <table class="item-table">
          <thead>
            <tr>
              <th style="width: 50px">Ítem</th>
              <th>Producto a Producir</th>
              <th style="width: 100px">Cantidad</th>
              <th style="width: 120px">Costo M.O. ($)</th>
            </tr>
          </thead>
          <tbody id="production-items-body">
            ${Array.from({ length: 10 }).map((_, i) => `
              <tr class="item-row">
                <td style="text-align: center; color: var(--text-muted)">${i + 1}</td>
                <td>
                  <select class="prod-item-code" data-index="${i}">
                    <option value="">Seleccione...</option>
                    ${state.products.slice().sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(p => `
                      <option value="${p.code}">${p.code} | ${p.name || ''}${p.color ? ' (' + p.color + ')' : ''}${p.size ? ' [' + p.size + ']' : ''}</option>
                    `).join('')}
                  </select>
                </td>
                <td><input type="number" class="prod-item-qty" step="1" value="0" placeholder="0"></td>
                <td><input type="number" class="prod-item-mo" step="0.01" value="0"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="form-actions">
          <button type="button" onclick="this.closest('.modal').style.display='none'" style="background: var(--surface-light)">Cancelar</button>
          <button id="btn-submit-production" style="background: var(--accent)">🚀 <span id="btn-prod-text">Iniciar Producción</span></button>
        </div>
      </div>
    </div>
  `,

  purchases: () => `
    <header class="animate-fade">
      <h1>Compras e Informes de Gastos</h1>
      <div style="display: flex; gap: 0.5rem">
        <button onclick="window.runMigration()" style="background: var(--danger); font-size: 0.7rem; padding: 2px 5px">🔧 Migrar DB</button>
        <button onclick="window.exportPurchases()" style="background: var(--accent)">📊 Exportar a Excel</button>
        <button onclick="window.openPurchaseModal()" style="background: var(--secondary)">+ Registrar Compra / Gasto</button>
      </div>
    </header>

    <div class="card animate-fade">
      <h2>Historial de Movimientos</h2>
      <div id="purchases-history-content">
        ${renderHistoryTable('purchases')}
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

        <div style="background: rgba(var(--primary-rgb), 0.05); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; border: 1px dashed var(--primary)">
          <div class="form-group" style="margin:0">
            <label style="font-weight: 600">Tipo de Registro</label>
            <select id="pur-type" onchange="window.togglePurType()" style="font-size: 1.1rem; padding: 0.5rem">
              <option value="mp">Compra de Insumos (Inventariable)</option>
              <option value="expense">Informe de Gasto / Caja Chica (Gasto Operacional)</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem">
          <div class="form-group" id="pur-prov-group">
            <label style="font-weight: 600">Proveedor</label>
            <select id="pur-prov">
              <option value="">Sin Proveedor / Boleta</option>
              ${state.providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label style="font-weight: 600">Fecha de Registro</label>
            <input type="date" id="pur-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group" id="pur-project-group">
            <label style="font-weight: 600; color: var(--secondary)">📁 Asociar a Proyecto (ABC)</label>
            <select id="pur-project" style="border: 1px solid var(--secondary)">
              <option value="">Gasto General (Sin Proyecto)</option>
              <optgroup label="Cotizaciones Ganadas / Aprobadas">
                ${state.quotations.filter(q => q.status === 'won' || q.status === 'approved').map(q => `<option value="${q.id}">📋 ${q.name || ('Cotización #' + q.id)}</option>`).join('')}
              </optgroup>
              <optgroup label="Ventas Realizadas">
                ${state.history.sales.slice(0, 10).map(s => `<option value="S-${s.id}">💰 Venta #${s.id} - ${s.client_name || 'Vta Directa'}</option>`).join('')}
              </optgroup>
            </select>
            <small style="font-size: 0.7rem; opacity: 0.7">Vincula este costo a un ingreso para calcular utilidad real.</small>
          </div>
        </div>

        <div class="form-group" id="pur-desc-group" style="display:none; margin-bottom: 1rem">
          <label style="font-weight: 600">Descripción / Motivo del Gasto</label>
          <input type="text" id="pur-description" placeholder="Ej: Compra de hilos, Almuerzo terreno, etc.">
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 8px">
          <div class="form-group">
            <label>Método de Pago</label>
            <select id="pur-payment-method">
              <option value="transfer">Transferencia</option>
              <option value="debit">Débito</option>
              <option value="credit">Crédito</option>
              <option value="cash">Efectivo / Caja Chica</option>
            </select>
          </div>
          <div class="form-group">
            <label>Cuenta / Fondo</label>
            <select id="pur-account">
              <option value="">Seleccionar cuenta...</option>
              ${state.accounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join('') || ''}
            </select>
          </div>
          <div class="form-group">
            <label>Tipo Documento</label>
            <select id="pur-doc-type">
              <option value="factura">Factura</option>
              <option value="boleta">Boleta / Comprobante</option>
              <option value="n/a">Sin Documento</option>
            </select>
          </div>
        </div>
        
        <div id="pur-items-container">
          <table class="item-table">
            <thead>
              <tr>
                <th style="width: 50px">Ítem</th>
                <th>Insumo</th>
                <th style="width: 130px">Neto Unit</th>
                <th style="width: 100px">Cant</th>
                <th style="width: 150px">Sub Tot</th>
              </tr>
            </thead>
            <tbody id="pur-items-body">
              ${Array.from({ length: 8 }).map((_, i) => `
                <tr class="item-row">
                  <td style="text-align: center; color: var(--text-muted)">${i + 1}</td>
                  <td>
                    <select class="item-code" data-index="${i}">
                      <option value="">Seleccione...</option>
                      ${state.rawMaterials.slice().sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(m => `
                        <option value="${m.code}" data-price="${m.cost_net}">${m.code} | ${m.name}</option>
                      `).join('')}
                    </select>
                  </td>
                  <td><input type="number" class="item-price" step="0.01" value="0"></td>
                  <td><input type="number" class="item-qty" step="0.01" value="0"></td>
                  <td><input type="number" class="item-subtotal" readonly value="0" style="font-weight: 600; text-align: right"></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div id="pur-expense-amount-container" style="display: none; background: var(--surface-light); padding: 1.5rem; border-radius: 0.5rem; border: 1px solid var(--border)">
           <div class="form-group" style="max-width: 300px; margin: 0 auto">
             <label style="font-size: 1.1rem; text-align: center; display: block">Monto Total del Gasto ($)</label>
             <input type="number" id="pur-expense-total" value="0" style="font-size: 1.5rem; text-align: center; font-weight: 700; color: var(--primary)">
             <p style="font-size: 0.8rem; opacity: 0.6; text-align: center; margin-top: 0.5rem">Se contabilizará como Gasto Operacional neto.</p>
           </div>
        </div>

        <div class="summary-section" id="pur-summary-section">
          <table class="summary-table">
            <tr><td>Neto</td><td style="text-align: right; padding-right: 1rem;">$ <span id="pur-net-display">0</span></td></tr>
            <tr><td>IVA (19%)</td><td style="text-align: right; padding-right: 1rem;">$ <span id="pur-iva-display">0</span></td></tr>
            <tr style="font-size: 1.1rem; color: var(--primary)"><td style="background: var(--primary); color: white">Total</td><td style="text-align: right; padding-right: 1rem;"><strong>$ <span id="pur-total-display">0</span></strong></td></tr>
          </table>
          <input type="hidden" id="pur-net" value="0">
          <input type="hidden" id="pur-iva" value="0">
          <input type="hidden" id="pur-total" value="0">
        </div>

        <div class="form-actions">
          <button type="button" onclick="this.closest('.modal').style.display='none'" style="background: var(--surface-light)">Cancelar</button>
          <button id="btn-submit-purchase" style="background: var(--primary); padding: 0.8rem 2rem; font-weight: 700">Registrar Registro</button>
        </div>
      </div>
    </div>
  `,

  sales: () => `
    <header class="animate-fade">
      <h1>Ventas (Salida PT)</h1>
      <div style="display: flex; gap: 0.5rem">
        <button onclick="window.exportSales()" style="background: var(--accent)">📊 Exportar a Excel</button>
        <button onclick="document.getElementById('sale-modal').style.display='flex'" style="background: var(--secondary)">+ Registrar Venta</button>
      </div>
    </header>

    <div class="card animate-fade">
      <h2>Historial de Ventas</h2>
      <div id="sales-history-content">
        ${renderHistoryTable('sales')}
      </div>
    </div>

    <!-- Sale Modal -->
    <div id="sale-modal" class="modal" style="display:none">
      <div class="card modal-content modal-wide">
        <header>
          <h3 id="sale-modal-title">Nueva Venta de Productos</h3>
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted)">✕</button>
        </header>

        <input type="hidden" id="sale-edit-mode" value="false">
        <input type="hidden" id="sale-edit-id" value="">

        <div style="display: flex; gap: 2rem; margin-bottom: 1rem;">
           <div class="form-group" style="flex: 1">
            <label>Cliente</label>
            <select id="sale-client">
              <option value="">Venta Directa</option>
              ${state.clients.map(c => `<option value="${c.id}">${c.name || 'Cliente ' + c.id}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1">
            <label>Fecha</label>
            <input type="date" id="sale-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group" style="flex: 1">
            <label>Evento/Feria</label>
            <input type="text" id="sale-event-name" placeholder="Ej: Feria Navideña">
          </div>
        </div>
        <div style="display: flex; gap: 2rem; margin-bottom: 1rem;">
          <div class="form-group" style="flex: 1">
            <label>Método de Pago</label>
            <select id="sale-payment-method" onchange="window.updatePaymentFields()">
              <option value="transfer">Transferencia</option>
              <option value="machine">Máquina (Tarjeta)</option>
              <option value="cash">Efectivo</option>
            </select>
          </div>
          <div class="form-group" style="flex: 1" id="machine-selector-group">
            <label>Máquina de Pago</label>
            <select id="sale-machine">
              <option value="">Seleccionar máquina...</option>
              ${state.paymentMachines?.filter(m => m.active !== false).map(m => `<option value="${m.id}" data-commission="${m.commission_percent}">${m.name} (${m.commission_percent}%)</option>`).join('') || ''}
            </select>
          </div>
          <div class="form-group" style="flex: 1">
            <label>Cuenta Destino</label>
            <select id="sale-account">
              <option value="">Sin asignar</option>
              ${state.accounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join('') || ''}
            </select>
          </div>
        </div>
        <div style="display: flex; gap: 2rem; margin-bottom: 1rem; align-items: center;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" id="sale-iva-exempt" onchange="window.recalculateSaleTotals()">
            <span>Exento de IVA (venta sin documento tributario)</span>
          </label>
        </div>

        <table class="item-table">
          <thead>
            <tr>
              <th style="width: 50px">Ítem</th>
              <th>Producto (Seleccionar)</th>
              <th style="width: 130px">Precio Unit (Neto)</th>
              <th style="width: 100px">Cantidad</th>
              <th style="width: 150px">Sub Tot</th>
            </tr>
          </thead>
          <tbody id="sale-items-body">
            ${Array.from({ length: 10 }).map((_, i) => `
              <tr class="item-row">
                <td style="text-align: center; color: var(--text-muted)">${i + 1}</td>
                <td>
                  <select class="item-code" data-index="${i}">
                    <option value="">Seleccione...</option>
                    ${state.products.slice().sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(p => `
                      <option value="${p.code}" data-price="${p.price_net || 0}">
                        ${p.code} | ${p.name || ''}${p.color ? ' (' + p.color + ')' : ''}${p.size ? ' [' + p.size + ']' : ''}
                      </option>`).join('')}
                  </select>
                </td>
                <td><input type="number" class="item-price" step="0.01" value="0"></td>
                <td><input type="number" class="item-qty" step="1" value="0" placeholder="0"></td>
                <td><input type="number" class="item-subtotal" readonly value="0" style="font-weight: 600; text-align: right"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="summary-section">
          <table class="summary-table">
            <tr><td>Sub Total (Detalle)</td><td style="text-align: right; padding-right: 1rem;">$ <span id="sale-net-display">0</span></td></tr>
            <tr>
              <td>Dcto. ($)</td>
              <td style="text-align: right; padding-right: 1rem;">
                <input type="number" id="sale-discount-input" value="0" step="1" oninput="window.recalculateSaleTotals()" style="width: 100px; text-align: right; border: 1px solid var(--border); border-radius: 4px; padding: 2px 5px;">
              </td>
            </tr>
            <tr style="border-top: 2px solid var(--border); font-weight: 600;">
              <td>Neto (Base Imponible)</td>
              <td style="text-align: right; padding-right: 1rem;">$ <span id="sale-adjusted-net-display">0</span></td>
            </tr>
            <tr>
              <td>
                IVA (19%) 
                <span id="sale-iva-ledger-note" style="display: none; font-size: 0.75rem; color: var(--warning); margin-left: 0.5rem;">(No contabilizado en Libro Diario)</span>
              </td>
              <td style="text-align: right; padding-right: 1rem;">$ <span id="sale-iva-display">0</span></td>
            </tr>
            <tr style="font-size: 1.1rem; color: var(--secondary)">
              <td style="background: var(--secondary); color: white">TOTAL</td>
              <td style="text-align: right; padding-right: 1rem;"><strong>$ <span id="sale-total-display">0</span></strong></td>
            </tr>
            <tr id="sale-commission-row" style="display: none; color: var(--danger)">
              <td>Comisión Máquina</td>
              <td style="text-align: right; padding-right: 1rem;">-$ <span id="sale-commission-display">0</span></td>
            </tr>
            <tr id="sale-real-income-row" style="border-top: 1px dashed var(--border); font-weight: 600;">
              <td>Ingreso Real</td>
              <td style="text-align: right; padding-right: 1rem;">$ <span id="sale-real-income-display">0</span></td>
            </tr>
          </table>
          <input type="hidden" id="sale-net" value="0">
          <input type="hidden" id="sale-iva" value="0">
          <input type="hidden" id="sale-discount" value="0">
          <input type="hidden" id="sale-commission" value="0">
          <input type="hidden" id="sale-total" value="0">
        </div>

        <div class="form-actions">
          <button type="button" onclick="this.closest('.modal').style.display='none'" style="background: var(--surface-light)">Cancelar</button>
          <button id="btn-submit-sale" style="background: var(--secondary)">Registrar Venta</button>
        </div>
      </div>
    </div>
  `,

  history: () => `
    <header class="animate-fade"><h1>Historial de Movimientos</h1></header>
    
    <div class="card animate-fade">
      <div class="tabs-header">
        <button class="tab-btn active" data-history="sales">Ventas</button>
        <button class="tab-btn" data-history="production">Producción</button>
        <button class="tab-btn" data-history="purchases">Compras</button>
      </div>
      <div id="history-content" style="margin-top: 1.5rem">
        <!-- History table will be injected here -->
        ${renderHistoryTable('sales')}
      </div>
    </div>
  `,

  reports: () => `
    <header class="animate-fade">
      <h1>Reportes Avanzados</h1>
      <div class="date-display">Análisis de Ganancias y Rendimiento</div>
    </header>

    <div class="grid-2 animate-fade">
      <div class="card">
        <h2>Ingresos vs Costos Mensuales</h2>
        <canvas id="monthlyProfitChart" style="max-height: 400px;"></canvas>
      </div>
      <div class="card">
        <h2>Evolución de Ganancia Neta</h2>
        <canvas id="netProfitChart" style="max-height: 400px;"></canvas>
      </div>
    </div>

    <div class="card animate-fade" style="margin-top: 2rem">
      <h2>Resumen Mensual</h2>
      <div class="table-container">
        <table id="monthly-report-table">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Operaciones</th>
              <th>Ingresos</th>
              <th>Costos Estimados</th>
              <th>Ganancia Neta</th>
              <th>Margen %</th>
            </tr>
          </thead>
          <tbody id="monthly-report-body">
            <tr><td colspan="6" style="text-align: center">Cargando datos...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `,

  clients_management: () => `
    <header class="animate-fade"><h1>Gestión de Clientes</h1></header>
    <div class="card animate-fade">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
        <h2>Listado de Clientes</h2>
        <button onclick="window.openClientModal()">+ Nuevo Cliente</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>RUT</th><th>Nombre</th><th>Dirección</th><th>E-mail</th><th>Teléfono</th><th>Observaciones</th></tr></thead>
          <tbody>
            ${state.clients.map(c => `
              <tr>
                <td><code style="font-size:0.8rem">${c.rut || '-'}</code></td>
                <td><strong>${c.name}</strong></td>
                <td><small>${c.address || '-'}</small></td>
                <td><small>${c.email || '-'}</small></td>
                <td><small>${c.phone || '-'}</small></td>
                <td>
                  <div style="display:flex; flex-direction:column; gap:0.3rem">
                    <div style="font-size:0.75rem; font-style:italic; max-width:180px">${c.notes || '-'}</div>
                    <div style="display:flex; gap:0.3rem">
                      <button class="btn-sm" onclick="window.editClient('${c.id}')">✏️</button>
                      <button class="btn-sm" style="background:var(--danger)" onclick="window.deleteClient('${c.id}')">🗑️</button>
                    </div>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Client Modal -->
    <div id="cli-modal" class="modal" style="display:none">
      <div class="card modal-content">
        <h3 id="cli-modal-title">Nuevo Cliente</h3>
        <form id="cli-form">
          <input type="hidden" id="cli-id">
          <div class="grid-2">
            <div class="form-group"><label>RUT</label><input type="text" id="cli-rut" placeholder="12.345.678-9"></div>
            <div class="form-group"><label>Nombre</label><input type="text" id="cli-name" required></div>
          </div>
          <div class="form-group"><label>Dirección</label><input type="text" id="cli-addr"></div>
          <div class="grid-2">
            <div class="form-group"><label>Email</label><input type="email" id="cli-email"></div>
            <div class="form-group"><label>Teléfono</label><input type="text" id="cli-phone"></div>
          </div>
          <div class="form-group"><label>Observaciones</label><textarea id="cli-notes" rows="2" style="width:100%; border: 1px solid var(--border); border-radius:0.5rem; padding:0.5rem"></textarea></div>
          <div class="form-actions">
            <button type="button" onclick="document.getElementById('cli-modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar Cliente</button>
          </div>
        </form>
      </div>
    </div>
  `,

  providers_management: () => `
    <header class="animate-fade"><h1>Gestión de Proveedores</h1></header>
    <div class="card animate-fade">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
        <h2>Listado de Proveedores</h2>
        <button onclick="window.openProviderModal()">+ Nuevo Proveedor</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>RUT</th><th>Nombre Empresa</th><th>Dirección</th><th>Persona Contacto</th><th>E-mail</th><th>Teléfono</th><th>Observaciones</th></tr></thead>
          <tbody>
            ${state.providers.map(p => `
              <tr>
                <td><code style="font-size:0.8rem">${p.rut || '-'}</code></td>
                <td><strong>${p.name}</strong></td>
                <td><small>${p.address || '-'}</small></td>
                <td><small>${p.contact || '-'}</small></td>
                <td><small>${p.email || '-'}</small></td>
                <td><small>${p.phone || '-'}</small></td>
                <td>
                  <div style="display:flex; flex-direction:column; gap:0.3rem">
                    <div style="font-size:0.75rem; font-style:italic; max-width:180px">${p.notes || '-'}</div>
                    <div style="display:flex; gap:0.3rem">
                      <button class="btn-sm" onclick="window.editProvider('${p.id}')">✏️</button>
                      <button class="btn-sm" style="background:var(--danger)" onclick="window.deleteProvider('${p.id}')">🗑️</button>
                    </div>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Provider Modal -->
    <div id="prov-modal" class="modal" style="display:none">
      <div class="card modal-content">
        <h3 id="prov-modal-title">Nuevo Proveedor</h3>
        <form id="prov-form">
          <input type="hidden" id="prov-id">
          <div class="grid-2">
            <div class="form-group"><label>RUT</label><input type="text" id="prov-rut" placeholder="12.345.678-9"></div>
            <div class="form-group"><label>Nombre Empresa</label><input type="text" id="prov-name" required></div>
          </div>
          <div class="form-group"><label>Dirección</label><input type="text" id="prov-addr"></div>
          <div class="form-group"><label>Persona de Contacto</label><input type="text" id="prov-cont"></div>
          <div class="grid-2">
            <div class="form-group"><label>Email</label><input type="email" id="prov-email"></div>
            <div class="form-group"><label>Teléfono</label><input type="text" id="prov-phone"></div>
          </div>
          <div class="form-group"><label>Observaciones</label><textarea id="prov-notes" rows="2" style="width:100%; border: 1px solid var(--border); border-radius:0.5rem; padding:0.5rem"></textarea></div>
          <div class="form-actions">
            <button type="button" onclick="document.getElementById('prov-modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar Proveedor</button>
          </div>
        </form>
      </div>
    </div>
  `,

  payment_machines: () => `
    <header class="animate-fade"><h1>Máquinas de Pago</h1></header>
    <div class="card animate-fade">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
        <h2>Dispositivos Configurados</h2>
        <button onclick="window.openMachineModal()">+ Nueva Máquina</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>Nombre</th><th>Proveedor</th><th>Comisión</th><th>Cuenta Asociada</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${state.paymentMachines.map(m => `
              <tr>
                <td><strong>${m.name}</strong></td>
                <td>${m.provider || '-'}</td>
                <td><code>${m.commission_percent || 0}%</code></td>
                <td>${state.accounts.find(a => a.id == m.account_id)?.name || 'Sin asignar'}</td>
                <td><span style="color: ${m.active !== false ? 'var(--success)' : 'var(--danger)'}">${m.active !== false ? '● Activa' : '○ Inactiva'}</span></td>
                <td>
                  <button class="btn-sm" onclick="window.editMachine('${m.id}')">✏️</button>
                  <button class="btn-sm" style="background:var(--danger)" onclick="window.deleteMachine('${m.id}')">🗑️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Machine Modal -->
    <div id="machine-modal" class="modal" style="display:none">
      <div class="card modal-content">
        <h3 id="machine-modal-title">Nueva Máquina de Pago</h3>
        <form id="machine-form">
          <input type="hidden" id="mach-id">
          <div class="form-group"><label>Nombre</label><input type="text" id="mach-name" required placeholder="Ej: Transbank Débito"></div>
          <div class="grid-2">
            <div class="form-group"><label>Proveedor</label><input type="text" id="mach-provider" placeholder="Transbank, Tenpo, etc."></div>
            <div class="form-group"><label>Comisión (%)</label><input type="number" id="mach-commission" step="0.01" value="3.33"></div>
          </div>
          <div class="form-group">
            <label>Cuenta Asociada</label>
            <select id="mach-account">
              <option value="">Sin asignar</option>
              ${state.accounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join('') || ''}
            </select>
          </div>
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="mach-active" checked>
              <span>Máquina activa</span>
            </label>
          </div>
          <div class="form-actions">
            <button type="button" onclick="document.getElementById('machine-modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar Máquina</button>
          </div>
        </form>
      </div>
    </div>
  `,

  direct_sales: () => `
    <header class="animate-fade"><h1>Ventas Directas</h1></header>
    <div class="card animate-fade">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
        <h2>Ventas Pendientes de Transferir</h2>
        <button onclick="window.openTransferModal()" style="background: var(--success)">💰 Transferir Seleccionadas</button>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" id="select-all-sales" onchange="window.toggleAllSales(this)"></th>
              <th>Fecha</th>
              <th>Evento</th>
              <th>Tipo Pago</th>
              <th>Máquina</th>
              <th>Total</th>
              <th>IVA</th>
              <th>Exento</th>
            </tr>
          </thead>
          <tbody id="pending-sales-body">
            ${state.pendingTransfers.map(s => `
              <tr>
                <td><input type="checkbox" class="sale-checkbox" data-id="${s.id}" data-total="${s.total}" data-iva="${s.iva || 0}" data-exempt="${s.is_iva_exempt}" data-machine="${s.payment_machines?.commission_percent || 0}"></td>
                <td>${s.date}</td>
                <td>${s.event_name || '-'}</td>
                <td>${s.payment_method === 'cash' ? '💵 Efectivo' : s.payment_method === 'machine' ? '💳 Máquina' : '🔄 Transf.'}</td>
                <td>${s.payment_machines?.name || '-'}</td>
                <td><strong>$${(s.total || 0).toLocaleString('es-CL')}</strong></td>
                <td>$${(s.iva || 0).toLocaleString('es-CL')}</td>
                <td>${s.is_iva_exempt ? '✅' : '❌'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div id="transfer-summary" style="margin-top: 1rem; padding: 1rem; background: var(--surface-light); border-radius: 0.5rem; display: none;">
        <h4>Resumen de Transferencia</h4>
        <div class="grid-4" style="margin-top: 0.5rem">
          <div><small>Total Bruto</small><br><strong id="sum-gross">$0</strong></div>
          <div><small>IVA a Descontar</small><br><strong id="sum-iva" style="color: var(--danger)">-$0</strong></div>
          <div><small>Comisión Máquina</small><br><strong id="sum-commission" style="color: var(--danger)">-$0</strong></div>
          <div><small>Neto a Transferir</small><br><strong id="sum-net" style="color: var(--success); font-size: 1.2rem">$0</strong></div>
        </div>
      </div>
    </div>

    <!-- Transfer Modal -->
    <div id="transfer-modal" class="modal" style="display:none">
      <div class="card modal-content">
        <h3>Confirmar Transferencia</h3>
        <div class="form-group">
          <label>Cuenta Destino</label>
          <select id="transfer-destination">
            ${state.accounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join('') || ''}
          </select>
        </div>
        <div style="margin: 1rem 0; padding: 1rem; background: var(--surface-light); border-radius: 0.5rem;">
          <p><strong>Ventas seleccionadas:</strong> <span id="modal-sales-count">0</span></p>
          <p><strong>Monto neto a transferir:</strong> <span id="modal-net-amount" style="color: var(--success); font-size: 1.2rem">$0</span></p>
        </div>
        <div class="form-actions">
          <button type="button" onclick="document.getElementById('transfer-modal').style.display='none'">Cancelar</button>
          <button onclick="window.executeBulkTransfer()" style="background: var(--success)">Confirmar Transferencia</button>
        </div>
      </div>
    </div>
  `,

  masters: () => `
    <header class="animate-fade"><h1>Gestión de Datos Insumos y Config.</h1></header>
    <div class="grid-2 animate-fade" style="margin-top: 2rem">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h2>Materias Primas</h2>
          <button onclick="document.getElementById('mp-modal').style.display='flex'">+ Nuevo</button>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>Código</th><th>Insumo</th><th>Unidad</th><th>Costo</th></tr></thead>
            <tbody>
              ${state.rawMaterials.slice(0, 10).map(m => `<tr><td>${m.code}</td><td>${m.name}</td><td>${m.unit}</td><td>$${m.cost_net.toLocaleString()}</td></tr>`).join('')}
              ${state.rawMaterials.length > 10 ? `<tr><td colspan="4" style="text-align:center; opacity:0.5">... y ${state.rawMaterials.length - 10} más</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" id="alerts-config-section">
        <h2>📱 Alertas al Celular (Telegram)</h2>
        <div style="margin-top: 1rem; padding: 1rem; background: rgba(59, 130, 246, 0.1); border-radius: 0.5rem; border: 1px solid var(--primary)">
            <p style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--text-muted)">
                Vincula tu ERP con Telegram para recibir avisos de stock bajo al instante.
            </p>
            <div class="form-group">
                <label>Telegram Bot Token</label>
                <input type="password" id="tg-token" placeholder="Ej: 123456:ABC-DEF...">
            </div>
            <div class="form-group">
                <label>Telegram Chat ID</label>
                <input type="text" id="tg-chatid" placeholder="Ej: 987654321">
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem">
                <button onclick="window.saveAlertSettings()" style="flex:1">Guardar Config</button>
                <button onclick="window.testTelegram()" style="background:var(--secondary)">Probar Envío</button>
            </div>
            <p style="font-size: 0.75rem; margin-top: 0.5rem; opacity: 0.6">
                Consigue estos datos hablando con <b>@BotFather</b> y <b>@userinfobot</b> en Telegram.
            </p>
        </div>

        <h3 style="margin-top: 2rem; margin-bottom: 1rem">Límites de Stock por Insumo</h3>
        <div class="table-container" style="max-height: 250px; overflow-y: auto;">
          <table>
            <thead><tr><th>Insumo</th><th style="width: 100px">Mínimo</th><th>Acción</th></tr></thead>
            <tbody id="alerts-thresholds-body">
              ${state.rawMaterials.map(m => `
                <tr>
                  <td><small>${m.code}</small><br>${m.name}</td>
                  <td><input type="number" class="alt-val" data-code="${m.code}" value="0" style="width: 80px; padding: 0.3rem"></td>
                  <td><button class="btn-sm" onclick="window.saveThreshold('${m.code}', this)">Set</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Raw Material Modal -->
    <div id="mp-modal" class="modal" style="display:none">
      <div class="card modal-content">
        <h3>Nueva Materia Prima</h3>
        <form id="new-mp-form">
          <div class="form-group"><label>Código</label><input type="text" id="nmp-code" required placeholder="MP-001"></div>
          <div class="form-group"><label>Nombre Insumo</label><input type="text" id="nmp-name" required></div>
          <div class="form-group"><label>Unidad (Mts, Uni, Kg, etc.)</label><input type="text" id="nmp-unit" required></div>
          <div class="form-group"><label>Costo Neto Unitario ($)</label><input type="number" id="nmp-cost" required></div>
          <div class="grid-2">
            <div class="form-group"><label>Atributo</label><input type="text" id="nmp-color" placeholder="Ej: Sabor, Material"></div>
            <div class="form-group"><label>Tamaño</label><input type="text" id="nmp-size" placeholder="Ej: XL"></div>
          </div>
          <div class="form-group"><label>Es Variante de (Código Base)</label><input type="text" id="nmp-parent" placeholder="Ej: TELA-BASE"></div>
          <div class="form-actions">
            <button type="button" onclick="this.closest('.modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `,

  login: () => `
    <div style="height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); margin: -2rem">
      <div class="card animate-fade" style="width: 100%; max-width: 400px; padding: 2rem; border-radius: 1rem">
        <h1 style="text-align: center; margin-bottom: 2rem; font-size: 1.8rem; background: linear-gradient(45deg, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">ERP Universal</h1>
        <form id="login-form">
          <div class="form-group">
            <label>Usuario</label>
            <input type="text" id="login-user" required placeholder="Tu nombre de usuario" style="padding: 0.8rem">
          </div>
          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" id="login-pass" required placeholder="••••••••" style="padding: 0.8rem">
          </div>
          <button type="submit" style="width: 100%; padding: 1rem; margin-top: 1rem; font-size: 1rem; background: var(--primary)">Ingresar</button>
          <p id="login-error" style="color: var(--danger); text-align: center; margin-top: 1rem; font-size: 0.9rem; display: none"></p>
        </form>
        <p style="text-align: center; margin-top: 2rem; opacity: 0.5; font-size: 0.8rem">Software de Control Industrial v2.0</p>
      </div>
    </div>
  `,

  profile: () => `
    <header class="animate-fade">
      <h1>Mi Perfil</h1>
    </header>
    <div class="card animate-fade" style="max-width: 500px">
      <h2>Cambiar Contraseña</h2>
      <form id="change-pass-form">
        <div class="form-group">
          <label>Contraseña Actual</label>
          <input type="password" id="cp-old" required placeholder="••••••••">
        </div>
        <div class="form-group">
          <label>Nueva Contraseña</label>
          <input type="password" id="cp-new" required placeholder="••••••••">
        </div>
        <div class="form-group">
          <label>Confirmar Nueva Contraseña</label>
          <input type="password" id="cp-confirm" required placeholder="••••••••">
        </div>
        <div class="form-actions">
          <button type="submit" style="width: 100%">Actualizar Contraseña</button>
        </div>
      </form>
    </div>
  `,

  user_management: () => `
    <header class="animate-fade">
      <h1>Gestión de Usuarios</h1>
      <button onclick="window.openUserModal()">+ Nuevo Usuario</button>
    </header>

    <div class="card animate-fade">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${state.users.map(u => `
              <tr>
                <td>${u.id}</td>
                <td><strong>${u.username}</strong></td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-success' : 'badge-info'}">${u.role}</span></td>
                <td>
                  <button class="btn-sm" onclick="window.editUser(${u.id})">✏️</button>
                  ${u.username !== currentUser.username ? `<button class="btn-sm" onclick="window.deleteUser(${u.id})" style="background:var(--danger)">🗑️</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- User Modal -->
    <div id="user-modal" class="modal" style="display:none">
      <div class="card modal-content">
        <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h3><span id="user-modal-title">Nuevo Usuario</span></h3>
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted); border:none; font-size: 1.2rem; cursor:pointer">✕</button>
        </header>
        <form id="user-form">
          <input type="hidden" id="user-edit-id" value="">
          <div class="form-group">
            <label>Nombre de Usuario</label>
            <input type="text" id="user-name" required>
          </div>
          <div class="form-group">
            <label id="user-pass-label">Contraseña</label>
            <input type="password" id="user-pass">
            <small id="user-pass-hint" style="display:none; opacity: 0.6">Dejar en blanco para no cambiar</small>
          </div>
          <div class="form-group">
            <label>Rol</label>
            <select id="user-role">
              <option value="superadmin">Gestor del ERP (Máximo Nivel)</option>
              <option value="admin">Administrador (Gestión General)</option>
              <option value="user">Usuario (Operaciones)</option>
              <option value="viewer">Visor (Sólo Lectura/Reportes)</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="button" onclick="this.closest('.modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
    </div>
  `,

  profile: () => `
    <header class="animate-fade">
      <h1>Mi Perfil</h1>
    </header>
    <div class="card animate-fade" style="max-width: 500px">
      <h2>Cambiar Contraseña</h2>
      <form id="change-pass-form">
        <div class="form-group">
          <label>Contraseña Actual</label>
          <input type="password" id="cp-old" required placeholder="••••••••">
        </div>
        <div class="form-group">
          <label>Nueva Contraseña</label>
          <input type="password" id="cp-new" required placeholder="••••••••">
        </div>
        <div class="form-group">
          <label>Confirmar Nueva Contraseña</label>
          <input type="password" id="cp-confirm" required placeholder="••••••••">
        </div>
        <div class="form-actions">
          <button type="submit" style="width: 100%">Actualizar Contraseña</button>
        </div>
      </form>
    </div>
    <div class="card animate-fade" style="max-width: 500px; margin-top: 1.5rem; border: 1px solid var(--danger-light); background: rgba(239, 68, 68, 0.05);">
      <h2 style="color: var(--danger)">Cerrar Sesión</h2>
      <p style="margin-bottom: 1.5rem; opacity: 0.8">¿Deseas salir del sistema? Tendrás que ingresar tus credenciales nuevamente.</p>
      <button id="btn-logout-profile" class="btn" style="width: 100%; background: var(--danger); color: white; border: none; padding: 0.8rem; border-radius: 0.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.8rem;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        Cerrar Sesión Activa
      </button>
    </div>
  `,

  accounting_ledger: () => {
    const sortedLedger = [...state.ledger];

    // Calculate balances for Mayor/Balance
    const balances = {};
    state.ledger.forEach(entry => {
      entry.lines.forEach(line => {
        if (!balances[line.account_code]) {
          balances[line.account_code] = { name: line.account_name, debit: 0, credit: 0 };
        }
        balances[line.account_code].debit += (line.debit || 0);
        balances[line.account_code].credit += (line.credit || 0);
      });
    });

    return `
      <header class="animate-fade">
        <h1>Sistema Contable</h1>
        <div style="display: flex; gap: 0.5rem">
           <button onclick="window.exportLedger()" style="background: var(--primary)">📥 Exportar Excel</button>
           <button onclick="window.openLedgerTransferModal()" style="background: var(--secondary)">🔄 Transferencia</button>
           <button onclick="window.openLedgerExpenseModal()" style="background: var(--accent)">💸 Registrar Gasto</button>
        </div>
      </header>

      <div class="card animate-fade" style="margin-bottom: 2rem">
        <div class="tabs" style="display: flex; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 1.5rem">
          <button class="tab-btn active" onclick="document.querySelectorAll('.ledger-section').forEach(s => s.style.display='none'); document.getElementById('section-diario').style.display='block'; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); this.classList.add('active');">Libro Diario</button>
          <button class="tab-btn" onclick="document.querySelectorAll('.ledger-section').forEach(s => s.style.display='none'); document.getElementById('section-balance').style.display='block'; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); this.classList.add('active');">Balance General (Saldos)</button>
        </div>

        <div id="section-diario" class="ledger-section">
          <style>
            .ledger-table th { background: rgba(0,0,0,0.1); }
            .entry-header td { background: rgba(var(--primary-rgb), 0.05); border-top: 2px solid var(--primary); }
            .ledger-table tr:hover { background: rgba(255,255,255,0.02); }
            .filter-bar { display: flex; gap: 1rem; margin-bottom: 1rem; align-items: center; background: rgba(255,255,255,0.03); padding: 0.8rem; border-radius: 0.5rem; }
          </style>
          
          <div class="filter-bar">
            <div class="form-group" style="margin:0">
              <label style="font-size: 0.8rem; opacity: 0.7">Filtrar por Tipo</label>
              <select id="ledger-filter-type" onchange="window.updateLedgerFilters()" style="padding: 0.4rem">
                <option value="all" ${state.ledgerFilter.type === 'all' ? 'selected' : ''}>Todos</option>
                <option value="venta" ${state.ledgerFilter.type === 'venta' ? 'selected' : ''}>Ventas</option>
                <option value="compra" ${state.ledgerFilter.type === 'compra' ? 'selected' : ''}>Compras</option>
                <option value="gasto" ${state.ledgerFilter.type === 'gasto' ? 'selected' : ''}>Gastos</option>
                <option value="transferencia" ${state.ledgerFilter.type === 'transferencia' ? 'selected' : ''}>Transferencias</option>
                <option value="consumo" ${state.ledgerFilter.type === 'consumo' ? 'selected' : ''}>Producción</option>
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-size: 0.8rem; opacity: 0.7">Orden</label>
              <select id="ledger-filter-order" onchange="window.updateLedgerFilters()" style="padding: 0.4rem">
                <option value="asc" ${state.ledgerFilter.order === 'asc' ? 'selected' : ''}>Cronológico (Antiguos primero)</option>
                <option value="desc" ${state.ledgerFilter.order === 'desc' ? 'selected' : ''}>Recientes primero</option>
              </select>
            </div>
          </div>

          <div class="table-container">
            <table class="ledger-table">
              <thead>
                <tr>
                  <th style="width: 120px">Fecha</th>
                  <th style="width: 150px">Código Account</th>
                  <th>Cuenta / Glosa</th>
                  <th style="text-align: right; width: 140px">Debe</th>
                  <th style="text-align: right; width: 140px">Haber</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
        let filtered = [...state.ledger];
        if (state.ledgerFilter.type !== 'all') {
          filtered = filtered.filter(e => e.entry_type === state.ledgerFilter.type);
        }
        filtered.sort((a, b) => {
          return state.ledgerFilter.order === 'asc'
            ? new Date(a.date) - new Date(b.date)
            : new Date(b.date) - new Date(a.date);
        });

        if (filtered.length === 0) return '<tr><td colspan="5" style="text-align:center; padding: 2rem; opacity: 0.5;">No hay asientos que coincidan con el filtro.</td></tr>';

        return filtered.map(entry => `
                    <tr class="entry-header">
                      <td><strong>${entry.date}</strong></td>
                      <td colspan="4"><strong>${entry.entry_type.toUpperCase()}</strong>: ${entry.description} ${entry.document_number ? `<small style="opacity:0.7">(Doc: #${entry.document_number})</small>` : ''}</td>
                    </tr>
                    ${entry.lines.map(line => `
                      <tr>
                        <td></td>
                        <td><small style="opacity:0.6">${line.account_code}</small></td>
                        <td style="${line.credit > 0 ? 'padding-left: 2.5rem; font-style: italic;' : ''}">${line.account_name}</td>
                        <td style="text-align: right; color: var(--success)">${line.debit > 0 ? `$${line.debit.toLocaleString()}` : ''}</td>
                        <td style="text-align: right; color: var(--danger)">${line.credit > 0 ? `$${line.credit.toLocaleString()}` : ''}</td>
                      </tr>
                    `).join('')}
                    <tr style="height: 12px"><td colspan="5"></td></tr>
                  `).join('');
      })()}
              </tbody>
            </table>
          </div>
        </div>

        <div id="section-balance" class="ledger-section" style="display: none">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cuenta</th>
                  <th style="text-align: right">Total Debe</th>
                  <th style="text-align: right">Total Haber</th>
                  <th style="text-align: right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                ${Object.keys(balances).sort().map(code => {
        const b = balances[code];
        const saldo = b.debit - b.credit;
        return `
                    <tr>
                      <td>${code}</td>
                      <td><strong>${b.name}</strong></td>
                      <td style="text-align: right">$${b.debit.toLocaleString()}</td>
                      <td style="text-align: right">$${b.credit.toLocaleString()}</td>
                      <td style="text-align: right; font-weight: 600; color: ${saldo >= 0 ? 'var(--success)' : 'var(--danger)'}">$${Math.abs(saldo).toLocaleString()} ${saldo >= 0 ? '(D)' : '(H)'}</td>
                    </tr>
                  `;
      }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Manual Expense Modal -->
      <div id="ledger-expense-modal" class="modal" style="display:none">
        <div class="card modal-content" style="max-width: 450px">
          <h3>Registrar Gasto / Egreso</h3>
          <form id="expense-form">
            <div class="form-group"><label>Fecha</label><input type="date" id="exp-date" required></div>
            <div class="form-group"><label>Descripción / Glosa</label><input type="text" id="exp-desc" required placeholder="Ej: Pago de luz, Arriendo..."></div>
            <div class="form-group"><label>Monto Total ($)</label><input type="number" id="exp-amount" required></div>
            <div class="form-group">
              <label>Cuenta de Gasto (Categoría)</label>
              <select id="exp-category" required>
                ${state.accountingAccounts.filter(a => a.type === 'Gasto' && a.category !== 'Header').map(a => `<option value="${a.code}">${a.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Cuenta de Origen (Pago)</label>
              <select id="exp-origin" required>
                ${state.accountingAccounts.filter(a => a.category === 'Disponible').map(a => `<option value="${a.code}">${a.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-actions">
              <button type="button" onclick="this.closest('.modal').style.display='none'">Cancelar</button>
              <button type="submit">Guardar Gasto</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Manual Transfer Modal -->
      <div id="ledger-transfer-modal" class="modal" style="display:none">
        <div class="card modal-content" style="max-width: 450px">
          <h3>Transferencia Bancaria / Caja</h3>
          <form id="transfer-form">
            <div class="form-group"><label>Fecha</label><input type="date" id="tra-date" required></div>
            <div class="form-group"><label>Monto ($)</label><input type="number" id="tra-amount" required></div>
            <div class="form-group">
              <label>Desde Cuenta</label>
              <select id="tra-from" required>
                ${state.accountingAccounts.filter(a => a.category === 'Disponible').map(a => `<option value="${a.code}">${a.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Hacia Cuenta</label>
              <select id="tra-to" required>
                ${state.accountingAccounts.filter(a => a.category === 'Disponible').map(a => `<option value="${a.code}">${a.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-actions">
              <button type="button" onclick="this.closest('.modal').style.display='none'">Cancelar</button>
              <button type="submit">Ejecutar Transferencia</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
};

function renderHistoryTable(type) {
  const data = state.history[type];
  if (type === 'sales') {
    return `
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Fecha</th>
          <th>Cliente</th>
          <th>Método Pago</th>
          <th>Total Bruto</th>
          <th style="text-align: center">Acción</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(h => `
              <tr>
                <td><strong>#${h.id}</strong></td>
                <td>${h.date ? h.date.split('T')[0] : '-'}</td>
                <td><strong>${h.client_name || 'Venta Directa'}</strong></td>
                <td>${h.payment_method === 'cash' ? '💵 Efectivo' : h.payment_method === 'machine' ? '💳 Máquina' : '🔄 Transferencia'}</td>
                <td>$${(h.total || 0).toLocaleString()} ${h.is_iva_exempt ? '<small style="color:var(--warning)">(Exento)</small>' : ''}</td>
                <td style="text-align: center">
                  <button class="btn-sm" onclick="window.showTransactionDetails('sale', '${h.id}')" title="Ver detalle de productos">👁️ Detalle</button>
                </td>
              </tr>
            `).join('')}
      </tbody>
    </table>
      </div>
  `;
  }
  if (type === 'production') {
    const flatItems = [];
    data.forEach(p => {
      if (p.items) {
        p.items.forEach(it => {
          flatItems.push({
            transId: p.id,
            date: p.date.split('T')[0],
            ...it
          });
        });
      }
    });

    return `
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Ítem</th>
          <th>Fecha</th>
          <th>Producto</th>
          <th>Nombre P</th>
          <th>Cant</th>
          <th>Costo M.O.</th>
          <th>T. M.O.</th>
          <th>Acción</th>
        </tr>
      </thead>
      <tbody>
        ${flatItems.reverse().map(it => `
              <tr>
                <td><strong>#${it.transId}</strong></td>
                <td>${it.item_number}</td>
                <td>${it.date}</td>
                <td>${it.product_code}</td>
                <td>${it.product_name} <small>(${it.color || '-'})</small></td>
                <td style="text-align: center">${it.quantity}</td>
                <td style="text-align: right">$${(it.mo_cost || 0).toLocaleString()}</td>
                <td style="text-align: right">$${((it.mo_cost || 0) * it.quantity).toLocaleString()}</td>
                <td style="text-align: center"><button class="btn-sm" onclick="window.editProduction(${it.transId})">✏️ Editar</button></td>
              </tr>
            `).join('')}
      </tbody>
    </table>
      </div>
  `;
  }
  if (type === 'purchases') {
    return `
  <div class="table-container">
    <table>
      <thead><tr><th>ID</th><th>Fecha</th><th>Tipo/Proyecto</th><th>Proveedor/Glosa</th><th>Total</th><th>Acción</th></tr></thead>
      <tbody>
        ${data.map(h => `
              <tr style="${h.type === 'expense' ? 'background: rgba(var(--accent-rgb), 0.05)' : ''}">
                <td>${h.id}</td>
                <td>${h.date ? h.date.split('T')[0] : '-'}</td>
                <td>
                  <span class="badge ${h.type === 'expense' ? 'badge-warning' : 'badge-info'}" style="font-size: 0.7rem">
                    ${h.type === 'expense' ? 'GASTO' : 'INSUMO'}
                  </span><br>
                  <small>${h.project_name ? '🏗️ ' + h.project_name : 'General'}</small>
                </td>
                <td>
                  <strong>${h.type === 'expense' ? (h.description || 'Gasto General') : (h.provider_name || 'Sin Proveedor')}</strong>
                </td>
                <td style="font-weight: 600">$${(h.total || 0).toLocaleString()}</td>
                <td><button class="btn-sm" onclick="window.showTransactionDetails('purchase', '${h.id}')">👁️ Ver</button></td>
              </tr>
            `).join('')}
      </tbody>
    </table>
      </div >
  `;
  }
}

window.showTransactionDetails = (type, id) => {
  const transaction = state.history[type === 'sale' ? 'sales' : (type === 'production' ? 'production' : 'purchases')].find(t => String(t.id) === String(id));
  if (!transaction) return;

  const modalId = 'details-modal';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    document.body.appendChild(modal);
  }

  const isProduction = type === 'production';
  const title = isProduction ? 'Producción' : (type === 'sale' ? 'Venta' : 'Compra');

  modal.innerHTML = `
  <div class="card modal-content modal-wide animate-fade">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem">
      <h3>Detalle de ${title} #${transaction.id}</h3>
      <div style="text-align: right">
        <span style="color: var(--text-muted); display: block">Fecha: ${transaction.date.split('T')[0]}</span>
        ${transaction.event_name ? `<span class="badge" style="background:var(--secondary-light); color:var(--secondary)">🎡 ${transaction.event_name}</span>` : ''}
      </div>
    </div>
      
      ${!isProduction ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: rgba(255,255,255,0.03); border-radius: 8px">
          <div>
            <label style="font-size: 0.75rem; color: var(--text-muted); display: block">${type === 'sale' ? 'Cliente' : 'Proveedor'}</label>
            <strong>${type === 'sale' ? (transaction.client_name || 'Venta Directa') : (transaction.provider_name || 'N/A')}</strong>
          </div>
          ${type === 'purchase' && transaction.account_name ? `
          <div>
            <label style="font-size: 0.75rem; color: var(--text-muted); display: block">Cuenta / Fondo</label>
            <strong style="color:var(--secondary)">🏦 ${transaction.account_name}</strong>
          </div>
          ` : ''}
          <div>
            <label style="font-size: 0.75rem; color: var(--text-muted); display: block">Método de Pago</label>
            <span>${transaction.payment_method === 'cash' ? '💵 Efectivo' : transaction.payment_method === 'machine' ? '💳 Máquina' : transaction.payment_method === 'credit' ? '💳 Crédito' : '🔄 Transferencia'}</span>
            ${transaction.is_iva_exempt ? ' <small style="color:var(--warning)">(Exento de IVA)</small>' : ''}
          </div>
        </div>
      ` : ''}

<table class="item-table">
  <thead>
    <tr>
      <th style="width: 50px">Ítem</th>
      <th>Código</th>
      <th>Nombre</th>
      <th style="width: 80px; text-align: center">Cant</th>
      ${!isProduction ? `<th style="width: 110px; text-align: right">Precio</th>` : ''}
      ${!isProduction ? `<th style="width: 130px; text-align: right">Subtotal</th>` : ''}
    </tr>
  </thead>
  <tbody>
    ${transaction.items.map(item => {
    // User wants NET values in the rows. 
    // For old sales where gross was stored in subtotal, we calculate net display.
    // If the item subtotal matches the total part of the transaction, it was likely gross.
    let displayUnitPrice = item.unit_price || 0;
    let displaySubtotal = item.subtotal || 0;

    if (type === 'sale' && !transaction.is_iva_exempt) {
      // Check if stored values were gross (common in Venta #4)
      // If transaction.net is roughly 1/1.19 of transaction.total, then items were likely gross
      const isStoredAsGross = Math.abs((transaction.net * 1.19) - transaction.total) < 10;
      if (isStoredAsGross || displaySubtotal > transaction.net) {
        displayUnitPrice = Math.round(displayUnitPrice / 1.19);
        displaySubtotal = Math.round(displaySubtotal / 1.19);
      }
    }

    return `
            <tr>
              <td style="text-align: center">${item.item_number}</td>
              <td><code>${item.product_code || item.mp_code}</code></td>
              <td>${item.product_name || item.mp_name}${item.color ? ' (' + item.color + ')' : ''}${item.size ? ' [' + item.size + ']' : ''}</td>
              <td style="text-align: center">${item.quantity}</td>
              ${!isProduction ? `<td style="text-align: right">$${(displayUnitPrice).toLocaleString()}</td>` : ''}
              ${!isProduction ? `<td style="text-align: right; font-weight: 600">$${(displaySubtotal).toLocaleString()}</td>` : ''}
            </tr>
          `;
  }).join('')}
  </tbody>
</table>

      ${!isProduction ? `
      <div class="summary-section">
        <table class="summary-table">
          <tr><td>Sub Total (Detalle)</td><td style="text-align: right">$${(transaction.net || 0).toLocaleString()}</td></tr>
          <tr><td>Dcto.</td><td style="text-align: right; color: var(--danger)">-$${(transaction.discount || 0).toLocaleString()}</td></tr>
          <tr style="border-top: 1px solid var(--border); font-weight: 600">
            <td>Neto (Base)</td>
            <td style="text-align: right">$${((transaction.net || 0) - (transaction.discount || 0)).toLocaleString()}</td>
          </tr>
          <tr>
            <td>
              IVA (19%) 
              ${transaction.payment_method === 'cash' ? '<span style="font-size:0.75rem; color:var(--warning); margin-left:0.5rem">(No contabilizado)</span>' : ''}
            </td>
            <td style="text-align: right">$${(transaction.iva || 0).toLocaleString()}</td>
          </tr>
          <tr style="font-size: 1.1rem; border-top: 2px solid var(--border); color: var(--success)">
             <td>TOTAL</td>
             <td style="text-align: right"><strong>$${(transaction.total || 0).toLocaleString()}</strong></td>
          </tr>
          ${transaction.payment_method === 'machine' ? `
            <tr style="color: var(--danger); font-size: 0.9rem">
              <td>Comisión Máquina (3,33%)</td>
              <td style="text-align: right">-$${(transaction.commission || Math.round(transaction.total * 0.0333)).toLocaleString()}</td>
            </tr>
          ` : ''}
          ${type === 'sale' ? `
            <tr style="font-size: 1rem; border-top: 2px solid var(--border); background: rgba(var(--success-rgb), 0.1)">
              <td style="padding: 0.75rem 0.5rem"><strong>Ingreso Real (Monto Líquido)</strong></td>
              <td style="text-align: right; padding: 0.75rem 0.5rem"><strong>$${(transaction.total - (transaction.commission || (transaction.payment_method === 'machine' ? Math.round(transaction.total * 0.0333) : 0))).toLocaleString()}</strong></td>
            </tr>
          ` : ''}
        </table>
        </div>
      ` : ''}
      
      <div class="form-actions">
        ${!isProduction ? `<button style="background: var(--accent)" onclick="window.editTransaction('${type}', '${transaction.id}')">✏️ Editar</button>` : ''}
        <button onclick="document.getElementById('${modalId}').style.display='none'">Cerrar</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

window.editTransaction = (type, id) => {
  const transaction = state.history[type === 'sale' ? 'sales' : 'purchases'].find(t => String(t.id) === String(id));
  if (!transaction) {
    console.error(`Transaction not found: ${type} #${id}`);
    return;
  }

  const prefix = type === 'sale' ? 'sale' : 'pur';
  const modalId = type === 'sale' ? 'sale-modal' : 'buy-modal';
  const modalElement = document.getElementById(modalId);

  // If the target modal doesn't exist in the current view (e.g., we are in History)
  if (!modalElement) {
    const targetView = type === 'sale' ? 'sales' : 'purchases';
    renderView(targetView);
    // Important: Wait for DOM to be ready after renderView replaces innerHTML
    setTimeout(() => window.editTransaction(type, id), 200);
    return;
  }

  // Close details modal if open
  const detailsModal = document.getElementById('details-modal');
  if (detailsModal) detailsModal.style.display = 'none';

  try {
    // Set edit mode fields
    const modeEl = document.getElementById(`${prefix}-edit-mode`);
    const idEl = document.getElementById(`${prefix}-edit-id`);
    const titleEl = document.getElementById(`${prefix}-modal-title`);
    const submitBtn = document.getElementById(`btn-submit-${type === 'sale' ? 'sale' : 'purchase'}`);

    if (modeEl) modeEl.value = 'true';
    if (idEl) idEl.value = transaction.id;
    if (titleEl) titleEl.textContent = `Editar ${type === 'sale' ? 'Venta' : 'Compra'} #${transaction.id}`;
    if (submitBtn) submitBtn.textContent = 'Guardar Cambios';

    // Fill main headers
    if (type === 'sale') {
      const clientEl = document.getElementById('sale-client');
      const dateEl = document.getElementById('sale-date');
      const eventEl = document.getElementById('sale-event-name');
      const ivaExemptEl = document.getElementById('sale-iva-exempt');
      const paymentEl = document.getElementById('sale-payment-method');
      const discountInput = document.getElementById('sale-discount-input');

      if (clientEl) clientEl.value = transaction.client_id || '';
      if (dateEl) dateEl.value = transaction.date;
      if (eventEl) eventEl.value = transaction.event_name || '';
      if (ivaExemptEl) ivaExemptEl.checked = transaction.is_iva_exempt || false;
      if (paymentEl) {
        paymentEl.value = transaction.payment_method || 'transfer';
        if (typeof window.updatePaymentFields === 'function') window.updatePaymentFields();
      }
      if (discountInput) discountInput.value = transaction.discount || 0;

      if (transaction.payment_method === 'machine') {
        const machineEl = document.getElementById('sale-machine');
        if (machineEl) machineEl.value = transaction.machine_id || '';
      }
    } else {
      const provEl = document.getElementById('pur-prov');
      const dateEl = document.getElementById('pur-date');
      const paymentEl = document.getElementById('pur-payment-method');
      const accEl = document.getElementById('pur-account');
      const docEl = document.getElementById('pur-doc-type');

      if (provEl) provEl.value = transaction.provider_id || '';
      if (dateEl) dateEl.value = transaction.date;
      if (paymentEl) paymentEl.value = transaction.payment_method || 'transfer';
      if (accEl) accEl.value = transaction.account_id || '';
      if (docEl) docEl.value = transaction.document_type || 'factura';
    }

    // Fill Items Table
    const bodyId = type === 'sale' ? 'sale-items-body' : 'pur-items-body';
    const rows = document.querySelectorAll(`#${bodyId} .item-row`);

    // Clear all rows first
    rows.forEach(row => {
      const codeSel = row.querySelector('.item-code');
      const priceInp = row.querySelector('.item-price');
      const qtyInp = row.querySelector('.item-qty');
      const subInp = row.querySelector('.item-subtotal');
      if (codeSel) codeSel.value = '';
      if (priceInp) priceInp.value = 0;
      if (qtyInp) qtyInp.value = 0;
      if (subInp) subInp.value = 0;
    });

    // Populate with transaction items
    if (transaction.items && Array.isArray(transaction.items)) {
      transaction.items.forEach((item, i) => {
        if (i < rows.length) {
          const row = rows[i];
          const codeSel = row.querySelector('.item-code');
          const priceInp = row.querySelector('.item-price');
          const qtyInp = row.querySelector('.item-qty');
          const subInp = row.querySelector('.item-subtotal');

          if (codeSel) codeSel.value = type === 'sale' ? item.product_code : item.mp_code;
          if (priceInp) priceInp.value = item.unit_price || 0;
          if (qtyInp) qtyInp.value = item.quantity || 0;
          if (subInp) subInp.value = item.subtotal || 0;
        }
      });
    }

    // Update Totals/Summary
    const netH = document.getElementById(`${prefix}-net`);
    const ivaH = document.getElementById(`${prefix}-iva`);
    const totalH = document.getElementById(`${prefix}-total`);
    const netD = document.getElementById(`${prefix}-net-display`);
    const ivaD = document.getElementById(`${prefix}-iva-display`);
    const totalD = document.getElementById(`${prefix}-total-display`);

    if (netH) netH.value = transaction.net;
    if (ivaH) ivaH.value = transaction.iva;
    if (totalH) totalH.value = transaction.total;
    if (netD) netD.textContent = (transaction.net || 0).toLocaleString();
    if (ivaD) ivaD.textContent = (transaction.iva || 0).toLocaleString();
    if (totalD) totalD.textContent = (transaction.total || 0).toLocaleString();

    if (type === 'sale') {
      const discH = document.getElementById('sale-discount');
      const commH = document.getElementById('sale-commission');
      if (discH) discH.value = transaction.discount || 0;
      if (commH) commH.value = transaction.commission || 0;
    }

    // Finally show the modal
    modalElement.style.display = 'flex';

  } catch (err) {
    console.error('Error populating edit modal:', err);
    alert('No se pudo abrir el editor correctamente.');
  }
};

window.editItem = (type, code) => {
  if (type === 'product') {
    const p = state.products.find(x => x.code === code);
    if (!p) return;

    // Set edit mode
    document.getElementById('np-edit-mode').value = 'true';
    document.getElementById('np-original-code').value = p.code;
    document.getElementById('prod-modal-title').textContent = 'Editar Producto';

    // Load data
    document.getElementById('np-code').value = p.code;
    document.getElementById('np-name').value = p.name;
    document.getElementById('np-type').value = p.type || '';

    // UI Loading for pricing
    document.getElementById('np-precio-input').value = p.price_sale;
    document.getElementById('np-incluye-iva').checked = true;

    // Trigger calculation to update displays and hidden fields
    const event = new Event('input');
    document.getElementById('np-precio-input').dispatchEvent(event);

    document.getElementById('np-cost').value = p.cost_unit || 0;
    document.getElementById('np-color').value = p.color || '';
    document.getElementById('np-size').value = p.size || '';
    document.getElementById('np-parent').value = p.parent_code || '';

    document.getElementById('new-prod-modal').style.display = 'flex';
  } else {
    const m = state.rawMaterials.find(x => x.code === code);
    if (!m) return;

    // Set edit mode
    document.getElementById('nrm-edit-mode').value = 'true';
    document.getElementById('nrm-original-code').value = m.code;
    document.getElementById('rm-modal-title').textContent = 'Editar Insumo';

    // Load data
    document.getElementById('nrm-code').value = m.code;
    document.getElementById('nrm-name').value = m.name;
    document.getElementById('nrm-batch-size').value = m.batch_size || 1;
    document.getElementById('nrm-unit').value = m.unit;

    // UI Loading for pricing
    document.getElementById('nrm-precio-input').value = m.cost_net;
    document.getElementById('nrm-incluye-iva').checked = false;

    // Trigger calculation to update displays and hidden fields
    const event = new Event('input');
    document.getElementById('nrm-precio-input').dispatchEvent(event);

    document.getElementById('nrm-color').value = m.color || '';
    document.getElementById('nrm-size').value = m.size || '';
    document.getElementById('nrm-parent').value = m.parent_code || '';

    document.getElementById('new-rm-modal').style.display = 'flex';
  }
};

window.recalculateAllCosts = async () => {
  if (!confirm('¿Deseas recalcular los costos de todos los productos basados en sus recetas?')) return;

  try {
    const result = await apiFetch('/products/recalculate-all-costs', {
      method: 'POST'
    });
    if (result && result.success) {
      alert(result.message);
      fetchData();
    } else {
      alert('Error: ' + (result?.error || 'Error desconocido'));
    }
  } catch (e) {
    alert('Error al recalcular costos');
  }
};

// --- Recetas en Producción ---
window.recipeState = {
  currentPid: null,
  items: []
};

window.editRecipeRow = (index) => {
  const row = document.querySelector(`.recipe-row[data-index="${index}"]`);
  if (!row) return;

  const item = window.recipeState.items[index];
  row.innerHTML = `
    <td>
      <select class="edit-mp-code" onchange="window.updateRecipeRowMP(${index}, this.value)" style="width: 100%">
        <option value="">Seleccione...</option>
        ${state.rawMaterials.map(m => `<option value="${m.code}" ${m.code === item.mp_code ? 'selected' : ''}>${m.name}${m.color ? ' (' + m.color + ')' : ''}</option>`).join('')}
      </select>
    </td>
    <td><input type="number" step="any" class="edit-qty" value="${item.quantity}" oninput="window.updateRecipeRowData(${index})" style="width: 80px; text-align: center"></td>
    <td style="text-align: center"><input type="number" step="1" class="edit-batch" value="${item.batch_size || 1}" oninput="window.updateRecipeRowData(${index})" style="width: 60px; text-align: center"></td>
    <td class="row-consumption" style="text-align: center; font-weight: 600; color: var(--primary)">${((item.quantity || 0) / (item.batch_size || 1)).toFixed(4)}</td>
    <td class="row-unit-price-mp" style="text-align: right">$${Math.round((item.cost_net || 0) / (item.mp_batch_size || 1)).toLocaleString()}</td>
    <td class="row-unit-cost" style="font-weight: 700; color: var(--accent); text-align: right">$${(item.unit_cost || 0).toLocaleString()}</td>
    <td style="text-align: center">
      <button class="btn-sm" onclick="window.saveRecipeRow(${index})" style="background: var(--success); margin-right: 0.5rem">✔️</button>
      <button class="btn-sm" onclick="window.refreshRecipeView()" style="background: var(--surface-light)">❌</button>
    </td>
  `;
};

window.updateRecipeRowMP = (index, code) => {
  const mp = state.rawMaterials.find(m => m.code === code);
  if (!mp) return;
  const item = window.recipeState.items[index];
  item.mp_code = code;
  item.mp_name = mp.name;
  item.unit = mp.unit;
  item.cost_net = mp.cost_net; // Total neto del MP
  item.mp_batch_size = mp.batch_size || 1; // Lote del MP
  window.updateRecipeRowData(index);
};

window.updateRecipeRowData = (index) => {
  const row = document.querySelector(`.recipe-row[data-index="${index}"]`);
  const item = window.recipeState.items[index];

  const qty = parseFloat(row.querySelector('.edit-qty').value) || 0;
  const batch = parseFloat(row.querySelector('.edit-batch').value) || 1;
  const mpUnitPrice = (item.cost_net || 0) / (item.mp_batch_size || 1);
  const consumption = qty / batch;
  const unitCost = consumption * mpUnitPrice;

  item.quantity = qty;
  item.batch_size = batch;
  item.unit_cost = unitCost;

  row.querySelector('.row-consumption').textContent = consumption.toFixed(4);
  row.querySelector('.row-unit-price-mp').textContent = `$${Math.round(mpUnitPrice).toLocaleString()} `;
  row.querySelector('.row-unit-cost').textContent = `$${Math.round(unitCost).toLocaleString()} `;

  window.calculateRecipeTotal();
};

window.saveRecipeRow = (index) => {
  // Solo refresca la vista, los datos ya están en window.recipeState.items
  window.refreshRecipeView();
};

window.deleteRecipeRow = (index) => {
  if (!confirm('¿Eliminar este insumo de la receta?')) return;
  window.recipeState.items.splice(index, 1);
  window.refreshRecipeView();
};

window.addRecipeRow = () => {
  window.recipeState.items.push({
    mp_code: '',
    mp_name: 'Nuevo Insumo',
    quantity: 0,
    batch_size: 1,
    unit_cost: 0,
    unit: '-',
    cost_net: 0,
    mp_batch_size: 1
  });
  window.refreshRecipeView();
  window.editRecipeRow(window.recipeState.items.length - 1);
};

window.calculateRecipeTotal = () => {
  const total = window.recipeState.items.reduce((sum, item) => sum + (item.unit_cost || 0), 0);
  document.getElementById('display-total-cost').textContent = `$${Math.round(total).toLocaleString()} `;
};

window.showProductionHistory = () => {
  document.getElementById('prod-history-modal').style.display = 'flex';
};

window.populateProductDropdowns = (selector) => {
  const selects = document.querySelectorAll(selector);
  const optionsHtml = `
  < option value = "" > Seleccione...</option >
    ${state.products.slice().sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(p => `
      <option value="${p.code}">${p.code} | ${p.name || ''}${p.color ? ' (' + p.color + ')' : ''}${p.size ? ' [' + p.size + ']' : ''}</option>
    `).join('')
    }
`;
  selects.forEach(s => {
    const currentVal = s.value;
    s.innerHTML = optionsHtml;
    s.value = currentVal;
  });
};

window.openProductionModal = (code) => {
  const modal = document.getElementById('production-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  window.populateProductDropdowns('.prod-item-code');

  // Reset fields
  const selects = modal.querySelectorAll('.prod-item-code');
  const mtos = modal.querySelectorAll('.prod-item-mo');
  const qtys = modal.querySelectorAll('.prod-item-qty');
  selects.forEach(s => s.value = '');
  qtys.forEach(q => q.value = '0');
  mtos.forEach(m => m.value = '0');

  if (code) {
    selects[0].value = code;
    qtys[0].value = '1';
  }
};

window.editProduction = (id) => {
  const production = state.history.production.find(p => p.id === id);
  if (!production) return;

  const modal = document.getElementById('production-modal');
  modal.style.display = 'flex';

  window.populateProductDropdowns('.prod-item-code');

  document.getElementById('prod-modal-title').textContent = `Editar Producción #${id} `;
  document.getElementById('btn-prod-text').textContent = 'Guardar Cambios';
  document.getElementById('prod-edit-mode').value = 'true';
  document.getElementById('prod-edit-id').value = id;
  document.getElementById('prod-date').value = production.date.split('T')[0];

  const rows = modal.querySelectorAll('#production-items-body .item-row');
  // Reset all rows
  rows.forEach(row => {
    row.querySelector('.prod-item-code').value = '';
    row.querySelector('.prod-item-qty').value = '0';
    row.querySelector('.prod-item-mo').value = '0';
  });

  // Fill data
  production.items.forEach((item, i) => {
    if (rows[i]) {
      rows[i].querySelector('.prod-item-code').value = item.product_code;
      rows[i].querySelector('.prod-item-qty').value = item.quantity;
      rows[i].querySelector('.prod-item-mo').value = item.mo_cost || 0;
    }
  });
};

// --- USER MANAGEMENT HELPERS ---
window.openUserModal = () => {
  document.getElementById('user-modal').style.display = 'flex';
  document.getElementById('user-modal-title').textContent = 'Nuevo Usuario';
  document.getElementById('user-edit-id').value = '';
  document.getElementById('user-form').reset();
  document.getElementById('user-pass-label').textContent = 'Contraseña';
  document.getElementById('user-pass').required = true;
  document.getElementById('user-pass-hint').style.display = 'none';
};

window.editUser = (id) => {
  const user = state.users.find(u => u.id === id);
  if (!user) return;

  window.openUserModal();
  document.getElementById('user-modal-title').textContent = 'Editar Usuario';
  document.getElementById('user-edit-id').value = id;
  document.getElementById('user-name').value = user.username;
  document.getElementById('user-role').value = user.role;
  document.getElementById('user-pass-label').textContent = 'Nueva Contraseña';
  document.getElementById('user-pass').required = false;
  document.getElementById('user-pass-hint').style.display = 'block';
};

window.deleteUser = async (id) => {
  if (!confirm('¿Está seguro de eliminar este usuario?')) return;
  const res = await apiFetch(`/ users / ${id} `, { method: 'DELETE' });
  if (res && res.success) {
    alert(res.message);
    fetchData();
  }
};

window.refreshRecipeView = () => {
  const container = document.getElementById('recipe-items-body');
  if (!container) return;

  container.innerHTML = window.recipeState.items.map((r, i) => {
    // Calculamos el costo unitario sobre la marcha si es necesario
    const mpUnitPrice = (r.cost_net || 0) / (r.mp_batch_size || 1);
    const consumption = (r.quantity || 0) / (r.batch_size || 1);
    const calculatedUnitCost = consumption * mpUnitPrice;

    // Actualizamos el objeto para que el total se calcule bien
    r.unit_cost = calculatedUnitCost;

    return `
    <tr class="recipe-row" data-index="${i}">
      <td>
        <strong>${r.mp_name}</strong>
        ${r.color || r.size ? `<br><small style="opacity:0.7">${r.color || ''} ${r.size ? '| ' + r.size : ''}</small>` : ''}
      </td>
      <td style="text-align: center">${r.quantity}</td>
      <td style="text-align: center">${r.batch_size || 1}</td>
      <td style="text-align: center; font-weight: 600; color: var(--primary)">${consumption.toFixed(4)} ${r.unit || ''}</td>
      <td style="text-align: right; font-weight: 700">$${Math.round(calculatedUnitCost || 0).toLocaleString()}</td>
      <td style="text-align: center">
        <button class="btn-sm" onclick="window.editRecipeRow(${i})" title="Modificar">✏️</button>
        <button class="btn-sm" onclick="window.deleteRecipeRow(${i})" style="background: var(--danger)" title="Eliminar">🗑️</button>
      </td>
    </tr>
    `;
  }).join('');

  window.calculateRecipeTotal();
};

async function showRecipe(pid) {
  const recipe = await getRecipe(pid);
  const product = state.products.find(p => p.code === pid);
  const container = document.getElementById('recipe-details');

  window.recipeState.currentPid = pid;
  window.recipeState.items = JSON.parse(JSON.stringify(recipe)); // Deep copy

  container.innerHTML = `
    <div class="animate-fade">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
        <h2>Receta: ${product.name} ${product.color ? '(' + product.color + ')' : ''}</h2>
        <button class="btn-sm" onclick="window.addRecipeRow()" style="background: var(--secondary)">➕ Agregar Insumo</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr auto; gap: 1rem; margin-bottom: 1rem">
        <div></div>
        <div style="background: var(--surface-light); padding: 1rem; border-radius: 0.5rem">
          <div style="font-size: 0.875rem; color: var(--text-muted)">Costo Calculado:</div>
          <div id="display-total-cost" style="font-size: 1.5rem; font-weight: 700; color: var(--accent)">$0</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem">Costo en BD: $${(product.cost_unit || 0).toLocaleString()}</div>
        </div>
      </div>

      <div class="table-container" style="margin-bottom: 1.5rem">
        <table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th style="width: 80px; text-align: center">Cant MP</th>
              <th style="width: 80px; text-align: center">Lote Prod</th>
              <th style="width: 120px; text-align: center">Consumo Unit.</th>
              <th style="text-align: right">Costo Unit.</th>
              <th style="width: 100px; text-align: center">Acciones</th>
            </tr>
          </thead>
          <tbody id="recipe-items-body">
            <!-- Rows injected by refreshRecipeView -->
          </tbody>
        </table>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem">
        <button id="btn-save-recipe" style="background: var(--success); padding: 0.75rem 2rem">💾 Guardar Receta</button>
      </div>
    </div>
  `;

  window.refreshRecipeView();

  // Guardamos la receta en window para poder llamarla desde el onclick
  window.saveCurrentRecipe = async () => {
    const items = window.recipeState.items.filter(item => item.mp_code && item.quantity > 0).map(item => ({
      mpCode: item.mp_code,
      quantity: item.quantity,
      batchSize: item.batch_size
    }));

    if (items.length === 0) {
      if (!confirm('La receta está vacía. ¿Deseas borrar todos los insumos de este producto?')) return;
    }

    const btn = document.getElementById('btn-save-recipe');
    if (!btn) return;

    btn.textContent = 'Guardando...';
    btn.disabled = true;

    try {
      const res = await putData(`/recipes/${pid}`, { items }, true); // true = silent
      if (res && res.success) {
        alert('✅ Receta guardada exitosamente');
        // Recargar productos para ver el nuevo costo
        const prods = await apiFetch('/products');
        if (prods) state.products = prods;
        state.recipes[pid] = null; // Limpiar cache
        showRecipe(pid);
      } else {
        alert('❌ Error al guardar: ' + (res?.error || 'Error desconocido'));
        btn.textContent = '💾 Guardar Receta';
        btn.disabled = false;
      }
    } catch (err) {
      console.error('Save Recipe Error:', err);
      alert('❌ Error crítico al guardar la receta');
      btn.textContent = '💾 Guardar Receta';
      btn.disabled = false;
    }
  };

  const btn = document.getElementById('btn-save-recipe');
  if (btn) {
    btn.onclick = window.saveCurrentRecipe;
  }
}

// --- Accounts State & View ---
state.accounts = [];

// ... (in fetchData) ...
// Add fetch accounts logic

views.accounts_management = () => `
  <header class="animate-fade">
    <h1>Gestión de Cuentas (Fondos)</h1>
    <button onclick="window.openAccountModal()">+ Nueva Cuenta</button>
  </header>
  <div class="card animate-fade">
    <div class="table-container">
      <table>
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Saldo Actual</th><th>Acción</th></tr></thead>
        <tbody>
          ${state.accounts.map(acc => `
            <tr>
              <td><strong>${acc.name}</strong></td>
              <td>${acc.type === 'debit' ? 'Débito / Banco' : (acc.type === 'credit' ? 'Tarjeta Crédito' : 'Efectivo')}</td>
              <td style="color: ${acc.current_balance >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 600">
                $${(acc.current_balance || 0).toLocaleString()}
              </td>
              <td><button class="btn-sm" onclick="window.editAccount('${acc.id}')">✏️</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div id="account-modal" class="modal" style="display:none">
    <div class="card modal-content">
       <h3 id="acc-modal-title">Nueva Cuenta</h3>
       <form id="account-form">
         <input type="hidden" id="acc-id">
         <div class="form-group"><label>Nombre</label><input type="text" id="acc-name" required></div>
         <div class="form-group"><label>Tipo</label>
           <select id="acc-type">
             <option value="debit">Banco / Débito</option>
             <option value="credit">Tarjeta de Crédito</option>
             <option value="cash">Efectivo / Caja Chica</option>
           </select>
         </div>
         <div class="form-group"><label>Saldo Inicial</label><input type="number" id="acc-balance" value="0"></div>
         <div class="form-actions">
           <button type="button" onclick="document.getElementById('account-modal').style.display='none'">Cancelar</button>
           <button type="submit">Guardar</button>
         </div>
       </form>
    </div>
  </div>
`;

window.openAccountModal = () => {
  document.getElementById('account-modal').style.display = 'flex';
  document.getElementById('acc-modal-title').textContent = 'Nueva Cuenta';
  document.getElementById('acc-id').value = '';
  document.getElementById('account-form').reset();
};

window.editAccount = (id) => {
  const acc = state.accounts.find(a => a.id === id);
  if (!acc) return;
  window.openAccountModal();
  document.getElementById('acc-modal-title').textContent = 'Editar Cuenta';
  document.getElementById('acc-id').value = acc.id;
  document.getElementById('acc-name').value = acc.name;
  document.getElementById('acc-type').value = acc.type;
  document.getElementById('acc-balance').value = acc.current_balance;
};

// --- Quotations State & View ---
state.quotations = [];
window.quotationItems = []; // Temporary items for current editing quote

views.quotations = () => `
  <header class="animate-fade">
    <div style="display:flex; align-items:center; gap:1rem">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>
      <h1>Cotizaciones</h1>
    </div>
    <button onclick="window.openQuotationModal()">+ Nueva Cotización</button>
  </header>
  
  <div class="card animate-fade">
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Nombre Proyecto</th>
            <th style="text-align:right">Costo Interno</th>
            <th style="text-align:right">Precio Venta (IVA Inc)</th>
            <th style="text-align:center">Prob. Éxito</th>
            <th style="text-align:center">Estado</th>
            <th style="text-align:center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.quotations.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:3rem; opacity:0.5">No hay cotizaciones registradas</td></tr>' :
    state.quotations.map(q => `
              <tr>
                <td>${q.created_at ? new Date(q.created_at).toLocaleDateString() : '-'}</td>
                <td>${q.clients?.name || 'Varios'}</td>
                <td><strong>${q.name || '-'}</strong></td>
                <td style="text-align:right">$${Math.round(q.total_net_cost || 0).toLocaleString()}</td>
                <td style="text-align:right; font-weight:bold; color:var(--primary)">$${Math.round(q.total_price_gross || 0).toLocaleString()}</td>
                <td style="text-align:center">
                  ${q.success_probability ? `<span style="font-weight:bold; color:${q.success_probability > 50 ? '#10b981' : (q.success_probability > 20 ? '#f59e0b' : '#ef4444')}">${Math.round(q.success_probability)}%</span>` : '-'}
                </td>
                <td style="text-align:center"><span class="badge ${q.status}">${q.status === 'draft' ? 'Borrador' : (q.status === 'approved' ? 'Aprobada' : q.status)}</span></td>
                <td style="text-align:center">
                  <div style="display:flex; gap:0.3rem; justify-content:center">
                    <button class="btn-sm" onclick="window.viewQuotation('${q.id}')">👁️ Ver</button>
                    <button class="btn-sm" style="background:var(--accent)" onclick="window.editQuotation('${q.id}')">✏️ Editar</button>
                  </div>
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Quotation Modal -->
  <div id="quotation-modal" class="modal" style="display:none">
    <div class="card modal-content modal-wide animate-fade">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem">
        <h3 id="quote-modal-title">Nueva Cotización</h3>
        <input type="hidden" id="quote-id">
        <button class="btn-sm" style="background:none; color:var(--text-muted); font-size:1.5rem" onclick="document.getElementById('quotation-modal').style.display='none'">✕</button>
      </div>

      <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:1rem">
        <div class="form-group" style="grid-column: span 2">
          <label>Cliente</label>
          <select id="quote-client" onchange="window.onQuoteClientChange(this.value)">
            <option value="">Seleccione...</option>
            ${state.clients?.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="grid-column: span 2">
          <label>RUT Cliente</label>
          <input type="text" id="quote-rut" placeholder="Ej: 76.123.456-7">
        </div>
        <div class="form-group" style="grid-column: span 2">
          <label>Dirección Cliente</label>
          <input type="text" id="quote-address" placeholder="Ej: Av. Vitacura 1234, Oficina 501">
        </div>
        <div class="form-group" style="grid-column: span 4">
          <label>Descripción de la Propuesta (Aparece en PDF)</label>
          <textarea id="quote-description-proposal" rows="2" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:8px" placeholder="Ej: PROPUESTA PARA ADQUISICIÓN DE 22 MANTELES..."></textarea>
        </div>
        
        <div class="form-group" style="grid-column: span 4; margin-bottom: 1rem">
          <label>🖼️ Referencias Fotográficas (Arrastra imágenes aquí)</label>
          <div id="quote-dropzone" 
            style="border: 2px dashed var(--border); border-radius: 12px; padding: 1.5rem; text-align: center; background: rgba(255,255,255,0.02); cursor: pointer; transition: all 0.3s"
            onclick="document.getElementById('quote-file-input').click()"
            ondragover="event.preventDefault(); this.style.borderColor='var(--primary)'; this.style.background='rgba(59, 130, 246, 0.05)'"
            ondragleave="this.style.borderColor='var(--border)'; this.style.background='rgba(255,255,255,0.02)'"
            ondrop="window.handleQuoteDrop(event)">
            <p id="dropzone-text" style="margin:0; opacity:0.6">📸 Haz clic o arrastra fotos aquí (Máx. 4 fotos, tamaño pequeño)</p>
            <input type="file" id="quote-file-input" multiple accept="image/*" style="display:none" onchange="window.handleQuoteFiles(this.files)">
            <div id="quote-images-preview" style="display: flex; gap: 0.8rem; flex-wrap: wrap; margin-top: 1rem; justify-content: center"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Nombre Interno</label>
          <input type="text" id="quote-name" placeholder="Ej: Evento Municipalidad">
        </div>
        <div class="form-group">
          <label>Fecha Emisión</label>
          <input type="date" id="quote-date">
        </div>
        <div class="form-group">
          <label>Plazo Entrega</label>
          <input type="text" id="quote-delivery-time" placeholder="Ej: 8 días corridos">
        </div>
        <div class="form-group">
          <label>% Utilidad</label>
          <input type="number" id="quote-utility" value="30" min="0" oninput="window.calculateQuotation()">
        </div>
        <div class="form-group">
          <label>Presupuesto (P)</label>
          <input type="number" id="quote-budget" value="0" min="0" oninput="window.calculateQuotation()">
        </div>
        <div class="form-group">
          <label>% Éxito</label>
          <div id="quote-probability" style="font-size: 1.1rem; font-weight: bold; padding-top: 0.5rem; color: var(--primary)">-%</div>
        </div>
      </div>

      <!-- Nueva Sección de Productos -->
      <div style="margin-top: 1.5rem; background: rgba(59, 130, 246, 0.05); padding: 1.2rem; border-radius: 12px; border: 1px dashed var(--primary)">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h4 style="margin:0; color:var(--primary)">📦 1. Definir Productos a Vender</h4>
          <button class="btn-sm btn-primary" onclick="window.addQuotationProduct()">+ Añadir Producto</button>
        </div>
        <div id="quote-products-list" style="display:flex; flex-direction:column; gap:0.5rem"></div>
      </div>

      <div style="margin-top: 2rem">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h4 style="margin:0; display:flex; align-items:center; gap:0.5rem">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7h-9m9 4h-9m9 4h-9M4 7h2m-2 4h2m-2 4h2"></path></svg>
            2. Desglose de Costos de Insumos y Servicios
          </h4>
          <button class="btn-sm btn-primary" onclick="window.addQuotationItem()">+ Agregar Ítem</button>
        </div>
        <div class="table-container" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px">
          <table class="item-table" style="width:100%">
            <thead style="position:sticky; top:0; background:var(--surface); z-index:10">
              <tr>
                <th style="width:110px">Vincular a</th>
                <th style="width:110px">Tipo</th>
                <th style="width:90px">Cálculo</th>
                <th>Descripción / Insumo</th>
                <th style="width:100px">Doc.</th>
                <th style="width:140px">Costo Neto</th>
                <th style="width:80px">Cant</th>
                <th style="width:130px; text-align:right">SubTot Unit</th>
                <th style="width:140px; text-align:right">Subtotal</th>
                <th style="width:40px"></th>
              </tr>
            </thead>
            <tbody id="quote-items-body"></tbody>
          </table>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 2rem; margin-top: 2rem; padding-top: 1.5rem; border-top: 2px solid var(--border)">
        <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 8px">
          <h4 style="margin-top:0; color:var(--text-muted)">Resumen de Costos</h4>
          <table class="summary-table" style="width:100%">
            <tr><td>Neto (Facturas)</td><td id="res-cost-net" style="text-align:right">$0</td></tr>
            <tr><td>IVA Gasto (Boletas)</td><td id="res-cost-iva" style="text-align:right">$0</td></tr>
            <tr style="border-top: 1px solid var(--border)"><td style="padding-top:0.5rem"><strong>Costo Total</strong></td><td id="res-cost-total" style="text-align:right; font-weight:bold; padding-top:0.5rem">$0</td></tr>
            <tr><td style="color:var(--primary)">Costo Unitario (CTU)</td><td id="res-ctu" style="text-align:right; font-weight:bold; color:var(--primary)">$0</td></tr>
          </table>
        </div>
        <div style="background: var(--primary-light); padding: 1rem; border-radius: 8px; border-left: 4px solid var(--primary)">
          <h4 style="margin-top:0; color:var(--primary)">Propuesta Venta Cliente</h4>
          <table class="summary-table" style="width:100%">
            <tr><td>Subtotal Venta Neto</td><td id="res-price-net" style="text-align:right">$0</td></tr>
            <tr><td>IVA Venta (19%)</td><td id="res-price-iva" style="text-align:right">$0</td></tr>
            <tr style="font-size: 1.1rem">
                <td><strong>Total a Cobrar</strong></td>
                <td id="res-price-total" style="text-align:right; color:var(--primary); font-weight:bold">$0</td>
            </tr>
            <tr style="font-size: 0.9rem; opacity:0.8">
              <td>Precio Unitario (PVP)</td>
              <td id="res-pvp" style="text-align:right">$0</td>
            </tr>
          </table>
        </div>
      </div>

      <div class="form-actions" style="margin-top: 2rem; border-top:none">
        <button onclick="document.getElementById('quotation-modal').style.display='none'" style="background:var(--surface-light)">Cancelar</button>
        <button id="btn-save-quote" class="btn-primary" style="padding: 0.8rem 2rem; font-weight:600" onclick="window.saveQuotation()">💾 Guardar y Finalizar</button>
      </div>
    </div>
  </div>
  <datalist id="raw-materials-list">
    ${state.rawMaterials.map(rm => `<option value="${rm.name}">${rm.code}</option>`).join('')}
  </datalist>
`;

window.openQuotationModal = () => {
  document.getElementById('quotation-modal').style.display = 'flex';
  document.getElementById('quote-modal-title').textContent = 'Nueva Cotización';
  document.getElementById('quote-id').value = '';
  document.getElementById('quote-name').value = '';
  document.getElementById('quote-client').value = '';
  document.getElementById('quote-rut').value = '';
  document.getElementById('quote-address').value = '';
  document.getElementById('quote-description-proposal').value = '';
  document.getElementById('quote-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('quote-delivery-time').value = '';
  document.getElementById('quote-utility').value = '30';
  document.getElementById('quote-budget').value = '0';
  document.getElementById('quote-probability').textContent = '-%';
  document.getElementById('btn-save-quote').disabled = false;
  document.getElementById('btn-save-quote').textContent = '💾 Guardar Cotización';

  window.quotationItems = [];
  window.quotationProducts = [
    { id: 'p' + Date.now(), name: '', quantity: 1 }
  ];
  window.quotationImages = [];
  window.renderQuoteImagePreviews();

  window.renderQuotationProducts();
  if (window.quotationItems.length === 0) {
    window.addQuotationItem();
  } else {
    window.renderQuotationItems();
  }
  window.calculateQuotation();
};

window.editQuotation = async (id) => {
  const q = await apiFetch(`/quotations/${id}`);
  if (!q) return;

  window.openQuotationModal();
  document.getElementById('quote-modal-title').textContent = 'Editar Cotización';
  document.getElementById('quote-id').value = q.id;
  document.getElementById('quote-name').value = q.name || '';
  document.getElementById('quote-client').value = q.client_id || '';
  document.getElementById('quote-rut').value = q.rut || '';
  document.getElementById('quote-address').value = q.address || '';
  document.getElementById('quote-description-proposal').value = q.description_proposal || '';
  document.getElementById('quote-date').value = q.quote_date ? q.quote_date.split('T')[0] : '';
  document.getElementById('quote-delivery-time').value = q.delivery_time || '';
  document.getElementById('quote-utility').value = q.utility_percentage || 0;
  document.getElementById('quote-budget').value = q.budget || 0;

  window.quotationProducts = q.products_list || [
    { id: 'p' + Date.now(), name: q.name, quantity: q.quantity || 1 }
  ];

  window.quotationItems = q.items.map(it => ({
    type: it.item_type || 'material',
    calculation_type: it.calculation_type || 'unit',
    linked_to: it.linked_to || 'general',
    description: it.description,
    document_type: it.document_type || 'factura',
    unit_value_net: it.unit_cost,
    quantity: it.quantity
  }));

  window.quotationImages = q.images || [];
  window.renderQuoteImagePreviews();

  window.renderQuotationProducts();
  window.renderQuotationItems();
  window.calculateQuotation();
};

window.addQuotationItem = () => {
  window.quotationItems.push({
    type: 'material',
    calculation_type: 'unit', // 'unit' o 'fixed'
    linked_to: 'general', // ID de producto o 'general'
    description: '',
    document_type: 'factura',
    unit_value_net: 0,
    quantity: 1
  });
  window.renderQuotationItems();
};

window.renderQuotationItems = () => {
  const tbody = document.getElementById('quote-items-body');
  if (!tbody) return;

  tbody.innerHTML = window.quotationItems.map((item, index) => `
    <tr>
      <td>
        <select class="form-input-sm" onchange="window.updateQuoteItem(${index}, 'linked_to', this.value)">
          <option value="general" ${item.linked_to === 'general' ? 'selected' : ''}>General</option>
          ${window.quotationProducts.map(p => `<option value="${p.id}" ${item.linked_to === p.id ? 'selected' : ''}>${p.name || 'Sin nombre'}</option>`).join('')}
        </select>
      </td>
      <td>
        <select class="form-input-sm" onchange="window.updateQuoteItem(${index}, 'type', this.value)">
          <option value="material" ${item.type === 'material' ? 'selected' : ''}>Material</option>
          <option value="service" ${item.type === 'service' ? 'selected' : ''}>Servicio</option>
          <option value="labor" ${item.type === 'labor' ? 'selected' : ''}>Mano Obra</option>
          <option value="other" ${item.type === 'other' ? 'selected' : ''}>Otro</option>
        </select>
      </td>
      <td>
        <select class="form-input-sm" onchange="window.updateQuoteItem(${index}, 'calculation_type', this.value)">
          <option value="unit" ${item.calculation_type === 'unit' ? 'selected' : ''}>Unitario</option>
          <option value="fixed" ${item.calculation_type === 'fixed' ? 'selected' : ''}>Fijo</option>
        </select>
      </td>
      <td>
        <input type="text" class="form-input-sm" list="raw-materials-list" value="${item.description}" placeholder="Descripción ítem..." oninput="window.updateQuoteItem(${index}, 'description', this.value)">
      </td>
      <td>
        <select class="form-input-sm" onchange="window.updateQuoteItem(${index}, 'document_type', this.value)">
          <option value="factura" ${item.document_type === 'factura' ? 'selected' : ''}>Factura</option>
          <option value="boleta" ${item.document_type === 'boleta' ? 'selected' : ''}>Boleta</option>
        </select>
      </td>
      <td>
        <input type="number" class="form-input-sm" value="${item.unit_value_net}" style="text-align:right" oninput="window.updateQuoteItem(${index}, 'unit_value_net', this.value)">
      </td>
      <td>
        <input type="number" class="form-input-sm" value="${item.quantity}" style="text-align:center" oninput="window.updateQuoteItem(${index}, 'quantity', this.value)">
      </td>
      <td id="quote-item-subtotunit-${index}" style="text-align:right; font-weight:400; color: var(--text-muted)">
        $${Math.round((item.unit_value_net || 0) * (item.quantity || 0)).toLocaleString()}
      </td>
      <td id="quote-item-subtotal-${index}" style="text-align:right; font-weight:500">
        $${window.getItemProjectTotal(item).toLocaleString()}
      </td>
      <td>
        <button class="btn-sm" onclick="window.removeQuoteItem(${index})" style="background:none; color:var(--danger); border:none; padding:0">✕</button>
      </td>
    </tr>
  `).join('');
};

window.updateQuoteItem = (index, field, value) => {
  const item = window.quotationItems[index];
  item[field] = (field === 'unit_value_net' || field === 'quantity') ? parseFloat(value) || 0 : value;

  // Actualizar SubTot Unit y Subtotal de la fila en tiempo real
  const subtotUnitTd = document.getElementById(`quote-item-subtotunit-${index}`);
  if (subtotUnitTd) {
    subtotUnitTd.textContent = `$${Math.round((item.unit_value_net || 0) * (item.quantity || 0)).toLocaleString()}`;
  }
  const subtotalTd = document.getElementById(`quote-item-subtotal-${index}`);
  if (subtotalTd) {
    subtotalTd.textContent = `$${window.getItemProjectTotal(item).toLocaleString()}`;
  }

  // Autocompletado de precio si es Material y coincide con un Insumo
  if (field === 'description' && item.type === 'material') {
    const rm = state.rawMaterials.find(x => x.name === value || x.code === value);
    if (rm) {
      item.unit_value_net = Math.round((rm.cost_net || 0) / (rm.batch_size || 1));
      window.renderQuotationItems(); // Re-render to show new price
    }
  }

  window.calculateQuotation();
};

window.addQuotationProduct = () => {
  window.quotationProducts.push({ id: 'p' + Date.now(), name: '', quantity: 1 });
  window.renderQuotationProducts();
  window.renderQuotationItems(); // Para actualizar los selects de vinculación
};

window.renderQuotationProducts = () => {
  const container = document.getElementById('quote-products-list');
  if (!container) return;
  container.innerHTML = window.quotationProducts.map((p, index) => `
    <div style="display:flex; gap:0.5rem; align-items:center">
      <input type="text" class="form-input-sm" placeholder="Nombre Producto (ej: Mantel Spandex)" value="${p.name}" style="flex:2" oninput="window.updateQuotationProduct(${index}, 'name', this.value)">
      <input type="number" class="form-input-sm" placeholder="Cantidad" value="${p.quantity}" style="width:100px" oninput="window.updateQuotationProduct(${index}, 'quantity', this.value)">
      <button class="btn-sm" onclick="window.removeQuotationProduct(${index})" style="background:none; color:var(--danger)">✕</button>
    </div>
  `).join('');
};

window.updateQuotationProduct = (index, field, value) => {
  window.quotationProducts[index][field] = field === 'quantity' ? parseFloat(value) || 0 : value;
  window.renderQuotationItems(); // Para actualizar los nombres en los selects
  window.calculateQuotation();
};

window.removeQuotationProduct = (index) => {
  const pid = window.quotationProducts[index].id;
  window.quotationProducts.splice(index, 1);
  // Desvincular items que apuntaban a este producto
  window.quotationItems.forEach(it => { if (it.linked_to === pid) it.linked_to = 'general'; });
  window.renderQuotationProducts();
  window.renderQuotationItems();
  window.calculateQuotation();
};

window.removeQuoteItem = (index) => {
  window.quotationItems.splice(index, 1);
  window.renderQuotationItems();
  window.calculateQuotation();
};

window.onQuoteClientChange = (cid) => {
  const client = state.clients.find(c => c.id == cid);
  if (client) {
    document.getElementById('quote-rut').value = client.rut || '';
    document.getElementById('quote-address').value = client.address || '';
  }
};

window.calculateQuotation = () => {
  const utilityPerc = parseFloat(document.getElementById('quote-utility').value) || 0;

  let totalCostGlobal = 0;
  let factNetGlobal = 0;
  let bolIVAGlobal = 0;

  // 1. Mapear productos para fácil acceso
  const products = {};
  window.quotationProducts.forEach(p => {
    products[p.id] = { ...p, cost: 0, net: 0, iva: 0 };
  });

  // 2. Separar costos fijos (generales) y variables (por producto)
  let generalFixedCost = 0;
  let generalFixedNet = 0;
  let generalFixedIVA = 0;

  window.quotationItems.forEach(item => {
    const raw = (item.unit_value_net || 0) * (item.quantity || 0);
    const isFixed = item.calculation_type === 'fixed';

    let lineCost = raw;
    let lineIVA = 0;
    if (item.document_type === 'boleta') {
      lineCost = raw * 1.19;
      lineIVA = raw * 0.19;
    }

    if (item.linked_to === 'general') {
      if (isFixed) {
        generalFixedCost += lineCost;
        generalFixedNet += (item.document_type === 'factura' ? raw : 0);
        generalFixedIVA += lineIVA;
      } else {
        // Unitario General: Escala por la suma de todos los productos
        const totalQty = window.quotationProducts.reduce((sum, p) => sum + (p.quantity || 0), 0);
        generalFixedCost += lineCost * (totalQty || 1);
        generalFixedNet += (item.document_type === 'factura' ? raw * (totalQty || 1) : 0);
        generalFixedIVA += lineIVA * (totalQty || 1);
      }
    } else {
      const p = products[item.linked_to];
      if (p) {
        if (isFixed) {
          p.cost += lineCost;
          p.net += (item.document_type === 'factura' ? raw : 0);
          p.iva += lineIVA;
        } else {
          // Si es unitario, se multiplica por la cantidad del producto
          const totalLine = lineCost * (p.quantity || 1);
          p.cost += totalLine;
          p.net += (item.document_type === 'factura' ? raw * p.quantity : 0);
          p.iva += lineIVA * (p.quantity || 1);
        }
      }
    }
  });

  // 3. Sumar y calcular precios unitarios redondeados (Bottom-Up)
  let totalNetoVisual = 0;
  const totalQty = window.quotationProducts.reduce((sum, p) => sum + (p.quantity || 0), 0);

  Object.values(products).forEach(p => {
    // Proporción de costos generales (basado en cantidad de unidades)
    const share = totalQty > 0 ? (p.quantity / totalQty) : 0;
    const pTotalCost = p.cost + (generalFixedCost * share);

    // Precio Unitario Neto propuesto (Costo + Utilidad)
    const unitPriceNetRaw = (pTotalCost / (p.quantity || 1)) * (1 + (utilityPerc / 100));
    const unitPriceNetRounded = Math.round(unitPriceNetRaw);

    const productSubtotalNet = unitPriceNetRounded * (p.quantity || 0);
    totalNetoVisual += productSubtotalNet;

    // Guardar para uso en la vista
    p.unitPriceNet = unitPriceNetRounded;
    p.subtotalNet = productSubtotalNet;

    totalCostGlobal += pTotalCost;
    factNetGlobal += p.net + (generalFixedNet * share);
    bolIVAGlobal += p.iva + (generalFixedIVA * share);
  });

  const priceNet = totalNetoVisual;
  const iva = Math.round(priceNet * 0.19);
  const priceGross = priceNet + iva;

  // Probabilidad
  const budget = parseFloat(document.getElementById('quote-budget').value) || 0;
  let probPercent = 0;
  if (budget > 0) {
    const rawProb = -1.6 * (priceGross / budget) + 1.7;
    probPercent = Math.max(0, Math.min(100, rawProb * 100));
  }
  const probEl = document.getElementById('quote-probability');
  if (probEl) {
    probEl.textContent = budget > 0 ? `${Math.round(probPercent)}%` : '-%';
    probEl.style.color = probPercent > 50 ? '#10b981' : (probPercent > 20 ? '#f59e0b' : '#ef4444');
  }

  document.getElementById('res-cost-net').textContent = `$${Math.round(factNetGlobal).toLocaleString()}`;
  document.getElementById('res-cost-iva').textContent = `$${Math.round(bolIVAGlobal).toLocaleString()}`;
  document.getElementById('res-cost-total').textContent = `$${Math.round(totalCostGlobal).toLocaleString()}`;

  // CTU promedio
  document.getElementById('res-ctu').textContent = `$${Math.round(totalCostGlobal / (totalQty || 1)).toLocaleString()}`;

  document.getElementById('res-price-net').textContent = `$${Math.round(priceNet).toLocaleString()}`;
  document.getElementById('res-price-iva').textContent = `$${Math.round(iva).toLocaleString()}`;
  document.getElementById('res-price-total').textContent = `$${Math.round(priceGross).toLocaleString()}`;
  document.getElementById('res-pvp').textContent = `$${Math.round(priceGross / (totalQty || 1)).toLocaleString()}`;

  window.currentQuoteCalcs = {
    total_net_cost: totalCostGlobal,
    total_price_net: priceNet,
    total_iva: iva,
    total_price_gross: priceGross,
    budget: budget,
    success_probability: probPercent
  };
};

// Función auxiliar para calcular el impacto total de una fila de costo en el proyecto
window.getItemProjectTotal = (item) => {
  const raw = (item.unit_value_net || 0) * (item.quantity || 0);
  const lineCost = item.document_type === 'boleta' ? raw * 1.19 : raw;
  const isFixed = item.calculation_type === 'fixed';

  if (item.linked_to === 'general') {
    if (isFixed) return Math.round(lineCost);
    const totalQty = window.quotationProducts.reduce((sum, p) => sum + (p.quantity || 0), 0);
    return Math.round(lineCost * (totalQty || 1));
  } else {
    const p = window.quotationProducts.find(x => x.id === item.linked_to);
    if (!p) return Math.round(lineCost);
    if (isFixed) return Math.round(lineCost);
    return Math.round(lineCost * (p.quantity || 1));
  }
};

window.saveQuotation = async () => {
  const btn = document.getElementById('btn-save-quote');
  const quoteId = document.getElementById('quote-id').value;
  const clientId = document.getElementById('quote-client').value;
  const name = document.getElementById('quote-name').value;
  const rut = document.getElementById('quote-rut').value;
  const address = document.getElementById('quote-address').value;
  const descProposal = document.getElementById('quote-description-proposal').value;
  const quoteDate = document.getElementById('quote-date').value;
  const deliveryTime = document.getElementById('quote-delivery-time').value;

  if (!clientId || !name) return alert('Por favor complete Cliente y Nombre');

  btn.disabled = true;
  btn.textContent = 'Guardando...';

  console.log('SAVE_DEBUG - quotationImages:', window.quotationImages?.length, 'items');
  console.log('SAVE_DEBUG - images type:', typeof window.quotationImages, Array.isArray(window.quotationImages));

  const body = {
    client_id: clientId,
    name: name,
    rut: rut,
    address: address,
    description_proposal: descProposal,
    images: window.quotationImages,
    quote_date: quoteDate,
    delivery_time: deliveryTime,
    quantity: window.quotationProducts.reduce((sum, p) => sum + (p.quantity || 0), 0),
    utility_percentage: parseFloat(document.getElementById('quote-utility').value),
    products_list: window.quotationProducts,
    ...window.currentQuoteCalcs,
    items: window.quotationItems
      .filter(it => it.quantity > 0)
      .map(it => {
        const projectTotal = window.getItemProjectTotal(it);
        return {
          item_type: it.type,
          calculation_type: it.calculation_type,
          linked_to: it.linked_to,
          description: it.description,
          quantity: it.quantity,
          unit_cost: it.unit_value_net,
          total_cost: Math.round(projectTotal)
        };
      })
  };

  try {
    const method = quoteId ? 'PUT' : 'POST';
    const endpoint = quoteId ? `/quotations/${quoteId}` : '/quotations';
    const res = await apiFetch(endpoint, { method, body: JSON.stringify(body) });

    if (res && res.success) {
      alert(res.message || 'Cotización guardada correctamente');
      document.getElementById('quotation-modal').style.display = 'none';
      fetchData();
    } else {
      btn.disabled = false;
      btn.textContent = '💾 Guardar Cotización';
      alert('Error: No se pudo guardar la cotización. Podría ser que las imágenes son muy pesadas o hay un problema de conexión.');
    }
  } catch (err) {
    console.error('Save error:', err);
    btn.disabled = false;
    btn.textContent = '💾 Guardar Cotización';
    alert('Error al guardar la cotización');
  }
};


window.handleQuoteDrop = (e) => {
  e.preventDefault();
  const dz = document.getElementById('quote-dropzone');
  dz.style.borderColor = 'var(--border)';
  dz.style.background = 'rgba(255,255,255,0.02)';
  window.handleQuoteFiles(e.dataTransfer.files);
};

window.handleQuoteFiles = async (files) => {
  if (window.quotationImages.length >= 4) return alert('Máximo 4 imágenes por cotización');

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    if (window.quotationImages.length >= 4) break;

    const base64 = await window.processQuoteImage(file);
    window.quotationImages.push(base64);
  }
  window.renderQuoteImagePreviews();
};

window.processQuoteImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max = 600;

        if (width > height) {
          if (width > max) {
            height *= max / width;
            width = max;
          }
        } else {
          if (height > max) {
            width *= max / height;
            height = max;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compresión para peso pequeño
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

window.renderQuoteImagePreviews = () => {
  const container = document.getElementById('quote-images-preview');
  const dzText = document.getElementById('dropzone-text');
  if (!container) return;

  container.innerHTML = window.quotationImages.map((src, idx) => `
    <div style="position:relative; width:80px; height:80px; border-radius:8px; overflow:hidden; border:1px solid var(--border)">
      <img src="${src}" style="width:100%; height:100%; object-fit:cover">
      <button onclick="event.stopPropagation(); window.removeQuoteImage(${idx})" 
        style="position:absolute; top:2px; right:2px; background:rgba(239, 68, 68, 0.8); color:white; border:none; border-radius:50%; width:18px; height:18px; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center">✕</button>
    </div>
  `).join('');

  if (dzText) {
    dzText.style.display = window.quotationImages.length > 0 ? 'none' : 'block';
  }
};

window.removeQuoteImage = (idx) => {
  window.quotationImages.splice(idx, 1);
  window.renderQuoteImagePreviews();
};

window.viewQuotation = async (id) => {
  const q = await apiFetch(`/quotations/${id}`);
  if (!q) return;

  const modalId = 'view-quote-modal';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    document.body.appendChild(modal);
  }

  const renderContent = (viewType) => {
    let tableHtml = '';
    if (viewType === 'internal') {
      tableHtml = `
        <table>
          <thead>
            <tr style="background: var(--surface-light)">
              <th>Item</th>
              <th>Vincular a</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th style="text-align:right">Subtotal Proyecto</th>
            </tr>
          </thead>
          <tbody>
            ${q.items.map((it, idx) => `
              <tr>
                <td style="text-align:center">${idx + 1}</td>
                <td style="color: var(--primary); font-weight:500">${it.linked_to === 'general' ? 'General' : (q.products_list?.find(p => p.id === it.linked_to)?.name || 'Producto')}</td>
                <td>${it.item_type}</td>
                <td>${it.description}</td>
                <td style="text-align:right; font-weight:bold">$${Math.round(it.total_cost).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      // Client view: Multi-product table with Item, Detalle, Precio Unit, Cant, Sub Tot
      const products = q.products_list || [{ id: 'p1', name: q.name, quantity: q.quantity || 1 }];
      const totalQuoteGross = q.total_price_gross || 0;
      const totalQuoteNet = q.total_price_net || 0;
      const totalQuoteIVA = q.total_iva || 0;

      // 1. Calculate each product's cost weight to distribute the final price proportionally
      let totalProjectCost = 0;
      const productCosts = {};
      const totalQuantityAll = products.reduce((sum, p) => sum + (p.quantity || 0), 0);

      products.forEach(p => productCosts[p.id] = 0);
      let generalCosts = 0;

      (q.items || []).forEach(it => {
        const raw = (it.unit_cost || 0) * (it.quantity || 0);
        const costWithTax = it.document_type === 'boleta' ? raw * 1.19 : raw;
        const isFixed = it.calculation_type === 'fixed';

        if (it.linked_to === 'general') {
          generalCosts += isFixed ? costWithTax : (costWithTax * totalQuantityAll);
        } else if (productCosts[it.linked_to] !== undefined) {
          const p = products.find(x => x.id === it.linked_to);
          productCosts[it.linked_to] += isFixed ? costWithTax : (costWithTax * (p?.quantity || 1));
        }
      });

      // Distribute general costs among products based on quantity
      products.forEach(p => {
        const share = totalQuantityAll > 0 ? (p.quantity / totalQuantityAll) : 0;
        productCosts[p.id] += generalCosts * share;
        totalProjectCost += productCosts[p.id];
      });

      tableHtml = `
        <div class="client-view-container">
          <table class="item-table pvp-table">
            <thead>
              <tr style="background: var(--primary); color: white">
                <th style="width: 50px; text-align: center">Item</th>
                <th>Detalle</th>
                <th style="width: 140px; text-align: right">Precio Unit</th>
                <th style="width: 80px; text-align: center">Cant</th>
                <th style="width: 140px; text-align: right">Sub Tot</th>
              </tr>
            </thead>
            <tbody>
              ${(() => {
          let currentVisualNeto = 0;
          return products.map((p, idx) => {
            const costWeight = totalProjectCost > 0 ? (productCosts[p.id] / totalProjectCost) : (1 / products.length);
            const pNetShare = totalQuoteNet * costWeight;
            const unitPriceNet = Math.round(p.quantity > 0 ? (pNetShare / p.quantity) : 0);
            const rowSubtotal = unitPriceNet * p.quantity;
            currentVisualNeto += rowSubtotal;

            return `
                    <tr>
                      <td style="text-align: center; color: var(--text-muted)">${idx + 1}</td>
                      <td style="font-weight: 600">${p.name || '-'}</td>
                      <td style="text-align: right">$ ${unitPriceNet.toLocaleString()}</td>
                      <td style="text-align: center">${p.quantity}</td>
                      <td style="text-align: right">$ ${rowSubtotal.toLocaleString()}</td>
                    </tr>
                  `;
          }).join('');
        })()}
            </tbody>
          </table>

          <div style="display: flex; justify-content: flex-end; margin-top: -1px">
            <table style="width: 360px; border-collapse: collapse; background: rgba(255,255,255,0.05)">
              <tr style="border: 1px solid var(--border)">
                <td style="padding: 0.8rem; font-weight: bold; background: var(--primary); color: white; width: 40%">Neto</td>
                <td style="padding: 0.8rem; text-align: right; font-weight: bold; font-size: 1.1rem">$ ${Math.round(totalQuoteNet).toLocaleString()}</td>
              </tr>
              <tr style="border: 1px solid var(--border)">
                <td style="padding: 0.8rem; font-weight: bold; background: var(--primary); color: white">IVA (19%)</td>
                <td style="padding: 0.8rem; text-align: right; font-weight: bold; font-size: 1.1rem">$ ${Math.round(totalQuoteIVA).toLocaleString()}</td>
              </tr>
              <tr style="border: 1px solid var(--border)">
                <td style="padding: 0.8rem; font-weight: bold; background: var(--primary); color: white">TOTAL</td>
                <td style="padding: 0.8rem; text-align: right; font-weight: bold; font-size: 1.3rem; color: var(--primary)">$ ${Math.round(totalQuoteGross).toLocaleString()}</td>
              </tr>
            </table>
          </div>
        </div>
        <p style="margin-top:2rem; font-size:0.9rem; opacity:0.7; border-top: 1px solid var(--border); padding-top: 1rem">
          Nota: Cotización sujeta a factibilidad técnica y disponibilidad de stock. Valores expresados en Pesos Chilenos ($).
        </p>
      `;
    }

    modal.innerHTML = `
      <div class="card modal-content modal-wide animate-fade">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem">
          <h3>Cotización #${String(q.id).split('-')[0]} - ${q.name}</h3>
          <div class="tab-group">
            <button class="tab-btn ${viewType === 'internal' ? 'active' : ''}" onclick="window.updateViewQuoteType('internal')">Vista Interna</button>
            <button class="tab-btn ${viewType === 'client' ? 'active' : ''}" onclick="window.updateViewQuoteType('client')">Vista Cliente (PVP)</button>
          </div>
        </div>

        <div style="margin-bottom:1.5rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem">
          ${(() => {
        const clientInfo = state.clients.find(c => String(c.id) === String(q.client_id)) || q.clients || {};
        const displayRut = q.rut || clientInfo.rut || '-';
        const displayAddress = q.address || clientInfo.address || '-';
        return `
              <div><p><strong>Cliente:</strong> ${clientInfo.name || q.name || 'Varios'}</p></div>
              <div><p><strong>RUT:</strong> ${displayRut}</p></div>
              <div><p><strong>Dirección:</strong> ${displayAddress}</p></div>
              <div><p><strong>Fecha Emisión:</strong> ${q.quote_date ? new Date(q.quote_date).toLocaleDateString() : '-'}</p></div>
              <div><p><strong>Plazo de Entrega:</strong> ${q.delivery_time || 'No especificado'}</p></div>
            `;
      })()}
        </div>

        <div class="table-container">${tableHtml}</div>

        ${q.images && q.images.length > 0 ? `
          <div style="margin-top: 1.5rem">
            <h4 style="margin-bottom: 0.8rem; color: var(--primary)">🖼️ Imágenes de Referencia</h4>
            <div style="display: flex; gap: 1rem; flex-wrap: wrap">
              ${q.images.map(img => `<img src="${img}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); background: #000">`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="form-actions" style="margin-top:2rem">
          <button onclick="document.getElementById('${modalId}').style.display='none'">Cerrar</button>
          ${viewType === 'client' ? `<button class="btn-primary" onclick="window.printQuotation()">🖨️ Imprimir / PDF</button>` : ''}
        </div>
      </div>
    `;
  };

  window.updateViewQuoteType = (type) => renderContent(type);
  window.currentViewedQuote = q;
  renderContent('client'); // Default to client view
  modal.style.display = 'flex';
};

// --- Print Quotation Function ---
window.printQuotation = () => {
  const q = window.currentViewedQuote;
  if (!q) return alert('No hay cotización cargada');

  const printWindow = window.open('', '_blank', 'width=900,height=900');
  if (!printWindow) return alert('Por favor, desactive el bloqueador de ventanas emergentes.');

  const today = new Date().toLocaleDateString('es-CL');
  const quoteDisplayId = String(q.id).split('-')[0].toUpperCase();

  // Find client in global state for fallback
  const clientInfo = state.clients.find(c => String(c.id) === String(q.client_id)) || q.clients || {};
  const displayRut = q.rut || clientInfo.rut || '-';
  const displayAddress = q.address || clientInfo.address || '-';
  const displayClientName = clientInfo.name || q.name || 'Varios';

  const products = q.products_list || [{ id: 'p1', name: q.name, quantity: q.quantity || 1 }];
  const totalQuoteNet = q.total_price_net || 0;
  const totalQuoteIVA = q.total_iva || 0;
  const totalQuoteGross = q.total_price_gross || 0;

  // Re-calculate weights for unit prices
  let totalProjectCost = 0;
  const productCosts = {};
  const totalQuantityAll = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
  products.forEach(p => productCosts[p.id] = 0);
  let generalCosts = 0;
  (q.items || []).forEach(it => {
    const raw = (it.unit_cost || 0) * (it.quantity || 0);
    const costWithTax = it.document_type === 'boleta' ? raw * 1.19 : raw;
    if (it.linked_to === 'general') {
      generalCosts += (it.calculation_type === 'fixed') ? costWithTax : (costWithTax * totalQuantityAll);
    } else if (productCosts[it.linked_to] !== undefined) {
      const p = products.find(x => x.id === it.linked_to);
      productCosts[it.linked_to] += (it.calculation_type === 'fixed') ? costWithTax : (costWithTax * (p?.quantity || 1));
    }
  });
  products.forEach(p => {
    productCosts[p.id] += generalCosts * (totalQuantityAll > 0 ? (p.quantity / totalQuantityAll) : 0);
    totalProjectCost += productCosts[p.id];
  });

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Cotización Ross - ${q.id}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Roboto', sans-serif; padding: 40px; color: #333; line-height: 1.4; background: white; }
        
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
        .logo-section { display: flex; align-items: center; gap: 15px; }
        .logo-img { width: 90px; height: 90px; object-fit: contain; }
        
        .company-details h2 { font-size: 18px; color: #000; }
        .company-details p { font-size: 13px; color: #444; }
        
        .quote-meta { text-align: right; }
        .quote-meta p { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
        
        .line-divider { border-top: 3px solid #000; margin-bottom: 30px; }
        
        .main-title { text-align: center; color: #4a7ebb; font-size: 26px; font-weight: bold; margin-bottom: 30px; letter-spacing: 2px; }
        
        .client-info-grid { margin-bottom: 40px; font-size: 14px; }
        .info-row { display: flex; margin-bottom: 5px; }
        .info-label { width: 100px; font-weight: bold; }
        .info-value { flex: 1; }
        
        .presente { color: #4a7ebb; font-size: 18px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; }
        .intro-text { font-size: 14px; margin-bottom: 20px; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 0; table-layout: fixed; }
        th { border: 1.5px solid #000; padding: 10px; font-size: 13px; background: #fff; text-transform: uppercase; }
        td { border: 1.5px solid #000; padding: 10px; font-size: 14px; }
        
        .totals-table { width: 260px; margin-left: auto; margin-top: -1.5px; border-collapse: collapse; }
        .totals-table td { font-weight: bold; width: 50%; }
        .label-cell { background: #fff; }
        
        .section-title { color: #4a7ebb; font-size: 18px; font-weight: bold; margin: 40px 0 20px 0; text-transform: uppercase; }
        
        .bank-details { background: #f9f9f9; padding: 20px; border: 1px dashed #4a7ebb; border-radius: 8px; margin-top: 20px; }
        .bank-details p { font-size: 13px; margin-bottom: 3px; }
        
        .page-break { page-break-before: always; }
        
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <!-- HOJA 1: COTIZACIÓN -->
      <div class="page-header">
        <div class="logo-section">
          <img src="${window.LOGO_ROSS_B64 || ''}" class="logo-img" alt="Logo">
          <div class="company-details">
            <h2>ROSS Confecciones</h2>
            <p>Rosa Huentemil Contreras</p>
            <p>Fono: +569 98745436</p>
            <p>Mail: ross.confecciones@gmail.com</p>
          </div>
        </div>
        <div class="quote-meta">
          <p>COTIZACIÓN: ${quoteDisplayId}</p>
          <p>Fecha documento: ${q.quote_date ? q.quote_date.split('-').reverse().join('-') : today}</p>
          <p>Página 1 de 2</p>
        </div>
      </div>

      <div class="line-divider"></div>
      
      <h1 class="main-title">COTIZACIÓN</h1>

      <div class="client-info-grid">
        <div class="info-row"><span class="info-label">Señores:</span><span class="info-value">${displayClientName}</span></div>
        <div class="info-row">
          <span class="info-label">RUT:</span><span class="info-value" style="width:200px">${displayRut}</span>
          <span class="info-label">Estado Cotización:</span><span class="info-value">VIGENTE</span>
        </div>
        <div class="info-row"><span class="info-label">Dirección:</span><span class="info-value">${displayAddress}</span></div>
        <div class="info-row"><span class="info-label">Descripción:</span><span class="info-value">${q.description_proposal || '-'}</span></div>
      </div>

      <h2 class="presente">PRESENTE</h2>
      
      <p class="intro-text">De nuestra consideración:<br>Por la presente, tenemos el agrado de Cotizar nuestros productos que detallamos a continuación:</p>

      <table>
        <thead>
          <tr>
            <th style="width: 50px; text-align:center">Items</th>
            <th>DESCRIPCION</th>
            <th style="width: 130px; text-align:right">PRECIO X UNIDAD</th>
            <th style="width: 130px; text-align:right">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((p, idx) => {
    const costWeight = totalProjectCost > 0 ? (productCosts[p.id] / totalProjectCost) : (1 / products.length);
    const unitPrice = Math.round(p.quantity > 0 ? (totalQuoteNet * costWeight / p.quantity) : 0);
    return `
              <tr>
                <td style="text-align:center">${p.quantity}</td>
                <td><strong>${p.name}</strong></td>
                <td style="text-align:right">$ ${unitPrice.toLocaleString('es-CL')}</td>
                <td style="text-align:right">$ ${Math.round(unitPrice * p.quantity).toLocaleString('es-CL')}</td>
              </tr>
            `;
  }).join('')}
        </tbody>
      </table>

      <table class="totals-table">
        <tr><td class="label-cell">NETO</td><td style="text-align:right">$ ${Math.round(totalQuoteNet).toLocaleString('es-CL')}</td></tr>
        <tr><td class="label-cell">IVA (19%)</td><td style="text-align:right">$ ${Math.round(totalQuoteIVA).toLocaleString('es-CL')}</td></tr>
        <tr style="font-size:18px"><td class="label-cell" style="background:#eee">TOTAL</td><td style="text-align:right; background:#eee">$ ${Math.round(totalQuoteGross).toLocaleString('es-CL')}</td></tr>
      </table>

      <div class="page-break"></div>

      <!-- HOJA 2: ESPECIFICACIONES Y CONDICIONES -->
      <div class="page-header">
        <div class="logo-section">
          <img src="${window.LOGO_ROSS_B64 || ''}" class="logo-img" alt="Logo">
          <div class="company-details"><h2>ROSS Confecciones</h2></div>
        </div>
        <div class="quote-meta">
          <p>COTIZACIÓN: ${quoteDisplayId}</p>
          <p>Página 2 de 2</p>
        </div>
      </div>

      <h2 class="section-title">SERVICIOS INCLUIDOS:</h2>
      <ul style="list-style: none; font-size:14px; margin-left: 20px">
        <li>• Materiales e insumos de alta calidad.</li>
        <li>• Confección completa y terminaciones profesionales.</li>
        <li>• Control de calidad unitario.</li>
        <li>• Embalaje y despacho incluido.</li>
      </ul>

      ${q.images && q.images.length > 0 ? `
        <h2 class="section-title">REFERENCIAS VISUALES:</h2>
        <div style="display: flex; gap: 15px; margin-left: 20px; flex-wrap: wrap">
          ${q.images.map(img => `<img src="${img}" style="width: 180px; height: 180px; object-fit: cover; border: 1.5px solid #000; border-radius: 4px">`).join('')}
        </div>
      ` : ''}

      <h2 class="section-title">PLAZO DE ENTREGA:</h2>
      <p style="font-size:14px; margin-left: 20px"><strong>${q.delivery_time || 'Por confirmar'}</strong> a contar de la confirmación del pedido y pago inicial.</p>

      <h2 class="section-title">PLAZO DE VALIDEZ DE LA COTIZACIÓN:</h2>
      <p style="font-size:14px; margin-left: 20px">Cotización válida por 30 días.</p>

      <h2 class="section-title">DATOS BANCARIOS PARA TRANSFERENCIA:</h2>
      <div class="bank-details">
        <p><strong>Nombre:</strong> Rosa Angélica Huentemil Contreras</p>
        <p><strong>RUT:</strong> 13.267.639-9</p>
        <p><strong>Banco:</strong> Banco Estado</p>
        <p><strong>Tipo Cuenta:</strong> Cuenta Rut</p>
        <p><strong>N° Cuenta:</strong> 13267639</p>
        <p><strong>E-mail:</strong> ross.confecciones@gmail.com</p>
      </div>

      <h2 class="section-title">GARANTÍA Y POST-VENTA:</h2>
      <p style="font-size:14px; margin-left: 20px">
        • <strong>Plazo:</strong> 90 días desde la entrega del producto.<br>
        • <strong>Cobertura:</strong> Defectos de confección, fallas de material o medidas fuera de especificación.<br>
        • <strong>Condición:</strong> El producto debe devolverse limpio y sin signos de mal uso.
      </p>

      <div style="margin-top: 80px; text-align: center; font-size: 13px; color: #666">
        <p>Sin otro particular y atento a sus comentarios, le saluda muy cordialmente,</p>
        <div style="position: relative; height: 120px; margin-top: 30px">
          <img src="${window.FIRMA_ROSS_B64 || ''}" style="width: 250px; height: auto; position: absolute; left: 50%; transform: translateX(-50%); top: -65px; z-index: 1" alt="Firma">
          <div style="position: relative; z-index: 2; margin-top: 80px">
            <p style="margin: 0"><strong>ROSS Confecciones</strong></p>
            <p style="margin: 0">Rosa Huentemil Contreras</p>
          </div>
        </div>
      </div>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

async function postData(endpoint, body) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (result.success) {
      alert(result.message || 'Operación exitosa');
      fetchData(); // Sincronizar stock
    } else alert('Error: ' + result.error);
  } catch (e) { alert('Error de conexión'); }
}

function renderView(viewName) {
  const appContainer = document.getElementById('app');

  // Limpiar cualquier residuo de vistas y modales abiertos para evitar blurs persistentes
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  if (viewName === 'login') {
    appContainer.style.display = 'block';
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.main-content').style.marginLeft = '0';
    document.querySelector('.main-content').style.padding = '0';
  } else {
    appContainer.style.display = 'flex';
    document.querySelector('.sidebar').style.display = 'flex';
    document.querySelector('.main-content').style.marginLeft = 'var(--sidebar-width)';
    document.querySelector('.main-content').style.padding = '2rem';

    // --- SISTEMA DE PERMISOS POR ROL ---
    const userRole = currentUser?.role || 'user';

    // Definimos qué puede ver cada uno
    const permissions = {
      superadmin: ['dashboard', 'inventory_products', 'inventory_rm', 'design', 'production', 'sales', 'purchases', 'history', 'reports', 'masters', 'user_management', 'quotations', 'accounts_management', 'clients_management', 'providers_management', 'payment_machines', 'direct_sales', 'accounting_ledger', 'profile'],
      admin: ['dashboard', 'inventory_products', 'inventory_rm', 'design', 'production', 'sales', 'purchases', 'history', 'reports', 'masters', 'quotations', 'accounts_management', 'clients_management', 'providers_management', 'payment_machines', 'direct_sales', 'accounting_ledger', 'profile'],
      user: ['dashboard', 'inventory_products', 'inventory_rm', 'production', 'sales', 'purchases', 'history', 'quotations', 'clients_management', 'providers_management', 'direct_sales', 'profile'],
      viewer: ['dashboard', 'reports', 'history', 'profile'] // El "Externo" que solo revisa informes
    };

    const allowedViews = permissions[userRole] || permissions['user'];

    navItems.forEach(item => {
      const view = item.dataset.view;
      if (allowedViews.includes(view)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });

    // Si el usuario intenta entrar a una vista no permitida (por link manual o error)
    if (!allowedViews.includes(viewName) && viewName !== 'login') {
      return renderView('dashboard');
    }
  }

  if (!views[viewName]) return;
  mainContent.innerHTML = views[viewName]();
  navItems.forEach(item => item.classList.toggle('active', item.dataset.view === viewName));

  // Actualizar nombre de usuario en el sidebar si no estamos en login
  if (viewName !== 'login') {
    const userDisplay = document.getElementById('display-username');
    const roleDisplay = document.getElementById('display-user-role');
    if (userDisplay && currentUser) {
      userDisplay.textContent = currentUser.username;
    }
    if (roleDisplay && currentUser) {
      const roleMap = {
        'superadmin': 'Gestor del ERP',
        'admin': 'Administrador',
        'user': 'Usuario',
        'viewer': 'Visor'
      };
      roleDisplay.textContent = roleMap[currentUser.role] || currentUser.role;
      // DEBUG:
      console.log('Current User Role:', currentUser.role);
    }
  }

  if (viewName === 'login') {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-user').value;
      const password = document.getElementById('login-pass').value;
      const errorEl = document.getElementById('login-error');

      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        }).then(r => r.json());

        if (res.token) {
          token = res.token;
          currentUser = res.user;
          localStorage.setItem('erp_token', token);
          localStorage.setItem('erp_user', JSON.stringify(currentUser));

          // Ocultar formulario inmediatamente
          mainContent.innerHTML = '<div class="animate-fade" style="text-align:center; padding: 2rem;"><h3>Ingreso exitoso...</h3></div>';

          fetchData();
        } else {
          errorEl.textContent = res.error || 'Error al ingresar';
          errorEl.style.display = 'block';
        }
      } catch (err) {
        errorEl.textContent = 'Error de conexión';
        errorEl.style.display = 'block';
      }
    });
    return;
  }

  if (viewName === 'quotations') {
    // Initialization for quotations view
  }

  if (viewName === 'accounts_management') {
    // Handler para guardar cuentas
    document.getElementById('account-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('acc-id').value;
      const body = {
        name: document.getElementById('acc-name').value,
        type: document.getElementById('acc-type').value,
        current_balance: parseFloat(document.getElementById('acc-balance').value) || 0
      };

      if (id) {
        // Editar
        await putData(`/accounts/${id}`, body);
      } else {
        // Nueva
        await postData('/accounts', body);
      }

      document.getElementById('account-modal').style.display = 'none';
      fetchData();
    });
  }


  if (viewName === 'reports') {
    initReports();
  }

  if (viewName === 'history') {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('history-content').innerHTML = renderHistoryTable(btn.dataset.history);
      });
    });
  }

  if (viewName === 'production') {
    document.querySelectorAll('.recipe-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.recipe-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        showRecipe(item.dataset.pid);
      });
    });
  }

  if (viewName === 'purchases') {
    setupItemTable('pur');

    window.togglePurType = function () {
      const type = document.getElementById('pur-type')?.value;
      const mpContainer = document.getElementById('pur-items-container');
      const expenseContainer = document.getElementById('pur-expense-amount-container');
      const summarySection = document.getElementById('pur-summary-section');
      const descGroup = document.getElementById('pur-desc-group');
      const provGroup = document.getElementById('pur-prov-group');
      const projectGroup = document.getElementById('pur-project-group');
      const titleEl = document.getElementById('buy-modal-title');

      if (!mpContainer || !expenseContainer || !summarySection || !descGroup || !provGroup || !projectGroup) return;

      if (type === 'expense') {
        if (titleEl) titleEl.textContent = 'Informe de Gasto / Caja Chica';
        mpContainer.style.display = 'none';
        expenseContainer.style.display = 'block';
        summarySection.style.display = 'none';
        descGroup.style.display = 'block';
        provGroup.style.display = 'none';
      } else {
        if (titleEl) titleEl.textContent = 'Nueva Compra de Insumos (Materiales)';
        mpContainer.style.display = 'block';
        expenseContainer.style.display = 'none';
        summarySection.style.display = 'block';
        descGroup.style.display = 'none';
        provGroup.style.display = 'block';
      }
    };

    window.openPurchaseModal = function () {
      const modal = document.getElementById('buy-modal');
      if (modal) modal.style.display = 'flex';

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      };

      setVal('pur-edit-mode', 'false');
      setVal('pur-edit-id', '');
      setVal('pur-type', 'mp');
      setVal('pur-description', '');
      setVal('pur-project', '');
      setVal('pur-expense-total', 0);

      window.togglePurType();
    };

    window.runMigration = async function () {
      if (!confirm('¿Ejecutar actualización de base de datos?')) return;
      try {
        const res = await apiFetch('/admin/migrate-purchases');
        alert(res?.message || 'Migración exitosa');
      } catch (e) {
        alert('Error: ' + e.message);
      }
    };

    document.getElementById('btn-submit-purchase')?.addEventListener('click', async () => {
      const isEditMode = document.getElementById('pur-edit-mode')?.value === 'true';
      const editId = document.getElementById('pur-edit-id')?.value;
      const type = document.getElementById('pur-type')?.value;

      const projectVal = document.getElementById('pur-project')?.value || null;
      const body = {
        type: type,
        date: document.getElementById('pur-date')?.value,
        payment_method: document.getElementById('pur-payment-method')?.value,
        account_id: document.getElementById('pur-account')?.value || null,
        document_type: document.getElementById('pur-doc-type')?.value,
        quotation_id: (projectVal && !projectVal.includes('S-')) ? parseInt(projectVal) : null,
        project_ref: (projectVal && projectVal.includes('S-')) ? projectVal : (projectVal || null)
      };

      if (type === 'mp') {
        body.providerId = document.getElementById('pur-prov')?.value;
        body.items = getTableItems('pur');
        body.net = parseInt(document.getElementById('pur-net')?.value) || 0;
        body.iva = parseInt(document.getElementById('pur-iva')?.value) || 0;
        body.total = parseInt(document.getElementById('pur-total')?.value) || 0;

        if (!body.items || body.items.length === 0) return alert('Debe agregar al menos un ítem');
      } else {
        const totalExp = parseInt(document.getElementById('pur-expense-total')?.value) || 0;
        body.description = document.getElementById('pur-description')?.value;
        body.net = totalExp;
        body.iva = 0;
        body.total = totalExp;

        if (!body.description) return alert('Debe ingresar una descripción para el gasto');
        if (body.total <= 0) return alert('El monto debe ser mayor a cero');
      }

      try {
        let res;
        if (isEditMode) {
          res = await putData(`/purchases/${editId}`, body);
        } else {
          res = await postData('/purchases', body);
        }

        // Hide modal immediately if successful (postData/putData already alert and refresh)
        const modal = document.getElementById('buy-modal');
        if (modal) modal.style.display = 'none';

      } catch (e) {
        alert('Error al procesar: ' + e.message);
      }
    });
  }

  if (viewName === 'sales') {
    setupItemTable('sale');

    // Helper: show/hide machine selector based on payment method
    window.updatePaymentFields = function () {
      const method = document.getElementById('sale-payment-method').value;
      const machineGroup = document.getElementById('machine-selector-group');
      const ivaExempt = document.getElementById('sale-iva-exempt');

      if (method === 'machine') {
        machineGroup.style.display = 'block';
        ivaExempt.checked = false;
      } else if (method === 'cash') {
        machineGroup.style.display = 'none';
        ivaExempt.checked = true; // Efectivo auto-marca exento
      } else {
        machineGroup.style.display = 'none';
        ivaExempt.checked = false;
      }
      window.recalculateSaleTotals();
    };

    // Recalculate totals when IVA exempt changes
    window.recalculateSaleTotals = function () {
      calculateTotals('sale');
    };

    document.getElementById('btn-submit-sale').addEventListener('click', async () => {
      const isEditMode = document.getElementById('sale-edit-mode').value === 'true';
      const editId = document.getElementById('sale-edit-id').value;
      const paymentMethod = document.getElementById('sale-payment-method').value;

      const body = {
        clientId: document.getElementById('sale-client').value,
        date: document.getElementById('sale-date').value,
        items: getTableItems('sale'),
        net: parseInt(document.getElementById('sale-net').value),
        iva: parseInt(document.getElementById('sale-iva').value),
        discount: parseInt(document.getElementById('sale-discount').value) || 0,
        commission: parseInt(document.getElementById('sale-commission').value) || 0,
        total: parseInt(document.getElementById('sale-total').value),
        payment_method: paymentMethod,
        account_id: document.getElementById('sale-account').value || null,
        is_iva_exempt: document.getElementById('sale-iva-exempt').checked,
        machine_id: paymentMethod === 'machine' ? (document.getElementById('sale-machine').value || null) : null,
        event_name: document.getElementById('sale-event-name').value || null
      };

      if (body.items.length === 0) return alert('Debe agregar al menos un ítem');

      if (isEditMode) {
        await putData(`/sales/${editId}`, body);
      } else {
        await postData('/sales', body);
      }

      // Limpiar y cerrar
      document.getElementById('sale-modal').style.display = 'none';
      document.getElementById('sale-edit-mode').value = 'false';
      document.getElementById('sale-edit-id').value = '';
      document.getElementById('sale-modal-title').textContent = 'Nueva Venta de Productos';
      document.getElementById('btn-submit-sale').textContent = 'Registrar Venta';
      fetchData();
    });
  }

  if (viewName === 'inventory_products') {
    // IVA Calculation Logic - All values rounded to integers (Chilean pesos)
    function calculateProductPrices() {
      const input = parseFloat(document.getElementById('np-precio-input').value) || 0;
      const incluyeIva = document.getElementById('np-incluye-iva').checked;

      let neto, iva, total;

      if (incluyeIva) {
        // El precio ingresado YA incluye IVA, calcular hacia atrás
        total = Math.round(input);
        neto = Math.round(input / 1.19);
        iva = total - neto;
      } else {
        // El precio es neto, calcular IVA y total
        neto = Math.round(input);
        iva = Math.round(neto * 0.19);
        total = neto + iva;
      }

      // Update displays
      document.getElementById('np-neto-display').textContent = '$' + neto.toLocaleString('es-CL');
      document.getElementById('np-iva-display').textContent = '$' + iva.toLocaleString('es-CL');
      document.getElementById('np-total-display').textContent = '$' + total.toLocaleString('es-CL');

      // Update hidden inputs (all integers)
      document.getElementById('np-pnet').value = neto;
      document.getElementById('np-iva').value = iva;
      document.getElementById('np-psale').value = total;
    }

    // Add event listeners for calculation
    document.getElementById('np-precio-input')?.addEventListener('input', calculateProductPrices);
    document.getElementById('np-incluye-iva')?.addEventListener('change', calculateProductPrices);

    document.getElementById('new-prod-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const isEditMode = document.getElementById('np-edit-mode').value === 'true';
      const originalCode = document.getElementById('np-original-code').value;

      const body = {
        code: document.getElementById('np-code').value,
        name: document.getElementById('np-name').value,
        type: document.getElementById('np-type').value,
        price_net: parseFloat(document.getElementById('np-pnet').value),
        price_sale: parseFloat(document.getElementById('np-psale').value),
        iva: parseFloat(document.getElementById('np-iva').value),
        cost_unit: parseFloat(document.getElementById('np-cost').value),
        color: document.getElementById('np-color').value,
        size: document.getElementById('np-size').value,
        parent_code: document.getElementById('np-parent').value
      };

      if (isEditMode) {
        await putData(`/products/${originalCode}`, body);
      } else {
        await postData('/products', body);
      }

      // Reset form and close modal
      document.getElementById('new-prod-modal').style.display = 'none';
      document.getElementById('np-edit-mode').value = 'false';
      document.getElementById('np-original-code').value = '';
      document.getElementById('prod-modal-title').textContent = 'Nuevo Producto Terminado';
      e.target.reset();
      fetchData();
    });
  }

  if (viewName === 'inventory_rm') {
    // IVA Calculation for Raw Materials
    function calculateRawMaterialPrices() {
      const input = parseFloat(document.getElementById('nrm-precio-input').value) || 0;
      const batchSize = parseFloat(document.getElementById('nrm-batch-size').value) || 1;
      const incluyeIva = document.getElementById('nrm-incluye-iva').checked;

      let neto, iva, total;

      if (incluyeIva) {
        total = Math.round(input);
        neto = Math.round(input / 1.19);
        iva = total - neto;
      } else {
        neto = Math.round(input);
        iva = Math.round(neto * 0.19);
        total = neto + iva;
      }

      const unitPrice = neto / batchSize;

      document.getElementById('nrm-neto-display').textContent = '$' + neto.toLocaleString('es-CL');
      document.getElementById('nrm-unit-price-display').textContent = '$' + Math.round(unitPrice).toLocaleString('es-CL');
      document.getElementById('nrm-total-display').textContent = '$' + total.toLocaleString('es-CL');

      document.getElementById('nrm-cost').value = neto; // cost_net
      document.getElementById('nrm-iva').value = iva;
      document.getElementById('nrm-total').value = total;
    }

    document.getElementById('nrm-precio-input')?.addEventListener('input', calculateRawMaterialPrices);
    document.getElementById('nrm-batch-size')?.addEventListener('input', calculateRawMaterialPrices);
    document.getElementById('nrm-incluye-iva')?.addEventListener('change', calculateRawMaterialPrices);

    document.getElementById('new-rm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const isEditMode = document.getElementById('nrm-edit-mode').value === 'true';
      const originalCode = document.getElementById('nrm-original-code').value;

      const body = {
        code: document.getElementById('nrm-code').value,
        name: document.getElementById('nrm-name').value,
        unit: document.getElementById('nrm-unit').value,
        batch_size: parseFloat(document.getElementById('nrm-batch-size').value) || 1,
        cost_net: parseFloat(document.getElementById('nrm-cost').value),
        iva: parseFloat(document.getElementById('nrm-iva').value),
        total: parseFloat(document.getElementById('nrm-total').value),
        color: document.getElementById('nrm-color').value,
        size: document.getElementById('nrm-size').value,
        parent_code: document.getElementById('nrm-parent').value,
        type: 'MP'
      };

      if (isEditMode) {
        await putData(`/raw-materials/${originalCode}`, body);
      } else {
        await postData('/raw-materials', body);
      }

      document.getElementById('new-rm-modal').style.display = 'none';
      document.getElementById('nrm-edit-mode').value = 'false';
      document.getElementById('nrm-original-code').value = '';
      document.getElementById('rm-modal-title').textContent = 'Nuevo Insumo / Materia Prima';
      e.target.reset();
      fetchData();
    });
  }

  if (viewName === 'clients_management') {
    document.getElementById('cli-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('cli-id').value;
      const body = {
        rut: document.getElementById('cli-rut').value,
        name: document.getElementById('cli-name').value,
        address: document.getElementById('cli-addr').value,
        email: document.getElementById('cli-email').value,
        phone: document.getElementById('cli-phone').value,
        notes: document.getElementById('cli-notes').value
      };

      if (id) {
        await putData(`/clients/${id}`, body);
      } else {
        await postData('/clients', body);
      }

      document.getElementById('cli-modal').style.display = 'none';
      fetchData();
    });
  }

  if (viewName === 'providers_management') {
    document.getElementById('prov-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('prov-id').value;
      const body = {
        rut: document.getElementById('prov-rut').value,
        name: document.getElementById('prov-name').value,
        address: document.getElementById('prov-addr').value,
        contact: document.getElementById('prov-cont').value,
        email: document.getElementById('prov-email').value,
        phone: document.getElementById('prov-phone').value,
        notes: document.getElementById('prov-notes').value
      };

      if (id) {
        await putData(`/providers/${id}`, body);
      } else {
        await postData('/providers', body);
      }

      document.getElementById('prov-modal').style.display = 'none';
      fetchData();
    });
  }

  if (viewName === 'masters') {
    document.getElementById('new-mp-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        code: document.getElementById('nmp-code').value,
        name: document.getElementById('nmp-name').value,
        unit: document.getElementById('nmp-unit').value,
        cost_net: parseFloat(document.getElementById('nmp-cost').value),
        color: document.getElementById('nmp-color').value,
        size: document.getElementById('nmp-size').value,
        parent_code: document.getElementById('nmp-parent').value,
        type: 'MP'
      };
      await postData('/raw-materials', body);
      document.getElementById('mp-modal').style.display = 'none';
    });
  }

  if (viewName === 'design') {
    document.querySelectorAll('.recipe-item').forEach(item => {
      item.addEventListener('click', () => showRecipe(item.dataset.pid));
    });
  }

  if (viewName === 'production') {
    document.getElementById('btn-submit-production').addEventListener('click', async () => {
      const isEditMode = document.getElementById('prod-edit-mode').value === 'true';
      const editId = document.getElementById('prod-edit-id').value;

      const items = [];
      const rows = document.querySelectorAll('#production-items-body .item-row');
      rows.forEach(row => {
        const productCode = row.querySelector('.prod-item-code').value;
        const quantity = parseFloat(row.querySelector('.prod-item-qty').value);
        const mo_cost = parseFloat(row.querySelector('.prod-item-mo').value) || 0;
        if (productCode && quantity > 0) {
          items.push({ productCode, quantity, mo_cost });
        }
      });

      if (items.length === 0) return alert('Debe agregar al menos un ítem');

      const body = {
        date: document.getElementById('prod-date').value,
        items
      };

      if (isEditMode) {
        await putData(`/production/${editId}`, body);
      } else {
        await postData('/production', body);
      }

      document.getElementById('production-modal').style.display = 'none';
      document.getElementById('prod-edit-mode').value = 'false';
      document.getElementById('prod-edit-id').value = '';
      document.getElementById('prod-modal-title').textContent = 'Nueva Orden de Producción';
      document.getElementById('btn-prod-text').textContent = 'Iniciar Producción';
      fetchData();
    });
  }

  if (viewName === 'profile') {
    document.getElementById('change-pass-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldPassword = document.getElementById('cp-old').value;
      const newPassword = document.getElementById('cp-new').value;
      const confirm = document.getElementById('cp-confirm').value;

      if (newPassword !== confirm) {
        return alert('Las contraseñas nuevas no coinciden');
      }

      const res = await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword })
      });

      if (res && res.success) {
        alert(res.message);
        e.target.reset();
      } else if (res) {
        alert('Error: ' + res.error);
      }
    });

    document.getElementById('btn-logout-profile')?.addEventListener('click', () => {
      logout();
    });
  }

  if (viewName === 'user_management') {
    document.getElementById('user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('user-edit-id').value;
      const body = {
        username: document.getElementById('user-name').value,
        password: document.getElementById('user-pass').value,
        role: document.getElementById('user-role').value
      };

      let result;
      if (id) {
        result = await apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        if (!body.password) return alert('La contraseña es requerida para nuevos usuarios');
        result = await apiFetch('/users', { method: 'POST', body: JSON.stringify(body) });
      }

      if (result && result.success) {
        alert(result.message);
        document.getElementById('user-modal').style.display = 'none';
        fetchData();
      } else if (result) {
        alert('Error: ' + result.error);
      }
    });
  }

  if (viewName === 'payment_machines') {
    window.openMachineModal = function (id = null) {
      document.getElementById('mach-id').value = '';
      document.getElementById('mach-name').value = '';
      document.getElementById('mach-provider').value = '';
      document.getElementById('mach-commission').value = '3.33';
      document.getElementById('mach-account').value = '';
      document.getElementById('mach-active').checked = true;
      document.getElementById('machine-modal-title').textContent = 'Nueva Máquina de Pago';
      document.getElementById('machine-modal').style.display = 'flex';
    };

    window.editMachine = async function (id) {
      const m = state.paymentMachines.find(x => x.id == id);
      if (!m) return;
      document.getElementById('mach-id').value = m.id;
      document.getElementById('mach-name').value = m.name || '';
      document.getElementById('mach-provider').value = m.provider || '';
      document.getElementById('mach-commission').value = m.commission_percent || 0;
      document.getElementById('mach-account').value = m.account_id || '';
      document.getElementById('mach-active').checked = m.active !== false;
      document.getElementById('machine-modal-title').textContent = 'Editar Máquina';
      document.getElementById('machine-modal').style.display = 'flex';
    };

    window.deleteMachine = async function (id) {
      if (!confirm('¿Eliminar esta máquina de pago?')) return;
      await apiFetch(`/payment-machines/${id}`, { method: 'DELETE' });
      fetchData();
    };

    document.getElementById('machine-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('mach-id').value;
      const body = {
        name: document.getElementById('mach-name').value,
        provider: document.getElementById('mach-provider').value,
        commission_percent: parseFloat(document.getElementById('mach-commission').value) || 0,
        account_id: document.getElementById('mach-account').value || null,
        active: document.getElementById('mach-active').checked
      };

      if (id) {
        await apiFetch(`/payment-machines/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/payment-machines', { method: 'POST', body: JSON.stringify(body) });
      }
      document.getElementById('machine-modal').style.display = 'none';
      fetchData();
    });
  }

  if (viewName === 'direct_sales') {
    // Load pending transfers only once (avoid infinite loop)
    if (!state.pendingTransfersLoaded) {
      state.pendingTransfersLoaded = true;
      (async () => {
        const pending = await apiFetch('/sales/pending-transfer');
        state.pendingTransfers = pending || [];
        // Re-render with loaded data
        document.getElementById('pending-sales-body').innerHTML = state.pendingTransfers.map(s => `
          <tr>
            <td><input type="checkbox" class="sale-checkbox" data-id="${s.id}" data-total="${s.total}" data-iva="${s.iva || 0}" data-exempt="${s.is_iva_exempt}" data-machine="${s.payment_machines?.commission_percent || 0}"></td>
            <td>${s.date}</td>
            <td>${s.event_name || '-'}</td>
            <td>${s.payment_method === 'cash' ? '💵 Efectivo' : s.payment_method === 'machine' ? '💳 Máquina' : '🔄 Transf.'}</td>
            <td>${s.payment_machines?.name || '-'}</td>
            <td><strong>$${(s.total || 0).toLocaleString('es-CL')}</strong></td>
            <td>$${(s.iva || 0).toLocaleString('es-CL')}</td>
            <td>${s.is_iva_exempt ? '✅' : '❌'}</td>
          </tr>
        `).join('');
        // Re-attach event listeners
        document.querySelectorAll('.sale-checkbox').forEach(cb => {
          cb.addEventListener('change', window.calculateTransferSummary);
        });
      })();
    }

    window.toggleAllSales = function (el) {
      document.querySelectorAll('.sale-checkbox').forEach(cb => cb.checked = el.checked);
      window.calculateTransferSummary();
    };

    window.calculateTransferSummary = function () {
      let gross = 0, iva = 0, commission = 0;
      document.querySelectorAll('.sale-checkbox:checked').forEach(cb => {
        const total = parseFloat(cb.dataset.total) || 0;
        const saleIva = cb.dataset.exempt === 'true' ? 0 : (parseFloat(cb.dataset.iva) || 0);
        const comm = cb.dataset.exempt === 'true' ? 0 : Math.round(total * parseFloat(cb.dataset.machine || 0) / 100);
        gross += total;
        iva += saleIva;
        commission += comm;
      });
      const net = gross - iva - commission;
      document.getElementById('sum-gross').textContent = '$' + gross.toLocaleString('es-CL');
      document.getElementById('sum-iva').textContent = '-$' + iva.toLocaleString('es-CL');
      document.getElementById('sum-commission').textContent = '-$' + commission.toLocaleString('es-CL');
      document.getElementById('sum-net').textContent = '$' + net.toLocaleString('es-CL');
      document.getElementById('transfer-summary').style.display = gross > 0 ? 'block' : 'none';
      return { gross, iva, commission, net };
    };

    document.querySelectorAll('.sale-checkbox').forEach(cb => {
      cb.addEventListener('change', window.calculateTransferSummary);
    });

    window.openTransferModal = function () {
      const selected = document.querySelectorAll('.sale-checkbox:checked');
      if (selected.length === 0) return alert('Seleccione al menos una venta');
      const { net } = window.calculateTransferSummary();
      document.getElementById('modal-sales-count').textContent = selected.length;
      document.getElementById('modal-net-amount').textContent = '$' + net.toLocaleString('es-CL');
      document.getElementById('transfer-modal').style.display = 'flex';
    };

    window.executeBulkTransfer = async function () {
      const selected = Array.from(document.querySelectorAll('.sale-checkbox:checked')).map(cb => cb.dataset.id);
      const destAccount = document.getElementById('transfer-destination').value;
      if (!destAccount) return alert('Seleccione una cuenta destino');

      const result = await apiFetch('/sales/bulk-transfer', {
        method: 'POST',
        body: JSON.stringify({ sale_ids: selected, destination_account_id: destAccount })
      });

      if (result && result.success) {
        alert(`Transferencia exitosa: $${result.summary.totalNet.toLocaleString('es-CL')} a la cuenta destino`);
        document.getElementById('transfer-modal').style.display = 'none';
        fetchData();
      } else {
        alert('Error: ' + (result?.error || 'Error desconocido'));
      }
    };
  }

  if (viewName === 'accounting_ledger') {
    window.updateLedgerFilters = function () {
      state.ledgerFilter.type = document.getElementById('ledger-filter-type').value;
      state.ledgerFilter.order = document.getElementById('ledger-filter-order').value;
      renderView('accounting_ledger');
    };

    window.openLedgerExpenseModal = function () {
      document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('ledger-expense-modal').style.display = 'flex';
    };

    window.openLedgerTransferModal = function () {
      document.getElementById('tra-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('ledger-transfer-modal').style.display = 'flex';
    };

    document.getElementById('expense-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        date: document.getElementById('exp-date').value,
        description: document.getElementById('exp-desc').value,
        amount: parseFloat(document.getElementById('exp-amount').value),
        category_code: document.getElementById('exp-category').value,
        account_origin_code: document.getElementById('exp-origin').value
      };

      const res = await apiFetch('/accounting/expenses', { method: 'POST', body: JSON.stringify(body) });
      if (res && res.success) {
        alert('Gasto registrado exitosamente');
        document.getElementById('ledger-expense-modal').style.display = 'none';
        fetchData();
      }
    });

    document.getElementById('transfer-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        date: document.getElementById('tra-date').value,
        amount: parseFloat(document.getElementById('tra-amount').value),
        from_account_code: document.getElementById('tra-from').value,
        to_account_code: document.getElementById('tra-to').value
      };

      const res = await apiFetch('/accounting/transfers', { method: 'POST', body: JSON.stringify(body) });
      if (res && res.success) {
        alert('Transferencia registrada exitosamente');
        document.getElementById('ledger-transfer-modal').style.display = 'none';
        fetchData();
      }
    });
  }

  if (viewName === 'masters') {
    // Load current settings
    fetch(`${API_BASE}/settings`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(settings => {
        if (settings.telegram_bot_token) document.getElementById('tg-token').value = settings.telegram_bot_token;
        if (settings.telegram_chat_id) document.getElementById('tg-chatid').value = settings.telegram_chat_id;
      });

    // Load current thresholds
    fetch(`${API_BASE}/alerts-config`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(configs => {
        configs.forEach(c => {
          const input = document.querySelector(`.alt-val[data-code="${c.mp_code}"]`);
          if (input) input.value = c.threshold;
        });
      });
  }
}

// --- Clients & Providers Management ---
window.openClientModal = () => {
  const modal = document.getElementById('cli-modal');
  modal.style.display = 'flex';
  document.getElementById('cli-modal-title').textContent = 'Nuevo Cliente';
  document.getElementById('cli-id').value = '';
  document.getElementById('cli-form').reset();
};

window.editClient = (id) => {
  const c = state.clients.find(x => String(x.id) === String(id));
  if (!c) return;
  window.openClientModal();
  document.getElementById('cli-modal-title').textContent = 'Editar Cliente';
  document.getElementById('cli-id').value = c.id;
  document.getElementById('cli-rut').value = c.rut || '';
  document.getElementById('cli-name').value = c.name;
  document.getElementById('cli-addr').value = c.address || '';
  document.getElementById('cli-email').value = c.email || '';
  document.getElementById('cli-phone').value = c.phone || '';
  document.getElementById('cli-notes').value = c.notes || '';
};

window.deleteClient = async (id) => {
  if (!confirm('¿Seguro que desea eliminar este cliente?')) return;
  await deleteData(`/clients/${id}`);
  fetchData();
};

window.openProviderModal = () => {
  const modal = document.getElementById('prov-modal');
  modal.style.display = 'flex';
  document.getElementById('prov-modal-title').textContent = 'Nuevo Proveedor';
  document.getElementById('prov-id').value = '';
  document.getElementById('prov-form').reset();
};

window.editProvider = (id) => {
  const p = state.providers.find(x => String(x.id) === String(id));
  if (!p) return;
  window.openProviderModal();
  document.getElementById('prov-modal-title').textContent = 'Editar Proveedor';
  document.getElementById('prov-id').value = p.id;
  document.getElementById('prov-rut').value = p.rut || '';
  document.getElementById('prov-name').value = p.name;
  document.getElementById('prov-addr').value = p.address || '';
  document.getElementById('prov-cont').value = p.contact || '';
  document.getElementById('prov-email').value = p.email || '';
  document.getElementById('prov-phone').value = p.phone || '';
  document.getElementById('prov-notes').value = p.notes || '';
};

window.deleteProvider = async (id) => {
  if (!confirm('¿Seguro que desea eliminar este proveedor?')) return;
  await deleteData(`/providers/${id}`);
  fetchData();
};

window.saveAlertSettings = async () => {
  const tkn = document.getElementById('tg-token').value;
  const cid = document.getElementById('tg-chatid').value;

  try {
    await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'telegram_bot_token', value: tkn })
    });
    await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'telegram_chat_id', value: cid })
    });
    alert('Configuración de Telegram guardada.');
  } catch (e) { alert('Error al guardar configuración'); }
};

window.testTelegram = async () => {
  const res = await fetch(`${API_BASE}/test-notification`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  }).then(r => r.json());
  if (res.success) alert(res.message);
  else alert('Error: ' + res.error);
};

window.saveThreshold = async (code, btn) => {
  const input = document.querySelector(`.alt-val[data-code="${code}"]`);
  const threshold = parseFloat(input.value);

  const res = await fetch(`${API_BASE}/alerts-config`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mp_code: code, threshold })
  }).then(r => r.json());

  if (res.success) {
    btn.textContent = '✅';
    setTimeout(() => btn.textContent = 'Set', 2000);
  } else alert('Error al guardar límite');
};

async function initReports() {
  try {
    const data = await apiFetch('/reports/monthly');
    if (!data) return;

    // Monthly Profit Chart (Revenue vs Cost)
    new Chart(document.getElementById('monthlyProfitChart'), {
      type: 'bar',
      data: {
        labels: data.map(d => d.month),
        datasets: [
          {
            label: 'Ingresos',
            data: data.map(d => d.revenue),
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderColor: '#3b82f6',
            borderWidth: 1
          },
          {
            label: 'Costos',
            data: data.map(d => d.cost),
            backgroundColor: 'rgba(239, 68, 68, 0.6)',
            borderColor: '#ef4444',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });

    // Net Profit Evolution Chart
    new Chart(document.getElementById('netProfitChart'), {
      type: 'line',
      data: {
        labels: data.map(d => d.month),
        datasets: [{
          label: 'Ganancia Neta',
          data: data.map(d => d.profit),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });

    // Populate Table
    const tbody = document.getElementById('monthly-report-body');
    tbody.innerHTML = data.slice().reverse().map(d => {
      const margin = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
      return `
        <tr>
          <td><strong>${d.month}</strong></td>
          <td>${d.salesCount}</td>
          <td>$${Math.round(d.revenue).toLocaleString()}</td>
          <td>$${Math.round(d.cost).toLocaleString()}</td>
          <td style="color: ${d.profit >= 0 ? '#10b981' : '#ef4444'}; font-weight: 600">$${Math.round(d.profit).toLocaleString()}</td>
          <td>${margin.toFixed(1)}%</td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading reports:', error);
    const tbody = document.getElementById('monthly-report-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger)">Error al cargar datos</td></tr>`;
  }
}

function initSalesChart() {
  const ctx = document.getElementById('salesChart');
  if (!ctx) return;

  const data = state.stats.weeklySales;
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [{
        label: 'Ventas ($)',
        data: data.map(d => d.total),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function setupItemTable(prefix) {
  const body = document.getElementById(`${prefix}-items-body`);
  if (!body) return;
  const rows = body.querySelectorAll('.item-row');

  rows.forEach(row => {
    const codeSelect = row.querySelector('.item-code');
    const priceInput = row.querySelector('.item-price');
    const qtyInput = row.querySelector('.item-qty');
    const subtotalInput = row.querySelector('.item-subtotal');

    if (!codeSelect || !priceInput || !qtyInput || !subtotalInput) return;

    const parseNum = (val) => parseFloat(String(val).replace(',', '.')) || 0;

    const calculateRow = () => {
      const price = parseNum(priceInput.value);
      const qty = parseNum(qtyInput.value);
      const subtotal = price * qty;
      subtotalInput.value = Math.round(subtotal);
      calculateTotals(prefix);
    };

    codeSelect.addEventListener('change', () => {
      const option = codeSelect.selectedOptions[0];
      if (option && option.dataset.price) {
        priceInput.value = option.dataset.price;
      } else {
        priceInput.value = 0;
      }
      calculateRow();
    });

    priceInput.addEventListener('input', calculateRow);
    qtyInput.addEventListener('input', calculateRow);
  });
}

function calculateTotals(prefix) {
  const body = document.getElementById(`${prefix}-items-body`);
  const subtotals = Array.from(body.querySelectorAll('.item-subtotal')).map(i => parseInt(i.value) || 0);
  const net = subtotals.reduce((a, b) => a + b, 0);

  let iva = 0;
  let total = net;
  let discount = 0;
  let commission = 0;
  let adjustedNet = net;

  if (prefix === 'sale') {
    discount = parseInt(document.getElementById('sale-discount-input')?.value) || 0;
    const isExempt = document.getElementById('sale-iva-exempt')?.checked;
    const paymentMethod = document.getElementById('sale-payment-method').value;
    const machineSelect = document.getElementById('sale-machine');
    const commissionRow = document.getElementById('sale-commission-row');
    const ivaLedgerNote = document.getElementById('sale-iva-ledger-note');

    // 1. Calculate Neto (Base) after Discount
    adjustedNet = net - discount;
    if (adjustedNet < 0) adjustedNet = 0;

    // 2. Calculate IVA on Adjusted Net
    if (!isExempt) {
      iva = Math.round(adjustedNet * 0.19);
    }

    // 3. Calculate Final TOTAL
    total = adjustedNet + iva;

    // 4. Calculate Machine Commission (Default 3.33% if not specified)
    if (paymentMethod === 'machine') {
      let commPercent = 3.33;
      if (machineSelect && machineSelect.value) {
        const selectedOption = machineSelect.options[machineSelect.selectedIndex];
        if (selectedOption.dataset.commission) {
          commPercent = parseFloat(selectedOption.dataset.commission);
        }
      }
      commission = Math.round(total * commPercent / 100);
      if (commissionRow) commissionRow.style.display = 'table-row';
    } else {
      if (commissionRow) commissionRow.style.display = 'none';
      commission = 0;
    }

    // 5. Handle Cash Note (not in ledger)
    if (ivaLedgerNote) {
      ivaLedgerNote.style.display = (paymentMethod === 'cash') ? 'inline' : 'none';
    }

    // Update displays for Adjusted Net
    const adjNetDisplay = document.getElementById('sale-adjusted-net-display');
    if (adjNetDisplay) adjNetDisplay.textContent = adjustedNet.toLocaleString();

    // Update hidden inputs
    document.getElementById('sale-discount').value = discount;
    document.getElementById('sale-commission').value = commission;
    const commDisplay = document.getElementById('sale-commission-display');
    if (commDisplay) commDisplay.textContent = commission.toLocaleString();

    // Update Ingreso Real
    const realIncome = total - commission;
    const realIncomeDisplay = document.getElementById('sale-real-income-display');
    if (realIncomeDisplay) realIncomeDisplay.textContent = realIncome.toLocaleString();
  } else {
    // For purchases
    iva = Math.round(net * 0.19);
    total = net + iva;
  }

  // Common updates (using original 'net' which is subtotal of rows)
  const netEl = document.getElementById(`${prefix}-net`);
  const ivaEl = document.getElementById(`${prefix}-iva`);
  const totalEl = document.getElementById(`${prefix}-total`);

  if (netEl) netEl.value = net;
  if (ivaEl) ivaEl.value = iva;
  if (totalEl) totalEl.value = total;

  const netDisplay = document.getElementById(`${prefix}-net-display`);
  const ivaDisplay = document.getElementById(`${prefix}-iva-display`);
  const totalDisplay = document.getElementById(`${prefix}-total-display`);

  if (netDisplay) netDisplay.textContent = net.toLocaleString();
  if (ivaDisplay) ivaDisplay.textContent = iva.toLocaleString();
  if (totalDisplay) totalDisplay.textContent = total.toLocaleString();
}

function getTableItems(prefix) {
  const body = document.getElementById(`${prefix}-items-body`);
  const rows = body.querySelectorAll('.item-row');
  const items = [];

  const parseNum = (val) => parseFloat(String(val).replace(',', '.')) || 0;

  rows.forEach(row => {
    const code = row.querySelector('.item-code').value;
    const price = parseNum(row.querySelector('.item-price').value);
    const qty = parseNum(row.querySelector('.item-qty').value);
    const subtotal = parseNum(row.querySelector('.item-subtotal').value);

    if (code && qty > 0) {
      if (prefix === 'sale') {
        items.push({ productCode: code, quantity: qty, unitPrice: price, subtotal });
      } else {
        items.push({ mpCode: code, quantity: qty, unitPrice: price, subtotal });
      }
    }
  });

  return items;
}

async function putData(endpoint, body, silent = false) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();

    if (!silent) {
      if (result.success) {
        alert(result.message || 'Actualizado correctamente');
        fetchData();
      } else {
        alert('Error: ' + result.error);
      }
    }
    return result;
  } catch (error) {
    console.error(`Error en PUT ${endpoint}:`, error);
    if (!silent) alert('Error al actualizar datos');
    return { success: false, error: error.message };
  }
}

async function deleteData(endpoint) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const result = await response.json();
    if (result.success) {
      alert('Eliminado exitosamente');
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    alert('Error al eliminar datos');
  }
}

// Export Functions
window.exportProducts = function () {
  const formatted = formatProductsForExport(state.products);
  exportToExcel(formatted, 'Inventario_Productos', 'Productos');
  alert('✅ Productos exportados a Excel exitosamente');
};

window.exportRawMaterials = function () {
  const formatted = formatMaterialsForExport(state.rawMaterials);
  exportToExcel(formatted, 'Inventario_Insumos', 'Insumos');
  alert('✅ Insumos exportados a Excel exitosamente');
};

window.exportSales = function () {
  const formatted = formatSalesForExport(state.history.sales);
  exportToExcel(formatted, 'Historial_Ventas', 'Ventas');
  alert('✅ Ventas exportadas a Excel exitosamente');
};

window.exportPurchases = function () {
  const formatted = formatPurchasesForExport(state.history.purchases);
  exportToExcel(formatted, 'Historial_Compras', 'Compras');
  alert('✅ Compras exportadas a Excel exitosamente');
};

window.exportLedger = function () {
  let filtered = [...state.ledger];
  if (state.ledgerFilter.type !== 'all') {
    filtered = filtered.filter(e => e.entry_type === state.ledgerFilter.type);
  }
  filtered.sort((a, b) => {
    return state.ledgerFilter.order === 'asc'
      ? new Date(a.date) - new Date(b.date)
      : new Date(b.date) - new Date(a.date);
  });

  const formatted = formatLedgerForExport(filtered);
  exportToExcel(formatted, 'Libro_Diario', 'Libro Diario');
  alert('✅ Libro Diario exportado a Excel exitosamente');
};


window.exportProduction = function () {
  const formatted = formatProductionForExport(state.history.production);
  exportToExcel(formatted, 'Historial_Produccion', 'Producción');
  alert('✅ Producción exportada a Excel exitosamente');
};

navItems.forEach(item => item.addEventListener('click', () => renderView(item.dataset.view)));

function logout() {
  token = null;
  localStorage.removeItem('erp_token');
  localStorage.removeItem('erp_user');
  renderView('login');
}

document.getElementById('btn-logout')?.addEventListener('click', logout);

fetchData();
