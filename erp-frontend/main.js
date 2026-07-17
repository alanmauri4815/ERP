console.log('ERP Universal v1.2.3 [PIPELINE-RENAME-FIX]');
import './style.css'
import './accounting.css'
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

// Módulos de Contabilidad ContaChile
import { renderDashboard as renderProDashboard } from './modules/dashboard/dashboard.page.js'
import { renderPlanCuentas } from './modules/plan-cuentas/plan-cuentas.page.js'
import { renderLibroDiario } from './modules/libro-diario/libro-diario.page.js'
import { renderLibroMayor } from './modules/libro-mayor/libro-mayor.page.js'
import { renderTomaInventario } from './modules/inventarios/toma-inventario.page.js'
import { renderBalanceComprobacion as renderEstadosFinancieros, renderBalanceGeneral, renderEstadoResultados } from './modules/estados-financieros/estados-financieros.page.js'
import { renderRemuneraciones } from './modules/rrhh/remuneraciones.page.js'
import { renderLibroCompras, renderLibroVentas } from './modules/libros-auxiliares/compras-ventas.page.js'
import { renderHonorarios } from './modules/libros-auxiliares/honorarios.page.js'
import { renderTributario } from './modules/tributario/tributario.page.js'
import { renderActivoFijo } from './modules/financiero/activo-fijo.page.js'
import { renderAnalisisFinanciero } from './modules/financiero/analisis.page.js'
import { renderTesoreria } from './modules/tesoreria/bancos.page.js'
import { sincronizarOperacionesERP, initPlanCuentas } from './services/contabilidad.service.js'
import { PLAN_CUENTAS_DEFAULT } from './utils/constants.js'
import { db } from './services/datastore.js'

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? `http://${window.location.hostname}:3001/api`
  : 'https://erp-universal-backend.onrender.com/api';
console.log('Conectado con API en:', API_BASE);

// Inyectar indicador de entorno
setTimeout(() => {
  const sidebar = document.getElementById('sidebar-user-info');
  if (sidebar) {
    const indicator = document.createElement('div');
    const isLocal = API_BASE.includes('localhost');
    indicator.style.fontSize = '0.7rem';
    indicator.style.marginTop = '0.5rem';
    indicator.style.padding = '0.2rem 0.5rem';
    indicator.style.borderRadius = '4px';
    indicator.style.background = isLocal ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)';
    indicator.style.color = isLocal ? '#3b82f6' : '#10b981';
    indicator.style.border = `1px solid ${isLocal ? '#3b82f6' : '#10b981'}`;
    indicator.style.display = 'inline-block';
    indicator.style.marginLeft = '1.1rem';
    indicator.innerHTML = `<i class="fas fa-link"></i> ${isLocal ? 'ENTORNO LOCAL' : 'ENTORNO WEB'}`;
    sidebar.appendChild(indicator);
  }
}, 1000);

const mainContent = document.getElementById('main-content');
const navItems = document.querySelectorAll('.nav-item');

// --- Tema ---
function initTheme() {
  const theme = localStorage.getItem('erp_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = theme === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
    toggleBtn.onclick = () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('erp_theme', next);
      toggleBtn.innerHTML = next === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
    };
  }
}
initTheme();

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
window.apiFetch = apiFetch;

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
  },
  purchaseFilters: {
    type: 'all',
    search: ''
  },
  logistics: [],
  pendingLogistics: [],
  costCenters: [],
  settings: {},
  productCatalogFilter: 'finished',
  hideProjectProducts: localStorage.getItem('erp_hide_projects') === 'true'
};

