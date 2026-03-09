/* ============================================
   DASHBOARD — Panel de Control Integral (ERP + Contabilidad)
   ============================================ */

import { db } from '../../services/datastore.js';
import { getBalanceGeneral, getEstadoResultados, getResumenIVA } from '../../services/contabilidad.service.js';
import { erpFetch } from '../../services/erp-api.js';
import Chart from 'chart.js/auto';
import { formatCLP } from '../../utils/formatters.js';
import { MESES } from '../../utils/constants.js';
import { getSelectedPeriodo } from '../../components/ui-helpers.js';

export async function renderDashboard(container, state) {
  const { mes, string: periodo } = getSelectedPeriodo();
  const mesActual = MESES[mes - 1];

  // Loading state
  container.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;height:400px;flex-direction:column;gap:1.5rem;">
      <div class="spinner"></div>
      <p style="color:var(--text-muted);font-size:0.9rem;">Sincronizando el Panel de Control Integral...</p>
    </div>
  `;

  // Fetch real data in parallel
  const [balance, resultado, iva, asientos, rawPurchases, rawSales] = await Promise.all([
    getBalanceGeneral(periodo),
    getEstadoResultados(periodo),
    getResumenIVA(periodo),
    db.getAll('asientos'),
    erpFetch('/purchases'),
    erpFetch('/sales')
  ]);

  const purchases = Array.isArray(rawPurchases) ? rawPurchases : [];
  const sales = Array.isArray(rawSales) ? rawSales : [];

  // Calcular CxC y CxP Pendientes
  const cxCPending = sales.reduce((s, v) => s + (parseFloat(v.total) - parseFloat(v.paid_amount || 0)), 0);
  const cxPPending = purchases.reduce((s, c) => s + (parseFloat(c.total) - parseFloat(c.paid_amount || 0)), 0);

  container.innerHTML = `
    <div class="dashboard animate-fade">
      <header style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 2rem;">
        <div>
          <h1 style="margin:0; font-size:1.75rem; font-weight:800;">Panel de Control Integral</h1>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">Resumen ejecutivo operativo y financiero — ${mesActual} ${new Date().getFullYear()}</p>
        </div>
        <div style="display:flex; gap:0.5rem;">
           <button class="btn btn-secondary btn-sm" id="btn-sync-dashboard">
             <i class="fas fa-sync"></i> Sincronizar Operaciones
           </button>
        </div>
      </header>

      <!-- Row 1: KPIs Financieros (SC Legacy) -->
      <div class="grid-4" style="margin-bottom: 2rem; gap: 1.25rem;">
        ${renderStatCard('Total Activos', formatCLP(balance.totalActivos), 'blue', 'fa-wallet')}
        ${renderStatCard('Ingresos Período', formatCLP(resultado.totalIngresos), 'purple', 'fa-money-bill-trend-up')}
        <div class="card stat-card" style="padding: 1.25rem; border-top: 3px solid ${resultado.utilidadNeta >= 0 ? '#10b981' : '#ef4444'};">
          <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
            <div style="width:38px; height:38px; border-radius:10px; background:${resultado.utilidadNeta >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${resultado.utilidadNeta >= 0 ? '#10b981' : '#ef4444'}; display:flex; align-items:center; justify-content:center;">
              <i class="fas ${resultado.utilidadNeta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
            </div>
          </div>
          <div style="font-size:1.5rem; font-weight:800; font-family:monospace; color:${resultado.utilidadNeta >= 0 ? '#10b981' : '#ef4444'};">${formatCLP(resultado.utilidadNeta)}</div>
          <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600; margin-top:2px;">Resultado Netó</div>
        </div>
        ${renderStatCard(`IVA ${iva.ivaPorPagar >= 0 ? 'por Pagar' : 'a Favor'}`, formatCLP(Math.abs(iva.ivaPorPagar)), 'yellow', 'fa-receipt')}
      </div>

      <!-- Row 2: Tesorería & Dash Operativo (Mixture) -->
      <div class="grid-2" style="margin-bottom: 2rem; gap: 1.5rem;">
        <div class="card">
           <h3 style="margin-bottom:1.5rem; font-size:1rem;"><i class="fas fa-chart-line" style="color:var(--accent); margin-right:8px;"></i>Tendencia de Ventas (7 Días)</h3>
           <canvas id="salesChart" style="max-height: 250px;"></canvas>
        </div>

        <div style="display:grid; grid-template-rows: 1fr 1fr; gap:1.5rem;">
          <div class="card" style="border-left: 5px solid #10b981; padding: 1.25rem;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:0.5rem;">
              <i class="fas fa-arrow-down" style="color:#10b981;"></i>
              <span style="font-size:0.8rem; font-weight:600; color:var(--text-muted);">Por Cobrar (CxC)</span>
            </div>
            <div style="font-size:1.75rem; font-weight:800; font-family:monospace; color:#10b981;">${formatCLP(cxCPending)}</div>
          </div>
          <div class="card" style="border-left: 5px solid #ef4444; padding: 1.25rem;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:0.5rem;">
              <i class="fas fa-arrow-up" style="color:#ef4444;"></i>
              <span style="font-size:0.8rem; font-weight:600; color:var(--text-muted);">Por Pagar (CxP)</span>
            </div>
            <div style="font-size:1.75rem; font-weight:800; font-family:monospace; color:#ef4444;">${formatCLP(cxPPending)}</div>
          </div>
        </div>
      </div>

      <!-- Row 3: Actividad Operativa ERP -->
      <div class="grid-4" style="margin-bottom: 2rem; gap: 1rem;">
        <div class="card">
          <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Ventas Canales</div>
          <div style="font-size:1.5rem; font-weight:700; margin-top:5px;">${state.stats.totalSales}</div>
          <div style="font-size:0.7rem; color:#10b981; margin-top:5px;">+${Math.round(state.stats.totalSales * 0.1)} este mes</div>
        </div>
        <div class="card">
          <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Producción Tot.</div>
          <div style="font-size:1.5rem; font-weight:700; margin-top:5px;">${state.stats.totalProduction}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-top:10px;">Stock Crítico</div>
          <div style="font-size:1.1rem; font-weight:700; color:#ef4444;">${state.stats.lowStockItems} Items</div>
        </div>
        <div class="card">
          <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Asientos Contables</div>
          <div style="font-size:1.5rem; font-weight:700; margin-top:5px;">${asientos.length}</div>
          <div style="font-size:0.7rem; color:var(--accent); margin-top:5px;">Sincronizado</div>
        </div>
        <div class="card">
           <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">IVA Neto</div>
           <div style="font-size:1.5rem; font-weight:700; margin-top:5px; color:${iva.ivaPorPagar >= 0 ? '#ef4444' : '#10b981'}">${formatCLP(Math.abs(iva.ivaPorPagar))}</div>
           <p style="font-size:0.65rem; margin-top:10px; opacity:0.6;">Dato basado en Libro Compras/Ventas</p>
        </div>
      </div>

      <!-- Row 4: Salud Financiera & Acciones -->
      <div class="grid-2" style="gap: 1.5rem;">
        <div class="card">
           <h3 style="margin-bottom:1rem; font-size:1rem;"><i class="fas fa-scale-balanced" style="color:var(--secondary);"></i> Ecuación Contable</h3>
           <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:1rem; border-radius:10px;">
              <div style="text-align:center;">
                <div style="font-size:0.65rem; color:var(--text-muted);">Activos</div>
                <div style="font-weight:700; font-family:monospace;">${formatCLP(balance.totalActivos)}</div>
              </div>
              <div style="opacity:0.3;">=</div>
              <div style="text-align:center;">
                <div style="font-size:0.65rem; color:var(--text-muted);">Pasivos + Pat.</div>
                <div style="font-weight:700; font-family:monospace;">${formatCLP(balance.totalPasivos + balance.totalPatrimonio)}</div>
              </div>
              <div class="badge ${balance.cuadra ? 'badge-success' : 'badge-error'}">
                ${balance.cuadra ? 'Cuadrado' : 'Descuadrado'}
              </div>
           </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:1rem; font-size:1rem;"><i class="fas fa-rocket" style="color:var(--accent);"></i> Accesos Rápidos</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
            <button class="btn btn-primary" onclick="window.renderView('inventory_products')">Gestión Inventario</button>
            <button class="btn btn-secondary" onclick="window.renderView('sales')">Nueva Venta</button>
            <button class="btn btn-ghost" onclick="window.renderView('acc_libro_diario')">Libro Diario</button>
            <button class="btn btn-ghost" onclick="window.renderView('acc_analisis')">Análisis Avanzado</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Initialize Sales Chart
  if (state.stats.weeklySales && state.stats.weeklySales.length > 0) {
    setTimeout(() => initDashboardChart(state.stats.weeklySales), 100);
  }

  // Event Listeners
  const btnSync = container.querySelector('#btn-sync-dashboard');
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      btnSync.disabled = true;
      btnSync.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
      try {
        await window.apiSyncOperations(); // This should be defined globally or in main.js
      } catch (e) {
        console.error(e);
      } finally {
        btnSync.disabled = false;
        btnSync.innerHTML = '<i class="fas fa-sync"></i> Sincronizar Operaciones';
      }
    });
  }
}

function renderStatCard(label, value, color, icon) {
  const colors = {
    blue: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
    purple: { bg: 'rgba(139,92,246,0.1)', text: '#8b5cf6' },
    yellow: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
    green: { bg: 'rgba(16,185,129,0.1)', text: '#10b981' }
  };
  const c = colors[color] || colors.blue;

  return `
    <div class="card stat-card" style="padding: 1.25rem;">
      <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
        <div style="width:38px; height:38px; border-radius:10px; background:${c.bg}; color:${c.text}; display:flex; align-items:center; justify-content:center;">
          <i class="fas ${icon}"></i>
        </div>
      </div>
      <div style="font-size:1.5rem; font-weight:800; font-family:monospace;">${value}</div>
      <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600; margin-top:2px;">${label}</div>
    </div>
  `;
}

function initDashboardChart(data) {
  const ctx = document.getElementById('salesChart');
  if (!ctx) return;

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
