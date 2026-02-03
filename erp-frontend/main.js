import './style.css'
import Chart from 'chart.js/auto'
import {
  exportToExcel,
  formatProductsForExport,
  formatMaterialsForExport,
  formatSalesForExport,
  formatPurchasesForExport,
  formatProductionForExport
} from './export-utils.js'

const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' && window.location.origin.includes('localhost') ? 'http://localhost:3001/api' : '/api');
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

  return response.json();
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
  users: []
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
    const [products, rawMaterials, providers, clients, stats, hPurchases, hSales, hProduction, users] = await Promise.all([
      apiFetch('/products'),
      apiFetch('/raw-materials'),
      apiFetch('/providers'),
      apiFetch('/clients'),
      apiFetch('/stats'),
      apiFetch('/history/purchases'),
      apiFetch('/history/sales'),
      apiFetch('/history/production'),
      currentUser?.role === 'superadmin' ? apiFetch('/users') : Promise.resolve([])
    ]);

    if (!products) return; // session expired

    state.products = products;
    state.rawMaterials = rawMaterials;
    state.providers = providers;
    state.clients = clients;
    state.stats = stats;
    state.history = {
      purchases: hPurchases,
      sales: hSales,
      production: hProduction
    };
    state.users = users || [];


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
              <th>Neto</th>
              <th>IVA</th>
              <th>Precio Venta</th>
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
                <td>$${(p.price_net || 0).toLocaleString()}</td>
                <td style="color: var(--accent)">$${(p.iva || 0).toLocaleString()}</td>
                <td style="font-weight: 600">$${(p.price_sale || 0).toLocaleString()}</td>
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
              <th>Unidad</th>
              <th>Costo Unit.</th>
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
                <td><span class="badge ${m.stock < 2 ? 'badge-danger' : 'badge-success'}">${m.stock.toFixed(2)}</span></td>
                <td>${m.unit}</td>
                <td>$${(m.cost_net || 0).toLocaleString()}</td>
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
          <div class="form-group"><label>Unidad</label><input type="text" id="nrm-unit" required placeholder="Mts, Kg, Uni"></div>
          <div class="form-group"><label>Costo Neto Unitario ($)</label><input type="number" id="nrm-cost" required></div>
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
      <h1>Compras (Entrada MP)</h1>
      <div style="display: flex; gap: 0.5rem">
        <button onclick="window.exportPurchases()" style="background: var(--accent)">📊 Exportar a Excel</button>
        <button onclick="document.getElementById('buy-modal').style.display='flex'">+ Registrar Compra</button>
      </div>
    </header>

    <div class="card animate-fade">
      <h2>Historial de Compras</h2>
      <div id="purchases-history-content">
        ${renderHistoryTable('purchases')}
      </div>
    </div>

    <!-- Purchase Modal -->
    <div id="buy-modal" class="modal" style="display:none">
      <div class="card modal-content modal-wide">
        <header>
          <h3 id="buy-modal-title">Nueva Compra de Insumos</h3>
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted)">✕</button>
        </header>

        <input type="hidden" id="pur-edit-mode" value="false">
        <input type="hidden" id="pur-edit-id" value="">

        <div style="display: flex; gap: 2rem; margin-bottom: 1rem;">
           <div class="form-group" style="flex: 1">
            <label>Proveedor</label>
            <select id="pur-prov">
              <option value="">Consumidor Final / Sin Proveedor</option>
              ${state.providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1">
            <label>Fecha</label>
            <input type="date" id="pur-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        
        <table class="item-table">
          <thead>
            <tr>
              <th style="width: 50px">Ítem</th>
              <th>Insumo (Seleccionar)</th>
              <th style="width: 130px">Precio Unit (Neto)</th>
              <th style="width: 100px">Cantidad</th>
              <th style="width: 150px">Sub Tot</th>
            </tr>
          </thead>
          <tbody id="purchase-items-body">
            ${Array.from({ length: 10 }).map((_, i) => `
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
                <td><input type="number" class="item-qty" step="0.01" value="0" placeholder="0.00"></td>
                <td><input type="number" class="item-subtotal" readonly value="0" style="font-weight: 600; text-align: right"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="summary-section">
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
          <button id="btn-submit-purchase">Registrar Compra</button>
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
                      <option value="${p.code}" data-price="${p.price_sale || 0}">
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
            <tr><td>Neto</td><td style="text-align: right; padding-right: 1rem;">$ <span id="sale-net-display">0</span></td></tr>
            <tr><td>IVA (19%)</td><td style="text-align: right; padding-right: 1rem;">$ <span id="sale-iva-display">0</span></td></tr>
            <tr style="font-size: 1.1rem; color: var(--secondary)"><td style="background: var(--secondary); color: white">Total</td><td style="text-align: right; padding-right: 1rem;"><strong>$ <span id="sale-total-display">0</span></strong></td></tr>
          </table>
          <input type="hidden" id="sale-net" value="0">
          <input type="hidden" id="sale-iva" value="0">
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

  masters: () => `
    <header class="animate-fade"><h1>Gestión de Datos</h1></header>
    <div class="grid-2 animate-fade">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h2>Clientes</h2>
          <button onclick="document.getElementById('cli-modal').style.display='flex'">+ Nuevo</button>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>ID</th><th>Nombre</th><th>Acción</th></tr></thead>
            <tbody>
              ${state.clients.map(c => `<tr><td>${c.id}</td><td>${c.name}</td><td><button class="btn-sm">Editar</button></td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h2>Proveedores</h2>
          <button onclick="document.getElementById('prov-modal').style.display='flex'">+ Nuevo</button>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>ID</th><th>Nombre</th><th>Acción</th></tr></thead>
            <tbody>
              ${state.providers.map(p => `<tr><td>${p.id}</td><td>${p.name}</td><td><button class="btn-sm">Editar</button></td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modals (Simple overlays for now) -->
    <div id="cli-modal" class="modal" style="display:none">
      <div class="card modal-content">
        <h3>Nuevo Cliente</h3>
        <form id="new-cli-form">
          <div class="form-group"><label>Nombre</label><input type="text" id="nc-name" required></div>
          <div class="form-group"><label>Dirección</label><input type="text" id="nc-addr"></div>
          <div class="form-actions">
            <button type="button" onclick="this.closest('.modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
      </div>
    </div>

    <div id="prov-modal" class="modal" style="display:none">
      <div class="card modal-content">
        <h3>Nuevo Proveedor</h3>
        <form id="new-prov-form">
          <div class="form-group"><label>Nombre</label><input type="text" id="np-name" required></div>
          <div class="form-group"><label>Contacto</label><input type="text" id="np-cont"></div>
          <div class="form-group"><label>Teléfono</label><input type="text" id="np-tel"></div>
          <div class="form-actions">
            <button type="button" onclick="this.closest('.modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
      </div>
    </div>
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
  `
};

function renderHistoryTable(type) {
  const data = state.history[type];
  if (type === 'sales') {
    return `
  <div class="table-container">
    <table>
      <thead><tr><th>ID</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Acción</th></tr></thead>
      <tbody>
        ${data.map(h => `
              <tr>
                <td>${h.id}</td>
                <td>${h.date}</td>
                <td>${h.client_name || 'Directa'}</td>
                <td>$${h.total.toLocaleString()}</td>
                <td><button class="btn-sm" onclick="window.showTransactionDetails('sale', ${h.id})">Detalle</button></td>
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
      <thead><tr><th>ID</th><th>Fecha</th><th>Proveedor</th><th>Total</th><th>Acción</th></tr></thead>
      <tbody>
        ${data.map(h => `
              <tr>
                <td>${h.id}</td>
                <td>${h.date}</td>
                <td>${h.provider_name || '-'}</td>
                <td>$${h.total.toLocaleString()}</td>
                <td><button class="btn-sm" onclick="window.showTransactionDetails('purchase', ${h.id})">Detalle</button></td>
              </tr>
            `).join('')}
      </tbody>
    </table>
      </div >
  `;
  }
}

window.showTransactionDetails = (type, id) => {
  const transaction = state.history[type === 'sale' ? 'sales' : (type === 'production' ? 'production' : 'purchases')].find(t => t.id === id);
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
      <span style="color: var(--text-muted)">Fecha: ${transaction.date.split('T')[0]}</span>
    </div>
      
      ${!isProduction ? `<p style="margin-bottom: 1rem"><strong>${type === 'sale' ? 'Cliente' : 'Proveedor'}:</strong> ${transaction.client_name || transaction.provider_name || 'N/A'}</p>` : ''}

<table class="item-table">
  <thead>
    <tr>
      <th style="width: 50px">Ítem</th>
      <th>${type === 'purchase' ? 'Insumo' : 'Producto'}</th>
      ${!isProduction ? `<th style="width: 120px">Precio Unit</th>` : ''}
      <th style="width: 100px">Cantidad</th>
      ${!isProduction ? `<th style="width: 150px">Sub Tot</th>` : ''}
    </tr>
  </thead>
  <tbody>
    ${transaction.items.map(item => `
            <tr>
              <td style="text-align: center">${item.item_number}</td>
              <td>${item.product_name || item.mp_name}${item.color ? ' (' + item.color + ')' : ''}${item.size ? ' [' + item.size + ']' : ''}</td>
              ${!isProduction ? `<td style="text-align: right">$${(item.unit_price || 0).toLocaleString()}</td>` : ''}
              <td style="text-align: center">${item.quantity}</td>
              ${!isProduction ? `<td style="text-align: right">$${(item.subtotal || 0).toLocaleString()}</td>` : ''}
            </tr>
          `).join('')}
  </tbody>
</table>

      ${!isProduction ? `
      <div class="summary-section">
        <table class="summary-table">
          <tr><td>Neto</td><td style="text-align: right">$${(transaction.net || 0).toLocaleString()}</td></tr>
          <tr><td>IVA (19%)</td><td style="text-align: right">$${(transaction.iva || 0).toLocaleString()}</td></tr>
          <tr><td>Total</td><td style="text-align: right"><strong>$${(transaction.total || 0).toLocaleString()}</strong></td></tr>
        </table>
      </div>
      ` : ''
    }

<div class="form-actions">
  ${!isProduction ? `<button class="btn-warning" onclick="window.editTransaction('${type}', ${transaction.id})">✏️ Editar</button>` : ''}
  <button onclick="document.getElementById('${modalId}').style.display='none'">Cerrar</button>
</div>
    </div >
  `;
  modal.style.display = 'flex';
};

window.editTransaction = (type, id) => {
  const transaction = state.history[type === 'sale' ? 'sales' : 'purchases'].find(t => t.id === id);
  if (!transaction) return;

  const prefix = type === 'sale' ? 'sale' : 'pur';
  const modalId = type === 'sale' ? 'sale-modal' : 'buy-modal';

  // Set edit mode
  document.getElementById(`${prefix} -edit - mode`).value = 'true';
  document.getElementById(`${prefix} -edit - id`).value = transaction.id;
  document.getElementById(`${prefix} -modal - title`).textContent = `Editar ${type === 'sale' ? 'Venta' : 'Compra'} #${transaction.id} `;
  document.getElementById(`btn - submit - ${type === 'sale' ? 'sale' : 'purchase'} `).textContent = 'Guardar Cambios';

  // Fill main fields
  if (type === 'sale') {
    document.getElementById('sale-client').value = transaction.client_id || '';
    document.getElementById('sale-date').value = transaction.date;
  } else {
    document.getElementById('pur-prov').value = transaction.provider_id || '';
    document.getElementById('pur-date').value = transaction.date;
  }

  // Clear rows first
  const bodyId = type === 'sale' ? 'sale-items-body' : 'purchase-items-body';
  const rows = document.querySelectorAll(`#${bodyId} .item - row`);
  rows.forEach(row => {
    row.querySelector('.item-code').value = '';
    row.querySelector('.item-price').value = 0;
    row.querySelector('.item-qty').value = 0;
    row.querySelector('.item-subtotal').value = 0;
  });

  // Fill items
  transaction.items.forEach((item, i) => {
    if (i < 10) {
      const row = rows[i];
      const select = row.querySelector('.item-code');
      select.value = type === 'sale' ? item.product_code : item.mp_code;
      row.querySelector('.item-price').value = item.unit_price;
      row.querySelector('.item-qty').value = item.quantity;
      row.querySelector('.item-subtotal').value = item.subtotal;
    }
  });

  // Update summary
  document.getElementById(`${prefix} -net`).value = transaction.net;
  document.getElementById(`${prefix} -iva`).value = transaction.iva;
  document.getElementById(`${prefix} -total`).value = transaction.total;
  document.getElementById(`${prefix} -net - display`).textContent = (transaction.net || 0).toLocaleString();
  document.getElementById(`${prefix} -iva - display`).textContent = (transaction.iva || 0).toLocaleString();
  document.getElementById(`${prefix} -total - display`).textContent = (transaction.total || 0).toLocaleString();

  // Close details modal and open edit modal
  document.getElementById('details-modal').style.display = 'none';
  document.getElementById(modalId).style.display = 'flex';
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
    document.getElementById('np-pnet').value = p.price_net;
    document.getElementById('np-psale').value = p.price_sale;
    document.getElementById('np-cost').value = p.cost_unit;
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
    document.getElementById('nrm-unit').value = m.unit;
    document.getElementById('nrm-cost').value = m.cost_net;
    document.getElementById('nrm-color').value = m.color || '';
    document.getElementById('nrm-size').value = m.size || '';
    document.getElementById('nrm-parent').value = m.parent_code || '';

    document.getElementById('new-rm-modal').style.display = 'flex';
  }
};

window.recalculateAllCosts = async () => {
  if (!confirm('¿Deseas recalcular los costos de todos los productos basados en sus recetas?')) return;

  try {
    const response = await fetch(`${API_BASE} /products/recalculate - all - costs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (result.success) {
      alert(result.message);
      fetchData();
    } else {
      alert('Error: ' + result.error);
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
  const row = document.querySelector(`.recipe - row[data - index="${index}"]`);
  if (!row) return;

  const item = window.recipeState.items[index];
  row.innerHTML = `
  < td >
  <select class="edit-mp-code" onchange="window.updateRecipeRowMP(${index}, this.value)">
    <option value="">Seleccione...</option>
    ${state.rawMaterials.map(m => `<option value="${m.code}" ${m.code === item.mp_code ? 'selected' : ''}>${m.name}${m.color ? ' (' + m.color + ')' : ''}</option>`).join('')}
  </select>
    </td >
    <td><input type="number" step="any" class="edit-qty" value="${item.quantity}" oninput="window.updateRecipeRowData(${index})"></td>
    <td class="row-unit">${item.unit || '-'}</td>
    <td class="row-net-cost">$${(item.cost_net || 0).toLocaleString()}</td>
    <td><input type="number" step="1" class="edit-batch" value="${item.batch_size || 1}" oninput="window.updateRecipeRowData(${index})"></td>
    <td class="row-unit-cost" style="font-weight: 600">$${(item.unit_cost || 0).toLocaleString()}</td>
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
  item.cost_net = mp.cost_net;
  window.updateRecipeRowData(index);
};

window.updateRecipeRowData = (index) => {
  const row = document.querySelector(`.recipe - row[data - index="${index}"]`);
  const item = window.recipeState.items[index];

  const qty = parseFloat(row.querySelector('.edit-qty').value) || 0;
  const batch = parseInt(row.querySelector('.edit-batch').value) || 1;
  const unitCost = (qty / batch) * (item.cost_net || 0);

  item.quantity = qty;
  item.batch_size = batch;
  item.unit_cost = unitCost;

  row.querySelector('.row-unit').textContent = item.unit || '-';
  row.querySelector('.row-net-cost').textContent = `$${(item.cost_net || 0).toLocaleString()} `;
  row.querySelector('.row-unit-cost').textContent = `$${unitCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} `;

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
    cost_net: 0
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

  container.innerHTML = window.recipeState.items.map((r, i) => `
  < tr class="recipe-row" data - index="${i}" >
      <td>${r.mp_name}</td>
      <td style="text-align: center">${r.quantity}</td>
      <td>${r.unit || ''}</td>
      <td>$${(r.cost_net || 0).toLocaleString()}</td>
      <td style="text-align: center">${r.batch_size || 1}</td>
      <td style="font-weight: 600">$${(r.unit_cost || 0).toLocaleString()}</td>
      <td style="text-align: center">
        <button class="btn-sm" onclick="window.editRecipeRow(${i})" title="Modificar">✏️</button>
        <button class="btn-sm" onclick="window.deleteRecipeRow(${i})" style="background: var(--danger)" title="Eliminar">🗑️</button>
      </td>
    </tr >
  `).join('');
  window.calculateRecipeTotal();
};

async function showRecipe(pid) {
  const recipe = await getRecipe(pid);
  const product = state.products.find(p => p.code === pid);
  const container = document.getElementById('recipe-details');

  window.recipeState.currentPid = pid;
  window.recipeState.items = JSON.parse(JSON.stringify(recipe)); // Deep copy

  const totalCost = window.recipeState.items.reduce((sum, r) => sum + (r.unit_cost || 0), 0);

  container.innerHTML = `
  < div class="animate-fade" >
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
        <h2>Receta: ${product.name} ${product.color ? '(' + product.color + ')' : ''}</h2>
        <button class="btn-sm" onclick="window.addRecipeRow()" style="background: var(--secondary)">➕ Agregar Insumo</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr auto; gap: 1rem; margin-bottom: 1rem">
        <div></div>
        <div style="background: var(--surface-light); padding: 1rem; border-radius: 0.5rem">
          <div style="font-size: 0.875rem; color: var(--text-muted)">Costo Calculado:</div>
          <div id="display-total-cost" style="font-size: 1.5rem; font-weight: 700; color: var(--accent)">$${Math.round(totalCost).toLocaleString()}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem">Costo en BD: $${(product.cost_unit || 0).toLocaleString()}</div>
        </div>
      </div>

      <div class="table-container" style="margin-bottom: 1.5rem">
        <table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th style="width: 100px; text-align: center">Cant MP</th>
              <th>Unidad</th>
              <th>Costo Neto</th>
              <th style="width: 80px; text-align: center">Lote</th>
              <th>Costo Unit.</th>
              <th style="width: 100px; text-align: center">Acciones</th>
            </tr>
          </thead>
          <tbody id="recipe-items-body">
            <!-- Rows injected by refreshRecipeView -->
          </tbody>
        </table>
      </div>
      
      <div style="display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1.5rem">
        <div class="form-group" style="margin-bottom: 0">
          <label>Cantidad a Producir</label>
          <input type="number" id="prod-qty" value="1" min="1" style="width: 100px">
        </div>
        <button id="btn-save-recipe" style="background: var(--surface-light); color: var(--text)">💾 Guardar Cambios Receta</button>
        <button id="btn-produce" style="flex: 1">🚀 Iniciar Producción</button>
      </div>
    </div >
  `;

  window.refreshRecipeView();

  // Save recipe
  document.getElementById('btn-save-recipe').addEventListener('click', async () => {
    const items = window.recipeState.items.filter(item => item.mp_code && item.quantity > 0).map(item => ({
      mpCode: item.mp_code,
      quantity: item.quantity,
      batchSize: item.batch_size
    }));

    await putData(`/ recipes / ${pid} `, { items });
    state.products = await fetch(`${API_BASE}/products`).then(r => r.json());
    state.recipes[pid] = null; // Clear cache
    showRecipe(pid);
  });
}

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
      alert(result.message);
      fetchData(); // Sincronizar stock
    } else alert('Error: ' + result.error);
  } catch (e) { alert('Error de conexión'); }
}

function renderView(viewName) {
  const appContainer = document.getElementById('app');

  // Limpiar cualquier residuo de vistas anteriores
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
      superadmin: ['dashboard', 'inventory_products', 'inventory_rm', 'design', 'production', 'sales', 'purchases', 'history', 'reports', 'masters', 'user_management', 'profile'],
      admin: ['dashboard', 'inventory_products', 'inventory_rm', 'design', 'production', 'sales', 'purchases', 'history', 'reports', 'masters', 'profile'],
      user: ['dashboard', 'inventory_products', 'inventory_rm', 'production', 'sales', 'purchases', 'history', 'profile'],
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

  if (viewName === 'dashboard') {
    initSalesChart();
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
    setupItemTable('purchase');
    document.getElementById('btn-submit-purchase').addEventListener('click', async () => {
      const isEditMode = document.getElementById('pur-edit-mode').value === 'true';
      const editId = document.getElementById('pur-edit-id').value;

      const body = {
        providerId: document.getElementById('pur-prov').value,
        date: document.getElementById('pur-date').value,
        items: getTableItems('purchase'),
        net: parseInt(document.getElementById('pur-net').value),
        iva: parseInt(document.getElementById('pur-iva').value),
        total: parseInt(document.getElementById('pur-total').value)
      };

      if (body.items.length === 0) return alert('Debe agregar al menos un ítem');

      if (isEditMode) {
        await putData(`/purchases/${editId}`, body);
      } else {
        await postData('/purchases', body);
      }

      // Limpiar y cerrar
      document.getElementById('buy-modal').style.display = 'none';
      document.getElementById('pur-edit-mode').value = 'false';
      document.getElementById('pur-edit-id').value = '';
      document.getElementById('buy-modal-title').textContent = 'Nueva Compra de Insumos';
      document.getElementById('btn-submit-purchase').textContent = 'Registrar Compra';
      fetchData();
    });
  }

  if (viewName === 'sales') {
    setupItemTable('sale');
    document.getElementById('btn-submit-sale').addEventListener('click', async () => {
      const isEditMode = document.getElementById('sale-edit-mode').value === 'true';
      const editId = document.getElementById('sale-edit-id').value;

      const body = {
        clientId: document.getElementById('sale-client').value,
        date: document.getElementById('sale-date').value,
        items: getTableItems('sale'),
        net: parseInt(document.getElementById('sale-net').value),
        iva: parseInt(document.getElementById('sale-iva').value),
        total: parseInt(document.getElementById('sale-total').value)
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
    document.getElementById('new-rm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const isEditMode = document.getElementById('nrm-edit-mode').value === 'true';
      const originalCode = document.getElementById('nrm-original-code').value;

      const body = {
        code: document.getElementById('nrm-code').value,
        name: document.getElementById('nrm-name').value,
        unit: document.getElementById('nrm-unit').value,
        cost_net: parseFloat(document.getElementById('nrm-cost').value),
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

      // Reset form and close modal
      document.getElementById('new-rm-modal').style.display = 'none';
      document.getElementById('nrm-edit-mode').value = 'false';
      document.getElementById('nrm-original-code').value = '';
      document.getElementById('rm-modal-title').textContent = 'Nuevo Insumo / Materia Prima';
      e.target.reset();
    });
  }

  if (viewName === 'masters') {
    document.getElementById('new-cli-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById('nc-name').value,
        address: document.getElementById('nc-addr').value
      };
      await postData('/clients', body);
      document.getElementById('cli-modal').style.display = 'none';
    });

    document.getElementById('new-prov-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById('np-name').value,
        contact: document.getElementById('np-cont').value,
        phone: document.getElementById('np-tel').value
      };
      await postData('/providers', body);
      document.getElementById('prov-modal').style.display = 'none';
    });

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

    document.getElementById('btn-save-recipe')?.addEventListener('click', async () => {
      const pid = window.recipeState.currentPid;
      if (!pid) return;
      const items = window.recipeState.items.filter(item => item.mp_code && item.quantity > 0).map(item => ({
        mpCode: item.mp_code,
        quantity: item.quantity,
        batchSize: item.batch_size
      }));

      await putData(`/recipes/${pid}`, { items });
      state.products = await fetch(`${API_BASE}/products`).then(r => r.json());
      state.recipes[pid] = null; // Clear cache
      showRecipe(pid);
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
  const rows = body.querySelectorAll('.item-row');

  rows.forEach(row => {
    const codeSelect = row.querySelector('.item-code');
    const priceInput = row.querySelector('.item-price');
    const qtyInput = row.querySelector('.item-qty');
    const subtotalInput = row.querySelector('.item-subtotal');

    const calculateRow = () => {
      const price = parseFloat(priceInput.value) || 0;
      const qty = parseFloat(qtyInput.value) || 0;
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
  const iva = Math.round(net * 0.19);
  const total = net + iva;

  // Update hidden inputs for form submission
  document.getElementById(`${prefix}-net`).value = net;
  document.getElementById(`${prefix}-iva`).value = iva;
  document.getElementById(`${prefix}-total`).value = total;

  // Update display spans for the user
  document.getElementById(`${prefix}-net-display`).textContent = net.toLocaleString();
  document.getElementById(`${prefix}-iva-display`).textContent = iva.toLocaleString();
  document.getElementById(`${prefix}-total-display`).textContent = total.toLocaleString();
}

function getTableItems(prefix) {
  const body = document.getElementById(`${prefix}-items-body`);
  const rows = body.querySelectorAll('.item-row');
  const items = [];

  rows.forEach(row => {
    const code = row.querySelector('.item-code').value;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
    const subtotal = parseInt(row.querySelector('.item-subtotal').value) || 0;

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

async function putData(endpoint, body) {
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
    if (result.success) {
      alert(result.message);
      fetchData(); // Refresh data
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    alert('Error al actualizar datos');
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