function isMerchandiseProduct(product) {
  const normalized = String(product?.type || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return normalized === 'merchandise' || normalized === 'mercaderia';
}

function getFinishedProducts() {
  return state.products.filter(product => !isMerchandiseProduct(product));
}

function getMerchandiseProducts() {
  return state.products.filter(isMerchandiseProduct);
}

window.setProductCatalogFilter = (filter) => {
  state.productCatalogFilter = filter === 'merchandise' ? 'merchandise' : 'finished';
  renderView('inventory_products');
};

window.applyPlanRestrictions = function () {
  if (!currentUser) return;
  const plan = currentUser.plan_categoria || 'completo';

  const navFinanzas = document.getElementById('nav-group-finanzas');
  const navInformes = document.getElementById('nav-group-informes');

  const navItemProduccion = document.querySelector('.nav-item[data-view="production"]');
  const navItemCotizaciones = document.querySelector('.nav-item[data-view="quotations"]');
  const navItemInformes = document.querySelector('.nav-item[data-view="reports"]');
  const navItemLogistica = document.querySelector('.nav-item[data-view="logistics"]');
  const navItemPipeline = document.querySelector('.nav-item[data-view="pipeline"]');

  if (plan === 'basico') {
    if (navFinanzas) navFinanzas.style.display = 'none';

    // Ocultar partes complejas
    if (navItemProduccion) navItemProduccion.style.display = 'none';
    if (navItemCotizaciones) navItemCotizaciones.style.display = 'none';
    if (navItemInformes) navItemInformes.style.display = 'none';
    if (navItemLogistica) navItemLogistica.style.display = 'none';
    if (navItemPipeline) navItemPipeline.style.display = 'none';

    // Deshabilitar proyectos en compras y ventas
    const purProjectGroup = document.getElementById('pur-project-group');
    if (purProjectGroup) purProjectGroup.style.display = 'none';
    const saleQuotationGroup = document.getElementById('sale-quotation-group');
    if (saleQuotationGroup) saleQuotationGroup.style.display = 'none';

    // Ocultar opciones pull
    document.querySelectorAll('.pro-only-option').forEach(el => el.style.display = 'none');
  } else {
    // Restaurar si es completo
    if (navFinanzas) navFinanzas.style.display = 'block';

    if (navItemProduccion) navItemProduccion.style.display = 'flex';
    if (navItemCotizaciones) navItemCotizaciones.style.display = 'flex';
    if (navItemInformes) navItemInformes.style.display = 'flex';
    if (navItemLogistica) navItemLogistica.style.display = 'flex';
    if (navItemPipeline) navItemPipeline.style.display = 'flex';

    // Restaurar opciones y grupos PULL
    const purProjectGroup = document.getElementById('pur-project-group');
    if (purProjectGroup) purProjectGroup.style.display = 'block';
    const saleQuotationGroup = document.getElementById('sale-quotation-group');
    if (saleQuotationGroup) saleQuotationGroup.style.display = 'block';
    document.querySelectorAll('.pro-only-option').forEach(el => el.style.display = 'block');
  }
};

window.toggleHideProjects = (val) => {
  state.hideProjectProducts = val;
  localStorage.setItem('erp_hide_projects', val);
  renderView('inventory_products');
};

window.openSaleModal = function () {
  const modal = document.getElementById('sale-modal');
  if (!modal) return;

  // Reset modes
  const modeEl = document.getElementById('sale-edit-mode');
  const idEl = document.getElementById('sale-edit-id');
  const titleEl = document.getElementById('sale-modal-title');
  if (modeEl) modeEl.value = 'false';
  if (idEl) idEl.value = '';
  if (titleEl) titleEl.textContent = 'Nueva Venta de Productos';

  // Reset first row
  const catEl = document.getElementById('sale-category');
  if (catEl) catEl.value = 'push';

  const clientEl = document.getElementById('sale-client');
  if (clientEl) clientEl.value = '';

  modal.style.display = 'flex';
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
      <p>Sincronizando Sistema de Contabilidad Pro...</p>
    </div>
  `;

  try {
    const [
      prods, rms, provs, hSales, hPurch, hProd, st, usrs,
      recipes, accs, quotes, clis, pmachines, aAccounts,
      aLedger, logHistory, pendingLog, cCenters, appSettings,
      // Nuevas tablas profesionalizadas
      proPlanCuentas, proAsientos, proMovimientos
    ] = await Promise.all([
      apiFetch(`/products?t=${Date.now()}`),
      apiFetch(`/raw-materials?t=${Date.now()}`),
      apiFetch(`/providers?t=${Date.now()}`),
      apiFetch(`/sales?t=${Date.now()}`),
      apiFetch(`/purchases?t=${Date.now()}`),
      apiFetch(`/production?t=${Date.now()}`),
      apiFetch(`/stats?t=${Date.now()}`),
      (currentUser.role === 'superadmin') ? apiFetch('/users') : Promise.resolve([]),
      apiFetch('/recipes'),
      apiFetch('/accounts'),
      apiFetch('/quotations'),
      apiFetch('/clients'),
      apiFetch('/payment-machines'),
      apiFetch('/accounting/accounts'),
      apiFetch('/accounting/ledger'),
      apiFetch('/logistics'),
      apiFetch('/logistics/pending'),
      apiFetch('/cost-centers'),
      apiFetch('/settings'),
      // Consultas directas a las tablas nuevas via Datastore (con fallback)
      db.getAll('plan_cuentas').catch(e => { console.error(e); return []; }),
      db.getAll('asientos').catch(e => { console.error(e); return []; }),
      db.getAll('asiento_movimientos').catch(e => { console.error(e); return []; })
    ]);

    // Asignaciones estándar
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
    state.logistics = Array.isArray(logHistory) ? logHistory : [];
    state.pendingLogistics = Array.isArray(pendingLog) ? pendingLog : [];
    state.costCenters = Array.isArray(cCenters) ? cCenters : [];
    state.settings = appSettings || {};
    window.erpSettings = state.settings;
    if (state.settings.ppm_percentage !== undefined) {
      localStorage.setItem('erp_ppm_percentage', String(state.settings.ppm_percentage));
    }

    // Asignaciones de Contabilidad Profesional (Sincronizadas con Supabase)
    state.accounting = {
      plan: Array.isArray(proPlanCuentas) ? proPlanCuentas : [],
      asientos: Array.isArray(proAsientos) ? proAsientos : [],
      movimientos: Array.isArray(proMovimientos) ? proMovimientos : []
    };

    // Compatibilidad con vistas antiguas si existieran
    state.accountingAccounts = state.accounting.plan;
    state.ledger = state.accounting.asientos;

    const activeView = document.querySelector('.nav-item.active')?.dataset.view || 'dashboard';

    // Aplicar restricciones del plan
    window.applyPlanRestrictions();

    renderView(activeView);
  } catch (error) {
    console.error('Error fetching data:', error);
    alert('Error al sincronizar con Supabase. Verifique su conexión.');
  }
}

async function getRecipe(pid) {
  if (state.recipes[pid]) return state.recipes[pid];
  const recipe = await apiFetch(`/recipes/${pid}`);
  state.recipes[pid] = recipe;
  return recipe;
}

const views = {
  dashboard: () => `<div id="dashboard-pro-container"></div>`,
  inventory_taking: () => `<div id="inventory-taking-container"></div>`,

  inventory_products: () => `
    <header class="animate-fade">
      <h1>${state.productCatalogFilter === 'merchandise' ? 'Inventario de Mercaderías' : 'Inventario de Productos Terminados'}</h1>
      <div style="display: flex; gap: 0.5rem; align-items: center">
        <label style="display: flex; align-items: center; gap: 0.5rem; background: var(--surface-light); padding: 0.5rem 0.8rem; border-radius: 8px; cursor: pointer; border: 1px solid var(--border); font-size: 0.9rem">
          <input type="checkbox" ${state.hideProjectProducts ? 'checked' : ''} onchange="window.toggleHideProjects(this.checked)">
          <span>Ocultar Proyectos [P-]</span>
        </label>
        <button onclick="window.exportProducts()" style="background: var(--secondary)">📊 Exportar</button>
        ${(currentUser.role === 'superadmin') ? `
          <button onclick="window.recalculateAllCosts()" style="background: var(--accent)" title="Recalcular costos unitarios basados en recetas">🚀 Costos</button>
          <button onclick="window.recalculateAllStock()" style="background: var(--warning); color: var(--bg-dark)" title="Auditoría total: Fix stock según historial de compras/ventas/prods">🔄 Recalcular Stock</button>
        ` : ''}
        <button onclick="window.openNewProductModal()">+ Nuevo</button>
      </div>
    </header>

    <div style="display:flex; gap:0.5rem; margin-bottom:1rem;" role="tablist" aria-label="Tipo de inventario">
      <button type="button" onclick="window.setProductCatalogFilter('finished')" aria-selected="${state.productCatalogFilter === 'finished'}" style="background:${state.productCatalogFilter === 'finished' ? 'var(--primary)' : 'var(--surface-light)'}; color:${state.productCatalogFilter === 'finished' ? 'white' : 'var(--text)'};">
        Productos terminados (${getFinishedProducts().length})
      </button>
      <button type="button" onclick="window.setProductCatalogFilter('merchandise')" aria-selected="${state.productCatalogFilter === 'merchandise'}" style="background:${state.productCatalogFilter === 'merchandise' ? 'var(--secondary)' : 'var(--surface-light)'}; color:${state.productCatalogFilter === 'merchandise' ? 'white' : 'var(--text)'};">
        Mercaderías (${getMerchandiseProducts().length})
      </button>
    </div>

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
            ${state.products
      .filter(p => state.productCatalogFilter === 'merchandise' ? isMerchandiseProduct(p) : !isMerchandiseProduct(p))
      .filter(p => !state.hideProjectProducts || !p.code?.startsWith('[P-'))
      .map(p => `
              <tr>
                <td><strong>${p.code}</strong></td>
                <td>${p.name}</td>
                <td>${p.color || '-'}</td>
                <td>${p.size || '-'}</td>
                <td><span class="badge ${p.stock < 1 ? 'badge-danger' : (p.stock < 5 ? 'badge-warning' : 'badge-success')}">${p.stock}</span></td>
                <td style="font-weight: 600; color: var(--accent)">$${(p.cost_unit || 0).toLocaleString('es-CL')}</td>
                <td>$${(p.price_net || 0).toLocaleString('es-CL')}</td>
                <td style="color: var(--accent)">$${(p.iva || 0).toLocaleString('es-CL')}</td>
                <td style="font-weight: 600; color: var(--secondary)">$${(p.price_sale || 0).toLocaleString('es-CL')}</td>
                <td><button class="btn-sm" onclick="window.editItem('product', '${p.code}')" title="Editar producto">📝</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    </div>
  `,

  inventory_rm: () => `
    <header class="animate-fade">
      <h1>Inventario de Insumos</h1>
      <div style="display: flex; gap: 0.5rem">
        <button onclick="window.exportRawMaterials()" style="background: var(--secondary)">📊 Exportar a Excel</button>
        ${(currentUser.role === 'superadmin') ? `
          <button onclick="window.recalculateAllStock()" style="background: var(--warning); color: var(--bg-dark)" title="Auditoría total del historial">🔄 Recalcular Stock</button>
        ` : ''}
        <button onclick="window.openNewRawMaterialModal()">+ Nuevo Insumo</button>
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
              <th>Neto (Lote)</th>
              <th>Costo Unitario</th>
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
                <td><button class="btn-sm" onclick="window.editItem('rm', '${m.code}')" title="Editar insumo">📝</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `,

  design: () => `
    <header class="animate-fade">
      <h1>Diseño (Recetas)</h1>
      <button onclick="window.openNewProductModal()">+ Nuevo Diseño</button>
    </header>
    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 1.5rem">
      <div class="card animate-fade">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h2>Productos</h2>
        </div>
        <div class="nav-links" style="max-height: 500px; overflow-y: auto;">
          ${getFinishedProducts().map(p => `
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
      <h2 id="ver-prod-v2">Historial Detallado de Producción [V2.1]</h2>
      <div id="production-history-content">
        ${renderHistoryTable('production')}
      </div>
    </div>

    <!-- Production Modal -->
    <datalist id="production-products-list"></datalist>
    <div id="production-modal" class="modal" style="display:none">
      <div class="card modal-content modal-wide">
        <header>
          <h3 id="production-modal-title">Nueva Orden de Producción</h3>
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted)">✖</button>
        </header>

        <input type="hidden" id="prod-edit-mode" value="false">
        <input type="hidden" id="prod-edit-id" value="">

        <div class="form-group" style="margin-bottom: 1rem">
          <label>Fecha</label>
          <input type="date" id="prod-date" value="${new Date().toISOString().split('T')[0]}">
        </div>

        <div style="background: rgba(var(--primary-rgb), 0.05); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; border: 1px dashed var(--primary)">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600">Método de Producción</label>
              <select id="prod-category" onchange="window.toggleProdCategory()" style="font-size: 1.1rem; padding: 0.5rem">
                <option value="push">🚀 Push (fabricar para vender)</option>
                <option value="pull">🔄 Pull (de cotización ganada)</option>
              </select>
            </div>
            <div class="form-group" id="prod-project-group" style="margin:0; display:none">
              <label style="font-weight: 600; color: var(--secondary)">📁 Cotización Asociada</label>
              <select id="prod-quotation" style="border: 1px solid var(--secondary)">
                <option value="">Sin asociar</option>
                ${state.quotations.filter(q => q.status === 'approved' || q.status === 'production').map(q => `<option value="${q.id}">${q.name || ('Cotizacion #' + q.id)} ${q.purchase_order_id ? '[OC: ' + q.purchase_order_id + ']' : ''} - Cliente: ${q.clients?.name || 'Cliente Particular'}</option>`).join('')}
              </select>
            </div>
          </div>
          
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05)">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600; color: var(--accent)">📦 Costo Materiales / Insumos ($)</label>
              <input type="number" id="prod-material-cost" value="0" style="border-color: var(--accent)44">
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600; color: var(--warning)">⚠️ Gastos Generales / Varios ($)</label>
              <input type="number" id="prod-general-expenses" value="0" style="border-color: var(--warning)44">
            </div>
          </div>

          <!-- Gestión de Mano de Obra (M.O.) -->
          <div id="prod-labor-details" style="margin-top: 1rem; padding: 1rem; background: rgba(var(--warning-rgb), 0.05); border: 1px solid rgba(var(--warning-rgb), 0.2); border-radius: 0.5rem">
            <h4 style="margin:0 0 1rem 0; font-size: 0.9rem; color: var(--warning); display: flex; align-items: center; gap: 0.5rem">
              🔨 Gestión de Pago de Mano de Obra
            </h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem">
              <div class="form-group" style="margin:0">
                <label style="font-size: 0.8rem">Modalidad</label>
                <select id="prod-mo-subcontracted" style="font-size: 0.9rem; padding: 0.3rem">
                  <option value="direct">Trabajo Directo (Interno)</option>
                  <option value="subcontracted">Subcontratado (Externo)</option>
                </select>
              </div>
              <div class="form-group" style="margin:0">
                <label style="font-size: 0.8rem">Documento de Respaldo</label>
                <select id="prod-mo-doc-type" style="font-size: 0.9rem; padding: 0.3rem">
                  <option value="none">Sin Documento (Informal)</option>
                  <option value="boleta">Boleta de Honorarios</option>
                  <option value="factura">Factura de Servicios</option>
                  <option value="sueldo">Liquidación de Sueldo</option>
                </select>
              </div>
              <div class="form-group" style="margin:0; display:flex; flex-direction:column; justify-content:center">
                <label style="font-size: 0.8rem; display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:600">
                  <input type="checkbox" id="prod-mo-paid" checked>
                  ¿M.O. Pagada?
                </label>
                <small style="opacity:0.7; font-size:0.7rem">Si se desmarca, genera deuda.</small>
              </div>
            </div>
          </div>
        </div>

        <table class="item-table">
          <thead>
            <tr>
              <th style="width: 50px">Item</th>
              <th style="width: 280px">Producto (Código o Nuevo)</th>
              <th style="width: 80px; text-align: center">Cantidad</th>
              <th style="width: 110px; text-align: center">Costo M.P. ($)</th>
              <th style="width: 110px; text-align: center">Costo M.O. ($)</th>
            </tr>
          </thead>
          <tbody id="production-items-body">
            ${Array.from({ length: 10 }).map((_, i) => `
              <tr class="item-row">
                <td style="text-align: center; color: var(--text-muted)">${i + 1}</td>
                <td>
                  <input type="text" class="prod-item-code" data-index="${i}" list="production-products-list" placeholder="Código o producto nuevo..." style="width:100%" oninput="window.updateProdRecipeView()">
                </td>
                <td><input type="number" class="prod-item-qty" step="1" value="0" placeholder="0" oninput="window.updateProdRecipeView()"></td>
                <td><input type="number" class="prod-item-mp" step="0.01" value="0" oninput="window.updateProdTotals()"></td>
                <td><input type="number" class="prod-item-mo" step="0.01" value="0" oninput="window.updateProdTotals()"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Recipe/Materials Visualizer -->
        <div id="production-material-summary" style="margin-top: 1.5rem; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; display:none">
          <h4 style="margin: 0 0 1rem 0; color: var(--secondary); font-size: 0.9rem">
            Composicion y Consumos Proyectados
          </h4>
          <div id="material-summary-content" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem; font-size: 0.8rem">
            <!-- Will be populated by updateProdRecipeView -->
          </div>
        </div>
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
        <button onclick="window.runMigration()" style="background: var(--danger); font-size: 0.7rem; padding: 2px 5px">🛠️ Migrar DB</button>
        <button onclick="window.exportPurchases()" style="background: var(--accent)">📊 Exportar a Excel</button>
        <button onclick="window.openPurchaseModal()" style="background: var(--secondary)">+ Registrar Compra / Gasto</button>
      </div>
    </header>

    <div class="card animate-fade" style="margin-bottom: 1.5rem; padding: 1.25rem; border-left: 4px solid var(--primary)">
      <div style="display: flex; gap: 1.5rem; align-items: flex-end; flex-wrap: wrap">
        <div class="form-group" style="margin-bottom: 0; min-width: 200px">
          <label style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; display: block">Tipo de Registro</label>
          <select onchange="window.updatePurchaseFilters('type', this.value)" style="padding: 0.6rem; border-radius: 8px; background: var(--surface-light); border: 1px solid var(--border); color: var(--text); width: 100%">
            <option value="merchandise" ${state.purchaseFilters.type === 'merchandise' ? 'selected' : ''}>Mercadería (Reventa)</option>
            <option value="all" ${state.purchaseFilters.type === 'all' ? 'selected' : ''}>📦 Todos los registros</option>
            <option value="mp" ${state.purchaseFilters.type === 'mp' ? 'selected' : ''}>📦 Insumos (Inventariable)</option>
            <option value="expense" ${state.purchaseFilters.type === 'expense' ? 'selected' : ''}>💸 Gasto / Caja Chica</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 250px">
          <label style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; display: block">Buscar Proyecto, Proveedor o Glosa</label>
          <div style="position: relative">
            <i class="fas fa-search" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); opacity: 0.4"></i>
            <input type="text" 
              placeholder="Escribe para filtrar resultados..." 
              value="${state.purchaseFilters.search}"
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
          Mostrando: ${state.history.purchases.length} registros
        </span>
      </div>
      <div id="purchases-history-content">
        ${renderHistoryTable('purchases')}
      </div>
    </div>

    <!-- Purchase Modal -->
    <div id="buy-modal" class="modal" style="display:none">
      <div class="card modal-content modal-wide">
        <header>
          <h3 id="buy-modal-title">Nueva Compra / Gasto</h3>
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted)">✖</button>
        </header>

        <input type="hidden" id="pur-edit-mode" value="false">
        <input type="hidden" id="pur-edit-id" value="">

        <div style="background: var(--surface-light); padding: 1.25rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 1px solid var(--border-strong)">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.25rem">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600; color: var(--text)">Tipo de Registro</label>
              <select id="pur-type" onchange="window.togglePurType()" style="font-size: 1rem">
                <option value="merchandise">Compra de Mercadería (Reventa)</option>
                <option value="mp">Compra de Insumos (Inventariable)</option>
                <option value="expense">Informe de Gasto / Caja Chica (Gasto Operacional)</option>
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600; color: var(--text)">Categoría de Compra</label>
              <select id="pur-category" onchange="window.togglePurCategory()" style="font-size: 1rem">
                <option value="general">📦 General (sin producción específica)</option>
                <option value="pull" class="pro-only-option">🔄 Pull (de cotización ganada)</option>
                <option value="push">🚀 Push (para fabricar y vender)</option>
                <option value="comercializacion">🏢 Comercialización (reventa)</option>
              </select>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem">
          <div class="form-group" id="pur-prov-group">
            <label style="font-weight: 600">Proveedor</label>
            <div style="display: flex; gap: 0.5rem">
              <select id="pur-prov" style="flex: 1">
                <option value="">Sin Proveedor / Boleta</option>
                ${state.providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
              </select>
              <button type="button" onclick="window.openProviderModal(); document.getElementById('prov-modal').style.display='flex'; document.getElementById('prov-modal').style.zIndex='10000';" style="padding: 0 0.75rem" title="Nuevo Proveedor">+</button>
            </div>
          </div>
          <div class="form-group">
            <label style="font-weight: 600">Fecha de Registro</label>
            <input type="date" id="pur-date" value="${new Date().toISOString().split('T')[0]}" required>
          </div>
          <div class="form-group">
            <label style="font-weight: 600">Nº Documento</label>
            <input type="text" id="pur-doc-number" placeholder="Ej: 12345">
          </div>
          <div class="form-group" id="pur-project-group">
            <label style="font-weight: 600; color: var(--secondary)">📁 Proyecto Asociado</label>
            <select id="pur-project" style="border: 1px solid var(--secondary)44">
              <option value="">Gasto General (Sin Proyecto)</option>
              <optgroup label="Cotizaciones Aprobadas / En Producción">
                ${state.quotations.filter(q => q.status === 'approved' || q.status === 'production').map(q => `<option value="${q.id}">📋 ${q.name || ('Cotización #' + q.id)} ${q.purchase_order_id ? '[OC: ' + q.purchase_order_id + ']' : ''}</option>`).join('')}
              </optgroup>
              <optgroup label="Ventas Realizadas">
                ${state.history.sales.slice(0, 10).map(s => `<option value="S-${s.id}">💰 Venta #${s.id} - ${s.client_name || 'Vta Directa'}</option>`).join('')}
              </optgroup>
            </select>
          </div>
        </div>

        <div class="form-group" id="pur-desc-group" style="display:none; margin-bottom: 1rem">
          <label style="font-weight: 600">Descripción / Motivo del Gasto</label>
          <input type="text" id="pur-description" placeholder="Ej: Compra de hilos, Almuerzo terreno, etc.">
        </div>

        <div style="background: var(--surface-light); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; border: 1px solid var(--border)">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; align-items: center">
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600">Método de Pago Sugerido</label>
              <select id="pur-payment-method">
                <option value="transfer">Transferencia</option>
                <option value="debit">Débito</option>
                <option value="credit">Crédito (Cuentas por Pagar)</option>
                <option value="cash">Efectivo / Caja Chica</option>
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label style="font-weight: 600">Cuenta / Fondo Origen</label>
              <select id="pur-account">
                <option value="">Seleccionar cuenta...</option>
                ${state.accounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join('') || ''}
              </select>
            </div>
            <div class="form-group" style="margin:0; display: flex; flex-direction: column; justify-content: center;">
              <label style="font-weight: 600; color: var(--success); display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="pur-auto-pay" checked>
                Pagar al contado
              </label>
              <small style="opacity: 0.7; font-size: 0.65rem; line-height: 1.1">Registra egreso y liquida deuda.</small>
            </div>
          </div>
        </div>
        
        <div id="pur-items-container">
          <table class="item-table">
            <thead>
              <tr>
                <th style="width: 50px">Item</th>
                <th id="pur-item-name-header">Insumo</th>
                <th style="width: 130px">Neto Unitario</th>
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
                        <option value="${m.code}" data-price="${(m.cost_net || 0) / (m.batch_size || 1)}">${m.code} | ${m.name}</option>
                      `).join('')}
                      <option value="__otros__" style="background:#f59e0b; color:#000; font-weight:bold">+ Otros (escribir nombre)</option>
                    </select>
                    <input type="text" class="item-custom-name" placeholder="Nombre del producto eventual..." style="display:none; margin-top:4px; width:100%; background:var(--surface-light); border:1px solid var(--accent); color:var(--text); padding:0.4rem; border-radius:4px; font-size:0.85rem">
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
          <button id="btn-submit-purchase" style="background: var(--primary); padding: 0.8rem 2rem; font-weight: 700">Registrar Compra</button>
        </div>
      </div>
    </div>
  `,

  sales: () => `
    <header class="animate-fade">
      <h1>Ventas (Salida PT)</h1>
      <div style="display: flex; gap: 0.5rem">
        <button onclick="window.exportSales()" style="background: var(--accent)">📊 Exportar a Excel</button>
        <button onclick="window.openSaleModal()" style="background: var(--secondary)">+ Registrar Venta</button>
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
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted)">✖</button>
        </header>

        <input type="hidden" id="sale-edit-mode" value="false">
        <input type="hidden" id="sale-edit-id" value="">

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem">
          <div class="form-group">
            <label>Cliente</label>
            <select id="sale-client">
              <option value="">Venta Directa</option>
              ${state.clients.map(c => `<option value="${c.id}">${c.name || 'Cliente ' + c.id}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Fecha</label>
            <input type="date" id="sale-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label>Nº Documento</label>
            <input type="text" id="sale-doc-number" placeholder="Ej: 98765">
          </div>
          <div class="form-group">
            <label>Tipo Documento</label>
            <select id="sale-doc-type">
              <option value="boleta">Boleta</option>
              <option value="factura">Factura</option>
              <option value="n/a">Sin Documento</option>
            </select>
          </div>
          <div class="form-group">
            <label>Evento/Feria</label>
            <input type="text" id="sale-event-name" placeholder="Ej: Feria Navideña">
          </div>
          <div class="form-group">
            <label>Categoría (PUSH/PULL)</label>
            <select id="sale-category" onchange="window.toggleSaleCategory()">
              <option value="push">PUSH (Venta Directa/Stock)</option>
              <option value="pull" class="pro-only-option">PULL (Cotización/Encargo)</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom: 1.5rem">
          <div class="form-group" id="sale-quotation-group">
            <label style="font-weight: 600; color: var(--secondary)">📁 Asociar a Proyecto (ABC)</label>
            <select id="sale-quotation" style="border: 1px solid var(--secondary)">
              <option value="">Sin Proyecto / Venta Directa</option>
              <optgroup label="Cotizaciones Aprobadas / En Producción">
                ${state.quotations.filter(q => q.status === 'approved' || q.status === 'production').map(q => `<option value="${q.id}">${q.name || ('Cotizacion #' + q.id)} ${q.purchase_order_id ? '[OC: ' + q.purchase_order_id + ']' : ''} - Cliente: ${q.clients?.name || 'Cliente Particular'}</option>`).join('')}
              </optgroup>
            </select>
            <small style="font-size: 0.7rem; opacity: 0.7">Vincula esta venta a un proyecto para cerrar el ciclo PULL.</small>
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
        <div style="display: flex; gap: 2rem; margin-bottom: 1rem; align-items: center; background: var(--surface-light); padding: 0.75rem 1rem; border-radius: 0.5rem; border: 1px solid var(--border)">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--success); font-weight: 600;">
            <input type="checkbox" id="sale-auto-collect" checked>
            <span>Cobrar ahora al contado</span>
          </label>
          <label style="display: flex; align-items: center; gap: 0.7rem; cursor: pointer; font-weight: 500">
            <input type="checkbox" id="sale-iva-exempt" onchange="window.recalculateSaleTotals()">
            <span>Exento de IVA</span>
          </label>
        </div>

        <table class="item-table">
          <thead>
            <tr>
              <th style="width: 50px">?tem</th>
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
                    <optgroup label="Productos terminados">
                    ${getFinishedProducts().slice().sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(p => `
                      <option value="${p.code}" data-price="${p.price_net || 0}">
                        ${p.code} | ${p.name || ''}${p.color ? ' (' + p.color + ')' : ''}${p.size ? ' [' + p.size + ']' : ''}
                      </option>`).join('')}
                    </optgroup>
                    <optgroup label="Mercaderías">
                    ${getMerchandiseProducts().slice().sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(p => `
                      <option value="${p.code}" data-price="${p.price_net || 0}">
                        ${p.code} | ${p.name || ''}${p.color ? ' (' + p.color + ')' : ''}${p.size ? ' [' + p.size + ']' : ''}
                      </option>`).join('')}
                    </optgroup>
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

    <div class="tabs" style="display: flex; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 2rem">
      <button class="tab-btn active" onclick="window.showReportTab('general', this)">General Mensual</button>
      <button class="tab-btn" onclick="window.showReportTab('profitability', this)">Rentabilidad por Proyecto</button>
    </div>

    <!-- TAB GENERAL -->
    <div id="report-tab-general" class="report-tab animate-fade">
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
    </div>

    <!-- TAB RENTABILIDAD -->
    <div id="report-tab-profitability" class="report-tab animate-fade" style="display:none">
       <div class="card animate-fade">
         <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem">
           <h2>Rentabilidad por Proyecto / Cotización</h2>
           <button class="btn-sm" onclick="window.calculateProfitabilityByProject()" title="Recalcular">🔄</button>
         </div>
         <p style="font-size: 0.9rem; opacity: 0.8; margin-bottom: 1rem">
           Ingresos (Ventas PULL) menos Costos Directos (Compras MP, Gastos) asociados al proyecto.
         </p>
         <div class="table-container">
           <table class="data-table">
             <thead>
               <tr>
                 <th>Proyecto / OC</th>
                 <th>Cliente</th>
                 <th style="text-align:right">Ingresos ($)</th>
                 <th style="text-align:right">Costos/Gastos ($)</th>
                 <th style="text-align:right">Utilidad ($)</th>
                 <th style="text-align:right">Margen (%)</th>
                 <th>Estado</th>
               </tr>
             </thead>
             <tbody id="profitability-report-body">
               <tr><td colspan="7" style="text-align:center; padding: 2rem">Cargando análisis...</td></tr>
             </tbody>
           </table>
         </div>
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
                      <button class="btn-sm" onclick="window.editClient('${c.id}')">📝</button>
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
                      <button class="btn-sm" onclick="window.editProvider('${p.id}')">📝</button>
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
                <td><span style="color: ${m.active !== false ? 'var(--success)' : 'var(--danger)'}">${m.active !== false ? 'Activa' : 'Inactiva'}</span></td>
                <td>
                  <button class="btn-sm" onclick="window.editMachine('${m.id}')">📝</button>
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
            <div class="form-group"><label>Comisión (%)</label><input type="number" id="mach-commission" step="0.01" value="3.45"></div>
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
                <td>${s.is_iva_exempt ? 'Si' : 'No'}</td>
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
        <h2>Configuración Tributaria</h2>
        <div style="margin-top: 1rem; padding: 1rem; background: rgba(245, 158, 11, 0.10); border-radius: 0.5rem; border: 1px solid var(--accent)">
            <p style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--text-muted)">
                Porcentaje de PPM usado como gasto tributario en las cotizaciones.
            </p>
            <div class="form-group">
                <label>PPM a pagar (%)</label>
                <input type="number" id="ppm-percentage" min="0" max="100" step="0.01" value="${parseFloat(state.settings?.ppm_percentage ?? 1.25)}" placeholder="Ej: 1.25">
            </div>
            <button onclick="window.saveTaxSettings()" style="background:var(--accent)">Guardar PPM</button>
        </div>

        <h2>Alertas al Celular (Telegram)</h2>
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
  `,

  login: () => `
    <div style="height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); margin: -2rem">
      <div class="card animate-fade" style="width: 100%; max-width: 400px; padding: 2rem; border-radius: 1rem">
        <h1 style="text-align: center; margin-bottom: 2rem; font-size: 1.8rem; background: linear-gradient(45deg, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">ERP Universal</h1>
        <form id="login-form">
          <div class="form-group">
            <label>Empresa</label>
            <select id="login-empresa" required style="padding: 0.8rem; width: 100%; background: var(--surface-light); border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text); font-size: 1rem">
              <option value="">Cargando empresas...</option>
            </select>
          </div>
          <div class="form-group">
            <label>Usuario</label>
            <input type="text" id="login-user" required placeholder="Tu nombre de usuario" style="padding: 0.8rem">
          </div>
          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" id="login-pass" required placeholder="********" style="padding: 0.8rem">
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
          <input type="password" id="cp-old" required placeholder="********">
        </div>
        <div class="form-group">
          <label>Nueva Contraseña</label>
          <input type="password" id="cp-new" required placeholder="********">
        </div>
        <div class="form-group">
          <label>Confirmar Nueva Contraseña</label>
          <input type="password" id="cp-confirm" required placeholder="********">
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
              <th>Empresa</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${state.users.map(u => `
              <tr>
                <td>${u.id}</td>
                <td><strong>${u.username}</strong></td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-success' : 'badge-info'}">${u.role}</span></td>
                <td>${u.empresa_nombre || 'Sin empresa'}</td>
                <td>
                  <button class="btn-sm" onclick="window.editUser(${u.id})">📝</button>
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
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted); border:none; font-size: 1.2rem; cursor:pointer">✖</button>
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
          <div class="form-group">
            <label>Empresa</label>
            <select id="user-empresa">
              <option value="">-- Seleccionar Empresa --</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="button" onclick="this.closest('.modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
      </div>
    </div>

    ${currentUser?.role === 'superadmin' ? `
    <!-- ========== GESTION DE EMPRESAS (Solo Gestor) ========== -->
    <header class="animate-fade" style="margin-top: 2rem">
      <h1>Gestion de Empresas</h1>
      <button onclick="window.openEmpresaModal()">+ Nueva Empresa</button>
    </header>

    <div class="card animate-fade">
      <div class="table-container">
        <table id="empresas-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>RUT</th>
              <th>Email</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody id="empresas-tbody">
            <tr><td colspan="6" style="text-align:center; opacity:0.5">Cargando empresas...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empresa Modal -->
    <div id="empresa-modal" class="modal" style="display:none">
      <div class="card modal-content" style="max-width: 500px">
        <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem">
          <h3 id="empresa-modal-title">Nueva Empresa</h3>
          <button class="btn-sm" onclick="this.closest('.modal').style.display='none'" style="background:transparent; color:var(--text-muted); border:none; font-size: 1.2rem; cursor:pointer">✖</button>
        </header>
        <form id="empresa-form">
          <input type="hidden" id="empresa-edit-id" value="">
          <div class="form-group">
            <label>Nombre de Empresa *</label>
            <input type="text" id="empresa-nombre" required placeholder="Ej: Acme Corp">
          </div>
          <div class="grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem">
            <div class="form-group">
              <label>RUT</label>
              <input type="text" id="empresa-rut" placeholder="12.345.678-9">
            </div>
            <div class="form-group">
              <label>Teléfono</label>
              <input type="text" id="empresa-telefono" placeholder="+56 9 1234 5678">
            </div>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="empresa-email" placeholder="contacto@empresa.cl">
          </div>
          <div class="form-group">
            <label>Plan de Suscripción (SaaS)</label>
            <select id="empresa-plan">
              <option value="completo">Plan Completo (Pro)</option>
              <option value="basico">Plan Básico (Micro/Artesano)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Dirección</label>
            <input type="text" id="empresa-direccion" placeholder="Calle 123, Ciudad">
          </div>
          <p style="font-size: 0.8rem; opacity: 0.6; margin-top: 0.5rem">
            Al crear una nueva empresa, se generara automaticamente un usuario <strong>admin</strong> con contrasena <strong>admin123</strong>.
          </p>
          <div class="form-actions">
            <button type="button" onclick="this.closest('.modal').style.display='none'">Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
      </div>
    </div>
    ` : ''}
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
          <input type="password" id="cp-old" required placeholder="********">
        </div>
        <div class="form-group">
          <label>Nueva Contraseña</label>
          <input type="password" id="cp-new" required placeholder="********">
        </div>
        <div class="form-group">
          <label>Confirmar Nueva Contraseña</label>
          <input type="password" id="cp-confirm" required placeholder="********">
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
                <option value="venta" ${state.ledgerFilter.type === 'venta' ? 'selected' : ''}>Ventas (Todas)</option>
                <option value="venta_push" ${state.ledgerFilter.type === 'venta_push' ? 'selected' : ''}>Ventas PUSH</option>
                <option value="venta_pull" ${state.ledgerFilter.type === 'venta_pull' ? 'selected' : ''}>Ventas PULL</option>
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
          if (state.ledgerFilter.type === 'venta') {
            filtered = filtered.filter(e => e.entry_type.startsWith('venta'));
          } else if (state.ledgerFilter.type === 'compra') {
            filtered = filtered.filter(e => e.entry_type.startsWith('compra'));
          } else {
            filtered = filtered.filter(e => e.entry_type === state.ledgerFilter.type);
          }
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
  },
  logistics: () => {
    const activeTab = window.currentLogisticsTab || 'pending';
    return `
    <header class="animate-fade">
      <h1>Logística y Cadena de Valor</h1>
      <div style="display: flex; gap: 0.5rem">
        <button onclick="fetchData()" style="background: var(--surface-light)">🔄 Sincronizar</button>
      </div>
    </header>

    <div class="card animate-fade" style="margin-bottom: 2rem">
      <div class="tabs" style="display: flex; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 1.5rem">
        <button class="tab-btn ${activeTab === 'pending' ? 'active' : ''}" onclick="window.setLogisticsTab('pending')">Pendientes de Proceso</button>
        <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}" onclick="window.setLogisticsTab('history')">Historial Logistico</button>
      </div>

      ${activeTab === 'pending' ? `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Fecha Doc</th>
                <th>Tipo</th>
                <th>Transacción</th>
                <th>Entidad (Cli/Prov)</th>
                <th style="text-align: center">Acción Física</th>
              </tr>
            </thead>
            <tbody>
              ${state.pendingLogistics.map(p => `
                <tr>
                  <td>${p.date ? p.date.split('T')[0] : '-'}</td>
                  <td>
                    <span class="badge ${p.type === 'inbound' ? 'badge-success' : 'badge-warning'}">
                      ${p.type === 'inbound' ? 'ENTRADA' : 'SALIDA'}
                    </span>
                  </td>
                  <td><strong>#${p.id}</strong> (${p.transaction_type.toUpperCase()})</td>
                  <td>${p.entity || '-'}</td>
                  <td style="text-align: center">
                    <button class="btn-sm" onclick="window.openLogisticsModal('${p.type}', '${p.id}', '${p.transaction_type}')" 
                      style="background:${p.type === 'inbound' ? 'var(--secondary)' : 'var(--accent)'}">
                      📦 Registrar ${p.type === 'inbound' ? 'Recepción' : 'Despacho'}
                    </button>
                  </td>
                </tr>
              `).join('')}
              ${state.pendingLogistics.length === 0 ? '<tr><td colspan="5" style="text-align:center; opacity:0.5; padding: 2rem">No hay movimientos pendientes. Todo al dia.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>ID Log.</th>
                <th>Fecha Registro</th>
                <th>Tipo</th>
                <th>Transporte</th>
                <th>Seguimiento</th>
                <th style="text-align: right">Costos Log.</th>
                <th>Estado</th>
                <th style="text-align: center">Acción</th>
              </tr>
            </thead>
            <tbody>
              ${state.logistics.map(l => {
      const totalCost = (l.transport_cost || 0) + (l.handling_cost || 0);
      return `
                <tr>
                  <td><strong>#${l.id}</strong></td>
                  <td>${l.date ? l.date.split('T')[0] : '-'}</td>
                  <td style="font-size: 0.8rem">
                    <span class="badge ${l.type === 'inbound' ? 'badge-success' : 'badge-warning'}" style="padding: 2px 6px">
                      ${l.type === 'inbound' ? 'IN' : 'OUT'}
                    </span>
                    <br><small>${l.transaction_type.toUpperCase()} #${l.transaction_id}</small>
                  </td>
                  <td>${l.carrier_name || '-'}</td>
                  <td><code>${l.tracking_id || '-'}</code></td>
                  <td style="text-align: right; color: var(--danger)">$${totalCost.toLocaleString()}</td>
                  <td>
                    <span style="font-size:0.75rem; font-weight:700; color:var(--primary)">${l.status.toUpperCase()}</span>
                  </td>
                  <td style="text-align: center">
                     <button class="btn-sm" onclick="window.viewTransactionDetails('${l.transaction_type}', ${l.transaction_id})">👁️ Doc</button>
                  </td>
                </tr>
              `}).join('')}
              ${state.logistics.length === 0 ? '<tr><td colspan="8" style="text-align:center; opacity:0.5; padding: 2rem">No hay historial registrado.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      `}
    </div>
    `
  },

};

// ========== PIPELINE VIEW ==========
window.pipelineActiveTab = window.pipelineActiveTab || 'draft';
window.setPipelineTab = (tab) => { window.pipelineActiveTab = tab; renderView('pipeline'); };

views.pipeline = () => {
  const purchases = state.history?.purchases || [];
  const sales = state.history?.sales || [];
  const production = state.history?.production || [];
  const logistics = state.logistics || [];
  const quotations = state.quotations || [];

  // ── Build lookup maps ──
  const purchasesByQid = {};
  purchases.forEach(p => { if (p.quotation_id) { if (!purchasesByQid[p.quotation_id]) purchasesByQid[p.quotation_id] = []; purchasesByQid[p.quotation_id].push(p); } });

  const productionByQid = {};
  production.forEach(p => { if (p.quotation_id) { if (!productionByQid[p.quotation_id]) productionByQid[p.quotation_id] = []; productionByQid[p.quotation_id].push(p); } });

  const salesByQid = {};
  sales.forEach(s => { if (s.quotation_id) { if (!salesByQid[s.quotation_id]) salesByQid[s.quotation_id] = []; salesByQid[s.quotation_id].push(s); } });

  // Build logistics lookup: sale_id -> logistics records (outbound + venta)
  const logisticsBySaleId = {};
  logistics.forEach(l => {
    if (l.type === 'outbound' && l.transaction_type === 'venta' && l.transaction_id) {
      if (!logisticsBySaleId[l.transaction_id]) logisticsBySaleId[l.transaction_id] = [];
      logisticsBySaleId[l.transaction_id].push(l);
    }
  });

  // ── Classify each quotation into process stages ──
  const stageGroups = { draft: [], sent: [], approved: [], compras: [], produccion: [], despacho: [], facturacion: [], pago: [], rejected: [], cancelled: [] };

  quotations.forEach(q => {
    const st = q.status || 'draft';
    const qid = q.id;

    if (st === 'rejected') { stageGroups.rejected.push(q); return; }
    if (st === 'cancelled') { stageGroups.cancelled.push(q); return; }

    // Check process milestones
    const hasPurchases = !!purchasesByQid[qid];
    const hasProduction = !!productionByQid[qid];
    const hasSales = !!salesByQid[qid];
    const qSales = salesByQid[qid] || [];
    const hasDispatch = qSales.some(s => !!logisticsBySaleId[s.id]);
    const allPaid = hasSales && qSales.length > 0 && qSales.every(s => s.payment_status === 'pagado');

    // Place in the HIGHEST reached stage
    if (allPaid) stageGroups.pago.push(q);
    else if (hasSales) stageGroups.facturacion.push(q);
    else if (hasDispatch) stageGroups.despacho.push(q);
    else if (hasProduction) stageGroups.produccion.push(q);
    else if (hasPurchases) stageGroups.compras.push(q);
    else if (st === 'approved' || st === 'production') stageGroups.approved.push(q);
    else if (st === 'sent') stageGroups.sent.push(q);
    else stageGroups.draft.push(q);
  });

  // ── Stage definitions ──
  const STAGES = [
    { key: 'draft',       label: 'Borrador',     icon: '📝', color: '#6b7280', gradient: 'linear-gradient(135deg, #6b7280, #9ca3af)' },
    { key: 'sent',        label: 'Enviada',       icon: '📤', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)' },
    { key: 'approved',    label: 'Aprobada',      icon: '✅', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
    { key: 'compras',     label: 'Compras',       icon: '🛒', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
    { key: 'produccion',  label: 'Producción',    icon: '🏭', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
    { key: 'despacho',    label: 'Despacho',      icon: '🚚', color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)' },
    { key: 'facturacion', label: 'Facturación',   icon: '🧾', color: '#ec4899', gradient: 'linear-gradient(135deg, #ec4899, #f472b6)' },
    { key: 'pago',        label: 'Pago',          icon: '💰', color: '#22c55e', gradient: 'linear-gradient(135deg, #22c55e, #4ade80)' },
  ];

  const activeTab = window.pipelineActiveTab || 'draft';

  // ── KPIs ──
  const totalQuotes = quotations.length;
  const activeQuotes = quotations.filter(q => !['rejected', 'cancelled'].includes(q.status || 'draft')).length;
  const totalValue = quotations.reduce((sum, q) => sum + (q.total_price_gross || 0), 0);
  const paidValue = stageGroups.pago.reduce((sum, q) => sum + (q.total_price_gross || 0), 0);

  // ── Helper: render progress bar ──
  const renderProgressBar = (pct, color) => {
    const clamped = Math.min(100, Math.max(0, pct));
    const barColor = clamped >= 100 ? '#22c55e' : (clamped >= 50 ? color : '#f59e0b');
    return `<div style="width:100%; background:rgba(255,255,255,0.08); border-radius:6px; height:22px; overflow:hidden; position:relative">
      <div style="width:${clamped}%; height:100%; background:linear-gradient(90deg, ${barColor}, ${barColor}cc); border-radius:6px; transition:width 0.5s ease"></div>
      <span style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:0.7rem; font-weight:700; color:white; text-shadow:0 1px 2px rgba(0,0,0,0.5)">${Math.round(clamped)}%</span>
    </div>`;
  };

  // ── Detail table renderers per stage ──
  const renderDetailTable = (stageKey) => {
    const items = stageGroups[stageKey] || [];
    if (items.length === 0) return `<div style="text-align:center; padding:3rem; opacity:0.4; font-size:0.9rem">No hay cotizaciones en esta etapa</div>`;

    const formatDate = (d) => d ? (d.split ? d.split('T')[0] : new Date(d).toISOString().split('T')[0]) : '-';

    if (['draft', 'sent', 'approved'].includes(stageKey)) {
      return `<div class="table-container"><table>
        <thead><tr>
          <th>Cotización</th><th>Cliente</th><th>Fecha</th><th style="text-align:right">Valor Bruto</th><th style="text-align:center">Acción</th>
        </tr></thead>
        <tbody>${items.map(q => `<tr>
          <td><strong>${q.name || 'Sin nombre'}</strong></td>
          <td>${q.clients?.name || 'Varios'}</td>
          <td><small>${formatDate(q.created_at)}</small></td>
          <td style="text-align:right; font-weight:700; color:var(--primary)">$${Math.round(q.total_price_gross || 0).toLocaleString()}</td>
          <td style="text-align:center"><button class="btn-sm" onclick="window.viewQuotation('${q.id}')">👁️ Ver</button></td>
        </tr>`).join('')}</tbody></table></div>`;
    }

    if (stageKey === 'compras') {
      return `<div class="table-container"><table>
        <thead><tr>
          <th>Cotización</th><th>Cliente</th><th style="text-align:right">Costo Neto</th><th style="text-align:right">Comprado</th><th style="min-width:140px">Progreso Compras</th><th>Ítems Comprados</th>
        </tr></thead>
        <tbody>${items.map(q => {
          const qPurchases = purchasesByQid[q.id] || [];
          const totalPurchased = qPurchases.reduce((s, p) => s + (p.total || 0), 0);
          const netCost = q.total_net_cost || 1;
          const pct = netCost > 0 ? (totalPurchased / netCost * 100) : 0;
          const purchasedItems = qPurchases.flatMap(p => (p.items || []).map(i => i.product_name || i.product_code || '?'));
          const uniqueItems = [...new Set(purchasedItems)];
          return `<tr>
            <td><strong>${q.name || 'Sin nombre'}</strong></td>
            <td>${q.clients?.name || 'Varios'}</td>
            <td style="text-align:right">$${Math.round(netCost).toLocaleString()}</td>
            <td style="text-align:right; font-weight:700; color:#8b5cf6">$${Math.round(totalPurchased).toLocaleString()}</td>
            <td>${renderProgressBar(pct, '#8b5cf6')}</td>
            <td><small style="color:var(--text-muted)">${uniqueItems.length > 0 ? uniqueItems.slice(0, 3).join(', ') + (uniqueItems.length > 3 ? '...' : '') : 'Sin datos'}</small></td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    }

    if (stageKey === 'produccion') {
      return `<div class="table-container"><table>
        <thead><tr>
          <th>Cotización</th><th>Cliente</th><th>Fecha Producción</th><th>Ítems Producidos</th><th style="text-align:center">Acción</th>
        </tr></thead>
        <tbody>${items.map(q => {
          const qProds = productionByQid[q.id] || [];
          const latestDate = qProds.length > 0 ? formatDate(qProds[qProds.length - 1].date) : '-';
          const prodItems = qProds.flatMap(p => (p.items || []).map(i => `${i.product_name || i.product_code || '?'} x${i.quantity || 1}`));
          return `<tr>
            <td><strong>${q.name || 'Sin nombre'}</strong></td>
            <td>${q.clients?.name || 'Varios'}</td>
            <td>${latestDate}</td>
            <td><small style="color:var(--text-muted)">${prodItems.length > 0 ? prodItems.slice(0, 3).join(', ') + (prodItems.length > 3 ? '...' : '') : 'Sin datos'}</small></td>
            <td style="text-align:center"><button class="btn-sm" onclick="window.viewQuotation('${q.id}')">👁️ Ver</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    }

    if (stageKey === 'despacho') {
      return `<div class="table-container"><table>
        <thead><tr>
          <th>Cotización</th><th>Cliente</th><th>Transportista</th><th>Seguimiento</th><th>Estado</th>
        </tr></thead>
        <tbody>${items.map(q => {
          const qSales = salesByQid[q.id] || [];
          const qLogistics = qSales.flatMap(s => logisticsBySaleId[s.id] || []);
          const latest = qLogistics.length > 0 ? qLogistics[qLogistics.length - 1] : {};
          return `<tr>
            <td><strong>${q.name || 'Sin nombre'}</strong></td>
            <td>${q.clients?.name || 'Varios'}</td>
            <td>${latest.carrier_name || '-'}</td>
            <td><code style="font-size:0.8rem">${latest.tracking_id || '-'}</code></td>
            <td><span style="font-size:0.75rem; font-weight:700; color:var(--primary); text-transform:uppercase">${latest.status || '-'}</span></td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    }

    if (stageKey === 'facturacion') {
      return `<div class="table-container"><table>
        <thead><tr>
          <th>Cotización</th><th>Cliente</th><th>Tipo Doc</th><th>Nº Doc</th><th style="text-align:right">Total Facturado</th>
        </tr></thead>
        <tbody>${items.map(q => {
          const qSalesArr = salesByQid[q.id] || [];
          const totalInvoiced = qSalesArr.reduce((s, sl) => s + (sl.total || 0), 0);
          const docTypes = [...new Set(qSalesArr.map(s => (s.document_type || 'boleta').toUpperCase()))].join(', ');
          const docNums = qSalesArr.map(s => s.document_number || '-').join(', ');
          return `<tr>
            <td><strong>${q.name || 'Sin nombre'}</strong></td>
            <td>${q.clients?.name || 'Varios'}</td>
            <td><span class="badge" style="background:var(--surface-light); font-size:0.7rem; border:1px solid var(--border)">${docTypes || '-'}</span></td>
            <td><small style="font-weight:700; color:var(--primary)">${docNums}</small></td>
            <td style="text-align:right; font-weight:700; color:#ec4899">$${Math.round(totalInvoiced).toLocaleString()}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    }

    if (stageKey === 'pago') {
      return `<div class="table-container"><table>
        <thead><tr>
          <th>Cotización</th><th>Cliente</th><th style="text-align:right">Total Venta</th><th style="text-align:right">Pagado</th><th style="min-width:140px">Progreso Pago</th>
        </tr></thead>
        <tbody>${items.map(q => {
          const qSalesArr = salesByQid[q.id] || [];
          const totalSale = qSalesArr.reduce((s, sl) => s + (sl.total || 0), 0);
          const totalPaid = qSalesArr.reduce((s, sl) => s + (sl.paid_amount || sl.total || 0), 0);
          const pct = totalSale > 0 ? (totalPaid / totalSale * 100) : 100;
          return `<tr>
            <td><strong>${q.name || 'Sin nombre'}</strong></td>
            <td>${q.clients?.name || 'Varios'}</td>
            <td style="text-align:right">$${Math.round(totalSale).toLocaleString()}</td>
            <td style="text-align:right; font-weight:700; color:#22c55e">$${Math.round(totalPaid).toLocaleString()}</td>
            <td>${renderProgressBar(pct, '#22c55e')}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    }

    return '';
  };

  // ── Find first stage with data for default tab ──
  const firstWithData = STAGES.find(s => (stageGroups[s.key] || []).length > 0);
  if (firstWithData && !STAGES.find(s => s.key === activeTab && (stageGroups[s.key] || []).length > 0)) {
    // If active tab is empty and there's another with data, keep activeTab anyway (user chose it)
  }

  const activeStageObj = STAGES.find(s => s.key === activeTab) || STAGES[0];

  return `
  <style>
    .pipeline-tab { padding:0.5rem 1rem; border-radius:20px; border:1px solid var(--border); background:var(--surface); color:var(--text-muted); cursor:pointer; font-size:0.8rem; font-weight:600; transition:all 0.25s ease; white-space:nowrap; display:inline-flex; align-items:center; gap:0.4rem; }
    .pipeline-tab:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.2); }
    .pipeline-tab.active { color:white; border-color:transparent; box-shadow:0 4px 15px rgba(0,0,0,0.3); transform:translateY(-1px); }
    .pipeline-funnel-box { text-align:center; padding:0.6rem 0.5rem; border-radius:10px; min-width:90px; flex:1; cursor:pointer; transition:all 0.25s ease; position:relative; }
    .pipeline-funnel-box:hover { transform:translateY(-3px); box-shadow:0 6px 20px rgba(0,0,0,0.25); }
    .pipeline-arrow { color:var(--text-muted); font-size:1.4rem; padding:0 0.15rem; display:flex; align-items:center; opacity:0.5; }
    .pipeline-detail-card tr:hover { background:rgba(255,255,255,0.03); }
  </style>

  <header class="animate-fade">
    <div style="display:flex; align-items:center; gap:1rem">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 7 4 4 20 4 20 7"></polyline>
        <line x1="9" y1="20" x2="15" y2="20"></line>
        <line x1="12" y1="4" x2="12" y2="20"></line>
      </svg>
      <div>
        <h1 style="margin:0">Gestión de Procesos</h1>
        <div class="date-display" style="font-size:0.8rem; opacity:0.7">Pipeline Completo — Cadena de Valor Pull</div>
      </div>
    </div>
  </header>

  <!-- KPI Cards -->
  <div class="grid-2 animate-fade" style="grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem">
    <div class="card" style="text-align:center; padding:1rem">
      <div style="font-size:0.8rem; color:var(--text-muted)">Total Cotizaciones</div>
      <div style="font-size:1.8rem; font-weight:700; color:var(--primary)">${totalQuotes}</div>
    </div>
    <div class="card" style="text-align:center; padding:1rem">
      <div style="font-size:0.8rem; color:var(--text-muted)">Activas (en proceso)</div>
      <div style="font-size:1.8rem; font-weight:700; color:#10b981">${activeQuotes}</div>
    </div>
    <div class="card" style="text-align:center; padding:1rem">
      <div style="font-size:0.8rem; color:var(--text-muted)">Valor Total Pipeline</div>
      <div style="font-size:1.5rem; font-weight:700; color:var(--primary)">$${Math.round(totalValue).toLocaleString()}</div>
    </div>
    <div class="card" style="text-align:center; padding:1rem">
      <div style="font-size:0.8rem; color:var(--text-muted)">Cobrado (Pagos Completos)</div>
      <div style="font-size:1.5rem; font-weight:700; color:#22c55e">$${Math.round(paidValue).toLocaleString()}</div>
    </div>
  </div>

  <!-- Funnel Diagram -->
  <div class="card animate-fade" style="padding:1.2rem 1.5rem; margin-bottom:1.5rem">
    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1rem">
      <strong style="color:var(--primary)">🔄 Pipeline de Procesos</strong>
      <span style="font-size:0.8rem; color:var(--text-muted)">— Click en una etapa para ver el detalle</span>
    </div>
    <div style="display:flex; align-items:stretch; gap:0; overflow-x:auto; padding:0.5rem 0">
      ${STAGES.map((stage, idx) => {
    const count = (stageGroups[stage.key] || []).length;
    const value = (stageGroups[stage.key] || []).reduce((s, q) => s + (q.total_price_gross || 0), 0);
    const isActive = stage.key === activeTab;
    return `
          ${idx > 0 ? '<div class="pipeline-arrow">›</div>' : ''}
          <div class="pipeline-funnel-box" onclick="window.setPipelineTab('${stage.key}')"
            style="background:${isActive ? stage.gradient : stage.color + '12'}; border:2px solid ${isActive ? stage.color : stage.color + '33'}; ${isActive ? 'box-shadow:0 4px 20px ' + stage.color + '44;' : ''}">
            <div style="font-size:1rem; margin-bottom:0.15rem">${stage.icon}</div>
            <div style="font-size:0.7rem; font-weight:700; color:${isActive ? 'white' : stage.color}; text-transform:uppercase; letter-spacing:0.03em">${stage.label}</div>
            <div style="font-size:1.4rem; font-weight:800; color:${isActive ? 'white' : stage.color}; line-height:1.2">${count}</div>
            <div style="font-size:0.65rem; color:${isActive ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)'}">$${Math.round(value).toLocaleString()}</div>
          </div>
        `;
  }).join('')}
    </div>
  </div>

  <!-- Detail Carousel: Tab Buttons -->
  <div class="card animate-fade pipeline-detail-card" style="padding:1.2rem 1.5rem">
    <div style="display:flex; gap:0.5rem; overflow-x:auto; padding-bottom:1rem; margin-bottom:1rem; border-bottom:1px solid var(--border)">
      ${STAGES.map(stage => {
    const count = (stageGroups[stage.key] || []).length;
    const isActive = stage.key === activeTab;
    return `<button class="pipeline-tab ${isActive ? 'active' : ''}" onclick="window.setPipelineTab('${stage.key}')"
      style="${isActive ? 'background:' + stage.gradient + ';' : ''}">${stage.icon} ${stage.label} <span style="background:${isActive ? 'rgba(255,255,255,0.25)' : 'var(--surface-light)'}; padding:0.1rem 0.45rem; border-radius:10px; font-size:0.7rem; font-weight:800">${count}</span></button>`;
  }).join('')}
    </div>

    <!-- Active Tab Header -->
    <div style="display:flex; align-items:center; gap:0.8rem; margin-bottom:1rem">
      <div style="width:36px; height:36px; border-radius:10px; background:${activeStageObj.gradient}; display:flex; align-items:center; justify-content:center; font-size:1.2rem">${activeStageObj.icon}</div>
      <div>
        <div style="font-weight:700; font-size:1rem">${activeStageObj.label}</div>
        <div style="font-size:0.78rem; color:var(--text-muted)">${(stageGroups[activeTab] || []).length} cotizaciones en esta etapa</div>
      </div>
    </div>

    <!-- Active Tab Content -->
    ${renderDetailTable(activeTab)}
  </div>

  <!-- Terminal States (collapsed) -->
  ${(stageGroups.rejected.length + stageGroups.cancelled.length) > 0 ? `
    <div class="card animate-fade" style="margin-top:1.5rem; opacity:0.7">
      <h3 style="margin:0 0 0.8rem">🚫 Cotizaciones Cerradas</h3>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem">
        ${[{ key: 'rejected', label: 'Rechazada', color: '#ef4444' }, { key: 'cancelled', label: 'Anulada', color: '#991b1b' }].map(stage => {
    const items = stageGroups[stage.key];
    if (items.length === 0) return '';
    return `
            <div>
              <div style="font-size:0.85rem; font-weight:700; color:${stage.color}; margin-bottom:0.5rem">${stage.label} (${items.length})</div>
              ${items.map(q => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--border); font-size:0.82rem">
                  <span style="cursor:pointer; text-decoration:underline" onclick="window.viewQuotation('${q.id}')">${q.name || 'Sin nombre'}</span>
                  <span style="color:var(--text-muted)">$${Math.round(q.total_price_gross || 0).toLocaleString()}</span>
                </div>
              `).join('')}
            </div>
          `;
  }).join('')}
      </div>
    </div>
  ` : ''}
`;
};

views.acc_plan_cuentas = () => `<header class="animate-fade"><h1>Plan de Cuentas</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_libro_diario = () => `<header class="animate-fade"><h1>Libro Diario</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_libro_mayor = () => `<header class="animate-fade"><h1>Libro Mayor</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_balance_8 = () => `<header class="animate-fade"><h1>Balance 8 Columnas</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_tesoreria = () => `<header class="animate-fade"><h1>Tesorería y Bancos</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_remuneraciones = () => `<header class="animate-fade"><h1>Remuneraciones</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_compras_libro = () => `<header class="animate-fade"><h1>Libro de Compras</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_ventas_libro = () => `<header class="animate-fade"><h1>Libro de Ventas</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_balance_general = () => `<header class="animate-fade"><h1>Balance General</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_estado_resultados = () => `<header class="animate-fade"><h1>Estado de Resultados</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_honorarios = () => `<header class="animate-fade"><h1>Libro de Honorarios</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_tributario = () => `<header class="animate-fade"><h1>Gestión Tributaria (F29)</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_activo_fijo = () => `<header class="animate-fade"><h1>Activo Fijo</h1></header><div id="accounting-container" class="animate-fade"></div>`;
views.acc_analisis = () => `<header class="animate-fade"><h1>Análisis Financiero</h1></header><div id="accounting-container" class="animate-fade"></div>`;
function renderHistoryTable(type) {
  const data = state.history[type];
  if (type === 'sales') {
    return `
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th style="width: 60px">ID</th>
          <th style="width: 100px">Fecha</th>
          <th style="width: 100px">Documento</th>
          <th>Cliente / Evento</th>
          <th style="width: 120px">Pago</th>
          <th style="width: 130px; text-align: right">Total Bruto</th>
          <th style="width: 100px; text-align: center">Acción</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(h => `
              <tr>
                <td><strong>#${h.id}</strong></td>
                <td><small>${h.date ? h.date.split('T')[0] : '-'}</small></td>
                <td>
                  <span class="badge" style="background:var(--surface-light); font-size:0.7rem; border:1px solid var(--border)">
                    ${(h.document_type || 'boleta').toUpperCase()}
                  </span><br>
                  <small style="font-weight:700; color:var(--primary)">${h.document_number || '-'}</small>
                </td>
                <td>
                  <strong>${h.client_name || 'Venta Directa'}</strong>
                  ${h.event_name ? `<br><small style="color:var(--text-muted)">🎪 ${h.event_name}</small>` : ''}
                </td>
                <td>
                  <span style="font-size:0.8rem">
                    ${h.payment_method === 'cash' ? '💵 Efectivo' : h.payment_method === 'machine' ? '💳 Máquina' : '🔄 Transferencia'}
                  </span>
                </td>
                <td style="text-align: right; font-weight:700">
                  $${(h.total || 0).toLocaleString()} ${h.is_iva_exempt ? '<br><small style="color:var(--warning)">(Exento)</small>' : ''}
                </td>
                <td style="text-align: center">
                  <div style="display: flex; gap: 0.3rem; justify-content: center">
                    <button class="btn-sm" onclick="window.showTransactionDetails('sale', '${h.id}')" title="Ver detalle">👁️ Ver</button>
                    ${currentUser?.role === 'superadmin' || currentUser?.role === 'admin' ? `
                      <button class="btn-sm" onclick="window.editTransaction('sale', '${h.id}')" style="background:var(--secondary)" title="Editar">📝 Editar</button>
                    ` : ''}
                    ${currentUser?.role === 'superadmin' ? `
                      <button class="btn-sm" onclick="window.deleteSale('${h.id}')" style="background:var(--danger)" title="Eliminar">🗑️ Borrar</button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
      </tbody>
    </table>
      </div>
  `;
  }
  if (type === 'production') {
    const PROD_CAT_LABELS = { push: '🚀 Push', pull: '🔄 Pull' };
    const PROD_CAT_COLORS = { push: '#f59e0b', pull: '#3b82f6' };

    return `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Fecha</th>
            <th>Método / Proyecto / Cliente</th>
            <th style="text-align: center">Cant.</th>
            <th style="text-align: right">Costo M.O.</th>
            <th style="text-align: right">Insumos</th>
            <th style="text-align: right">Gastos Gral.</th>
            <th style="text-align: right; background: rgba(var(--success-rgb), 0.05)">Costo Total</th>
            <th style="text-align: center">Rentabilidad</th>
            <th style="text-align: center">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(p => {
      const pcat = p.production_category || 'push';
      const itList = p.items || [];
      const totalMO = itList.reduce((sum, it) => {
        let cost = parseFloat(it.mo_cost) || 0;
        if (cost === 0) {
          const pm = state.products.find(prod => prod.code === it.product_code || prod.name === it.product_code);
          if (pm) cost = pm.labor_cost || 0;
          else {
            const rm = state.rawMaterials.find(m => m.code === it.product_code || m.name === it.product_code);
            if (rm && (rm.type === 'MO' || rm.type === 'Mano de Obra' || rm.type === 'Servicio')) cost = rm.cost_net || 0;
          }
        }
        return sum + (cost * (parseFloat(it.quantity) || 0));
      }, 0);
      const totalMP = itList.reduce((sum, it) => {
        const pm = state.products.find(prod => prod.code === it.product_code);
        const rm = state.rawMaterials.find(m => m.code === it.product_code);
        let cost = it.material_cost || 0;
        if (cost === 0) {
          if (pm) cost = pm.cost_unit || 0;
          else if (rm && rm.type !== 'MO' && rm.type !== 'Mano de Obra' && rm.type !== 'Servicio') cost = rm.cost_net || 0;
        }
        return sum + (cost * (it.quantity || 0));
      }, 0) + (p.material_cost || 0);
      const totalCost = totalMO + totalMP + (p.general_expenses || 0);
      const income = p.quotation_total || 0;
      const profit = income > 0 ? income - totalCost : 0;
      const profitPercent = income > 0 ? (profit / income * 100).toFixed(1) : null;

      return `
              <tr>
                <td><strong>#${p.id}</strong></td>
                <td>${p.date ? p.date.split('T')[0] : '-'}</td>
                <td>
                  <span style="display:inline-block; padding:0.15rem 0.5rem; border-radius:10px; font-size:0.75rem; font-weight:700; background:${PROD_CAT_COLORS[pcat] || '#6b7280'}22; color:${PROD_CAT_COLORS[pcat] || '#6b7280'}; border:1px solid ${PROD_CAT_COLORS[pcat] || '#6b7280'}44">
                    ${PROD_CAT_LABELS[pcat] || pcat}
                  </span>
                  ${p.project_name ? `
                    <div style="margin-top:0.4rem; font-size:0.85rem; color:var(--text); font-weight:600; display:flex; align-items:center; gap:4px">
                      <span style="opacity:0.6">📁</span> ${p.project_name}
                    </div>
                  ` : ''}
                  ${p.client_name ? `
                    <div style="font-size:0.8rem; color:var(--secondary); font-weight:700; display:flex; align-items:center; gap:4px">
                      <span style="opacity:0.6">👤</span> ${p.client_name}
                    </div>
                  ` : ''}
                </td>
                <td style="text-align: center">${(p.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0)}</td>
                <td style="text-align: right">$${totalMO.toLocaleString()}</td>
                <td style="text-align: right">$${totalMP.toLocaleString()}</td>
                <td style="text-align: right">$${(p.general_expenses || 0).toLocaleString()}</td>
                <td style="text-align: right; background: rgba(var(--success-rgb), 0.05); font-weight:700; color:var(--success)">$${totalCost.toLocaleString()}</td>
                <td style="text-align: center">
                  ${income > 0 ? `
                    <div style="font-size:0.8rem">
                      <strong style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">$${profit.toLocaleString()}</strong><br>
                      <small style="opacity:0.7">${profitPercent}%</small>
                    </div>
                  ` : '<small style="opacity:0.5">N/A (Push)</small>'}
                </td>
                <td style="text-align: center">
                   <div style="display: flex; gap: 0.3rem; justify-content: center">
                     <button class="btn-sm" onclick="window.showTransactionDetails('production', '${p.id}')">👁️ Ver</button>
                     <button class="btn-sm" onclick="window.editProduction(${p.id})" style="background:var(--secondary)">📝 Editar</button>
                     <button class="btn-sm" onclick="window.deleteProduction(${p.id})" style="background:var(--danger)">🗑️ Borrar</button>
                   </div>
                </td>
              </tr>
            `;
    }).join('')}
        </tbody>
      </table>
    </div>
  `;
  }
  if (type === 'purchases') {
    let data = state.history.purchases;

    // Aplicar filtros
    if (state.purchaseFilters.type !== 'all') {
      data = data.filter(p => p.type === state.purchaseFilters.type);
    }
    if (state.purchaseFilters.search) {
      const s = state.purchaseFilters.search.toLowerCase();
      data = data.filter(p =>
        (p.project_name && p.project_name.toLowerCase().includes(s)) ||
        (p.provider_name && p.provider_name.toLowerCase().includes(s)) ||
        (p.description && p.description.toLowerCase().includes(s)) ||
        (p.purchase_order_id && p.purchase_order_id.toLowerCase().includes(s))
      );
    }

    const CAT_LABELS = { general: '📦 General', pull: '🔄 Pull', push: '🚀 Push', comercializacion: '🏢 Comerc.' };
    const CAT_COLORS = { general: '#6b7280', pull: '#3b82f6', push: '#f59e0b', comercializacion: '#8b5cf6' };
    return `
  <div class="table-container">
    <table>
      <thead><tr><th>ID</th><th>Fecha</th><th>Tipo/Proyecto</th><th>Categoría</th><th>Ref / OC</th><th>Doc</th><th>Proveedor/Glosa</th><th>Total</th><th>Acción</th></tr></thead>
      <tbody>
        ${data.map(h => {
      const cat = h.purchase_category || 'general';
      return `
              <tr style="${h.type === 'expense' ? 'background: rgba(var(--accent-rgb), 0.05)' : ''}">
                <td>${h.id}</td>
                <td>${h.date ? h.date.split('T')[0] : '-'}</td>
                <td>
                  <span class="badge ${h.type === 'expense' ? 'badge-warning' : 'badge-info'}" style="font-size: 0.7rem">
                    ${h.type === 'expense' ? 'GASTO' : h.type === 'merchandise' ? 'MERCADERÍA' : 'INSUMO'}
                  </span><br>
                  <small>${h.project_name ? '🏷️ ' + h.project_name : 'General'}</small>
                </td>
                <td>
                  <span style="display:inline-block; padding:0.15rem 0.5rem; border-radius:10px; font-size:0.72rem; font-weight:700; background:${CAT_COLORS[cat]}22; color:${CAT_COLORS[cat]}; border:1px solid ${CAT_COLORS[cat]}44">
                    ${CAT_LABELS[cat] || cat}
                  </span>
                </td>
                <td><small style="font-weight:700; color:var(--secondary)">${h.purchase_order_id || '-'}</small></td>
                <td><small style="font-weight:700; color:var(--text-muted)">${h.document_number || '-'}</small></td>
                <td>
                  <strong>${h.type === 'expense' ? (h.description || 'Gasto General') : (h.provider_name || 'Sin Proveedor')}</strong>
                </td>
                <td style="font-weight: 600">$${(h.total || 0).toLocaleString()}</td>
                <td style="text-align: center">
                  <div style="display: flex; gap: 0.3rem; justify-content: center">
                    <button class="btn-sm" onclick="window.showTransactionDetails('purchase', '${h.id}')" title="Ver detalle">👁️ Ver</button>
                    ${currentUser?.role === 'superadmin' || currentUser?.role === 'admin' ? `
                      <button class="btn-sm" onclick="window.editTransaction('purchase', '${h.id}')" style="background:var(--secondary)" title="Editar">📝 Editar</button>
                    ` : ''}
                    ${currentUser?.role === 'superadmin' ? `
                      <button class="btn-sm" onclick="window.deletePurchase('${h.id}')" style="background:var(--danger)" title="Eliminar">🗑️ Borrar</button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `;
    }).join('')}
      </tbody>
    </table>
      </div>
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
        ${transaction.event_name ? `<span class="badge" style="background:var(--secondary-light); color:var(--secondary)">🎪 ${transaction.event_name}</span>` : ''}
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
            <strong style="color:var(--secondary)">${transaction.account_name}</strong>
          </div>
          ` : ''}
          <div>
            <label style="font-size: 0.75rem; color: var(--text-muted); display: block">Documento</label>
            <strong style="color:var(--accent)">${(transaction.document_type || 'N/A').toUpperCase()} #${transaction.document_number || '-'}</strong>
          </div>
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
      <th style="width: 50px">Item</th>
      <th>Código</th>
      <th>Nombre</th>
      <th style="width: 80px; text-align: center">Cant</th>
      <th style="width: 100px; text-align: right">${isProduction ? 'C. M.P. ($)' : 'Precio'}</th>
      <th style="width: 100px; text-align: right">${isProduction ? 'C. M.O. ($)' : 'Subtotal'}</th>
      ${isProduction ? '<th style="width: 110px; text-align: right">Total Item</th>' : ''}
    </tr>
  </thead>
  <tbody>
    ${transaction.items.map(item => {
    let displayUnitPrice = item.unit_price || 0;
    let displaySubtotal = item.subtotal || 0;

    if (type === 'sale' && !transaction.is_iva_exempt) {
      const isStoredAsGross = Math.abs((transaction.net * 1.19) - transaction.total) < 10;
      if (isStoredAsGross || displaySubtotal > transaction.net) {
        displayUnitPrice = Math.round(displayUnitPrice / 1.19);
        displaySubtotal = Math.round(displaySubtotal / 1.19);
      }
    }

    const pMaster = isProduction ? state.products.find(p => p.code === item.product_code) : null;
    const rMaster = isProduction && !pMaster ? state.rawMaterials.find(m => m.code === item.product_code) : null;

    let itemMP = item.material_cost || 0;
    let itemMO = item.mo_cost || 0;

    if (itemMP === 0 && itemMO === 0) {
      if (pMaster) {
        itemMP = pMaster.cost_unit || 0;
        itemMO = pMaster.labor_cost || 0;
      } else if (rMaster) {
        const isLabor = (rMaster.type === 'MO' || rMaster.type === 'Mano de Obra' || rMaster.type === 'Servicio');
        if (isLabor) itemMO = rMaster.cost_net || 0;
        else itemMP = rMaster.cost_net || 0;
      }
    }

    const itemQty = (item.quantity || 0);
    const itemTotal = (itemMP + itemMO) * itemQty;

    return `
            <tr>
              <td style="text-align: center">${item.item_number}</td>
              <td><code>${(item.product_code || item.mp_code)}</code></td>
              <td>
                ${(item.product_name || item.mp_name || '?')}${item.color ? ' (' + item.color + ')' : ''}${item.size ? ' [' + item.size + ']' : ''}
              </td>
              <td style="text-align: center">${itemQty}</td>
              <td style="text-align: right">$${isProduction ? (itemMP * itemQty).toLocaleString() : (displayUnitPrice).toLocaleString()}</td>
              <td style="text-align: right">$${isProduction ? (itemMO * itemQty).toLocaleString() : (displaySubtotal).toLocaleString()}</td>
              ${isProduction ? `<td style="text-align: right; font-weight:700">$${(itemTotal).toLocaleString()}</td>` : ''}
            </tr >
    `;
  }).join('')}
  </tbody>
</table>

      ${isProduction ? `
      <div class="summary-section">
        <table class="summary-table">
          <tr><td>Costo Mano de Obra (M.O.)</td><td style="text-align: right">$${(transaction.items.reduce((sum, it) => {
    let cost = parseFloat(it.mo_cost) || 0;
    if (cost === 0) {
      const pm = state.products.find(p => p.code === it.product_code || p.name === it.product_code);
      if (pm) cost = pm.labor_cost || 0;
      else {
        const rm = state.rawMaterials.find(m => m.code === it.product_code || m.name === it.product_code);
        if (rm && (rm.type === 'MO' || rm.type === 'Mano de Obra' || rm.type === 'Servicio')) cost = rm.cost_net || 0;
      }
    }
    return sum + (cost * (parseFloat(it.quantity) || 0));
  }, 0)).toLocaleString()}</td></tr>
          <tr><td>Costo Materiales / Insumos</td><td style="text-align: right">$${(transaction.items.reduce((sum, it) => {
    let cost = parseFloat(it.material_cost) || 0;
    if (cost === 0) {
      const pm = state.products.find(p => p.code === it.product_code || p.name === it.product_code);
      if (pm) cost = pm.cost_unit || 0;
      else {
        const rm = state.rawMaterials.find(m => m.code === it.product_code || m.name === it.product_code);
        if (rm && rm.type !== 'MO' && rm.type !== 'Mano de Obra' && rm.type !== 'Servicio') cost = rm.cost_net || 0;
      }
    }
    return sum + (cost * (parseFloat(it.quantity) || 0));
  }, 0) + (parseFloat(transaction.material_cost) || 0)).toLocaleString()}</td></tr>
          <tr><td>Gastos Generales / Varios</td><td style="text-align: right">$${(transaction.general_expenses || 0).toLocaleString()}</td></tr>
          <tr style="font-size: 1.1rem; border-top: 2px solid var(--border); color: var(--danger)">
             <td>COSTO TOTAL ESTIMADO</td>
              <td style="text-align: right"><strong>$${((transaction.items.reduce((sum, it) => {
    let costMP = parseFloat(it.material_cost) || 0;
    let costMO = parseFloat(it.mo_cost) || 0;
    if (costMP === 0 && costMO === 0) {
      const pm = state.products.find(p => p.code === it.product_code || p.name === it.product_code);
      if (pm) { costMP = pm.cost_unit || 0; costMO = pm.labor_cost || 0; }
      else {
        const rm = state.rawMaterials.find(m => m.code === it.product_code || m.name === it.product_code);
        if (rm) {
          if (rm.type === 'MO' || rm.type === 'Mano de Obra' || rm.type === 'Servicio') costMO = rm.cost_net || 0;
          else costMP = rm.cost_net || 0;
        }
      }
    }
    return sum + ((costMP + costMO) * (parseFloat(it.quantity) || 0));
  }, 0)) + (parseFloat(transaction.material_cost) || 0) + (parseFloat(transaction.general_expenses) || 0)).toLocaleString()}</strong></td>
          </tr>
          ${transaction.quotation_total > 0 ? `
            <tr style="font-size: 1rem; border-top: 1px dashed var(--border); color: var(--success); margin-top: 10px">
               <td>Ingreso Proyectado (Cotización)</td>
               <td style="text-align: right"><strong>$${(transaction.quotation_total).toLocaleString()}</strong></td>
            </tr>
            <tr style="font-size: 1.1rem; background: rgba(var(--success-rgb), 0.1)">
               <td style="padding: 0.5rem">UTILIDAD ESTIMADA (PROYECTO)</td>
               <td style="text-align: right; padding: 0.5rem"><strong>$${(transaction.quotation_total - ((transaction.items.reduce((sum, it) => sum + ((it.mo_cost || 0) * it.quantity), 0)) + (transaction.material_cost || 0) + (transaction.general_expenses || 0))).toLocaleString()}</strong></td>
            </tr>
          ` : ''}
        </table>
      </div>
      ` : `
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
              <td>Comisión Máquina (3,45%)</td>
              <td style="text-align: right">-$${(transaction.commission || Math.round(transaction.total * 0.0345)).toLocaleString()}</td>
            </tr>
          ` : ''}
          ${type === 'sale' ? `
            <tr style="font-size: 1rem; border-top: 2px solid var(--border); background: rgba(var(--success-rgb), 0.1)">
              <td style="padding: 0.75rem 0.5rem"><strong>Ingreso Real (Monto Líquido)</strong></td>
              <td style="text-align: right; padding: 0.75rem 0.5rem"><strong>$${(transaction.total - (transaction.commission || (transaction.payment_method === 'machine' ? Math.round(transaction.total * 0.0345) : 0))).toLocaleString()}</strong></td>
            </tr>
          ` : ''}
        </table>
      </div>
      `}
      
      <div class="form-actions">
        ${!isProduction ? `<button style="background: var(--accent)" onclick="window.editTransaction('${type}', '${transaction.id}')">📝 Editar</button>` : ''}
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
      if (dateEl) dateEl.value = transaction.date ? transaction.date.split('T')[0] : '';
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

      const saleCategoryEl = document.getElementById('sale-category');
      const saleQuoteEl = document.getElementById('sale-quotation');
      const saleDocNumEl = document.getElementById('sale-doc-number');
      const saleDocTypeEl = document.getElementById('sale-doc-type');

      if (saleCategoryEl) {
        saleCategoryEl.value = transaction.category || (transaction.quotation_id ? 'pull' : 'push');
      }
      if (saleQuoteEl) {
        saleQuoteEl.value = transaction.quotation_id || '';
      }
      if (saleDocNumEl) {
        saleDocNumEl.value = transaction.document_number || '';
      }
      if (saleDocTypeEl) {
        saleDocTypeEl.value = transaction.document_type || 'boleta';
      }
    } else {
      const typeEl = document.getElementById('pur-type');
      const categoryEl = document.getElementById('pur-category');
      const provEl = document.getElementById('pur-prov');
      const dateEl = document.getElementById('pur-date');
      const paymentEl = document.getElementById('pur-payment-method');
      const accEl = document.getElementById('pur-account');
      const docEl = document.getElementById('pur-doc-type');
      const projectEl = document.getElementById('pur-project');
      const descEl = document.getElementById('pur-description');
      const expTotalEl = document.getElementById('pur-expense-total');
      const ccEl = document.getElementById('pur-cost-center');

      if (typeEl) typeEl.value = transaction.type || 'mp';
      if (categoryEl) categoryEl.value = transaction.purchase_category || 'general';
      if (provEl) provEl.value = transaction.provider_id || '';
      if (dateEl) dateEl.value = transaction.date ? transaction.date.split('T')[0] : '';
      if (paymentEl) paymentEl.value = transaction.payment_method || 'transfer';
      if (accEl) accEl.value = transaction.account_id || '';
      if (docEl) docEl.value = transaction.document_type || 'factura';
      if (projectEl) projectEl.value = transaction.quotation_id || transaction.project_ref || '';
      if (ccEl) ccEl.value = transaction.centro_costo_id || '';

      const docNumEl = document.getElementById('pur-doc-number');
      if (docNumEl) docNumEl.value = transaction.document_number || '';

      if (transaction.type === 'expense') {
        if (descEl) descEl.value = transaction.description || '';
        if (expTotalEl) expTotalEl.value = transaction.total || 0;
      }

      // Refresh UI state
      if (typeof window.togglePurType === 'function') window.togglePurType();
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

          if (codeSel) {
            codeSel.value = type === 'sale' ? item.product_code : (item.product_code || item.mp_code);
            if (codeSel.value === '__otros__' || (!codeSel.value && item.custom_name)) {
              codeSel.value = '__otros__';
              const customNameInput = row.querySelector('.item-custom-name');
              if (customNameInput) {
                customNameInput.style.display = 'block';
                customNameInput.value = item.custom_name || item.product_name || item.mp_name || '';
              }
            }
          }
          if (priceInp) priceInp.value = item.unit_price || 0;
          if (qtyInp) qtyInp.value = item.quantity || 0;
          if (subInp) subInp.value = item.subtotal || 0;
        }
      });
    }

    // Update Totals/Summary
    const prefix_ = type === 'sale' ? 'sale' : 'pur';
    const netH = document.getElementById(`${prefix_}-net`);
    const ivaH = document.getElementById(`${prefix_}-iva`);
    const totalH = document.getElementById(`${prefix_}-total`);
    const netD = document.getElementById(`${prefix_}-net-display`);
    const ivaD = document.getElementById(`${prefix_}-iva-display`);
    const totalD = document.getElementById(`${prefix_}-total-display`);

    if (netH) netH.value = transaction.net || 0;
    if (ivaH) ivaH.value = transaction.iva || 0;
    if (totalH) totalH.value = transaction.total || 0;
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
    document.getElementById('np-code').readOnly = true;
    document.getElementById('np-code').title = 'El codigo es una clave usada por ventas, produccion, recetas y cotizaciones.';
    document.getElementById('np-name').value = p.name;
    document.getElementById('np-type').value = isMerchandiseProduct(p) ? 'merchandise' : 'finished';
    window.toggleProductTypeFields();

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
    document.getElementById('nrm-code').readOnly = true;
    document.getElementById('nrm-code').title = 'El codigo es una clave usada por compras, recetas, produccion e inventario.';
    document.getElementById('nrm-name').value = m.name;
    document.getElementById('nrm-batch-size').value = m.batch_size || 1;
    document.getElementById('nrm-type').value = m.type || 'MP';
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

window.findCatalogCodeConflict = (code, currentType = '', originalCode = '') => {
  const value = String(code || '').trim().toLowerCase();
  const original = String(originalCode || '').trim().toLowerCase();
  if (!value) return null;

  const product = state.products.find(p => String(p.code || '').trim().toLowerCase() === value);
  if (product && !(currentType === 'product' && value === original)) {
    return { type: 'producto', code: product.code, name: product.name || '' };
  }

  const rawMaterial = state.rawMaterials.find(m => String(m.code || '').trim().toLowerCase() === value);
  if (rawMaterial && !(currentType === 'rawMaterial' && value === original)) {
    return { type: 'insumo', code: rawMaterial.code, name: rawMaterial.name || '' };
  }

  return null;
};

window.validateCatalogCodeField = (inputId, currentType, originalCodeId = '') => {
  const input = document.getElementById(inputId);
  if (!input || input.readOnly) return true;

  const originalCode = originalCodeId ? document.getElementById(originalCodeId)?.value : '';
  const conflict = window.findCatalogCodeConflict(input.value, currentType, originalCode);
  input.setCustomValidity('');
  input.style.borderColor = '';

  if (!conflict) return true;

  const message = `El codigo ${conflict.code} ya esta usado por un ${conflict.type}: ${conflict.name || 'sin nombre'}. Debe usar un codigo distinto.`;
  input.setCustomValidity(message);
  input.style.borderColor = 'var(--danger)';
  alert(message);
  input.focus();
  input.select();
  return false;
};

window.openNewProductModal = () => {
  const modal = document.getElementById('new-prod-modal');
  const form = document.getElementById('new-prod-form');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('np-edit-mode').value = 'false';
  document.getElementById('np-original-code').value = '';
  document.getElementById('np-type').value = state.productCatalogFilter === 'merchandise' ? 'merchandise' : 'finished';
  window.toggleProductTypeFields();
  document.getElementById('np-code').readOnly = false;
  document.getElementById('np-code').title = '';
  document.getElementById('np-code').style.borderColor = '';
  document.getElementById('np-code').setCustomValidity('');
  document.getElementById('np-pnet').value = 0;
  document.getElementById('np-iva').value = 0;
  document.getElementById('np-psale').value = 0;
  document.getElementById('np-neto-display').textContent = '$0';
  document.getElementById('np-iva-display').textContent = '$0';
  document.getElementById('np-total-display').textContent = '$0';
  modal.style.display = 'flex';
};

window.toggleProductTypeFields = () => {
  const isMerchandise = document.getElementById('np-type')?.value === 'merchandise';
  const isEditing = document.getElementById('np-edit-mode')?.value === 'true';
  const title = document.getElementById('prod-modal-title');
  const costLabel = document.getElementById('np-cost-label');
  if (title) {
    title.textContent = isEditing
      ? (isMerchandise ? 'Editar Mercadería' : 'Editar Producto Terminado')
      : (isMerchandise ? 'Nueva Mercadería' : 'Nuevo Producto Terminado');
  }
  if (costLabel) costLabel.textContent = isMerchandise ? 'Costo de Compra Unitario ($)' : 'Costo Estimado ($)';
};

window.openNewRawMaterialModal = () => {
  const modal = document.getElementById('new-rm-modal');
  const form = document.getElementById('new-rm-form');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('nrm-edit-mode').value = 'false';
  document.getElementById('nrm-original-code').value = '';
  document.getElementById('rm-modal-title').textContent = 'Nuevo Insumo / Materia Prima';
  document.getElementById('nrm-code').readOnly = false;
  document.getElementById('nrm-code').title = '';
  document.getElementById('nrm-code').style.borderColor = '';
  document.getElementById('nrm-code').setCustomValidity('');
  document.getElementById('nrm-batch-size').value = 1;
  document.getElementById('nrm-cost').value = 0;
  document.getElementById('nrm-iva').value = 0;
  document.getElementById('nrm-total').value = 0;
  document.getElementById('nrm-neto-display').textContent = '$0';
  document.getElementById('nrm-unit-price-display').textContent = '$0';
  document.getElementById('nrm-total-display').textContent = '$0';
  modal.style.display = 'flex';
};

window.recalculateAllStock = async () => {
  if (!confirm('Esta operación auditará todo el historial para recalcular los niveles de stock (PT y MP) desde cero. ¿Desea continuar?')) return;

  const finishBtn = (btn, originalText) => {
    btn.innerHTML = originalText;
    btn.disabled = false;
  };

  const btn = event.target;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recalculando...';
  btn.disabled = true;

  try {
    const res = await apiFetch('/admin/recalculate-all-stock', { method: 'POST' });
    if (res && res.success) {
      alert(res.message);
      fetchData(); // Refrescar stock en UI
    } else {
      alert('Error: ' + (res?.error || 'No se pudo completar la operación. Verifique permisos de Admin.'));
    }
  } catch (e) {
    alert('Error de conexión o permisos insuficiente.');
  } finally {
    finishBtn(btn, originalText);
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
      <button class="btn-sm" onclick="window.saveRecipeRow(${index})" style="background: var(--success); margin-right: 0.5rem">Guardar</button>
      <button class="btn-sm" onclick="window.refreshRecipeView()" style="background: var(--surface-light)">Cancelar</button>
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

window.migrateOtrosToMP = async (itemId, customName, unitPrice) => {
  if (!confirm(`¿Desea registrar "${customName}" como una materia prima permanente?\n\nSe creará un código automático y quedará vinculada en este registro.`)) return;

  try {
    const res = await fetch(`${API_BASE}/purchase-items/migrate-to-mp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ item_id: itemId, custom_name: customName, unit_price: unitPrice })
    });
    const result = await res.json();
    if (result.success) {
      alert(result.message);
      fetchData(); // Refresh everything
      // Close detail modal if open
      const detailsModal = document.getElementById('details-modal');
      if (detailsModal) detailsModal.style.display = 'none';
    } else {
      alert('Error: ' + result.error);
    }
  } catch (e) {
    alert('Error al migrar: ' + e.message);
  }
};

// Global listener for dynamic "Migrate" buttons
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('migrate-otros-btn')) {
    const { id, name, price } = e.target.dataset;
    window.migrateOtrosToMP(id, name, price);
  }
});

window.populateProductDropdowns = (selector) => {
  window.formatProductionProductLabel = window.formatProductionProductLabel || ((productOrCode, fallbackName = '') => {
    const code = typeof productOrCode === 'string' ? productOrCode.trim() : (productOrCode?.code || '').trim();
    const name = typeof productOrCode === 'string' ? fallbackName.trim() : (productOrCode?.name || fallbackName || '').trim();
    if (!code) return name || '';
    if (!name || code.toLowerCase() === name.toLowerCase() || code.toLowerCase().includes(name.toLowerCase())) return code;
    return `${code} - ${name}`;
  });

  window.findProductionProduct = window.findProductionProduct || ((rawValue) => {
    const value = String(rawValue || '').trim().toLowerCase();
    if (!value) return null;
    return getFinishedProducts().find((product) => {
      const code = String(product.code || '').trim().toLowerCase();
      const name = String(product.name || '').trim().toLowerCase();
      const label = window.formatProductionProductLabel(product).toLowerCase();
      return code === value || name === value || label === value || value.startsWith(`${code} -`);
    }) || null;
  });

  window.getProductionProductCode = window.getProductionProductCode || ((rawValue) => {
    const match = window.findProductionProduct(rawValue);
    if (match?.code) return match.code;
    return String(rawValue || '').trim().split(' - ')[0].trim();
  });

  window.getProductionProductLabel = window.getProductionProductLabel || ((rawValue, fallbackName = '') => {
    const match = window.findProductionProduct(rawValue);
    if (match) return window.formatProductionProductLabel(match);
    return window.formatProductionProductLabel(window.getProductionProductCode(rawValue), fallbackName);
  });

  const selects = document.querySelectorAll(selector);
  const optionsHtml = `
  <option value="">Seleccione...</option>
    ${getFinishedProducts().slice().sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(p => `
      <option value="${window.formatProductionProductLabel(p)}">${p.code} | ${p.name || ''}${p.color ? ' (' + p.color + ')' : ''}${p.size ? ' [' + p.size + ']' : ''}</option>
    `).join('')}
`;
  selects.forEach(s => {
    const currentVal = s.value;
    s.innerHTML = optionsHtml;
    s.value = currentVal;
  });

  // Also update datalist if present
  const dl = document.getElementById('production-products-list');
  if (dl) {
    dl.innerHTML = getFinishedProducts().slice().sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(p => `
      <option value="${window.formatProductionProductLabel(p)}">${p.code} | ${p.name || ''}${p.color ? ' (' + p.color + ')' : ''}${p.size ? ' [' + p.size + ']' : ''}</option>
    `).join('');
  }
};

window.openProductionModal = (code) => {
  const modal = document.getElementById('production-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  // Reset edit mode
  document.getElementById('prod-edit-mode').value = 'false';
  document.getElementById('prod-edit-id').value = '';
  document.getElementById('production-modal-title').textContent = 'Nueva Orden de Producción';
  document.getElementById('btn-prod-text').textContent = 'Iniciar Producción';

  // Reset category to push and hide project group
  const catSelect = document.getElementById('prod-category');
  if (catSelect) catSelect.value = 'push';
  const projGroup = document.getElementById('prod-project-group');
  if (projGroup) projGroup.style.display = 'none';

  window.populateProductDropdowns('.prod-item-code');

  // Reset fields
  const selects = modal.querySelectorAll('.prod-item-code');
  const mps = modal.querySelectorAll('.prod-item-mp');
  const mtos = modal.querySelectorAll('.prod-item-mo');
  const qtys = modal.querySelectorAll('.prod-item-qty');
  selects.forEach(s => s.value = '');
  qtys.forEach(q => q.value = '0');
  mps.forEach(m => m.value = '0');
  mtos.forEach(m => m.value = '0');

  if (document.getElementById('prod-material-cost')) document.getElementById('prod-material-cost').value = '0';
  if (document.getElementById('prod-general-expenses')) document.getElementById('prod-general-expenses').value = '0';
  
  // Reset Labor Management Fields
  if (document.getElementById('prod-mo-subcontracted')) document.getElementById('prod-mo-subcontracted').value = 'direct';
  if (document.getElementById('prod-mo-doc-type')) document.getElementById('prod-mo-doc-type').value = 'none';
  if (document.getElementById('prod-mo-paid')) document.getElementById('prod-mo-paid').checked = true;

  if (code) {
    selects[0].value = window.getProductionProductLabel(code);
    qtys[0].value = '1';
  }
};

window.editProduction = async (id) => {
  const production = state.history.production.find(p => p.id === id);
  if (!production) return;

  const modal = document.getElementById('production-modal');
  modal.style.display = 'flex';

  window.populateProductDropdowns('.prod-item-code');

  document.getElementById('production-modal-title').textContent = `Editar Producción #${id} `;
  document.getElementById('btn-prod-text').textContent = 'Guardar Cambios';
  document.getElementById('prod-edit-mode').value = 'true';
  document.getElementById('prod-edit-id').value = id;
  document.getElementById('prod-date').value = production.date.split('T')[0];
  if (document.getElementById('prod-material-cost')) document.getElementById('prod-material-cost').value = production.material_cost || 0;
  if (document.getElementById('prod-general-expenses')) document.getElementById('prod-general-expenses').value = production.general_expenses || 0;

  // Restore production category (pull/push)
  const catSelect = document.getElementById('prod-category');
  if (catSelect) {
    catSelect.value = production.production_category || 'push';
  }

  // --- NEW: Load MO payment details from associated purchase ---
  const moPurchase = state.history.purchases.find(p => 
    p.description && p.description.includes(`Pago MO Producción #${id}`)
  );
  if (moPurchase) {
    const desc = moPurchase.description;
    const isSub = desc.includes('Subcontratada');
    const isPaid = moPurchase.payment_status === 'pagado';
    let docType = 'none';
    if (desc.includes('Boleta')) docType = 'boleta';
    else if (desc.includes('Factura')) docType = 'factura';
    else if (desc.includes('Sueldo')) docType = 'sueldo';

    if (document.getElementById('prod-mo-subcontracted')) document.getElementById('prod-mo-subcontracted').value = isSub ? 'subcontracted' : 'direct';
    if (document.getElementById('prod-mo-doc-type')) document.getElementById('prod-mo-doc-type').value = docType;
    if (document.getElementById('prod-mo-paid')) document.getElementById('prod-mo-paid').checked = isPaid;
  }

  // Show/hide the project group UI without triggering onchange
  const quoteSelect = document.getElementById('prod-quotation');
  if (production.production_category === 'pull') {
    if (window.toggleProdCategory) await window.toggleProdCategory();
    if (quoteSelect && production.quotation_id) {
      quoteSelect.value = production.quotation_id;
    }
  } else {
    if (window.toggleProdCategory) await window.toggleProdCategory();
  }

  // 1. Reset ALL rows first
  const rows = modal.querySelectorAll('#production-items-body .item-row');
  rows.forEach(row => {
    row.querySelector('.prod-item-code').value = '';
    row.querySelector('.prod-item-qty').value = '0';
    row.querySelector('.prod-item-mp').value = '0';
    row.querySelector('.prod-item-mo').value = '0';
  });

  // 2. Fill from saved production items
  production.items.forEach((item, i) => {
    if (rows[i]) {
      const select = rows[i].querySelector('.prod-item-code');
      let val = item.product_code || '';
      
      // Smart search: if val doesn't match a code, try finding by name
      if (val && !state.products.find(p => p.code === val)) {
        const match = state.products.find(p => p.name && p.name.toLowerCase().trim() === val.toLowerCase().trim());
        if (match) val = match.code;
      }
      
      select.value = window.getProductionProductLabel(val, item.product_name || item.description || '');
      rows[i].querySelector('.prod-item-qty').value = item.quantity;
      rows[i].querySelector('.prod-item-mp').value = item.material_cost || 0;
      rows[i].querySelector('.prod-item-mo').value = item.mo_cost || 0;
    }
  });

  // Ensure validation passes for existing production items even if not in master
  window.currentProductionItems = production.items.map(it => ({ item_code: it.product_code, description: it.product_code }));

  // 3. For PULL: fetch the quotation to supplement missing costs
  if (production.production_category === 'pull' && production.quotation_id) {
    try {
      const quote = await apiFetch(`/quotations/${production.quotation_id}`);
      if (quote && quote.items) {
        // Store for summary panel
        window.currentProductionItems = quote.items;
        window.updateProductionDatalist(quote);

        // Calculate total labor cost from quotation labor items
        const laborItems = quote.items.filter(it =>
          it.item_type === 'labor' || it.item_type === 'MO' || it.item_type === 'mano_de_obra'
        );
        const totalLaborFromQuote = laborItems.reduce((sum, it) => {
          return sum + (parseFloat(it.total_cost) || (parseFloat(it.unit_cost || 0) * parseFloat(it.quantity || 1)));
        }, 0);

        // Calculate total material cost from quotation material items
        const materialItems = quote.items.filter(it => it.item_type === 'material');
        const totalMaterialFromQuote = materialItems.reduce((sum, it) => {
          return sum + (parseFloat(it.total_cost) || (parseFloat(it.unit_cost || 0) * parseFloat(it.quantity || 1)));
        }, 0);

        // Get sellable items from quote to match with production rows
        const quoteProducts = quote.items.filter(it =>
          it.item_type === 'venta' || it.item_type === 'producto' || !it.item_type
        );
        const totalProductQty = quoteProducts.reduce((sum, it) => sum + (parseFloat(it.quantity) || 1), 0);

        // Supplement each production row with costs from quotation
        production.items.forEach((item, i) => {
          if (!rows[i]) return;
          const mpInput = rows[i].querySelector('.prod-item-mp');
          const moInput = rows[i].querySelector('.prod-item-mo');
          const currentMP = parseFloat(mpInput.value) || 0;
          const currentMO = parseFloat(moInput.value) || 0;

          // Find matching quote product for this item
          const matchingQuoteItem = quoteProducts.find(qi =>
            (qi.item_code === item.product_code) || (qi.description === item.product_code)
          );

          // Supplement MP cost if currently 0
          if (currentMP === 0) {
            if (matchingQuoteItem) {
              mpInput.value = matchingQuoteItem.unit_cost || matchingQuoteItem.cost_unit || 0;
            } else {
              const masterProd = state.products.find(p => p.code === item.product_code);
              if (masterProd) mpInput.value = masterProd.cost_unit || 0;
            }
          }

          // Supplement MO cost if currently 0
          if (currentMO === 0) {
            if (matchingQuoteItem && (matchingQuoteItem.labor_cost || matchingQuoteItem.mo_cost)) {
              moInput.value = matchingQuoteItem.labor_cost || matchingQuoteItem.mo_cost;
            } else if (totalLaborFromQuote > 0 && totalProductQty > 0) {
              // Distribute total labor proportionally
              moInput.value = Math.round(totalLaborFromQuote / totalProductQty);
            } else {
              const masterProd = state.products.find(p => p.code === item.product_code);
              if (masterProd && masterProd.labor_cost) moInput.value = masterProd.labor_cost;
            }
          }
        });
      }
    } catch (e) {
      console.error('Error loading quotation for edit:', e);
    }
  } else {
    // For PUSH: supplement MO from product master
    production.items.forEach((item, i) => {
      if (!rows[i]) return;
      const moInput = rows[i].querySelector('.prod-item-mo');
      const mpInput = rows[i].querySelector('.prod-item-mp');
      const currentMO = parseFloat(moInput.value) || 0;
      const currentMP = parseFloat(mpInput.value) || 0;
      const masterProd = state.products.find(p => p.code === item.product_code);
      if (currentMO === 0 && masterProd && masterProd.labor_cost) {
        moInput.value = masterProd.labor_cost;
      }
      if (currentMP === 0 && masterProd && masterProd.cost_unit) {
        mpInput.value = masterProd.cost_unit;
      }
    });
  }

  // Re-calculate totals
  if (window.updateProdRecipeView) window.updateProdRecipeView();
  if (window.updateProdTotals) window.updateProdTotals();
};

window.updateProdRecipeView = async () => {
  const rows = document.querySelectorAll('#production-items-body .item-row');
  const container = document.getElementById('production-material-summary');
  const content = document.getElementById('material-summary-content');
  const isPull = document.getElementById('prod-category')?.value === 'pull';
  const quoteId = document.getElementById('prod-quotation')?.value;

  let totalMP = 0;
  let totalMO = 0;
  let totalSvc = 0;
  const materialAggregation = {};

  // --- Logic for PULL (Custom) ---
  if (isPull && quoteId && window.currentProductionItems) {
    // In PULL mode, we list all materials found in the quotation items
    window.currentProductionItems.forEach(item => {
      const isMaterial = (item.item_type === 'material' || item.type === 'MP');
      const isLabor = (item.item_type === 'labor' || item.type === 'MO');
      const isService = (item.item_type === 'service' || item.type === 'Servicio');

      const cost = (parseFloat(item.total_cost) || (parseFloat(item.unit_cost) * parseFloat(item.quantity))) || 0;

      if (isMaterial) {
        totalMP += cost;
        const name = item.description || item.name || 'Material S.N.';
        if (!materialAggregation[name]) materialAggregation[name] = { qty: 0, cost: 0, name };
        materialAggregation[name].qty += (parseFloat(item.quantity) || 0);
        materialAggregation[name].cost += cost;
      } else if (isLabor) {
        totalMO += cost;
      } else if (isService) {
        totalSvc += cost;
      }
    });
  }
  // --- Logic for PUSH (Standard) ---
  else {
    for (const row of rows) {
      const rowItemCodeRaw = row.querySelector('.prod-item-code')?.value.trim();
      const rowItemCode = window.getProductionProductCode(rowItemCodeRaw);
      const qtyInput = row.querySelector('.prod-item-qty');
      const mpInput = row.querySelector('.prod-item-mp');
      const moInput = row.querySelector('.prod-item-mo');

      const qtyProduced = parseFloat(qtyInput?.value) || 0;
      if (!rowItemCode || qtyProduced <= 0) continue;

      const prodData = state.products.find(p => p.code === rowItemCode);
      if (prodData) {
        try {
          const recipeItems = await apiFetch(`/recipes/${rowItemCode}`);
          if (recipeItems && recipeItems.length > 0) {
            let rowUnitMP = 0;
            let rowUnitMO = 0;

            recipeItems.forEach(r => {
              const batchSize = parseFloat(r.batch_size) || 1;
              const unitContrib = parseFloat(r.unit_cost) || 0;

              const totalCostForThisRow = unitContrib * qtyProduced;
              const totalQtyForThisRow = (parseFloat(r.quantity) || 0) / batchSize * qtyProduced;

              const typeText = (r.type || r.raw_materials?.type || '').toLowerCase();
              const isMO = (typeText.includes('mo') || typeText.includes('mano') || typeText.includes('labor') || typeText.includes('servicio'));

              if (isMO) {
                rowUnitMO += unitContrib;
                totalMO += totalCostForThisRow;
              } else {
                rowUnitMP += unitContrib;
                totalMP += totalCostForThisRow;
              }

              const matName = r.mp_name || r.mp_code || 'Insumo';
              if (!materialAggregation[r.mp_code]) {
                materialAggregation[r.mp_code] = { qty: 0, cost: 0, name: matName };
              }
              materialAggregation[r.mp_code].qty += totalQtyForThisRow;
              materialAggregation[r.mp_code].cost += totalCostForThisRow;
            });

            // FILL ROW INPUTS WITH UNIT COSTS FROM RECIPE IF EMPTY
            if (mpInput && (parseFloat(mpInput.value) === 0 || mpInput.dataset.auto === 'true')) {
              mpInput.value = Math.round(rowUnitMP);
              mpInput.dataset.auto = 'true'; // Mark as auto-filled
            }
            if (moInput && (parseFloat(moInput.value) === 0 || moInput.dataset.auto === 'true')) {
              moInput.value = Math.round(rowUnitMO);
              moInput.dataset.auto = 'true';
            }
          }
        } catch (e) {
          console.error('Error fetching recipe for', rowItemCode, e);
        }
      }
    }
  }

  // Update Summary Display (Visual Assistance)
  if (container && content) {
    const matKeys = Object.keys(materialAggregation);
    if (matKeys.length === 0) {
      container.style.display = 'none';
    } else {
      container.style.display = 'block';
      let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">';
      matKeys.forEach(key => {
        const m = materialAggregation[key];
        html += `
          <div style="background: var(--bg-secondary); padding: 8px; border-radius: 6px; border: 1px solid var(--border)">
            <div style="font-weight:700; font-size: 0.75rem; color: var(--secondary); margin-bottom: 4px; border-bottom: 1px solid var(--border)">${m.name}</div>
            <div style="font-size: 0.7rem; opacity: 0.9">📦 Necesario: <b>${m.qty.toFixed(2)}</b></div>
            <div style="font-size: 0.7rem; color: var(--success)">💰 Costo: <b>$${Math.round(m.cost).toLocaleString()}</b></div>
          </div>
        `;
      });
      html += '</div>';
      content.innerHTML = html;
    }
  }

  // Refresh totals to reflect the changes (even if they were auto-filled)
  window.updateProdTotals();
};

window.recalculateProductionHistory = async () => {
  if (!confirm('Esta acción recalculará los costos y devolverá el stock de insumos mal descontado de TODA la historia de producción. ¿Estás seguro?')) return;

  try {
    const res = await apiFetch('/admin/recalculate-production', { method: 'POST' });
    if (res.error) throw new Error(res.error);
    alert('Exito: ' + res.message);
    window.loadHistory(); // Refresh history table
  } catch (e) {
    alert('Error al recalcular: ' + e.message);
  }
};

window.updateProdTotals = () => {
  const modal = document.getElementById('production-modal');
  if (!modal) return;
  const rows = modal.querySelectorAll('.item-row');
  let totalItemsMP = 0;
  let totalItemsMO = 0;

  rows.forEach(row => {
    const qtyInput = row.querySelector('.prod-item-qty');
    const mpInput = row.querySelector('.prod-item-mp');
    const moInput = row.querySelector('.prod-item-mo');

    if (qtyInput && mpInput && moInput) {
      const qty = parseFloat(qtyInput.value) || 0;
      const mp = parseFloat(mpInput.value) || 0;
      const mo = parseFloat(moInput.value) || 0;

      if (qty > 0) {
        // En Ross ERP, el costo por ítem se ingresa como Unitario. Multiplicamos por cantidad.
        totalItemsMP += (mp * qty);
        totalItemsMO += (mo * qty);
      }
    }
  });

  const costHeaderMP = document.getElementById('prod-material-cost');
  const costHeaderExpenses = document.getElementById('prod-general-expenses');

  // El input 'prod-material-cost' representa el costo TOTAL de materiales de la producción.
  if (costHeaderMP) costHeaderMP.value = Math.round(totalItemsMP);

  // Actualizamos el resumen visual en el modal si existe (puedes añadir un label para MO)
};

window.deleteProduction = async (id) => {
  if (!confirm(`¿Está seguro de eliminar la Orden de Producción #${id}?\n\nEsta acción revertirá el stock de productos y devolverá las materias primas al inventario.`)) return;

  const res = await deleteData(`/production/${id}`);
  if (res) {
    fetchData();
  }
};

// --- USER MANAGEMENT HELPERS ---
window.openUserModal = async () => {
  document.getElementById('user-modal').style.display = 'flex';
  document.getElementById('user-modal-title').textContent = 'Nuevo Usuario';
  document.getElementById('user-edit-id').value = '';
  document.getElementById('user-form').reset();
  document.getElementById('user-pass-label').textContent = 'Contraseña';
  document.getElementById('user-pass').required = true;
  document.getElementById('user-pass-hint').style.display = 'none';

  // Populate empresa dropdown
  const empresaSelect = document.getElementById('user-empresa');
  if (empresaSelect && empresaSelect.options.length <= 1) {
    const empresas = await apiFetch('/empresas/admin');
    if (Array.isArray(empresas)) {
      empresas.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.nombre;
        empresaSelect.appendChild(opt);
      });
    }
  }
  empresaSelect.value = '';
};

window.editUser = async (id) => {
  const user = state.users.find(u => u.id === id);
  if (!user) return;

  await window.openUserModal();
  document.getElementById('user-modal-title').textContent = 'Editar Usuario';
  document.getElementById('user-edit-id').value = id;
  document.getElementById('user-name').value = user.username;
  document.getElementById('user-role').value = user.role;
  document.getElementById('user-empresa').value = user.empresa_id || '';
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
        <button class="btn-sm" onclick="window.editRecipeRow(${i})" title="Modificar">📝</button>
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
        <button class="btn-sm" onclick="window.addRecipeRow()" style="background: var(--secondary)">+ Agregar Insumo</button>
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
        <button id="btn-save-recipe" style="background: var(--success); padding: 0.75rem 2rem">Guardar Receta</button>
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
        alert('Receta guardada exitosamente');
        // Recargar productos para ver el nuevo costo
        const prods = await apiFetch('/products');
        if (prods) state.products = prods;
        state.recipes[pid] = null; // Limpiar cache
        showRecipe(pid);
      } else {
        alert('Error al guardar: ' + (res?.error || 'Error desconocido'));
        btn.textContent = 'Guardar Receta';
        btn.disabled = false;
      }
    } catch (err) {
      console.error('Save Recipe Error:', err);
      alert('Error critico al guardar la receta');
      btn.textContent = 'Guardar Receta';
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
              <td><button class="btn-sm" onclick="window.editAccount('${acc.id}')">📝</button></td>
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
state.quoteStatusFilter = 'all';
window.quotationItems = []; // Temporary items for current editing quote

// Quotations module initialized at bottom

function initializeQuotations() {
  // View and Quotation functions moved to modules/quotations.js
}

views.quotations = () => {
  const filtered = state.quoteStatusFilter === 'all'
    ? state.quotations
    : state.quotations.filter(q => q.status === state.quoteStatusFilter);

  const statusCounts = {};
  state.quotations.forEach(q => {
    const s = q.status || 'draft';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  return `
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
    <div style="display: flex; gap: 0.5rem">
      ${currentUser.role === 'superadmin' ? `
        <button onclick="window.bulkPromoteQuotes()" style="background: var(--accent); color: white;" title="Sincronizar cotizaciones antiguas a productos">🚀 Sincronización Histórica</button>
        <button onclick="window.syncHistoryItems()" style="background: var(--primary); color: white;" title="Vincular ventas y producciones viejas con los nuevos códigos">📦 Vincular Historial</button>
      ` : ''}
      <button onclick="window.openQuotationModal()">+ Nueva Cotización</button>
    </div>
  </header>

  <!-- Status Filter Tabs -->
  <div class="card animate-fade" style="padding: 0.8rem 1.2rem; margin-bottom: 1rem; display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center">
    <button onclick="window.filterQuoteStatus('all')" style="padding:0.4rem 0.9rem; border-radius:20px; font-size:0.82rem; font-weight:600; border:none; cursor:pointer; transition:all 0.2s; ${state.quoteStatusFilter === 'all' ? 'background:var(--primary); color:white' : 'background:var(--surface-light); color:var(--text-muted)'}">
      Todos (${state.quotations.length})
    </button>
    ${Object.entries(QUOTE_STATUS_LABELS).map(([key, label]) => {
    const count = statusCounts[key] || 0;
    if (count === 0 && key !== state.quoteStatusFilter) return '';
    const isActive = state.quoteStatusFilter === key;
    return `<button onclick="window.filterQuoteStatus('${key}')" style="padding:0.4rem 0.9rem; border-radius:20px; font-size:0.82rem; font-weight:600; border:none; cursor:pointer; transition:all 0.2s; ${isActive ? `background:${QUOTE_STATUS_COLORS[key]}; color:white` : `background:var(--surface-light); color:${QUOTE_STATUS_COLORS[key]}`}">
        ${label} (${count})
      </button>`;
  }).join('')}
  </div>

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
            <th style="text-align:center">Prob. Exito</th>
            <th style="text-align:center">Estado</th>
            <th style="text-align:center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length === 0 ? '<tr><td colspan="8" style="text-align:center; padding:3rem; opacity:0.5">No hay cotizaciones en este filtro</td></tr>' :
      filtered.map(q => {
        const status = q.status || 'draft';
        const transitions = QUOTE_TRANSITIONS[status] || [];
        return `
              <tr>
                <td>${q.created_at ? new Date(q.created_at).toLocaleDateString() : '-'}</td>
                <td>${q.clients?.name || 'Varios'}</td>
                <td><strong>${q.name || '-'}</strong></td>
                <td style="text-align:right">$${Math.round(q.total_net_cost || 0).toLocaleString()}</td>
                <td style="text-align:right; font-weight:bold; color:var(--primary)">$${Math.round(q.total_price_gross || 0).toLocaleString()}</td>
                <td style="text-align:center">
                  ${q.success_probability ? `<span style="font-weight:bold; color:${q.success_probability > 50 ? '#10b981' : (q.success_probability > 20 ? '#f59e0b' : '#ef4444')}">${Math.round(q.success_probability)}%</span>` : '-'}
                </td>
                <td style="text-align:center">
                  <span style="display:inline-block; padding:0.25rem 0.7rem; border-radius:12px; font-size:0.78rem; font-weight:700; background:${QUOTE_STATUS_COLORS[status]}22; color:${QUOTE_STATUS_COLORS[status]}; border:1px solid ${QUOTE_STATUS_COLORS[status]}44">
                    ${QUOTE_STATUS_LABELS[status] || status}
                  </span>
                </td>
                <td style="text-align:center">
                  <div style="display:flex; gap:0.3rem; justify-content:center; flex-wrap:wrap">
                    <button class="btn-sm" onclick="window.viewQuotation('${q.id}')">👁️ Ver</button>
                    ${status !== 'rejected' && status !== 'cancelled' ? `<button class="btn-sm" style="background:var(--accent)" onclick="window.editQuotation('${q.id}')">📝</button>` : ''}
                    ${transitions.length > 0 ? `
                      <select onchange="if(this.value) window.changeQuoteStatus('${q.id}', this.value); this.value='';" style="padding:0.25rem 0.4rem; font-size:0.78rem; border-radius:6px; border:1px solid var(--border); background:var(--surface-light); color:var(--text); cursor:pointer; max-width:120px">
                        <option value="">Estado...</option>
                        ${transitions.map(t => `<option value="${t}">${QUOTE_STATUS_LABELS[t]}</option>`).join('')}
                      </select>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `;
      }).join('')}
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
        <button class="btn-sm" style="background:none; color:var(--text-muted); font-size:1.5rem" onclick="document.getElementById('quotation-modal').style.display='none'">✖</button>
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
        <div class="form-group" style="grid-column: span 1">
          <label style="color:var(--secondary); font-weight:700">ID Cotización</label>
          <input type="text" id="quote-external-id" placeholder="Ej: 1216088..." style="border:1px solid var(--secondary)">
        </div>
        <div class="form-group" style="grid-column: span 1">
          <label style="color:var(--secondary); font-weight:700">OC (Orden Compra)</label>
          <input type="text" id="quote-purchase-order" placeholder="Ej: 1216088..." style="border:1px solid var(--secondary)">
        </div>
        <div class="form-group" style="grid-column: span 4">
          <label>Descripción de la Propuesta (Aparece en PDF)</label>
          <textarea id="quote-description-proposal" rows="2" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:8px" placeholder="Ej: PROPUESTA PARA ADQUISICION DE 22 MANTELES..."></textarea>
        </div>
        
        <div class="form-group" style="grid-column: span 4; margin-bottom: 1rem">
          <label>Referencias Fotograficas (Arrastra imagenes aqui)</label>
          <div id="quote-dropzone" 
            style="border: 2px dashed var(--border); border-radius: 12px; padding: 1.5rem; text-align: center; background: rgba(255,255,255,0.02); cursor: pointer; transition: all 0.3s"
            onclick="document.getElementById('quote-file-input').click()"
            ondragover="event.preventDefault(); this.style.borderColor='var(--primary)'; this.style.background='rgba(59, 130, 246, 0.05)'"
            ondragleave="this.style.borderColor='var(--border)'; this.style.background='rgba(255,255,255,0.02)'"
            ondrop="window.handleQuoteDrop(event)">
            <p id="dropzone-text" style="margin:0; opacity:0.6">Haz clic o arrastra fotos aqui (Max. 4 fotos, tamano pequeno)</p>
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
          <div style="display:flex; align-items:center; gap:0.4rem; background: rgba(16, 185, 129, 0.05); padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.1)">
            <input type="number" id="quote-utility" value="30" min="0" style="width:45px; border:none; background:transparent; font-weight:700; color:var(--text); padding:0" oninput="window.calculateQuotation()">
            <span style="opacity:0.5; font-size:0.8rem">%</span>
            <div style="width:1px; height:16px; background:rgba(255,255,255,0.1); margin:0 2px"></div>
            <div id="res-utility-clp" style="font-weight:bold; color:#10b981; font-size:0.85rem; white-space:nowrap" title="Utilidad Estimada en Pesos">$0</div>
          </div>
        </div>
        <div class="form-group">
          <label>Presupuesto (P)</label>
          <input type="number" id="quote-budget" value="0" min="0" oninput="window.calculateQuotation()">
        </div>
        <div class="form-group">
          <label>% Exito</label>
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
          <button class="btn-sm btn-primary" onclick="window.addQuotationItem()">+ Agregar Item</button>
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
            <tr><td>PPM (<span id="res-ppm-rate">0</span>%)</td><td id="res-cost-ppm" style="text-align:right">$0</td></tr>
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
        <button id="btn-save-quote" class="btn-primary" style="padding: 0.8rem 2rem; font-weight:600" onclick="window.saveQuotation()">Guardar y Finalizar</button>
      </div>
    </div>
  </div>
  <datalist id="raw-materials-list">
    ${state.rawMaterials.map(rm => `<option value="${rm.name}">${rm.code}</option>`).join('')}
  </datalist>
`;
}

// Función auxiliar para calcular el impacto total de una fila de costo en el proyecto
window.getQuotationItemDocumentType = (item) => {
  if (item?.document_type === 'boleta' || item?.document_type === 'factura') {
    return item.document_type;
  }
  return Number(item?.price_gross) === 1 ? 'boleta' : 'factura';
};

window.getQuotationItemUnitNet = (item) => {
  return parseFloat(item?.unit_value_net ?? item?.unit_cost) || 0;
};

window.getPpmPercentage = (quote = null) => {
  const quotePpm = parseFloat(String(quote?.ppm_percentage ?? '').replace(',', '.'));
  const activePpm = parseFloat(String(window.activeQuotationPpmPercentage ?? '').replace(',', '.'));
  const rawValue = quotePpm > 0
    ? quotePpm
    : (activePpm > 0 ? activePpm : state.settings?.ppm_percentage ?? 0);
  const normalized = String(rawValue).replace(',', '.');
  return Math.max(0, parseFloat(normalized) || 0);
};

window.calculatePpmAmount = (baseCost, utilityPerc, ppmPerc) => {
  const cost = Math.max(0, parseFloat(baseCost) || 0);
  const utilityRate = Math.max(0, parseFloat(utilityPerc) || 0) / 100;
  const ppmRate = Math.max(0, parseFloat(ppmPerc) || 0) / 100;
  if (!cost || !ppmRate) return 0;

  const denominator = 1 - (ppmRate * (1 + utilityRate));
  if (denominator <= 0) return Math.round(cost * ppmRate);

  const estimatedNetSale = (cost * (1 + utilityRate)) / denominator;
  return Math.round(estimatedNetSale * ppmRate);
};

window.getStoredQuotationTotals = (quote) => {
  const products = Array.isArray(quote?.products_list) && quote.products_list.length
    ? quote.products_list
    : [{ id: 'p1', name: quote?.name, quantity: quote?.quantity || 1 }];
  const items = Array.isArray(quote?.items) ? quote.items : [];

  if (!items.length) {
    return {
      products,
      totalQuantity: products.reduce((sum, p) => sum + (parseFloat(p.quantity) || 0), 0),
      totalNetCost: quote?.total_net_cost || 0,
      ppmPerc: window.getPpmPercentage(quote),
      ppmAmount: parseFloat(quote?.ppm_amount) || 0,
      totalPriceNet: quote?.total_price_net || 0,
      totalIva: quote?.total_iva || 0,
      totalPriceGross: quote?.total_price_gross || 0,
      productSummaries: products.map((product) => ({
        ...product,
        totalCost: 0,
        unitPriceNet: 0,
        subtotalNet: 0
      })),
      usedStoredRecalculation: false
    };
  }

  const utilityPerc = parseFloat(quote?.utility_percentage) || 0;
  const totalQuantity = products.reduce((sum, p) => sum + (parseFloat(p.quantity) || 0), 0);
  let totalNetCost = 0;
  let factNetGlobal = 0;
  let bolIVAGlobal = 0;
  let generalFixedCost = 0;
  let generalFixedNet = 0;
  let generalFixedIVA = 0;

  const productMap = {};
  products.forEach((product) => {
    productMap[product.id] = { ...product, cost: 0, net: 0, iva: 0 };
  });

  items.forEach((item) => {
    const raw = window.getQuotationItemUnitNet(item) * (parseFloat(item.quantity) || 0);
    const isFixed = item.calculation_type === 'fixed';
    const docType = window.getQuotationItemDocumentType(item);
    const lineCost = docType === 'boleta' ? raw * 1.19 : raw;
    const lineIVA = docType === 'boleta' ? raw * 0.19 : 0;

    if (item.linked_to === 'general') {
      if (isFixed) {
        generalFixedCost += lineCost;
        generalFixedNet += docType === 'factura' ? raw : 0;
        generalFixedIVA += lineIVA;
      } else {
        generalFixedCost += lineCost * totalQuantity;
        generalFixedNet += docType === 'factura' ? raw * totalQuantity : 0;
        generalFixedIVA += lineIVA * totalQuantity;
      }
      return;
    }

    const product = Object.values(productMap).find((entry) => String(entry.id) === String(item.linked_to));
    if (!product) return;

    if (isFixed) {
      product.cost += lineCost;
      product.net += docType === 'factura' ? raw : 0;
      product.iva += lineIVA;
    } else {
      const productQty = parseFloat(product.quantity) || 0;
      product.cost += lineCost * productQty;
      product.net += docType === 'factura' ? raw * productQty : 0;
      product.iva += lineIVA * productQty;
    }
  });

  const ppmPerc = window.getPpmPercentage(quote);
  let baseCostGlobal = 0;
  let factNetAcc = 0;
  let bolIVAAcc = 0;
  const productCostRows = Object.values(productMap).map((product) => {
    const productQty = parseFloat(product.quantity) || 0;
    const share = totalQuantity > 0 ? (productQty / totalQuantity) : 0;
    const totalCost = product.cost + (generalFixedCost * share);

    baseCostGlobal += totalCost;
    factNetAcc += product.net + (generalFixedNet * share);
    bolIVAAcc += product.iva + (generalFixedIVA * share);

    return {
      ...product,
      totalCost
    };
  });

  const storedPpmAmount = quote?.ppm_amount !== undefined && quote?.ppm_amount !== null
    ? parseFloat(quote.ppm_amount)
    : NaN;
  const hasStoredPpmAmount = Number.isFinite(storedPpmAmount) && storedPpmAmount > 0;
  let ppmAmount = hasStoredPpmAmount
    ? storedPpmAmount
    : window.calculatePpmAmount(baseCostGlobal, utilityPerc, ppmPerc);
  let productSummaries = [];
  let totalPriceNet = 0;

  for (let i = 0; i < 2; i += 1) {
    totalPriceNet = 0;
    productSummaries = productCostRows.map((product) => {
      const productQty = parseFloat(product.quantity) || 0;
      const share = baseCostGlobal > 0
        ? (product.totalCost / baseCostGlobal)
        : (totalQuantity > 0 ? (productQty / totalQuantity) : 0);
      const totalCost = product.totalCost + (ppmAmount * share);
      const unitPriceNet = Math.round((totalCost / (productQty || 1)) * (1 + (utilityPerc / 100)));
      const subtotalNet = unitPriceNet * productQty;

      totalPriceNet += subtotalNet;

      return {
        ...product,
        totalCost,
        unitPriceNet,
        subtotalNet
      };
    });
    if (!hasStoredPpmAmount) {
      ppmAmount = Math.round(totalPriceNet * (ppmPerc / 100));
    }
  }

  totalNetCost = baseCostGlobal + ppmAmount;
  factNetGlobal = factNetAcc;
  bolIVAGlobal = bolIVAAcc;

  const totalIva = Math.round(totalPriceNet * 0.19);
  const totalPriceGross = totalPriceNet + totalIva;

  return {
    products,
    totalQuantity,
    totalNetCost,
    factNetGlobal,
    bolIVAGlobal,
    ppmPerc,
    ppmAmount,
    totalPriceNet,
    totalIva,
    totalPriceGross,
    productSummaries,
    usedStoredRecalculation: true
  };
};

window.getItemProjectTotal = (item) => {
  const lineQty = parseFloat(item.quantity) || 0;
  const unitNet = window.getQuotationItemUnitNet(item);
  const raw = unitNet * lineQty;
  const lineCost = window.getQuotationItemDocumentType(item) === 'boleta' ? raw * 1.19 : raw;
  const isFixed = item.calculation_type === 'fixed';

  if (item.linked_to === 'general') {
    if (isFixed) return Math.round(lineCost);
    const totalQty = window.quotationProducts.reduce((sum, p) => sum + (parseFloat(p.quantity) || 0), 0);
    return Math.round(lineCost * totalQty);
  } else {
    const targetPid = String(item.linked_to);
    const p = window.quotationProducts.find(x => String(x.id) === targetPid);
    if (!p) return isFixed ? Math.round(lineCost) : 0;
    if (isFixed) return Math.round(lineCost);
    const prodQty = parseFloat(p.quantity) || 0;
    return Math.round(lineCost * prodQty);
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
  const externalQuoteId = document.getElementById('quote-external-id').value;
  const purchaseOrderId = document.getElementById('quote-purchase-order').value;

  if (!clientId || !name) return alert('Por favor complete Cliente y Nombre');

  let method = quoteId ? 'PUT' : 'POST';
  let endpoint = quoteId ? `/quotations/${quoteId}` : '/quotations';
  let finalExternalId = externalQuoteId;

  // Lógica de Versionado para Super Admin (Sincronizado con módulo)
  if (quoteId && currentUser.role === 'superadmin' && (window.currentQuotationStatus === 'sent' || window.currentQuotationStatus === 'production')) {
    const createNewVersion = confirm(`Esta cotizacion ya tiene estado "${QUOTE_STATUS_LABELS[window.currentQuotationStatus]}". \n\nDeseas guardarla como una NUEVA VERSION para no sobreescribir la original?`);

    if (createNewVersion) {
      method = 'POST';
      endpoint = '/quotations';

      const baseId = externalQuoteId.split('V')[0];
      const versions = state.quotations
        .map(q => q.external_quote_id || '')
        .filter(id => id.startsWith(baseId))
        .map(id => {
          const match = id.match(/V(\d+)$/);
          return match ? parseInt(match[1]) : 1;
        });
      const nextVer = Math.max(...versions, 1) + 1;
      finalExternalId = `${baseId}V${nextVer}`;
      alert(`Se creará la versión: ${finalExternalId}`);
    }
  }

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
    external_quote_id: finalExternalId,
    purchase_order_id: purchaseOrderId,
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
          total_cost: Math.round(projectTotal),
          price_gross: (it.document_type === 'boleta') ? 1 : 0,
          item_code: it.item_code
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
      btn.textContent = 'Guardar Cotizacion';
      alert('Error: No se pudo guardar la cotización. Podría ser que las imágenes son muy pesadas o hay un problema de conexión.');
    }
  } catch (err) {
    console.error('Save error:', err);
    btn.disabled = false;
    btn.textContent = 'Guardar Cotizacion';
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
        style="position:absolute; top:2px; right:2px; background:rgba(239, 68, 68, 0.8); color:white; border:none; border-radius:50%; width:18px; height:18px; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center">✖</button>
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
    } else if (viewType === 'circuit') {
      const totalEstimatedCost = q.items.reduce((sum, it) => sum + (it.total_cost || 0), 0);
      const totalRealPurchase = (q.related_purchases || []).reduce((sum, p) => sum + (p.total || 0), 0);
      const totalRealSales = (q.related_sales || []).reduce((sum, s) => sum + (s.total || 0), 0);

      const totalProductionCosts = (q.related_productions || []).reduce((sum, pr) => sum + (pr.material_cost || 0) + (pr.general_expenses || 0), 0);

      // Map production quantities by product code
      const producedQtyMap = {};
      (q.related_productions || []).forEach(pr => {
        (pr.items || []).forEach(it => {
          const code = it.product_code?.toLowerCase() || '';
          producedQtyMap[code] = (producedQtyMap[code] || 0) + (it.quantity || 0);
        });
      });

      // Indicadores de IVA y Utilidad Neta solicitados por el usuario
      const totalIvaSales = (q.related_sales || []).reduce((sum, s) => sum + (s.iva || 0), 0);
      const totalIvaPurchases = (q.related_purchases || []).reduce((sum, p) => {
        // Solo IVA recuperable de facturas
        return (p.document_type === 'factura') ? sum + (p.iva || 0) : sum;
      }, 0);
      const ivaDiff = totalIvaSales - totalIvaPurchases;

      const totalNetSales = (q.related_sales || []).reduce((sum, s) => sum + (s.net || 0), 0);
      const totalNetCostPurchases = (q.related_purchases || []).reduce((sum, p) => {
        // Si es boleta, el costo real para el negocio es el TOTAL (no recupera IVA)
        // Si es factura, el costo real es el NETO (el IVA es crédito fiscal)
        return (p.document_type === 'boleta') ? sum + (p.total || 0) : sum + (p.net || 0);
      }, 0);

      const netProfit = totalNetSales - totalNetCostPurchases - totalProductionCosts;
      const balance = totalRealSales - totalRealPurchase - totalProductionCosts;

      tableHtml = `
        <div class="circuit-monitoring animate-fade">
          <div class="grid-3" style="gap: 1.5rem; margin-bottom: 2rem">
            <div class="card" style="border-left: 4px solid var(--secondary)">
              <small style="opacity:0.7">Presupuesto (Costo Estimado)</small>
              <div style="font-size:1.5rem; font-weight:700">$ ${Math.round(totalEstimatedCost).toLocaleString()}</div>
            </div>
            <div class="card" style="border-left: 4px solid var(--accent)">
              <small style="opacity:0.7">Gasto Real (Compras)</small>
              <div style="font-size:1.5rem; font-weight:700">$ ${Math.round(totalRealPurchase).toLocaleString()}</div>
            </div>
            <div class="card" style="border-left: 4px solid var(--success)">
              <small style="opacity:0.7">Ingreso Real (Ventas)</small>
              <div style="font-size:1.5rem; font-weight:700">$ ${Math.round(totalRealSales).toLocaleString()}</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem">
            <div>
              <h4 style="margin-bottom:0.8rem">📦 Compras Asociadas</h4>
              ${(q.related_purchases || []).length === 0 ? '<p style="opacity:0.5; font-size:0.9rem">No hay compras vinculadas.</p>' : `
                <table style="font-size:0.85rem">
                  <thead><tr><th>ID</th><th>Fecha</th><th>Proveedor</th><th style="text-align:right">Total</th></tr></thead>
                  <tbody>
                    ${q.related_purchases.map(p => `
                      <tr>
                        <td>#${p.id}</td>
                        <td>${p.date ? p.date.split('T')[0] : '-'}</td>
                        <td>${state.providers.find(prov => prov.id == p.provider_id)?.name || 'Varios'}</td>
                        <td style="text-align:right">$ ${p.total.toLocaleString()}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="background:rgba(var(--primary-rgb),0.05); font-weight:700; border-top: 1px solid var(--border)">
                      <td colspan="3" style="text-align:right; padding: 0.5rem">TOTAL COMPRAS:</td>
                      <td style="text-align:right; padding: 0.5rem">$ ${Math.round(totalRealPurchase).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              `}
            </div>
            <div>
              <h4 style="margin-bottom:0.8rem">Control de Produccion</h4>
              <table style="font-size:0.85rem">
                <thead><tr><th>Producto</th><th style="text-align:center">Pedido</th><th style="text-align:center">Fabricado</th><th style="text-align:center">Estado</th></tr></thead>
                <tbody>
                  ${(q.products_list || []).map(p => {
        const quoted = p.quantity || 0;
        const code = (p.master_code || p.id)?.toLowerCase() || '';
        const produced = producedQtyMap[code] || 0;
        const diff = quoted - produced;
        let status = '<span style="color:var(--success)">OK</span>';
        if (diff > 0) status = `<span style="color:var(--warning); font-weight:700">${diff} pend.</span>`;

        return `
                      <tr>
                        <td>${p.name || p.id}</td>
                        <td style="text-align:center">${quoted}</td>
                        <td style="text-align:center">${produced}</td>
                        <td style="text-align:center">${status}</td>
                      </tr>
                    `;
      }).join('')}
                </tbody>
              </table>
              ${(q.related_productions || []).length > 0 ? `
                <p style="font-size:0.75rem; margin-top:0.5rem; opacity:0.7">Ordenes: ${q.related_productions.map(pr => '#' + pr.id).join(', ')}</p>
              ` : ''}
            </div>
            <div>
              <h4 style="margin-bottom:0.8rem">💰 Ventas Realizadas</h4>
              ${(q.related_sales || []).length === 0 ? '<p style="opacity:0.5; font-size:0.9rem">No hay ventas vinculadas.</p>' : `
                <table style="font-size:0.85rem">
                  <thead><tr><th>ID</th><th>Fecha</th><th>Cliente</th><th style="text-align:right">Total</th></tr></thead>
                  <tbody>
                    ${q.related_sales.map(s => `
                      <tr>
                        <td>#${s.id}</td>
                        <td>${s.date ? s.date.split('T')[0] : '-'}</td>
                        <td>${state.clients.find(c => c.id == s.clientId)?.name || 'Venta Directa'}</td>
                        <td style="text-align:right">$ ${s.total.toLocaleString()}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="background:rgba(var(--primary-rgb),0.05); font-weight:700; border-top: 1px solid var(--border)">
                      <td colspan="3" style="text-align:right; padding: 0.5rem">TOTAL VENTAS:</td>
                      <td style="text-align:right; padding: 0.5rem">$ ${Math.round(totalRealSales).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              `}
            </div>
          </div>

          <div class="card" style="margin-top:2rem; background:rgba(var(--primary-rgb),0.05); border:1px dashed var(--border)">
            <h4 style="margin-bottom:1rem">Detalle Impositivo y Neto</h4>
            <div class="grid-4" style="gap:1rem">
              <div>
                <small style="opacity:0.7">IVA de Ventas</small>
                <div style="font-weight:700; color:var(--success)">$ ${Math.round(totalIvaSales).toLocaleString()}</div>
              </div>
              <div>
                <small style="opacity:0.7">IVA de Compras (S. Fac)</small>
                <div style="font-weight:700; color:var(--danger)">$ ${Math.round(totalIvaPurchases).toLocaleString()}</div>
              </div>
              <div>
                <small style="opacity:0.7">Diferencia IVA por Pagar</small>
                <div style="font-weight:700; color:${ivaDiff >= 0 ? 'var(--danger)' : 'var(--success)'}">$ ${Math.round(ivaDiff).toLocaleString()}</div>
              </div>
              <div style="background:var(--surface-light); padding:0.5rem; border-radius:8px">
                <small style="opacity:0.7; font-weight:700">Utilidad Neta (Sin IVAs)</small>
                <div style="font-size:1.1rem; font-weight:800; color:${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">$ ${Math.round(netProfit).toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:1.5rem; background: ${balance >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; border: 1px solid ${balance >= 0 ? 'var(--success)' : 'var(--danger)'}">
            <div style="display:flex; justify-content:space-between; align-items:center">
              <div>
                <h4 style="margin:0">Balance del Proyecto (Margen Bruto Real)</h4>
                <p style="font-size:0.85rem; opacity:0.8">Ingresos totales menos gastos reales vinculados (IVA Inc).</p>
              </div>
              <div style="font-size:2rem; font-weight:800; color:${balance >= 0 ? 'var(--success)' : 'var(--danger)'}">
                $ ${Math.round(balance).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Client view: Multi-product table with Item, Detalle, Precio Unit, Cant, Sub Tot
      const storedTotals = window.getStoredQuotationTotals(q);
      const products = storedTotals.products;
      const totalQuoteGross = storedTotals.totalPriceGross;
      const totalQuoteNet = storedTotals.totalPriceNet;
      const totalQuoteIVA = storedTotals.totalIva;
      const totalProjectCost = storedTotals.totalNetCost;
      const productSummaries = {};
      storedTotals.productSummaries.forEach((product) => {
        productSummaries[product.id] = product;
      });

      tableHtml = `
        <div class="client-view-container">
          <style>
            .pvp-table-preview { width: 100%; border-collapse: collapse; background: white; color: black; }
            .pvp-table-preview th, .pvp-table-preview td { border: 1px solid #000 !important; padding: 8px; }
            .pvp-table-preview th { background: #eee !important; color: black !important; }
          </style>
          <table class="pvp-table-preview">
            <thead>
              <tr>
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
            const summary = productSummaries[p.id] || { unitPriceNet: 0, subtotalNet: 0 };
            const unitPriceNet = summary.unitPriceNet || 0;
            const rowSubtotal = summary.subtotalNet || 0;
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
            <button class="tab-btn ${viewType === 'circuit' ? 'active' : ''}" onclick="window.updateViewQuoteType('circuit')" style="border-color: var(--secondary); color: var(--secondary)">📊 Monitoréo de Circuito</button>
          </div>
        </div>

        <div style="margin-bottom:1.5rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem">
          ${(() => {
        const clientInfo = state.clients.find(c => String(c.id) === String(q.client_id)) || q.clients || {};
        const displayRut = q.rut || clientInfo.rut || '-';
        const displayAddress = q.address || clientInfo.address || '-';
        return `
              <div><p><strong>Cliente:</strong> ${clientInfo.name || q.name || 'Varios'}</p></div>
              <div><p><strong>ID Cotización:</strong> <span style="color:var(--secondary); font-weight:700">${q.external_quote_id || '-'}</span></p></div>
              <div><p><strong>RUT:</strong> ${displayRut}</p></div>
              <div><p><strong>Orden Compra (OC):</strong> ${q.purchase_order_id || '-'}</p></div>
              <div><p><strong>Dirección:</strong> ${displayAddress}</p></div>
              <div><p><strong>Fecha Emisión:</strong> ${q.quote_date ? new Date(q.quote_date).toLocaleDateString('es-CL') : '-'}</p></div>
              <div style="grid-column: span 2; background: rgba(var(--primary-rgb), 0.1); padding: 0.5rem; border-radius: 4px; border: 1px dashed var(--primary)">
                <p><strong>Plazo de Entrega:</strong> <span style="font-size: 1.1rem; color: var(--primary); font-weight: 700">${q.delivery_time || "No especificado"}</span></p>
              </div>
            `;
      })()}
        </div>

        <div class="table-container">${tableHtml}</div>

        ${q.images && q.images.length > 0 ? `
          <div style="margin-top: 1.5rem">
            <h4 style="margin-bottom: 0.8rem; color: var(--primary)">Imagenes de Referencia</h4>
            <div style="display: flex; gap: 1rem; flex-wrap: wrap">
              ${q.images.map(img => `<img src="${img}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); background: #000">`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="form-actions" style="margin-top:2rem">
          <button onclick="document.getElementById('${modalId}').style.display='none'">Cerrar</button>
          ${viewType === "client" ? `<button class="btn-primary" onclick="window.printQuotation()">Imprimir / PDF</button>` : ""}
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

  const storedTotals = window.getStoredQuotationTotals(q);
  const products = storedTotals.products;
  const totalQuoteNet = storedTotals.totalPriceNet;
  const totalQuoteIVA = storedTotals.totalIva;
  const totalQuoteGross = storedTotals.totalPriceGross;
  const totalProjectCost = storedTotals.totalNetCost;
  const productSummaries = {};
  storedTotals.productSummaries.forEach((product) => {
    productSummaries[product.id] = product;
  });

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Cotización Ross Confecciones - ${q.id}</title>
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
        
        .bank-details { background: #f9f9f9; padding: 20px; border: 1px dashed #4a7ebb; border-radius: 8px; margin-top: 20px; break-inside: avoid; page-break-inside: avoid; }
        .bank-details p { font-size: 13px; margin-bottom: 3px; }
        
        .page-break { break-before: page; page-break-before: always; display: block; clear: both; height: 0; margin: 0; padding: 0; }
        .page-container { page-break-after: always; break-after: page; }
        .page-container:last-child { page-break-after: auto; break-after: auto; }
        
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="page-container">
      <!-- HOJA 1: COTIZACION -->
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
          <p>COTIZACION: ${q.external_quote_id || quoteDisplayId}</p>
          ${q.purchase_order_id ? `<p>ORDEN DE COMPRA: ${q.purchase_order_id}</p>` : ''}
          <p>Fecha documento: ${q.quote_date ? q.quote_date.split('-').reverse().join('-') : today}</p>
          <p>Página 1 de 3</p>
        </div>
      </div>

      <div class="line-divider"></div>
      
      <h1 class="main-title">COTIZACION</h1>

      <div class="client-info-grid">
        <div class="info-row"><span class="info-label">Señores:</span><span class="info-value">${displayClientName}</span></div>
        <div class="info-row">
          <span class="info-label">RUT:</span><span class="info-value" style="width:200px">${displayRut}</span>
          <span class="info-label">Estado Cotización:</span><span class="info-value">VIGENTE</span>
        </div>
        <div class="info-row"><span class="info-label">Dirección:</span><span class="info-value">${displayAddress}</span></div>
        <div class="info-row"><span class="info-label">Orden de Compra:</span><span class="info-value"><strong>${q.purchase_order_id || '-'}</strong></span></div>
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
    const summary = productSummaries[p.id] || { unitPriceNet: 0, subtotalNet: 0 };
    const unitPrice = summary.unitPriceNet || 0;
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
        <tr><td class="label-cell" style="border: 1.5px solid #000">NETO</td><td style="text-align:right; border: 1.5px solid #000">$ ${Math.round(totalQuoteNet).toLocaleString('es-CL')}</td></tr>
        <tr><td class="label-cell" style="border: 1.5px solid #000">IVA (19%)</td><td style="text-align:right; border: 1.5px solid #000">$ ${Math.round(totalQuoteIVA).toLocaleString('es-CL')}</td></tr>
        <tr style="font-size:18px"><td class="label-cell" style="background:#eee; border: 1.5px solid #000">TOTAL</td><td style="text-align:right; background:#eee; border: 1.5px solid #000">$ ${Math.round(totalQuoteGross).toLocaleString('es-CL')}</td></tr>
      </table>

      </div> <!-- End Hoja 1 -->
      <div class="page-break"></div>
      <div class="page-container">
      <!-- HOJA 2: ESPECIFICACIONES Y CONDICIONES -->
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
          <p>COTIZACION: ${q.external_quote_id || quoteDisplayId}</p>
          ${q.purchase_order_id ? `<p>ORDEN DE COMPRA: ${q.purchase_order_id}</p>` : ''}
          <p>Fecha documento: ${q.quote_date ? q.quote_date.split('-').reverse().join('-') : today}</p>
          <p>Página 2 de 3</p>
        </div>
      </div>
      <div class="line-divider"></div>

      <h2 class="section-title">SERVICIOS INCLUIDOS:</h2>
      <ul style="list-style: none; font-size:14px; margin-left: 20px">
        <li>- Materiales e insumos de alta calidad.</li>
        <li>- Confeccion completa y terminaciones profesionales.</li>
        <li>- Control de calidad unitario.</li>
        <li>- Embalaje y despacho incluido.</li>
      </ul>

      ${q.images && q.images.length > 0 ? `
        <h2 class="section-title">REFERENCIAS VISUALES:</h2>
        <div style="display: flex; gap: 15px; margin-left: 20px; flex-wrap: wrap">
          ${q.images.map(img => `<img src="${img}" style="width: 180px; height: 180px; object-fit: cover; border: 1.5px solid #000; border-radius: 4px">`).join('')}
        </div>
      ` : ''}

      <h2 class="section-title">PLAZO DE ENTREGA:</h2>
      <p style="font-size:14px; margin-left: 20px"><strong>${q.delivery_time || 'Por confirmar'}</strong> a contar de la confirmación de la O.C. y especificaciones.</p>

      <h2 class="section-title">PLAZO DE VALIDEZ DE LA COTIZACION:</h2>
      <p style="font-size:14px; margin-left: 20px">Cotización válida por 30 días.</p>

      </div> <!-- End Hoja 2 -->
      <div class="page-break"></div>
      <div class="page-container">
      <!-- HOJA 3: DATOS BANCARIOS Y GARANTIAS -->
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
          <p>COTIZACION: ${q.external_quote_id || quoteDisplayId}</p>
          ${q.purchase_order_id ? `<p>ORDEN DE COMPRA: ${q.purchase_order_id}</p>` : ''}
          <p>Fecha documento: ${q.quote_date ? q.quote_date.split('-').reverse().join('-') : today}</p>
          <p>Página 3 de 3</p>
        </div>
      </div>
      <div class="line-divider"></div>

      <h2 class="section-title">DATOS BANCARIOS PARA TRANSFERENCIA:</h2>
      <div class="bank-details">
        <p><strong>Nombre:</strong> Rosa Angélica Huentemil Contreras</p>
        <p><strong>RUT:</strong> 13.267.639-9</p>
        <p><strong>Banco:</strong> Banco Estado</p>
        <p><strong>Tipo Cuenta:</strong> Cuenta Rut</p>
        <p><strong>Nº Cuenta:</strong> 13267639</p>
        <p><strong>E-mail:</strong> ross.confecciones@gmail.com</p>
      </div>

      <h2 class="section-title">GARANTIA Y POST-VENTA:</h2>
      <p style="font-size:14px; margin-left: 20px">
        - <strong>Plazo:</strong> 90 dias desde la entrega del producto.<br>
        - <strong>Cobertura:</strong> Defectos de confeccion, fallas de material o medidas fuera de especificacion.<br>
        - <strong>Condicion:</strong> El producto debe devolverse limpio y sin signos de mal uso.
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

      </div> <!-- End Hoja 3 -->
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

async function postData(endpoint, body, refresh = true) {
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
      if (refresh) fetchData(); // Sincronizar stock si se solicita
      return result;
    } else {
      alert('Error: ' + result.error);
      return null;
    }
  } catch (e) {
    alert('Error de conexión');
    return null;
  }
}

function renderView(viewName) {
  const appContainer = document.getElementById('app');
  const mobileBtn = document.getElementById('mobile-menu-btn');

  // Limpiar cualquier residuo de vistas y modales abiertos para evitar blurs persistentes
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  if (viewName === 'login') {
    appContainer.style.display = 'block';
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.main-content').style.marginLeft = '0';
    document.querySelector('.main-content').style.padding = '0';
    if (mobileBtn) mobileBtn.style.display = 'none';
  } else {
    appContainer.style.display = 'flex';
    appContainer.style.width = '100vw';
    appContainer.style.maxWidth = '100vw';
    document.querySelector('.sidebar').style.display = 'flex';
    if (mobileBtn) mobileBtn.style.display = '';  // Let CSS media query handle it

    const mainContent = document.querySelector('.main-content');
    mainContent.style.flex = '1';
    mainContent.style.width = 'auto';
    mainContent.style.maxWidth = 'none';
    mainContent.style.marginLeft = '0'; // Usamos Flexbox, no márgenes manuales

    // --- SISTEMA DE PERMISOS POR ROL ---
    const userRole = currentUser?.role || 'user';

    // Definimos qué puede ver cada uno
    const permissions = {
      superadmin: ['dashboard', 'inventory_products', 'inventory_rm', 'inventory_taking', 'design', 'production', 'sales', 'purchases', 'logistics', 'history', 'reports', 'masters', 'user_management', 'quotations', 'pipeline', 'accounts_management', 'clients_management', 'providers_management', 'payment_machines', 'direct_sales', 'accounting_ledger', 'profile', 'acc_plan_cuentas', 'acc_libro_diario', 'acc_libro_mayor', 'acc_balance_8', 'acc_remuneraciones', 'acc_tesoreria', 'acc_honorarios', 'acc_tributario', 'acc_activo_fijo', 'acc_analisis', 'acc_compras_libro', 'acc_ventas_libro', 'acc_balance_general', 'acc_estado_resultados'],
      admin: ['dashboard', 'inventory_products', 'inventory_rm', 'inventory_taking', 'design', 'production', 'sales', 'purchases', 'logistics', 'history', 'reports', 'masters', 'quotations', 'pipeline', 'accounts_management', 'clients_management', 'providers_management', 'payment_machines', 'direct_sales', 'accounting_ledger', 'profile', 'acc_plan_cuentas', 'acc_libro_diario', 'acc_libro_mayor', 'acc_balance_8', 'acc_remuneraciones', 'acc_tesoreria', 'acc_honorarios', 'acc_tributario', 'acc_activo_fijo', 'acc_analisis', 'acc_compras_libro', 'acc_ventas_libro', 'acc_balance_general', 'acc_estado_resultados'],
      user: ['dashboard', 'inventory_products', 'inventory_rm', 'production', 'sales', 'purchases', 'logistics', 'history', 'quotations', 'pipeline', 'clients_management', 'providers_management', 'direct_sales', 'profile'],
      viewer: ['dashboard', 'reports', 'history', 'profile'] // El "Externo" que solo revisa informes
    };

    let allowedViews = permissions[userRole] || permissions['user'];

    // Remover vistas restringidas para el plan básico
    if (currentUser?.plan_categoria === 'basico') {
      const restrictedViews = ['production', 'quotations', 'reports', 'logistics', 'pipeline', 'acc_plan_cuentas', 'acc_libro_diario', 'acc_libro_mayor', 'acc_balance_8', 'acc_remuneraciones', 'acc_tesoreria', 'acc_honorarios', 'acc_tributario', 'acc_activo_fijo', 'acc_analisis', 'acc_compras_libro', 'acc_ventas_libro', 'acc_balance_general', 'acc_estado_resultados'];
      allowedViews = allowedViews.filter(v => !restrictedViews.includes(v));
    }

    navItems.forEach(item => {
      const view = item.dataset.view;
      if (allowedViews.includes(view)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });

    // Handle group visibility (hide group if all items inside are hidden)
    document.querySelectorAll('.nav-group').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.nav-item'))
        .some(item => item.style.display !== 'none');
      group.style.display = hasVisibleItems ? 'block' : 'none';
    });

    // Si el usuario intenta entrar a una vista no permitida (por link manual o error)
    if (!allowedViews.includes(viewName) && viewName !== 'login') {
      return renderView('dashboard');
    }
  }

  if (!views[viewName]) return;
  mainContent.innerHTML = views[viewName]();

  if (viewName === 'inventory_taking') renderTomaInventario('main-content');

  navItems.forEach(item => {
    const isActive = item.dataset.view === viewName;
    item.classList.toggle('active', isActive);

    // Auto-expand the group of the active item
    if (isActive) {
      const group = item.closest('.nav-group');
      if (group) group.classList.add('open');
    }
  });

  if (typeof window.applyPlanRestrictions === 'function') {
    window.applyPlanRestrictions();
  }

  // --- Branding Dinámico v2.2 ---
  function forceBranding() {
    if (viewName === 'login') return;

    const empresaNombre = currentUser?.empresa_nombre || 'ERP Universal';
    const userDisplay = document.getElementById('display-username');
    const sidebarEmpresa = document.getElementById('sidebar-empresa-name');
    const footerEmpresa = document.getElementById('footer-empresa-name');
    const dashStrong = document.querySelector('.card p strong');

    if (userDisplay && currentUser) userDisplay.textContent = currentUser.username || currentUser.nombre;

    const roleDisplay = document.getElementById('display-user-role');
    if (roleDisplay && currentUser) {
      roleDisplay.textContent = currentUser.role || '-';
      if (currentUser.role === 'superadmin') {
        roleDisplay.style.color = 'var(--accent)';
        roleDisplay.style.fontWeight = '700';
        roleDisplay.textContent = 'Super Admin';
      }
    }

    if (sidebarEmpresa) sidebarEmpresa.textContent = empresaNombre;
    else {
      const logoSpan = document.querySelector('.logo span');
      if (logoSpan) logoSpan.textContent = empresaNombre;
    }

    if (footerEmpresa) footerEmpresa.textContent = empresaNombre;

    if (dashStrong && dashStrong.textContent.includes('Ross')) {
      dashStrong.textContent = empresaNombre;
    }
  }

  if (viewName !== 'login') {
    forceBranding();
    // Bucle de persistencia para asegurar que cargue tras el rendering de módulos
    const brandingInterval = setInterval(forceBranding, 1000);
    setTimeout(() => clearInterval(brandingInterval), 10000);
  }

  if (viewName === 'login') {
    console.log('--- LOGIN VIEW INIT ---');
    const select = document.getElementById('login-empresa');

    // Función de fallback seguro
    const setFallback = () => {
      console.warn('Usando fallback de empresa por defecto');
      const s = document.getElementById('login-empresa');
      if (s) s.innerHTML = '<option value="1">Empresa Principal</option>';
    };

    // Timeout de seguridad: si en 5 segundos no hay respuesta, usar fallback
    const timeoutId = setTimeout(() => {
      const s = document.getElementById('login-empresa');
      if (s && s.value === "") {
        console.warn('Fetch de empresas excedio el tiempo limite, activando fallback.');
        setFallback();
      }
    }, 5000);

    console.log(`Solicitando empresas a: ${API_BASE}/empresas`);
    fetch(`${API_BASE}/empresas`)
      .then(r => {
        console.log(`📥 Respuesta recibida de empresas: status ${r.status}`);
        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
        return r.json();
      })
      .then(empresas => {
        clearTimeout(timeoutId);
        console.log('Empresas cargadas:', empresas);
        const s = document.getElementById('login-empresa');
        if (s && Array.isArray(empresas) && empresas.length > 0) {
          s.innerHTML = empresas.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
        } else {
          setFallback();
        }
      })
      .catch(err => {
        clearTimeout(timeoutId);
        console.error('Error cargando empresas:', err);
        setFallback();
      });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const empresa_id = parseInt(document.getElementById('login-empresa').value);
      const username = document.getElementById('login-user').value;
      const password = document.getElementById('login-pass').value;
      const errorEl = document.getElementById('login-error');

      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, empresa_id })
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
    renderProDashboard(document.getElementById('dashboard-pro-container'), state);

    // Global sync function for the dashboard button
    window.apiSyncOperations = async () => {
      try {
        const count = await sincronizarOperacionesERP(state.history.sales, state.history.purchases);
        alert(`Sincronización exitosa: ${count} nuevos registros contabilizados.`);
        await fetchData();
      } catch (e) {
        console.error(e);
        alert('Error: ' + e.message);
        throw e;
      }
    };
  }

  if (viewName === 'quotations') {
    // Initialization for quotations view
  }

  // Inicialización de Módulos de Contabilidad (Administración y Finanzas)
  if (viewName === 'acc_plan_cuentas') renderPlanCuentas(document.getElementById('accounting-container'));
  if (viewName === 'acc_libro_diario') renderLibroDiario(document.getElementById('accounting-container'));
  if (viewName === 'acc_libro_mayor') renderLibroMayor(document.getElementById('accounting-container'));
  if (viewName === 'acc_balance_8') renderEstadosFinancieros(document.getElementById('accounting-container'));
  if (viewName === 'acc_tesoreria') renderTesoreria(document.getElementById('accounting-container'));
  if (viewName === 'acc_remuneraciones') renderRemuneraciones(document.getElementById('accounting-container'));
  if (viewName === 'acc_honorarios') renderHonorarios(document.getElementById('accounting-container'));
  if (viewName === 'acc_tributario') renderTributario(document.getElementById('accounting-container'));
  if (viewName === 'acc_activo_fijo') renderActivoFijo(document.getElementById('accounting-container'));
  if (viewName === 'acc_analisis') renderAnalisisFinanciero(document.getElementById('accounting-container'));
  if (viewName === 'acc_compras_libro') renderLibroCompras(document.getElementById('accounting-container'));
  if (viewName === 'acc_ventas_libro') renderLibroVentas(document.getElementById('accounting-container'));
  if (viewName === 'acc_balance_general') renderBalanceGeneral(document.getElementById('accounting-container'));
  if (viewName === 'acc_estado_resultados') renderEstadoResultados(document.getElementById('accounting-container'));

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
      const itemHeader = document.getElementById('pur-item-name-header');
      const categoryEl = document.getElementById('pur-category');
      const isEditing = document.getElementById('pur-edit-mode')?.value === 'true';
      const editId = document.getElementById('pur-edit-id')?.value;

      if (!mpContainer || !expenseContainer || !summarySection || !descGroup || !provGroup || !projectGroup) return;

      if (type === 'expense') {
        if (titleEl) titleEl.textContent = isEditing ? `Editar Gasto #${editId}` : 'Informe de Gasto / Caja Chica';
        mpContainer.style.display = 'none';
        expenseContainer.style.display = 'block';
        summarySection.style.display = 'none';
        descGroup.style.display = 'block';
        provGroup.style.display = 'none';
      } else {
        if (titleEl) {
          titleEl.textContent = isEditing
            ? `Editar ${type === 'merchandise' ? 'Compra de Mercadería' : 'Compra de Insumos'} #${editId}`
            : (type === 'merchandise' ? 'Nueva Compra de Mercadería' : 'Nueva Compra de Insumos (Materiales)');
        }
        mpContainer.style.display = 'block';
        expenseContainer.style.display = 'none';
        summarySection.style.display = 'block';
        descGroup.style.display = 'none';
        provGroup.style.display = 'block';
      }

      if (itemHeader) itemHeader.textContent = type === 'merchandise' ? 'Mercadería' : 'Insumo';
      if (categoryEl) {
        if (type === 'merchandise') categoryEl.value = 'comercializacion';
        else if (categoryEl.value === 'comercializacion') categoryEl.value = 'general';
        categoryEl.disabled = type === 'merchandise';
      }
      window.populatePurchaseItemOptions();
    };

    window.togglePurCategory = function () {
      const cat = document.getElementById('pur-category')?.value;
      const projectGroup = document.getElementById('pur-project-group');

      if (projectGroup) {
        if (cat === 'pull') {
          projectGroup.style.display = 'block';
          projectGroup.style.border = '2px solid var(--secondary)';
          projectGroup.style.padding = '0.5rem';
          projectGroup.style.borderRadius = '8px';
          projectGroup.style.background = 'rgba(234, 179, 8, 0.05)';
        } else {
          projectGroup.style.display = 'block';
          projectGroup.style.border = 'none';
          projectGroup.style.padding = '0';
          projectGroup.style.background = 'none';
        }
      }
    };

    document.getElementById('pur-doc-type')?.addEventListener('change', () => {
      if (typeof calculateTotals === 'function') calculateTotals('pur');
    });

    window.openPurchaseModal = function () {
      const modal = document.getElementById('buy-modal');
      if (modal) modal.style.display = 'flex';

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      };

      setVal('pur-edit-mode', 'false');
      setVal('pur-edit-id', '');
      const preferredType = ['merchandise', 'mp', 'expense'].includes(state.purchaseFilters.type)
        ? state.purchaseFilters.type
        : 'mp';
      setVal('pur-type', preferredType);
      setVal('pur-category', 'general');
      setVal('pur-description', '');
      setVal('pur-project', '');
      setVal('pur-expense-total', 0);
      setVal('pur-cost-center', state.costCenters.find(cc => cc.codigo === 'OPER')?.id || '');

      window.togglePurType();
      window.togglePurCategory();
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

    document.getElementById('btn-submit-purchase')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const btn = e.currentTarget;
      const originalText = btn.textContent;

      console.log('[PURCHASE] Botón de guardar presionado');
      try {
        const isEditMode = document.getElementById('pur-edit-mode')?.value === 'true';
        const editId = document.getElementById('pur-edit-id')?.value;
        const type = document.getElementById('pur-type')?.value;
        const date = document.getElementById('pur-date')?.value;
        if (!date) return alert('Debe seleccionar una fecha');

        const totalVal = parseInt(document.getElementById('pur-total')?.value) || (type === 'expense' ? parseInt(document.getElementById('pur-expense-total')?.value) : 0) || 0;
        const provId = document.getElementById('pur-prov')?.value;

        // Disable button to prevent double-click
        btn.disabled = true;
        btn.textContent = 'Procesando...';

        const projectVal = document.getElementById('pur-project')?.value || null;
        const body = {
          type: type,
          purchase_category: document.getElementById('pur-category')?.value || 'general',
          date: date,
          payment_method: document.getElementById('pur-payment-method')?.value,
          account_id: document.getElementById('pur-account')?.value || null,
          document_type: document.getElementById('pur-doc-type')?.value,
          quotation_id: (projectVal && !projectVal.includes('S-')) ? parseInt(projectVal) : null,
          project_ref: (projectVal && projectVal.includes('S-')) ? projectVal : (projectVal || null),
          document_number: document.getElementById('pur-doc-number')?.value || null,
          centro_costo_id: document.getElementById('pur-cost-center')?.value || null,
          auto_pay: document.getElementById('pur-auto-pay')?.checked
        };

        // --- DUPLICATE CHECK ---
        if (!isEditMode && state.history.purchases?.length > 0) {
          const last = state.history.purchases[0];
          const isSameDate = (last.date && last.date.split('T')[0] === date);
          const isSameTotal = (Number(last.total) === totalVal);
          const isSameProvider = (String(last.provider_id) === String(provId));
          const isSameType = (last.type === type);
          const isSameQuotation = (last.quotation_id == body.quotation_id);
          const isSameProjectRef = (last.project_ref == body.project_ref);

          if (isSameDate && isSameTotal && isSameProvider && isSameType && isSameQuotation && isSameProjectRef) {
            if (!confirm('ALERTA DE DUPLICADO: Se detecto una compra identica registrada recientemente (mismo proveedor, fecha, monto y proyecto). Desea registrarla de todos modos?')) {
              btn.disabled = false;
              btn.textContent = originalText;
              return;
            }
          }
        }

        if (type === 'mp' || type === 'merchandise') {
          body.providerId = document.getElementById('pur-prov')?.value;
          body.items = getTableItems('pur');
          body.net = parseInt(document.getElementById('pur-net')?.value) || 0;
          body.iva = parseInt(document.getElementById('pur-iva')?.value) || 0;
          body.total = parseInt(document.getElementById('pur-total')?.value) || 0;

          if (!body.items || body.items.length === 0) {
            btn.disabled = false;
            btn.textContent = originalText;
            if (body.total > 0 && isEditMode) {
              console.warn('[PURCHASE] Editando compra antigua sin ítems.');
            } else {
              return alert('Debe agregar al menos un ítem con cantidad válida');
            }
          }
        } else {
          const totalExp = parseInt(document.getElementById('pur-expense-total')?.value) || 0;
          body.description = document.getElementById('pur-description')?.value;
          body.net = totalExp;
          body.iva = 0;
          body.total = totalExp;

          if (!body.description) {
            btn.disabled = false;
            btn.textContent = originalText;
            return alert('Debe ingresar una descripción para el gasto');
          }
          if (body.total <= 0) {
            btn.disabled = false;
            btn.textContent = originalText;
            return alert('El monto debe ser mayor a cero');
          }
        }

        console.log('[PURCHASE] Enviando body:', body);

        let res;
        if (isEditMode) {
          res = await apiFetch(`/purchases/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          res = await apiFetch('/purchases', { method: 'POST', body: JSON.stringify(body) });
        }

        if (res && res.success) {
          alert(res.message || 'Compra registrada con éxito');
          const modal = document.getElementById('buy-modal');
          if (modal) modal.style.display = 'none';
          fetchData();
        } else {
          alert('No se pudo guardar: ' + (res?.error || 'Error desconocido del servidor'));
        }

      } catch (e) {
        console.error('[PURCHASE] Error fatal:', e);
        alert('Error inesperado: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    window.deletePurchase = async function (id) {
      if (!confirm('¿Seguro que desea eliminar esta compra? Esta acción revertirá el stock de los insumos asociados y eliminará el asiento contable. Esta es una acción permanente.')) return;
      try {
        const res = await apiFetch(`/purchases/${id}`, { method: 'DELETE' });
        if (res && res.success) {
          alert(res.message);
          fetchData();
        } else {
          alert('Error: ' + (res?.error || 'No se pudo eliminar'));
        }
      } catch (e) {
        alert('Error fatal al eliminar: ' + e.message);
      }
    };
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

    // --- SALE PULL LOGIC ---
    window.toggleSaleCategory = function () {
      const cat = document.getElementById('sale-category')?.value;
      const group = document.getElementById('sale-quotation-group');
      if (group) group.style.display = (cat === 'pull' ? 'block' : 'none');
    };

    document.getElementById('sale-quotation').onchange = async (e) => {
      const qId = e.target.value;
      if (!qId) return;
      try {
        const q = await apiFetch(`/quotations/${qId}`);
        if (q && q.items) {
          const rows = document.querySelectorAll('#sale-items-body .item-row');

          // Clear current rows values first
          rows.forEach(row => {
            const codeInput = row.querySelector('.item-code');
            const qtyInput = row.querySelector('.item-qty');
            const priceInput = row.querySelector('.item-price');
            const subInput = row.querySelector('.item-subtotal');
            if (codeInput) codeInput.value = '';
            if (qtyInput) qtyInput.value = 0;
            if (priceInput) priceInput.value = 0;
            if (subInput) subInput.value = 0;
          });

          const sellableItems = q.items.filter(it => it.item_type === 'venta' || it.item_type === 'producto' || !it.item_type);

          sellableItems.forEach((item, idx) => {
            if (rows[idx]) {
              const codeInput = rows[idx].querySelector('.item-code');
              const qtyInput = rows[idx].querySelector('.item-qty');
              const priceInput = rows[idx].querySelector('.item-price');

              if (codeInput) {
                const originalCode = item.item_code || item.description || '';
                const projectCode = `[P-${qId}] ${originalCode}`;
                const existsAsProject = state.products.find(p => p.code === projectCode);
                codeInput.value = existsAsProject ? projectCode : originalCode;
              }
              if (qtyInput) qtyInput.value = item.quantity || 1;
              if (priceInput) priceInput.value = item.unit_price || 0;
            }
          });

          // Set client if possible
          if (q.client_id) {
            const clientSelect = document.getElementById('sale-client');
            if (clientSelect) clientSelect.value = q.client_id;
          }

          calculateTotals('sale');
        }
      } catch (err) {
        console.error('Error pulling quotation into sale:', err);
      }
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
        event_name: document.getElementById('sale-event-name').value || null,
        category: document.getElementById('sale-category')?.value || 'push',
        quotation_id: document.getElementById('sale-quotation')?.value || null,
        document_number: document.getElementById('sale-doc-number')?.value || null,
        document_type: document.getElementById('sale-doc-type')?.value || 'boleta',
        auto_collect: document.getElementById('sale-auto-collect')?.checked
      };

      console.log('[DEBUG] Enviando Venta:', body);
      if (!body.date) return alert('Por favor, ingrese una fecha válida.');
      if (body.items.length === 0) return alert('Debe agregar al menos un ítem');

      const originalSale = isEditMode
        ? state.history.sales.find(s => String(s.id) === String(editId))
        : null;
      const originalQuantities = aggregateSaleItemQuantities(originalSale?.items || []);
      const newQuantities = aggregateSaleItemQuantities(body.items || []);

      // --- STOCK VALIDATION BLOCK ---
      const isSuperAdmin = currentUser?.role === 'superadmin';
      if (!isSuperAdmin) {
        for (const [productCode, newQty] of Object.entries(newQuantities)) {
          const originalQty = originalQuantities[productCode] || 0;
          const requestedQty = newQty - originalQty;
          if (requestedQty <= 0) continue;

          let product = state.products.find(p => p.code?.toLowerCase() === productCode?.toLowerCase());

          // If not found, check if it's a project product [P-XXX]
          if (!product && body.quotation_id) {
            const projectCode = `[P-${body.quotation_id}] ${productCode}`;
            product = state.products.find(p => p.code === projectCode);
          }

          if (product) {
            const currentStock = parseFloat(product.stock) || 0;
            if (currentStock < requestedQty) {
              return alert(`Stock insuficiente para "${product.name}" (${product.code}). \n\nDisponible: ${currentStock} \nSolicitado: ${requestedQty} \n\nDebe producir o comprar mas antes de vender.`);
            }
          } else {
            return alert(`El codigo de producto "${productCode}" no existe en el maestro o no tiene stock registrado.`);
          }
        }
      }

      let res;
      if (isEditMode) {
        res = await putData(`/sales/${editId}`, body, false, false);
      } else {
        res = await postData('/sales', body, false);
      }

      if (res) {
        // Limpiar y cerrar
        const saleModal = document.getElementById('sale-modal');
        if (saleModal) saleModal.style.display = 'none';

        const saleEditMode = document.getElementById('sale-edit-mode');
        if (saleEditMode) saleEditMode.value = 'false';

        const saleEditId = document.getElementById('sale-edit-id');
        if (saleEditId) saleEditId.value = '';

        const saleTitle = document.getElementById('sale-modal-title');
        if (saleTitle) saleTitle.textContent = 'Nueva Venta de Productos';

        const saleBtn = document.getElementById('btn-submit-sale');
        if (saleBtn) saleBtn.textContent = 'Registrar Venta';

        fetchData();
      }
    });
    window.deleteSale = async function (id) {
      if (!confirm('¿Seguro que desea eliminar esta venta? Esta acción revertirá el stock de los productos asociados y eliminará el asiento contable de ingreso. Esta es una acción permanente.')) return;
      try {
        const res = await apiFetch(`/sales/${id}`, { method: 'DELETE' });
        if (res && res.success) {
          alert(res.message);
          fetchData();
        } else {
          alert('Error: ' + (res?.error || 'No se pudo eliminar'));
        }
      } catch (e) {
        alert('Error fatal al eliminar: ' + e.message);
      }
    };
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
    const productCodeInput = document.getElementById('np-code');
    const productNameInput = document.getElementById('np-name');
    if (productCodeInput) {
      productCodeInput.oninput = () => {
        productCodeInput.setCustomValidity('');
        productCodeInput.style.borderColor = '';
      };
    }
    if (productNameInput) {
      productNameInput.onfocus = () => {
        window.validateCatalogCodeField('np-code', 'product', 'np-original-code');
      };
    }

    document.getElementById('new-prod-form').onsubmit = async (e) => {
      e.preventDefault();
      const isEditMode = document.getElementById('np-edit-mode').value === 'true';
      const originalCode = document.getElementById('np-original-code').value;

      if (!window.validateCatalogCodeField('np-code', 'product', 'np-original-code')) return;

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
      document.getElementById('np-code').readOnly = false;
      document.getElementById('np-code').title = '';
      e.target.reset();
      fetchData();
    };
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
    const rawCodeInput = document.getElementById('nrm-code');
    const rawNameInput = document.getElementById('nrm-name');
    if (rawCodeInput) {
      rawCodeInput.oninput = () => {
        rawCodeInput.setCustomValidity('');
        rawCodeInput.style.borderColor = '';
      };
    }
    if (rawNameInput) {
      rawNameInput.onfocus = () => {
        window.validateCatalogCodeField('nrm-code', 'rawMaterial', 'nrm-original-code');
      };
    }

    document.getElementById('new-rm-form').onsubmit = async (e) => {
      e.preventDefault();
      const isEditMode = document.getElementById('nrm-edit-mode').value === 'true';
      const originalCode = document.getElementById('nrm-original-code').value;

      if (!window.validateCatalogCodeField('nrm-code', 'rawMaterial', 'nrm-original-code')) return;

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
        type: document.getElementById('nrm-type').value
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
      document.getElementById('nrm-code').readOnly = false;
      document.getElementById('nrm-code').title = '';
      e.target.reset();
      fetchData();
    };
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




  if (viewName === 'masters') {
    const newMpForm = document.getElementById('new-mp-form');
    if (newMpForm) newMpForm.onsubmit = async (e) => {
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
    };
  }

  if (viewName === 'design') {
    document.querySelectorAll('.recipe-item').forEach(item => {
      item.addEventListener('click', () => showRecipe(item.dataset.pid));
    });
  }

  if (viewName === 'production') {
    window.updateProductionDatalist = function (quote = null) {
      if (!window.formatProductionProductLabel) {
        window.populateProductDropdowns('.prod-item-code');
      }
      const dl = document.getElementById('production-products-list');
      if (!dl) return;

      const quoteOptions = [];
      if (quote) {
        // 1. Items listed as "products" for the client (from your image)
        const productsList = quote.products_list || [];
        productsList.forEach(p => {
          if (p.name) {
            const code = p.code || p.master_code || '';
            const label = window.formatProductionProductLabel(code, p.name);
            quoteOptions.push(`<option value="${label}">CLIENTE VE: ${label} | Cant: ${p.quantity || 1}</option>`);
          }
        });

        // 2. Specific sellable items from internal analysis
        const quoteItems = quote.items || [];
        quoteItems
          .filter(it => it.item_type === 'venta' || it.item_type === 'producto' || !it.item_type)
          .forEach(it => {
            const val = window.formatProductionProductLabel(it.item_code || '', it.description || '');
            if (val) {
              quoteOptions.push(`<option value="${val}">ANALISIS: ${val} | ${it.description || ""}</option>`);
            }
          });
      }

      // Standard products from master
      const standardOptions = getFinishedProducts()
        .slice()
        .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
        .map(p => `<option value="${window.formatProductionProductLabel(p)}">${p.code} | ${p.name || ''}${p.color ? ' (' + p.color + ')' : ''}${p.size ? ' [' + p.size + ']' : ''}</option>`);

      dl.innerHTML = [...new Set(quoteOptions), ...standardOptions].join('');
    };

    // Initial fill
    window.updateProductionDatalist();

    window.toggleProdCategory = async function () {
      const cat = document.getElementById('prod-category')?.value;
      const projectGroup = document.getElementById('prod-project-group');
      const quoteSelect = document.getElementById('prod-quotation');

      if (projectGroup) {
        if (cat === 'pull') {
          projectGroup.style.display = 'block';
          projectGroup.style.border = '2px solid var(--secondary)';
          projectGroup.style.padding = '0.5rem';
          projectGroup.style.borderRadius = '8px';
          projectGroup.style.background = 'rgba(234, 179, 8, 0.05)';

          // Add listener to load quote items
          quoteSelect.onchange = async () => {
            const quoteId = quoteSelect.value;
            if (!quoteId) return;

            try {
              const quote = await apiFetch(`/quotations/${quoteId}`);
              if (quote && quote.items) {
                const rows = document.querySelectorAll('#production-items-body .item-row');
                // Reset all rows
                rows.forEach(r => {
                  r.querySelector('.prod-item-code').value = '';
                  r.querySelector('.prod-item-qty').value = '0';
                  r.querySelector('.prod-item-mp').value = '0';
                  r.querySelector('.prod-item-mo').value = '0';
                });

                // Update datalist for this quote
                if (window.updateProductionDatalist) window.updateProductionDatalist(quote);


                const quoteProductsList = quote.products_list || [];
                
                // Also get sellable items from analysis
                const itemsToProduce = quoteProductsList.length > 0
                  ? quoteProductsList
                  : quote.items.filter(it => it.item_type === 'venta' || it.item_type === 'producto' || !it.item_type);

                // Calculate total labor cost from quotation labor items
                const laborItems = quote.items.filter(it => it.item_type === 'labor' || it.item_type === 'MO' || it.item_type === 'mano_de_obra');
                const totalLaborFromQuote = laborItems.reduce((sum, it) => {
                  return sum + (parseFloat(it.total_cost) || (parseFloat(it.unit_cost || 0) * parseFloat(it.quantity || 1)));
                }, 0);
                
                // Calculate total material cost from quotation material items
                const materialItems = quote.items.filter(it => it.item_type === 'material');
                const totalMaterialFromQuote = materialItems.reduce((sum, it) => {
                  return sum + (parseFloat(it.total_cost) || (parseFloat(it.unit_cost || 0) * parseFloat(it.quantity || 1)));
                }, 0);

                const totalProductQty = itemsToProduce.reduce((sum, it) => sum + (parseFloat(it.quantity) || 1), 0);

                itemsToProduce.forEach((item, idx) => {
                  if (rows[idx]) {
                    const codeSelect = rows[idx].querySelector('.prod-item-code');
                    const qtyInput = rows[idx].querySelector('.prod-item-qty');
                    const mpInput = rows[idx].querySelector('.prod-item-mp');
                    const moInput = rows[idx].querySelector('.prod-item-mo');

                    // Use code if available (new flow), fallback to item_code/name
                    let productCode = item.code || item.item_code || item.description || '';
                    
                    // Smart search: if productCode doesn't match a code, try finding by name
                    if (productCode && !state.products.find(p => p.code === productCode)) {
                      const match = state.products.find(p => 
                        (p.name && p.name.toLowerCase().trim() === productCode.toLowerCase().trim()) ||
                        (p.name && item.description && p.name.toLowerCase().trim() === item.description.toLowerCase().trim())
                      );
                      if (match) productCode = match.code;
                    }
                    
                    codeSelect.value = window.getProductionProductLabel(productCode, item.name || item.description || '');

                    qtyInput.value = item.quantity || 1;

                    // Costs from product master
                    const masterProd = state.products.find(p => p.code === productCode);
                    const unit_cost = masterProd?.cost_unit || item.unit_cost || item.cost_unit || 0;

                    // MO cost: from product master, or distributed from quotation labor items
                    let labor_cost = masterProd?.labor_cost || item.labor_cost || item.mo_cost || 0;
                    if (labor_cost === 0 && totalLaborFromQuote > 0 && totalProductQty > 0) {
                      labor_cost = Math.round(totalLaborFromQuote / totalProductQty);
                    }

                    // MP cost: from product master, or distributed from quotation material items
                    let mp_cost = unit_cost;
                    if (mp_cost === 0 && totalMaterialFromQuote > 0 && totalProductQty > 0) {
                      mp_cost = Math.round(totalMaterialFromQuote / totalProductQty);
                    }

                    mpInput.value = mp_cost;
                    moInput.value = labor_cost;
                  }
                });

                // Store full list for summary
                window.currentProductionItems = quote.items;
                window.updateProdRecipeView();
                window.updateProdTotals();
              }
            } catch (e) {
              console.error('Error loading quote items:', e);
            }
          };
        } else {
          projectGroup.style.display = 'none';
          quoteSelect.onchange = null;
          window.updateProductionDatalist(); // Reset to standard products
        }
      }
    };

    document.getElementById('btn-submit-production').addEventListener('click', async () => {
      const isEditMode = document.getElementById('prod-edit-mode').value === 'true';
      const editId = document.getElementById('prod-edit-id').value;

      const items = [];
      const rows = document.querySelectorAll('#production-items-body .item-row');

      const btn = document.getElementById('btn-submit-production');
      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = 'Procesando...';

      try {
        for (const row of rows) {
          const productInput = row.querySelector('.prod-item-code').value.trim();
          const productCode = window.getProductionProductCode(productInput);
          const quantity = parseFloat(row.querySelector('.prod-item-qty').value);
          const material_cost = parseFloat(row.querySelector('.prod-item-mp').value) || 0;
          const mo_cost = parseFloat(row.querySelector('.prod-item-mo').value) || 0;

          if (productCode && quantity > 0) {
            // Check if product exists in master (by code or by name)
            const merchandiseMatch = getMerchandiseProducts().find(p =>
              (p.code && p.code.toLowerCase().trim() === productCode.toLowerCase()) ||
              (p.name && p.name.toLowerCase().trim() === productCode.toLowerCase())
            );
            if (merchandiseMatch) {
              btn.disabled = false;
              btn.innerHTML = originalText;
              return alert(`"${merchandiseMatch.name}" es una mercadería y no debe pasar por producción.`);
            }

            const exists = window.findProductionProduct(productInput) || getFinishedProducts().find(p =>
              (p.code && p.code.toLowerCase().trim() === productCode.toLowerCase()) ||
              (p.name && p.name.toLowerCase().trim() === productCode.toLowerCase())
            );
            const isFromQuote = window.currentProductionItems && window.currentProductionItems.some(it => 
              (it.item_code && it.item_code.toLowerCase().trim() === productCode.toLowerCase()) || 
              (it.description && it.description.toLowerCase().trim() === productCode.toLowerCase()) ||
              (it.description && it.description.toLowerCase().trim() === productInput.toLowerCase())
            );

            if (!exists && !isFromQuote) {
              btn.disabled = false;
              btn.innerHTML = originalText;
              return alert(`El producto "${productCode}" no existe en el maestro. \n\nPor favor elija un producto existente o use uno de la cotización asociada.`);
            }

            // Automatic registration if not in master but in quote
            if (!exists && isFromQuote) {
              const quoteId = document.getElementById('prod-quotation')?.value;
              const projectCode = `[P-${quoteId}] ${productCode}`;

              // Check if it was already registered with the prefix in this session or previous
              const existsWithPrefix = state.products.find(p => p.code === projectCode);

              if (!existsWithPrefix) {
                console.log('Auto-registering project product:', projectCode);
                await postData('/products', {
                  code: projectCode,
                  name: productCode,
                  type: 'terminado',
                  price_sale: 0,
                  cost_unit: 0
                });
                state.products.push({ code: projectCode, name: productCode, type: 'terminado', stock: 0 });
              }
              // Update the item to use the project code for production record
              items.push({ productCode: projectCode, quantity, mo_cost, material_cost });
            } else {
              items.push({ productCode, quantity, mo_cost, material_cost });
            }
          }
        }

        if (items.length === 0) {
          btn.disabled = false;
          btn.innerHTML = originalText;
          return alert('Debe agregar al menos un ítem');
        }

        const body = {
          date: document.getElementById('prod-date').value,
          items,
          production_category: document.getElementById('prod-category')?.value || 'push',
          quotation_id: document.getElementById('prod-quotation')?.value || null,
          material_cost: parseFloat(document.getElementById('prod-material-cost')?.value || 0),
          general_expenses: parseFloat(document.getElementById('prod-general-expenses')?.value || 0),
          // Labor Management Metadata
          mo_subcontracted: document.getElementById('prod-mo-subcontracted')?.value || 'direct',
          mo_doc_type: document.getElementById('prod-mo-doc-type')?.value || 'none',
          mo_paid: document.getElementById('prod-mo-paid')?.checked || false
        };

        let res;
        if (isEditMode) {
          res = await putData(`/production/${editId}`, body, false, false);
        } else {
          res = await postData('/production', body, false);
        }

        if (res) {
          const mainModal = document.getElementById('production-modal');
          if (mainModal) mainModal.style.display = 'none';

          const editModeInput = document.getElementById('prod-edit-mode');
          if (editModeInput) editModeInput.value = 'false';

          const editIdInput = document.getElementById('prod-edit-id');
          if (editIdInput) editIdInput.value = '';

          const titleEl = document.getElementById('production-modal-title');
          if (titleEl) titleEl.textContent = 'Nueva Orden de Producción';

          const btnTextEl = document.getElementById('btn-prod-text');
          if (btnTextEl) btnTextEl.textContent = 'Iniciar Producción';

          const catSel = document.getElementById('prod-category');
          if (catSel) catSel.value = 'push';

          const projGroup = document.getElementById('prod-project-group');
          if (projGroup) projGroup.style.display = 'none';

          fetchData();
        }
      } catch (err) {
        console.error('Error saving production:', err);
        alert('Error al guardar la producción: ' + err.message);
      } finally {
        const btnFinal = document.getElementById('btn-submit-production');
        if (btnFinal) {
          btnFinal.disabled = false;
          btnFinal.innerHTML = originalText;
        }
      }
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
        role: document.getElementById('user-role').value,
        empresa_id: document.getElementById('user-empresa')?.value || null
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

    // ========== EMPRESA MANAGEMENT (superadmin only) ==========
    if (currentUser?.role === 'superadmin') {
      const loadEmpresas = async () => {
        const empresas = await apiFetch('/empresas/admin');
        const tbody = document.getElementById('empresas-tbody');
        if (!tbody || !Array.isArray(empresas)) return;

        tbody.innerHTML = empresas.map(e => `
          <tr>
            <td>${e.id}</td>
            <td><strong>${e.nombre}</strong></td>
            <td>${e.rut || '-'}</td>
            <td>${e.email || '-'}</td>
            <td><span class="badge ${e.plan_categoria === 'basico' ? 'badge-warning' : 'badge-primary'}" style="background:${e.plan_categoria === 'basico' ? '#f59e0b' : '#3b82f6'}; color:#fff">${e.plan_categoria === 'basico' ? 'Básico' : 'Pro'}</span></td>
            <td><span class="badge ${e.activa ? 'badge-success' : 'badge-danger'}">${e.activa ? 'Activa' : 'Inactiva'}</span></td>
            <td>
              <button class="btn-sm" onclick="window.editEmpresa(${e.id})">📝</button>
              <button class="btn-sm" onclick="window.toggleEmpresa(${e.id}, ${e.activa})" style="background:${e.activa ? 'var(--danger)' : 'var(--success)'}">
                ${e.activa ? 'Desactivar' : 'Activar'}
              </button>
            </td>
          </tr>
        `).join('');
      };
      loadEmpresas();

      window._empresasCache = [];
      apiFetch('/empresas/admin').then(data => { window._empresasCache = data || []; });

      window.openEmpresaModal = function () {
        document.getElementById('empresa-edit-id').value = '';
        document.getElementById('empresa-nombre').value = '';
        document.getElementById('empresa-rut').value = '';
        document.getElementById('empresa-telefono').value = '';
        document.getElementById('empresa-email').value = '';
        document.getElementById('empresa-plan').value = 'completo';
        document.getElementById('empresa-direccion').value = '';
        document.getElementById('empresa-modal-title').textContent = 'Nueva Empresa';
        document.getElementById('empresa-modal').style.display = 'flex';
      };

      window.editEmpresa = function (id) {
        const e = window._empresasCache?.find(x => x.id === id);
        if (!e) return;
        document.getElementById('empresa-edit-id').value = e.id;
        document.getElementById('empresa-nombre').value = e.nombre || '';
        document.getElementById('empresa-rut').value = e.rut || '';
        document.getElementById('empresa-telefono').value = e.telefono || '';
        document.getElementById('empresa-email').value = e.email || '';
        document.getElementById('empresa-plan').value = e.plan_categoria || 'completo';
        document.getElementById('empresa-direccion').value = e.direccion || '';
        document.getElementById('empresa-modal-title').textContent = 'Editar Empresa';
        document.getElementById('empresa-modal').style.display = 'flex';
      };

      window.toggleEmpresa = async function (id, currentlyActive) {
        const action = currentlyActive ? 'desactivar' : 'reactivar';
        if (!confirm(`¿Seguro que deseas ${action} esta empresa?`)) return;

        if (currentlyActive) {
          await apiFetch(`/empresas/${id}`, { method: 'DELETE' });
        } else {
          await apiFetch(`/empresas/${id}`, { method: 'PUT', body: JSON.stringify({ activa: true }) });
        }
        loadEmpresas();
        apiFetch('/empresas/admin').then(data => { window._empresasCache = data || []; });
      };

      document.getElementById('empresa-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('empresa-edit-id').value;
        const body = {
          nombre: document.getElementById('empresa-nombre').value,
          rut: document.getElementById('empresa-rut').value,
          direccion: document.getElementById('empresa-direccion').value,
          telefono: document.getElementById('empresa-telefono').value,
          email: document.getElementById('empresa-email').value,
          plan_categoria: document.getElementById('empresa-plan').value
        };

        let result;
        if (id) {
          result = await apiFetch(`/empresas/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          result = await apiFetch('/empresas', { method: 'POST', body: JSON.stringify(body) });
        }

        if (result && result.success) {
          alert(result.message || 'Empresa guardada exitosamente.');
          document.getElementById('empresa-modal').style.display = 'none';
          loadEmpresas();
          apiFetch('/empresas/admin').then(data => { window._empresasCache = data || []; });
        } else if (result) {
          alert('Error: ' + (result.error || 'Error desconocido'));
        }
      });
    }
  }

  if (viewName === 'payment_machines') {
    window.openMachineModal = function (id = null) {
      document.getElementById('mach-id').value = '';
      document.getElementById('mach-name').value = '';
      document.getElementById('mach-provider').value = '';
      document.getElementById('mach-commission').value = '3.45';
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
            <td>${s.is_iva_exempt ? 'Si' : 'No'}</td>
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
        state.settings = settings || {};
        window.erpSettings = state.settings;
        if (settings.ppm_percentage !== undefined) {
          localStorage.setItem('erp_ppm_percentage', String(settings.ppm_percentage));
        }
        if (settings.ppm_percentage && document.getElementById('ppm-percentage')) {
          document.getElementById('ppm-percentage').value = settings.ppm_percentage;
        }
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
  console.log('Opening Provider Modal...');
  const modal = document.getElementById('prov-modal');
  if (modal) {
    modal.style.display = 'flex';
    modal.style.zIndex = '10000'; // Higher than other modals
    document.getElementById('prov-modal-title').textContent = 'Nuevo Proveedor';
    document.getElementById('prov-id').value = '';
    document.getElementById('prov-form').reset();
  } else {
    console.error('Modal "prov-modal" not found in DOM!');
  }
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

window.saveTaxSettings = async () => {
  const input = document.getElementById('ppm-percentage');
  const ppm = Math.max(0, parseFloat(String(input?.value || '0').replace(',', '.')) || 0);

  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'ppm_percentage', value: String(ppm) })
    }).then(r => r.json());

    if (!res.success) throw new Error(res.error || 'No se pudo guardar PPM');
    state.settings = { ...(state.settings || {}), ppm_percentage: String(ppm) };
    window.erpSettings = state.settings;
    localStorage.setItem('erp_ppm_percentage', String(ppm));
    alert('PPM guardado correctamente.');
  } catch (e) {
    alert('Error al guardar PPM: ' + e.message);
  }
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
    btn.textContent = 'OK';
    setTimeout(() => btn.textContent = 'Set', 2000);
  } else alert('Error al guardar límite');
};

// --- Report Helpers ---
window.showReportTab = function (tabName, btn) {
  document.querySelectorAll('.report-tab').forEach(t => t.style.display = 'none');
  const target = document.getElementById(`report-tab-${tabName}`);
  if (target) target.style.display = 'block';

  if (btn) {
    btn.parentNode.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  if (tabName === 'profitability') {
    window.calculateProfitabilityByProject();
  }
};

window.calculateProfitabilityByProject = function () {
  const tbody = document.getElementById('profitability-report-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem">Calculando rentabilidad...</td></tr>';

  // 1. Initialize Projects based on Quotations
  const projects = {};

  (state.quotations || []).forEach(q => {
    // Consider a project if it has status that implies activity
    projects[q.id] = {
      id: q.id,
      name: q.purchase_order_id ? `OC: ${q.purchase_order_id}` : (q.name || `Cotización #${q.id}`),
      client: q.clients ? q.clients.name : 'Desconocido',
      status: q.status,
      income: 0,
      expenses: 0
    };
  });

  // 2. Process Sales (Income - NETO)
  (state.history.sales || []).forEach(s => {
    const netAmount = s.net || Math.round(s.total / 1.19);
    if (s.quotation_id && projects[s.quotation_id]) {
      projects[s.quotation_id].income += netAmount;
    }
  });

  // 3. Process Purchases (Expenses - NETO)
  (state.history.purchases || []).forEach(p => {
    const netAmount = p.net || Math.round(p.total / 1.19);
    let qId = null;

    if (p.quotation_id) {
      qId = p.quotation_id;
    } else if (p.project_ref && String(p.project_ref).startsWith('S-')) {
      const saleId = String(p.project_ref).replace('S-', '');
      const sale = state.history.sales.find(s => s.id == saleId);
      if (sale && sale.quotation_id) {
        qId = sale.quotation_id;
      }
    }

    if (qId && projects[qId]) {
      projects[qId].expenses += netAmount;
    }
  });

  // 4. Convert to Array, Filter and Sort
  const reportData = Object.values(projects)
    .filter(p => p.income > 0 || p.expenses > 0)
    .map(p => {
      const profit = p.income - p.expenses;
      const margin = p.income > 0 ? (profit / p.income) * 100 : 0;
      return { ...p, profit, margin };
    })
    .sort((a, b) => b.income - a.income);

  // 5. Render
  if (reportData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; opacity: 0.6">No hay datos de proyectos con movimientos financieros.</td></tr>';
    return;
  }

  tbody.innerHTML = reportData.map(p => {
    const statusMap = {
      'draft': 'Borrador',
      'sent': 'Enviada',
      'approved': 'Aprobada',
      'production': 'En Producción',
      'ready': 'Lista',
      'delivered': 'Entregada',
      'rejected': 'Rechazada'
    };

    // Color logic for profit
    const profitColor = p.profit >= 0 ? 'var(--success)' : 'var(--danger)';

    // Color logic for margin
    let marginBadge = 'badge-danger';
    if (p.margin > 30) marginBadge = 'badge-success';
    else if (p.margin > 15) marginBadge = 'badge-warning';

    return `
       <tr>
         <td>
            <div style="font-weight:600">${p.name}</div>
            <div style="font-size:0.75rem; opacity:0.6">ID: ${p.id}</div>
         </td>
         <td>${p.client}</td>
         <td style="text-align:right">$${Math.round(p.income).toLocaleString()}</td>
         <td style="text-align:right">$${Math.round(p.expenses).toLocaleString()}</td>
         <td style="text-align:right; font-weight:bold; color: ${profitColor}">$${Math.round(p.profit).toLocaleString()}</td>
         <td style="text-align:right"><span class="badge ${marginBadge}">${p.margin.toFixed(1)}%</span></td>
         <td><span class="badge status-${p.status}">${statusMap[p.status] || p.status}</span></td>
       </tr>
     `;
  }).join('');
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
      // Usar el valor real (con decimales) si existe, sino el del input
      const price = row.dataset.realPrice ? parseFloat(row.dataset.realPrice) : parseNum(priceInput.value);
      const qty = parseNum(qtyInput.value);
      const subtotal = price * qty;
      subtotalInput.value = Math.round(subtotal);
      calculateTotals(prefix);
    };

    codeSelect.addEventListener('change', () => {
      const option = codeSelect.selectedOptions[0];
      const customNameInput = row.querySelector('.item-custom-name');

      if (prefix === 'pur' && option?.dataset.purchaseType) {
        const selectedPurchaseType = option.dataset.purchaseType;
        const typeSelect = document.getElementById('pur-type');
        const otherSelectedRows = Array.from(body.querySelectorAll('.item-row')).some(otherRow =>
          otherRow !== row && Boolean(otherRow.querySelector('.item-code')?.value)
        );

        if (typeSelect && selectedPurchaseType !== typeSelect.value) {
          if (otherSelectedRows) {
            codeSelect.value = '';
            priceInput.value = 0;
            qtyInput.value = 0;
            delete row.dataset.realPrice;
            alert('Una compra no puede mezclar mercaderias e insumos. Registre cada tipo en una compra separada.');
            calculateRow();
            return;
          }

          typeSelect.value = selectedPurchaseType;
          window.togglePurType?.();
        }
      }

      if (codeSelect.value === '__otros__') {
        // Show custom name input for "Otros"
        if (customNameInput) {
          customNameInput.style.display = 'block';
          customNameInput.focus();
        }
        priceInput.value = 0;
      } else {
        // Hide custom name input
        if (customNameInput) {
          customNameInput.style.display = 'none';
          customNameInput.value = '';
        }
        if (option && option.dataset.price) {
          const realPrice = parseFloat(option.dataset.price) || 0;
          priceInput.value = Math.round(realPrice);
          row.dataset.realPrice = realPrice; // Guardar valor real con decimales
        } else {
          priceInput.value = 0;
          row.dataset.realPrice = 0;
        }
      }
      calculateRow();
    });

    priceInput.addEventListener('input', () => {
      // Si el usuario edita manualmente, el valor ingresado es el nuevo "real"
      row.dataset.realPrice = priceInput.value;
      calculateRow();
    });
    qtyInput.addEventListener('input', calculateRow);
  });
}

window.populatePurchaseItemOptions = function () {
  const merchandise = getMerchandiseProducts().slice().sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  const rawMaterials = state.rawMaterials.slice().sort((a, b) => (a.code || '').localeCompare(b.code || ''));

  const merchandiseOptions = merchandise.map(product => `
    <option value="${product.code}" data-price="${product.cost_unit || 0}" data-purchase-type="merchandise">${product.code} | ${product.name || ''}</option>
  `).join('');
  const rawMaterialOptions = rawMaterials.map(material => `
    <option value="${material.code}" data-price="${(material.cost_net || 0) / (material.batch_size || 1)}" data-purchase-type="mp">${material.code} | ${material.name || ''}</option>
  `).join('');
  const options = `
    <optgroup label="Mercaderias (reventa)">${merchandiseOptions}</optgroup>
    <optgroup label="Insumos y materias primas">${rawMaterialOptions}</optgroup>
  `;

  document.querySelectorAll('#pur-items-body .item-row').forEach(row => {
    const select = row.querySelector('.item-code');
    if (!select) return;
    const previousValue = select.value;
    select.innerHTML = `
      <option value="">Seleccione...</option>
      ${options}
      <option value="__otros__" data-purchase-type="mp">+ Otros (escribir nombre)</option>
    `;
    select.value = previousValue;
    if (previousValue && !select.value) {
      row.querySelector('.item-price').value = 0;
      row.querySelector('.item-qty').value = 0;
      row.querySelector('.item-subtotal').value = 0;
      delete row.dataset.realPrice;
    }
  });
  calculateTotals('pur');
};

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

    // 4. Calculate Machine Commission (Default 3.45% if not specified)
    if (paymentMethod === 'machine') {
      let commPercent = 3.45;
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
    const docType = document.getElementById('pur-doc-type')?.value;
    if (docType === 'boleta' || docType === 'n/a') {
      iva = 0;
    } else {
      iva = Math.round(net * 0.19);
    }
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
  if (!body) {
    console.error(`[getTableItems] No se encontró el elemento: ${prefix}-items-body`);
    return [];
  }
  const rows = body.querySelectorAll('.item-row');
  const items = [];

  const parseNum = (val) => parseFloat(String(val).replace(',', '.')) || 0;

  rows.forEach(row => {
    const codeEl = row.querySelector('.item-code');
    const priceEl = row.querySelector('.item-price');
    const qtyEl = row.querySelector('.item-qty');
    const subtotalEl = row.querySelector('.item-subtotal');

    if (!codeEl || !priceEl || !qtyEl || !subtotalEl) return;

    const code = codeEl.value;
    const price = parseNum(priceEl.value);
    const qty = parseNum(qtyEl.value);
    const subtotal = parseNum(subtotalEl.value);
    const customNameInput = row.querySelector('.item-custom-name');
    const customName = customNameInput ? customNameInput.value.trim() : '';

    if (code && qty > 0) {
      if (prefix === 'sale') {
        items.push({ productCode: code, quantity: qty, unitPrice: price, subtotal });
      } else {
        const purchaseType = document.getElementById('pur-type')?.value;
        const item = purchaseType === 'merchandise'
          ? { productCode: code, quantity: qty, unitPrice: price, subtotal }
          : { mpCode: code, quantity: qty, unitPrice: price, subtotal };
        if (code === '__otros__' && customName) {
          item.customName = customName;
        }
        items.push(item);
      }
    }
  });

  return items;
}

function aggregateSaleItemQuantities(items = []) {
  return (items || []).reduce((acc, item) => {
    const code = String(item?.productCode || item?.product_code || '').trim();
    if (!code) return acc;
    acc[code] = (acc[code] || 0) + (parseFloat(item.quantity) || 0);
    return acc;
  }, {});
}

async function putData(endpoint, body, silent = false, refresh = true) {
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
        if (refresh) fetchData();
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
    return result;
  } catch (error) {
    alert('Error al eliminar datos');
    return null;
  }
}

// Export Functions
window.exportProducts = function () {
  const isMerchandise = state.productCatalogFilter === 'merchandise';
  const catalog = isMerchandise ? getMerchandiseProducts() : getFinishedProducts();
  const formatted = formatProductsForExport(catalog);
  exportToExcel(formatted, isMerchandise ? 'Inventario_Mercaderias' : 'Inventario_Productos_Terminados', isMerchandise ? 'Mercaderías' : 'Productos Terminados');
  alert(`${isMerchandise ? 'Mercaderías' : 'Productos terminados'} exportados a Excel exitosamente`);
};

window.exportRawMaterials = function () {
  const formatted = formatMaterialsForExport(state.rawMaterials);
  exportToExcel(formatted, 'Inventario_Insumos', 'Insumos');
  alert('Insumos exportados a Excel exitosamente');
};

window.exportSales = function () {
  const formatted = formatSalesForExport(state.history.sales);
  exportToExcel(formatted, 'Historial_Ventas', 'Ventas');
  alert('Ventas exportadas a Excel exitosamente');
};

window.exportPurchases = function () {
  const formatted = formatPurchasesForExport(state.history.purchases);
  exportToExcel(formatted, 'Historial_Compras', 'Compras');
  alert('Compras exportadas a Excel exitosamente');
};

window.exportLedger = function () {
  let filtered = [...state.ledger];
  if (state.ledgerFilter.type !== 'all') {
    if (state.ledgerFilter.type === 'venta') {
      filtered = filtered.filter(e => e.entry_type.startsWith('venta'));
    } else if (state.ledgerFilter.type === 'compra') {
      filtered = filtered.filter(e => e.entry_type.startsWith('compra'));
    } else {
      filtered = filtered.filter(e => e.entry_type === state.ledgerFilter.type);
    }
  }
  filtered.sort((a, b) => {
    return state.ledgerFilter.order === 'asc'
      ? new Date(a.date) - new Date(b.date)
      : new Date(b.date) - new Date(a.date);
  });

  const enriched = filtered.map(e => {
    let projName = null;

    if (e.entry_type.startsWith('venta')) {
      // Find sale
      const sale = state.history.sales.find(s => s.id == e.document_number);
      if (sale && sale.quotation_id) {
        const q = state.quotations.find(q => q.id == sale.quotation_id);
        if (q) {
          projName = q.purchase_order_id ? `OC: ${q.purchase_order_id}` : (q.name || `Cotización #${q.id}`);
        } else {
          projName = `Cotización #${sale.quotation_id}`;
        }
      }
    } else if (e.entry_type.startsWith('compra')) {
      // Find purchase
      const pur = state.history.purchases.find(p => p.id == e.document_number);
      if (pur) {
        if (pur.project_ref && String(pur.project_ref).startsWith('S-')) {
          const saleId = String(pur.project_ref).replace('S-', '');
          // Try to find the sale to see if it has a quotation with OC
          const relatedSale = state.history.sales.find(s => s.id == saleId);
          if (relatedSale && relatedSale.quotation_id) {
            const q = state.quotations.find(q => q.id == relatedSale.quotation_id);
            if (q) {
              projName = q.purchase_order_id ? `OC: ${q.purchase_order_id}` : (q.name || `Cotización #${q.id}`);
            } else {
              projName = `Venta #${saleId}`;
            }
          } else {
            projName = `Venta #${saleId}`;
          }
        } else if (pur.quotation_id) {
          const q = state.quotations.find(q => q.id == pur.quotation_id);
          if (q) {
            projName = q.purchase_order_id ? `OC: ${q.purchase_order_id}` : (q.name || `Cotización #${q.id}`);
          } else {
            projName = `Cotización #${pur.quotation_id}`;
          }
        }
      }
    }
    return { ...e, project_name: projName };
  });

  const formatted = formatLedgerForExport(enriched);
  exportToExcel(formatted, 'Libro_Diario', 'Libro Diario');
  alert('Libro Diario exportado a Excel exitosamente');
};


window.exportProduction = function () {
  const formatted = formatProductionForExport(state.history.production);
  exportToExcel(formatted, 'Historial_Produccion', 'Producción');
  alert('Produccion exportada a Excel exitosamente');
};

navItems.forEach(item => item.addEventListener('click', () => {
  renderView(item.dataset.view);
  // On mobile, close sidebar after selecting
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (window.innerWidth <= 768 && sidebar) {
    sidebar.classList.remove('mobile-open');
    overlay?.classList.remove('active');
  }
}));

// ============================================
//  SIDEBAR RESPONSIVE LOGIC
// ============================================

// 1. Nav-group collapsible headers
document.querySelectorAll('.nav-group-header').forEach(header => {
  header.addEventListener('click', () => {
    const group = header.parentElement;
    group.classList.toggle('open');
  });
});

// 2. Set tooltip data attributes for collapsed mode
function initSideBarTooltips() {
  // Select both headers and items
  document.querySelectorAll('.sidebar .nav-item, .sidebar .nav-group-header').forEach(item => {
    // Try to find the specific text span
    const textElement = item.querySelector('.sidebar-text');
    let text = "";

    if (textElement) {
      text = textElement.textContent.trim();
    } else {
      // Fallback: clone and remove script/svg to get pure text
      const clone = item.cloneNode(true);
      clone.querySelectorAll('svg, i, .chevron').forEach(el => el.remove());
      text = clone.textContent.trim();
    }

    if (text && text.length > 0) {
      item.setAttribute('data-tooltip', text);
    }
  });
}

initSideBarTooltips();
setTimeout(initSideBarTooltips, 500);
setTimeout(initSideBarTooltips, 2000);

// 3. Desktop collapse toggle
const collapseBtn = document.getElementById('sidebar-collapse-btn');
const sidebar = document.getElementById('main-sidebar');

if (collapseBtn && sidebar) {
  // Restore previous state
  const savedCollapsed = localStorage.getItem('erp_sidebar_collapsed');
  if (savedCollapsed === 'true') {
    sidebar.classList.add('collapsed');
  }

  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('erp_sidebar_collapsed', sidebar.classList.contains('collapsed'));
  });

  // Double-click on collapsed sidebar to expand
  sidebar.addEventListener('dblclick', (e) => {
    if (sidebar.classList.contains('collapsed') && window.innerWidth > 768) {
      sidebar.classList.remove('collapsed');
      localStorage.setItem('erp_sidebar_collapsed', 'false');
    }
  });
}

// 4. Mobile hamburger toggle
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');

if (mobileMenuBtn && sidebar) {
  mobileMenuBtn.addEventListener('click', () => {
    const isOpen = sidebar.classList.contains('mobile-open');
    if (isOpen) {
      sidebar.classList.remove('mobile-open');
      sidebarOverlay?.classList.remove('active');
    } else {
      sidebar.classList.add('mobile-open');
      sidebarOverlay?.classList.add('active');
    }
  });
}

// 5. Close mobile sidebar when tapping overlay
if (sidebarOverlay && sidebar) {
  sidebarOverlay.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
    sidebarOverlay.classList.remove('active');
  });
}

// 6. Handle resize: clean up mobile classes when going to desktop
window.addEventListener('resize', () => {
  if (window.innerWidth > 768 && sidebar) {
    sidebar.classList.remove('mobile-open');
    sidebarOverlay?.classList.remove('active');
  }
});

function logout() {
  token = null;
  localStorage.removeItem('erp_token');
  localStorage.removeItem('erp_user');
  renderView('login');
}

document.getElementById('btn-logout')?.addEventListener('click', logout);

// --- Logistics Functions ---
window.setLogisticsTab = (tab) => {
  window.currentLogisticsTab = tab;
  renderView('logistics');
};

window.initializeQuotations();

window.openLogisticsModal = async (type, id, transaction_type) => {
  const modal = document.getElementById('logistics-modal');
  const title = document.getElementById('log-modal-title');
  const entityLabel = document.getElementById('log-entity-label');
  const itemsBody = document.getElementById('log-items-body');
  const submitBtn = document.getElementById('btn-submit-logistics');

  title.innerText = type === 'inbound' ? 'Registrar Recepcion de Mercaderia' : 'Registrar Despacho a Cliente';
  entityLabel.innerText = type === 'inbound' ? 'Proveedor' : 'Cliente';
  submitBtn.innerText = type === 'inbound' ? 'Confirmar Recepcion' : 'Confirmar Despacho';

  // Clear modal attributes
  modal.dataset.type = type;
  modal.dataset.transaction_type = transaction_type;
  modal.dataset.transaction_id = id;

  // Reset form
  document.getElementById('log-carrier').value = '';
  document.getElementById('log-tracking').value = '';
  document.getElementById('log-eta').value = '';
  document.getElementById('log-cost-transport').value = '0';
  document.getElementById('log-cost-handling').value = '0';
  document.getElementById('log-obs').value = '';

  itemsBody.innerHTML = '<tr><td colspan="4" style="text-align:center">Cargando ítems...</td></tr>';
  modal.style.display = 'flex';

  // Get transaction details for items and entity
  let endpoint = transaction_type === 'compra' ? `/purchases/${id}` : (transaction_type === 'venta' ? `/sales/${id}` : `/production/${id}`);
  const details = await apiFetch(endpoint);

  if (details) {
    document.getElementById('log-entity-name').value = details.proveedores?.name || details.clientela?.name || details.project_name || 'Varios';

    // Save items in the modal for submission
    window.currentLogItems = details.items.map(it => ({
      item_code: it.product_code || it.mp_code,
      quantity: it.quantity
    }));

    itemsBody.innerHTML = details.items.map((it, idx) => `
      <tr>
        <td style="text-align:center; color:var(--text-muted)">${idx + 1}</td>
        <td><code>${it.product_code || it.mp_code}</code></td>
        <td>${it.product_name || it.mp_name || 'Item'}</td>
        <td style="text-align:center"><strong>${it.quantity}</strong></td>
      </tr>
    `).join('');
  }
};

document.getElementById('btn-submit-logistics')?.addEventListener('click', async () => {
  const modal = document.getElementById('logistics-modal');
  const body = {
    type: modal.dataset.type,
    transaction_type: modal.dataset.transaction_type,
    transaction_id: modal.dataset.transaction_id,
    entity_name: document.getElementById('log-entity-name').value,
    carrier_name: document.getElementById('log-carrier').value,
    tracking_id: document.getElementById('log-tracking').value,
    estimated_arrival: document.getElementById('log-eta').value,
    transport_cost: parseFloat(document.getElementById('log-cost-transport').value) || 0,
    handling_cost: parseFloat(document.getElementById('log-cost-handling').value) || 0,
    observations: document.getElementById('log-obs').value,
    items: window.currentLogItems || []
  };

  if (!body.carrier_name) {
    alert('Por favor ingrese el transportista');
    return;
  }

  const res = await postData('/logistics', body);
  if (res.success) {
    modal.style.display = 'none';
    fetchData();
  }
});

fetchData();

// Initialize Plan de Cuentas for accounting modules
initPlanCuentas(PLAN_CUENTAS_DEFAULT).then(() => {
  console.log('Plan de Cuentas inicializado correctamente');
}).catch(err => {
  console.warn('Plan de Cuentas no inicializado:', err.message);
});
// --- Provider Helpers ---
window.refreshProviders = async () => {
  const provs = await apiFetch('/providers');
  state.providers = Array.isArray(provs) ? provs : [];
  window.populateProviderDropdowns();
};

window.populateProviderDropdowns = () => {
  const selects = document.querySelectorAll('#pur-prov');
  selects.forEach(select => {
    const currentVal = select.value;
    select.innerHTML = `
      <option value="">Sin Proveedor / Boleta</option>
      ${state.providers.map(p => `
        <option value="${p.id}">${p.name}</option>
      `).join('')}
    `;
    select.value = currentVal;
  });
};

// --- Global Listeners ---
document.addEventListener('submit', async (e) => {
  if (e.target && e.target.id === 'prov-form') {
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

    const res = id ? await putData(`/providers/${id}`, body) : await postData('/providers', body);
    if (res && res.success) {
      document.getElementById('prov-modal').style.display = 'none';
      await window.refreshProviders();

      // If we were in providers_management view, we need full refresh
      if (document.querySelector('.nav-item.active')?.dataset.view === 'providers_management') {
        fetchData();
      }
    }
  }
});
// Borrar si existía (limpieza de turnos previos si falló)
window.bulkPromoteQuotes = async () => {
  if (!confirm('¿Estás seguro de sincronizar todas las cotizaciones históricas? \n\nEsta acción buscará todas las cotizaciones en "Producción" que no han sido promocionadas y creará automáticamente sus productos, insumos y recetas en el catálogo.')) return;

  const btn = event.target;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Procesando...';

  try {
    const data = await apiFetch('/admin/bulk-promote-quotes', { method: 'POST' });
    if (data && data.success) {
      alert(data.message);
      window.filterQuoteStatus('production'); // Refrescar vista
    } else if (data) {
      alert('Error: ' + (data.error || 'Operación fallida'));
    } else {
      alert('Sesión expirada o error de red. Por favor inicia sesión de nuevo.');
    }
  } catch (e) {
    console.error('Bulk Promote Error:', e);
    alert('Error de conexión');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};

// Fase 2: Vincular Ventas y Producciones antiguas con los nuevos códigos CO
window.syncHistoryItems = async () => {
  if (!confirm('¿Deseas vincular las Ventas y Producciones antiguas con los nuevos códigos CO?\n\nEsto permitirá que al "Recalcular Stock" el inventario se actualice correctamente para esos productos.')) return;

  const btn = event.target;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Vinculando...';

  try {
    const data = await apiFetch('/admin/sync-history-items-to-master', { method: 'POST' });
    if (data && data.success) {
      alert(data.message + '\\n\\nIMPORTANTE: Ahora ve a Productos o Insumos y corre el botón "Recalcular Stock" para finalizar la auditoría.');
    } else if (data) {
      alert('Error: ' + (data.error || 'Operación fallida'));
    }
  } catch (e) {
    console.error('Sync History Items Error:', e);
    alert('Error de conexión');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};

// Exponer funciones y estado al ámbito global para compatibilidad con módulos legacy
window.apiFetch = apiFetch;
window.fetchData = fetchData;
window.renderView = renderView;
window.state = state;
window.currentUser = currentUser;


window.updatePurchaseFilters = (field, value) => {
  state.purchaseFilters[field] = value;
  const container = document.getElementById('purchases-history-content');
  if (container) {
    container.innerHTML = renderHistoryTable('purchases');
  }
};
