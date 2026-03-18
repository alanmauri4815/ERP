/* ============================================
   DASHBOARD — Panel de Control Dual (Operacional & Financiero)
   ============================================ */

import { db } from '../../services/datastore.js';
import { getBalanceGeneral, getEstadoResultados, getResumenIVA } from '../../services/contabilidad.service.js';
import { erpFetch } from '../../services/erp-api.js';
import Chart from 'chart.js/auto';
import { formatCLP, formatNumber } from '../../utils/formatters.js';
import { MESES } from '../../utils/constants.js';
import { getSelectedPeriodo } from '../../components/ui-helpers.js';
import { getIndicadoresHoy } from '../../services/indicadores.service.js';

export async function renderDashboard(container, state) {
  const { mes, string: periodo } = getSelectedPeriodo();
  const mesActual = MESES[mes - 1];

  // Loading state
  container.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;height:400px;flex-direction:column;gap:1.5rem;">
      <div class="spinner"></div>
      <p style="color:var(--text-muted);font-size:0.9rem;">Cargando Panel de Control Dual...</p>
    </div>
  `;

  // Fetch data in parallel
  const [balance, resultado, iva, asientos, rawPurchases, rawSales, indicadores] = await Promise.all([
    getBalanceGeneral(periodo),
    getEstadoResultados(periodo),
    getResumenIVA(periodo),
    db.getAll('asientos'),
    erpFetch('/purchases'),
    erpFetch('/sales'),
    getIndicadoresHoy()
  ]);

  const purchases = Array.isArray(rawPurchases) ? rawPurchases : [];
  const sales = Array.isArray(rawSales) ? rawSales : [];

  // Actualizar el estado global para asegurar que la sincronización tenga datos
  state.history.sales = sales;
  state.history.purchases = purchases;

  // Calcular CxC y CxP Pendientes
  const cxCPending = sales.reduce((s, v) => s + (parseFloat(v.total) - parseFloat(v.paid_amount || 0)), 0);
  const cxPPending = purchases.reduce((s, c) => s + (parseFloat(c.total) - parseFloat(c.paid_amount || 0)), 0);

  const user = JSON.parse(localStorage.getItem('erp_user') || '{}');
  const empresaNombre = user.empresa_nombre || 'ContaChile';

  container.innerHTML = `
    <div class="dashboard animate-fade" style="width: 100%; max-width: 100%;">
      <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2rem; background: var(--surface); padding: 1.5rem 2rem; border-radius: 16px; border: 1px solid var(--border); box-shadow: var(--shadow); width: 100%;">
        <div style="flex: 1; min-width: 0;">
          <h1 style="margin:0; font-size:2rem; font-weight:800; display:flex; align-items:center; gap:12px; white-space: nowrap;">
            <i class="fas fa-gauge-high" style="color:var(--primary);"></i> Panel de Control
          </h1>
          <p style="color:var(--text-muted); font-size:0.9rem; margin-top:4px; font-weight:500;">Gestión operativa y financiera de ${empresaNombre}</p>
        </div>

        <div style="display:flex; gap:1.5rem; align-items:center;">
           <!-- Periodo Badge -->
           <div style="background:var(--surface-light); padding:10px 20px; border-radius:12px; border:1px solid var(--border); display:flex; gap:12px; align-items:center; white-space: nowrap;">
              <i class="fas fa-calendar-alt" style="color:var(--secondary);"></i>
              <span style="font-weight:800; font-size:1rem; letter-spacing:0.5px;">${mesActual.toUpperCase()} ${new Date().getFullYear()}</span>
           </div>

           <!-- Indicadores Badges -->
           <div style="display:flex; gap:10px;">
              <div style="background:var(--surface-light); padding:10px 15px; border-radius:12px; border:1px solid var(--border); font-size:0.9rem; display:flex; align-items:center; gap:8px;">
                <span style="color:var(--text-muted); font-weight:700;">UF:</span>
                <span style="font-family:'JetBrains Mono', monospace; font-weight:700; color: var(--primary);">$${formatNumber(indicadores?.uf, 2)}</span>
              </div>
              <div style="background:var(--surface-light); padding:10px 15px; border-radius:12px; border:1px solid var(--border); font-size:0.9rem; display:flex; align-items:center; gap:8px;">
                <span style="color:var(--text-muted); font-weight:700;">UTM:</span>
                <span style="font-family:'JetBrains Mono', monospace; font-weight:700; color: var(--secondary);">$${formatNumber(indicadores?.utm, 0)}</span>
              </div>
              <div style="background:var(--surface-light); padding:10px 15px; border-radius:12px; border:1px solid var(--border); font-size:0.9rem; display:flex; align-items:center; gap:8px;">
                <span style="color:var(--text-muted); font-weight:700;">USD:</span>
                <span style="font-family:'JetBrains Mono', monospace; font-weight:700; color: var(--accent);">$${formatNumber(indicadores?.dolar, 2)}</span>
              </div>
           </div>
        </div>
      </header>

      <!-- Dashboard Tabs -->
      <div class="tabs-container" style="margin-bottom: 2rem;">
        <div class="tabs-header" style="display:flex; gap:1rem; border-bottom:1px solid var(--border); padding-bottom:10px;">
          <button class="tab-btn active" data-tab="operacional">
            <i class="fas fa-microchip" style="margin-right:8px;"></i> Resumen Operacional
          </button>
          <button class="tab-btn" data-tab="financiero">
            <i class="fas fa-vault" style="margin-right:8px;"></i> Resumen Financiero
          </button>
        </div>
      </div>

      <!-- Tab Content: OPERACIONAL -->
      <div id="tab-operacional" class="tab-pane active">
        <div class="stats-grid" style="margin-bottom: 2rem;">
          <div class="card stat-card">
            <div class="label">Ingresos Totales (Ventas)</div>
            <div class="value">${formatCLP(state.stats.totalRevenue || 0)}</div>
            <div class="trend up">Operativo</div>
          </div>
          <div class="card stat-card">
            <div class="label">Ventas Realizadas</div>
            <div class="value">${state.stats.totalSales || 0}</div>
            <div class="trend up">Docs</div>
          </div>
          <div class="card stat-card">
            <div class="label">Producción Total</div>
            <div class="value">${state.stats.totalProduction || 0}</div>
            <div class="trend up">Unidades</div>
          </div>
          <div class="card stat-card">
            <div class="label">Stock Crítico MP</div>
            <div class="value" style="color: var(--danger)">${state.stats.lowStockItems || 0} Items</div>
            <div class="trend down">Alerta</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <h2>Ventas Últimos 7 Días</h2>
            <canvas id="salesChart" style="max-height: 300px;"></canvas>
          </div>
          <div class="card">
            <h2>Acciones Rápidas</h2>
            <div style="display: grid; gap: 1rem; margin-top: 1rem;">
              <button class="btn btn-secondary" onclick="window.renderView('sales')">Nueva Venta</button>
              <button class="btn btn-primary" onclick="window.renderView('production')">Iniciar Producción</button>
              <button class="btn btn-accent" onclick="window.renderView('purchases')">Registrar Compra</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab Content: FINANCIERO -->
      <div id="tab-financiero" class="tab-pane" style="display:none">
        <div class="grid-4" style="margin-bottom: 2rem; gap: 1.25rem;">
          ${renderStatCard('Total Activos', formatCLP(balance.totalActivos), 'blue', 'fa-wallet')}
          ${renderStatCard('Resultado Neta', formatCLP(resultado.utilidadNeta), resultado.utilidadNeta >= 0 ? 'green' : 'red', resultado.utilidadNeta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down')}
          ${renderStatCard(`IVA ${iva.ivaPorPagar >= 0 ? 'a Pagar' : 'a Favor'}`, formatCLP(Math.abs(iva.ivaPorPagar)), 'yellow', 'fa-receipt')}
          ${renderStatCard('Patrimonio Neto', formatCLP(balance.totalPatrimonio), 'purple', 'fa-scale-unbalanced-flip')}
        </div>

        <div class="grid-2" style="margin-bottom: 2rem; gap: 1.5rem;">
          <div class="card" style="border-left: 5px solid var(--secondary); padding: 1.5rem; position:relative;">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:1rem;">
              <i class="fas fa-hand-holding-dollar" style="color:var(--secondary); font-size:1.5rem;"></i>
              <h4 style="margin:0; font-size:1rem; opacity:0.8;">Cuentas por Cobrar (Clientes)</h4>
            </div>
            <div style="font-size:2.5rem; font-weight:800; color:var(--secondary); font-family:'JetBrains Mono', monospace; letter-spacing:-1px;">${formatCLP(cxCPending)}</div>
          </div>

          <div class="card" style="border-left: 5px solid var(--danger); padding: 1.5rem; position:relative;">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:1rem;">
              <i class="fas fa-file-invoice-dollar" style="color:var(--danger); font-size:1.5rem;"></i>
              <h4 style="margin:0; font-size:1rem; opacity:0.8;">Cuentas por Pagar (Proveedores)</h4>
            </div>
            <div style="font-size:2.5rem; font-weight:800; color:var(--danger); font-family:'JetBrains Mono', monospace; letter-spacing:-1px;">${formatCLP(cxPPending)}</div>
          </div>
        </div>

        <div class="grid-2" style="gap:1.5rem;">
          <div class="card">
            <h3 style="margin-bottom:1.5rem; font-size:1.1rem;"><i class="fas fa-balance-scale" style="color:var(--primary);"></i> Ecuación Contable</h3>
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-light); padding:1.5rem; border-radius:12px; border:1px solid var(--border);">
              <div style="text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; font-weight:700;">Activos</div>
                <div style="font-family:'JetBrains Mono', monospace; font-weight:800; font-size:1.25rem; color:var(--text);">${formatCLP(balance.totalActivos)}</div>
              </div>
              <div style="font-size:2rem; opacity:0.2;">=</div>
              <div style="text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; font-weight:700;">Pasivos + Pat.</div>
                <div style="font-family:'JetBrains Mono', monospace; font-weight:800; font-size:1.25rem; color:var(--text);">${formatCLP(balance.totalPasivos + balance.totalPatrimonio)}</div>
              </div>
              <div class="badge ${balance.cuadra ? 'badge-success' : 'badge-error'}" style="padding: 6px 12px; font-size:0.8rem;">
                ${balance.cuadra ? 'Equilibrado' : 'Descuadrado'}
              </div>
            </div>
          </div>

          <div class="card">
             <h3 style="margin-bottom:1.25rem; font-size:1.1rem;"><i class="fas fa-book" style="color:var(--secondary);"></i> Actividad Contable</h3>
             <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                <div style="background:var(--surface-light); padding:1rem; border-radius:10px; border:1px solid var(--border);">
                   <div style="font-size:2rem; font-weight:800; font-family:'JetBrains Mono', monospace; color:var(--primary);">${asientos.length}</div>
                   <div style="font-size:0.75rem; opacity:0.6; font-weight:600;">Asientos Totales</div>
                </div>
                <div style="background:var(--surface-light); padding:1rem; border-radius:10px; border:1px solid var(--border);">
                   <div style="font-size:2rem; font-weight:800; font-family:'JetBrains Mono', monospace; color:var(--secondary);">${asientos.filter(a => a.fecha.startsWith(periodo)).length}</div>
                   <div style="font-size:0.75rem; opacity:0.6; font-weight:600;">Generados este mes</div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // --- Handlers & Chart ---

  // Tab Switching Logic
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.tab;
      container.querySelector('#tab-operacional').style.display = target === 'operacional' ? 'block' : 'none';
      container.querySelector('#tab-financiero').style.display = target === 'financiero' ? 'block' : 'none';

      if (target === 'operacional') {
        // Re-init chart if needed
        initDashboardChart(state.stats.weeklySales);
      }
    };
  });

  // Init Chart (default tab)
  if (state.stats.weeklySales && state.stats.weeklySales.length > 0) {
    setTimeout(() => initDashboardChart(state.stats.weeklySales), 100);
  }


}

function renderStatCard(label, value, color, icon) {
  const colors = {
    blue: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
    purple: { bg: 'rgba(139,92,246,0.1)', text: '#8b5cf6' },
    yellow: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
    green: { bg: 'rgba(16,185,129,0.1)', text: '#10b981' },
    red: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444' }
  };
  const c = colors[color] || colors.blue;

  return `
    <div class="card stat-card" style="padding: 1.25rem;">
      <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
        <div style="width:38px; height:38px; border-radius:10px; background:${c.bg}; color:${c.text}; display:flex; align-items:center; justify-content:center;">
          <i class="fas ${icon}"></i>
        </div>
      </div>
      <div style="font-size:1.5rem; font-weight:800; font-family:'JetBrains Mono', monospace; color:${color === 'red' ? 'var(--danger)' : 'inherit'}">${value}</div>
      <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600; margin-top:2px;">${label}</div>
    </div>
  `;
}

function initDashboardChart(data) {
  const ctx = document.getElementById('salesChart');
  if (!ctx) return;

  // Destroy previous if exists (Chart.js limitation)
  const existingChart = Chart.getChart(ctx);
  if (existingChart) existingChart.destroy();

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
