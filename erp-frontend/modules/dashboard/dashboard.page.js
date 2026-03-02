/* ============================================
   DASHBOARD — Resumen Ejecutivo (Supabase)
   ============================================ */

import { db } from '../../services/datastore.js';
import { getBalanceGeneral, getEstadoResultados, getResumenIVA } from '../../services/contabilidad.service.js';
import { formatCLP } from '../../utils/formatters.js';
import { MESES } from '../../utils/constants.js';

export async function renderDashboard(container) {
  const now = new Date();
  const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mesActual = MESES[now.getMonth()];

  // Loading state
  container.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;height:300px;flex-direction:column;gap:var(--space-md);">
      <div class="skeleton" style="width:60px;height:60px;border-radius:50%;"></div>
      <p style="color:var(--text-muted);">Cargando datos financieros desde Supabase...</p>
    </div>
  `;

  // Fetch real data from Supabase
  const [balance, resultado, iva, asientos, compras, ventas] = await Promise.all([
    getBalanceGeneral(),
    getEstadoResultados(),
    getResumenIVA(periodo),
    db.getAll('asientos'),
    db.getAll('libro_compras'),
    db.getAll('libro_ventas')
  ]);

  container.innerHTML = `
    <div class="dashboard">
      <!-- Stat Cards -->
      <div class="grid-4 animate-fade-in" style="margin-bottom: var(--space-2xl);">
        <div class="stat-card">
          <div class="stat-icon blue"><i class="fas fa-wallet"></i></div>
          <div class="stat-value">${formatCLP(balance.totalActivos)}</div>
          <div class="stat-label">Total Activos</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple"><i class="fas fa-chart-line"></i></div>
          <div class="stat-value">${formatCLP(resultado.totalIngresos)}</div>
          <div class="stat-label">Ingresos del Período</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon ${resultado.utilidadNeta >= 0 ? 'green' : 'red'}">
            <i class="fas ${resultado.utilidadNeta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
          </div>
          <div class="stat-value">${formatCLP(resultado.utilidadNeta)}</div>
          <div class="stat-label">Utilidad / Pérdida Neta</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon ${iva.ivaPorPagar >= 0 ? 'yellow' : 'green'}">
            <i class="fas fa-receipt"></i>
          </div>
          <div class="stat-value">${formatCLP(Math.abs(iva.ivaPorPagar))}</div>
          <div class="stat-label">IVA ${iva.ivaPorPagar >= 0 ? 'por Pagar' : 'a Favor'} (${mesActual})</div>
        </div>
      </div>

      <!-- Info Row -->
      <div class="grid-3 animate-fade-in" style="margin-bottom: var(--space-2xl); animation-delay: 0.1s;">
        <div class="card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-book" style="color:var(--accent-primary);margin-right:8px;"></i>Actividad Contable</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr; gap:var(--space-base);">
            <div>
              <div style="font-size:var(--font-size-2xl);font-weight:var(--font-weight-bold);font-family:var(--font-mono);">${asientos.length}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Asientos totales</div>
            </div>
            <div>
              <div style="font-size:var(--font-size-2xl);font-weight:var(--font-weight-bold);font-family:var(--font-mono);">${asientos.filter(a => a.fecha.startsWith(periodo)).length}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Este mes</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-shopping-cart" style="color:var(--status-warning);margin-right:8px;"></i>Compras (${mesActual})</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr; gap:var(--space-base);">
            <div>
              <div style="font-size:var(--font-size-2xl);font-weight:var(--font-weight-bold);font-family:var(--font-mono);">${iva.cantidadCompras}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Documentos</div>
            </div>
            <div>
              <div style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);font-family:var(--font-mono);">${formatCLP(iva.totalComprasNeto)}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Neto</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-cash-register" style="color:var(--status-success);margin-right:8px;"></i>Ventas (${mesActual})</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr; gap:var(--space-base);">
            <div>
              <div style="font-size:var(--font-size-2xl);font-weight:var(--font-weight-bold);font-family:var(--font-mono);">${iva.cantidadVentas}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Documentos</div>
            </div>
            <div>
              <div style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);font-family:var(--font-mono);">${formatCLP(iva.totalVentasNeto)}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Neto</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Balance Check -->
      <div class="grid-2 animate-fade-in" style="animation-delay: 0.2s;">
        <div class="card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-scale-balanced" style="color:var(--accent-secondary);margin-right:8px;"></i>Ecuación Contable</span>
            <span class="badge ${balance.cuadra ? 'badge-success' : 'badge-error'}">
              <i class="fas ${balance.cuadra ? 'fa-check' : 'fa-times'}"></i>
              ${balance.cuadra ? 'Cuadrado' : 'Descuadrado'}
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-lg);flex-wrap:wrap;">
            <div style="text-align:center;">
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Activos</div>
              <div style="font-family:var(--font-mono);font-weight:var(--font-weight-bold);font-size:var(--font-size-lg);">${formatCLP(balance.totalActivos)}</div>
            </div>
            <div style="font-size:var(--font-size-xl);color:var(--text-muted);">=</div>
            <div style="text-align:center;">
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Pasivos</div>
              <div style="font-family:var(--font-mono);font-weight:var(--font-weight-bold);font-size:var(--font-size-lg);">${formatCLP(balance.totalPasivos)}</div>
            </div>
            <div style="font-size:var(--font-size-xl);color:var(--text-muted);">+</div>
            <div style="text-align:center;">
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Patrimonio</div>
              <div style="font-family:var(--font-mono);font-weight:var(--font-weight-bold);font-size:var(--font-size-lg);">${formatCLP(balance.totalPatrimonio)}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-file-invoice-dollar" style="color:var(--status-warning);margin-right:8px;"></i>Resumen IVA — ${mesActual}</span>
          </div>
          <div style="display:grid; gap:var(--space-sm);">
            <div style="display:flex;justify-content:space-between;padding:var(--space-xs) 0;">
              <span style="color:var(--text-secondary);font-size:var(--font-size-sm);">Débito Fiscal (ventas)</span>
              <span class="cell-mono" style="font-size:var(--font-size-sm);">${formatCLP(iva.debitoFiscal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:var(--space-xs) 0;">
              <span style="color:var(--text-secondary);font-size:var(--font-size-sm);">Crédito Fiscal (compras)</span>
              <span class="cell-mono" style="font-size:var(--font-size-sm);">- ${formatCLP(iva.creditoFiscal)}</span>
            </div>
            <div style="border-top:1px solid var(--border-primary);margin:var(--space-xs) 0;"></div>
            <div style="display:flex;justify-content:space-between;padding:var(--space-xs) 0;">
              <span style="font-weight:var(--font-weight-bold);">IVA ${iva.ivaPorPagar >= 0 ? 'a Pagar' : 'a Favor'}</span>
              <span class="cell-mono ${iva.ivaPorPagar >= 0 ? 'cell-negative' : 'cell-positive'}" style="font-size:var(--font-size-md);font-weight:var(--font-weight-bold);">
                ${formatCLP(Math.abs(iva.ivaPorPagar))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
