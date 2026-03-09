/* ============================================
   DASHBOARD — Resumen Ejecutivo (Sincronizado ERP)
   ============================================ */

import { db } from '../../services/datastore.js';
import { getBalanceGeneral, getEstadoResultados, getResumenIVA } from '../../services/contabilidad.service.js';
import { erpFetch } from '../../services/erp-api.js';
import { formatCLP } from '../../utils/formatters.js';
import { MESES } from '../../utils/constants.js';
import { getSelectedPeriodo } from '../../components/ui-helpers.js';

export async function renderDashboard(container) {
  const { mes, string: periodo } = getSelectedPeriodo();
  const mesActual = MESES[mes - 1];

  // Loading state
  container.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;height:350px;flex-direction:column;gap:1.5rem;">
      <div class="spinner"></div>
      <p style="color:var(--text-muted);font-size:0.9rem;">Sincronizando datos con el ecosistema ERP...</p>
    </div>
  `;

  // Fetch data in parallel for speed
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
      <!-- Row 1: Principales KPIs Contables -->
      <div class="grid-4" style="margin-bottom: 2rem; gap: 1.5rem;">
        <div class="card stat-card" style="padding: 1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 1rem;">
            <div style="width:42px; height:42px; border-radius:12px; background:rgba(96,165,250,0.1); color:#3b82f6; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
              <i class="fas fa-wallet"></i>
            </div>
          </div>
          <div style="font-size:1.8rem; font-weight:800; font-family:monospace;">${formatCLP(balance.totalActivos)}</div>
          <div style="font-size:0.85rem; color:var(--text-muted); font-weight:600; margin-top:2px;">Total Activos</div>
        </div>

        <div class="card stat-card" style="padding: 1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 1rem;">
            <div style="width:42px; height:42px; border-radius:12px; background:rgba(139,92,246,0.1); color:#8b5cf6; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
              <i class="fas fa-money-bill-trend-up"></i>
            </div>
          </div>
          <div style="font-size:1.8rem; font-weight:800; font-family:monospace;">${formatCLP(resultado.totalIngresos)}</div>
          <div style="font-size:0.85rem; color:var(--text-muted); font-weight:600; margin-top:2px;">Ingresos Totales</div>
        </div>

        <div class="card stat-card" style="padding: 1.5rem; border-top: 3px solid ${resultado.utilidadNeta >= 0 ? '#10b981' : '#ef4444'};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 1rem;">
            <div style="width:42px; height:42px; border-radius:12px; background:${resultado.utilidadNeta >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${resultado.utilidadNeta >= 0 ? '#10b981' : '#ef4444'}; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
              <i class="fas ${resultado.utilidadNeta >= 0 ? 'fa-chart-area' : 'fa-chart-pie'}"></i>
            </div>
            <span style="font-size:0.75rem; font-weight:700; color:${resultado.utilidadNeta >= 0 ? '#10b981' : '#ef4444'}; background:rgba(255,255,255,0.03); padding:2px 8px; border-radius:4px;">
              ${resultado.utilidadNeta >= 0 ? 'Utilidad' : 'Pérdida'}
            </span>
          </div>
          <div style="font-size:1.8rem; font-weight:800; font-family:monospace; color:${resultado.utilidadNeta >= 0 ? '#10b981' : '#ef4444'};">${formatCLP(resultado.utilidadNeta)}</div>
          <div style="font-size:0.85rem; color:var(--text-muted); font-weight:600; margin-top:2px;">Resultado del Ejercicio</div>
        </div>

        <div class="card stat-card" style="padding: 1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 1rem;">
            <div style="width:42px; height:42px; border-radius:12px; background:rgba(245,158,11,0.1); color:#f59e0b; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
              <i class="fas fa-file-invoice"></i>
            </div>
          </div>
          <div style="font-size:1.8rem; font-weight:800; font-family:monospace;">${formatCLP(Math.abs(iva.ivaPorPagar))}</div>
          <div style="font-size:0.85rem; color:var(--text-muted); font-weight:600; margin-top:2px;">IVA ${iva.ivaPorPagar >= 0 ? 'por Pagar' : 'a Favor'} (${mesActual})</div>
        </div>
      </div>

      <!-- Row 2: Tesorería Pendiente (CxC y CxP) -->
      <div class="grid-2" style="margin-bottom: 2rem; gap: 1.5rem;">
        <div class="card" style="padding: 1.5rem; border-left: 5px solid #10b981; position:relative; overflow:hidden;">
          <div style="position:absolute; right:-20px; bottom:-20px; font-size:6rem; opacity:0.03; color:#10b981;">
             <i class="fas fa-arrow-down-long"></i>
          </div>
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:1rem;">
            <div style="width:36px; height:36px; border-radius:50%; background:rgba(16,185,129,0.1); color:#10b981; display:flex; align-items:center; justify-content:center;">
              <i class="fas fa-hand-holding-dollar"></i>
            </div>
            <h4 style="margin:0; font-size:0.9rem; color:var(--text-muted);">Cuentas por Cobrar (Clientes)</h4>
          </div>
          <div style="font-size:2.25rem; font-weight:800; color:#10b981; font-family:monospace;">${formatCLP(cxCPending)}</div>
          <div style="font-size:0.75rem; margin-top:8px; opacity:0.6;"><i class="fas fa-info-circle"></i> Saldo pendiente de ${sales.filter(s => parseFloat(s.total) > parseFloat(s.paid_amount || 0)).length} facturas emitidas.</div>
        </div>

        <div class="card" style="padding: 1.5rem; border-left: 5px solid #ef4444; position:relative; overflow:hidden;">
          <div style="position:absolute; right:-20px; bottom:-20px; font-size:6rem; opacity:0.03; color:#ef4444;">
             <i class="fas fa-arrow-up-long"></i>
          </div>
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:1rem;">
            <div style="width:36px; height:36px; border-radius:50%; background:rgba(239,68,68,0.1); color:#ef4444; display:flex; align-items:center; justify-content:center;">
              <i class="fas fa-file-invoice-dollar"></i>
            </div>
            <h4 style="margin:0; font-size:0.9rem; color:var(--text-muted);">Cuentas por Pagar (Proveedores)</h4>
          </div>
          <div style="font-size:2.25rem; font-weight:800; color:#ef4444; font-family:monospace;">${formatCLP(cxPPending)}</div>
          <div style="font-size:0.75rem; margin-top:8px; opacity:0.6;"><i class="fas fa-info-circle"></i> Obligaciones pendientes de ${purchases.filter(p => parseFloat(p.total) > parseFloat(p.paid_amount || 0)).length} compras registradas.</div>
        </div>
      </div>

      <!-- Row 3: Actividad y Libros -->
      <div class="grid-3" style="margin-bottom: 2rem; gap: 1.5rem;">
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h4 style="margin:0; font-size:0.9rem;"><i class="fas fa-book" style="color:#60a5fa; margin-right:8px;"></i>Libro Diario</h4>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
            <div style="background:rgba(255,255,255,0.03); padding:1rem; border-radius:8px;">
              <div style="font-size:1.5rem; font-weight:700; font-family:monospace;">${asientos.length}</div>
              <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Asientos</div>
            </div>
            <div style="background:rgba(255,255,255,0.03); padding:1rem; border-radius:8px;">
              <div style="font-size:1.5rem; font-weight:700; font-family:monospace;">${asientos.filter(a => a.fecha.startsWith(periodo)).length}</div>
              <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Este Mes</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h4 style="margin:0; font-size:0.9rem;"><i class="fas fa-shopping-cart" style="color:#f59e0b; margin-right:8px;"></i>Compras (${mesActual})</h4>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
            <div style="background:rgba(255,255,255,0.03); padding:1rem; border-radius:8px;">
              <div style="font-size:1.5rem; font-weight:700; font-family:monospace;">${iva.cantidadCompras}</div>
              <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Docs</div>
            </div>
            <div style="background:rgba(255,255,255,0.03); padding:1rem; border-radius:8px;">
              <div style="font-size:1.1rem; font-weight:700; font-family:monospace;">${formatCLP(iva.totalComprasNeto)}</div>
              <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Neto</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h4 style="margin:0; font-size:0.9rem;"><i class="fas fa-cash-register" style="color:#10b981; margin-right:8px;"></i>Ventas (${mesActual})</h4>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
            <div style="background:rgba(255,255,255,0.03); padding:1rem; border-radius:8px;">
              <div style="font-size:1.5rem; font-weight:700; font-family:monospace;">${iva.cantidadVentas}</div>
              <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Docs</div>
            </div>
            <div style="background:rgba(255,255,255,0.03); padding:1rem; border-radius:8px;">
              <div style="font-size:1.1rem; font-weight:700; font-family:monospace;">${formatCLP(iva.totalVentasNeto)}</div>
              <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Neto</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Row 4: Balance y Resumen IVA -->
      <div class="grid-2" style="gap: 1.5rem;">
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
            <h4 style="margin:0; font-size:1rem;"><i class="fas fa-scale-balanced" style="color:#a78bfa; margin-right:8px;"></i>Ecuación Contable</h4>
            <span style="background:${balance.cuadra ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${balance.cuadra ? '#10b981' : '#ef4444'}; padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:700;">
              <i class="fas ${balance.cuadra ? 'fa-check-circle' : 'fa-times-circle'}"></i> ${balance.cuadra ? 'Equilibrado' : 'Descuadrado'}
            </span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem; background:rgba(255,255,255,0.02); border-radius:12px;">
            <div style="text-align:center; flex:1;">
               <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase;">Activos</div>
               <div style="font-family:monospace; font-weight:800; font-size:1.1rem;">${formatCLP(balance.totalActivos)}</div>
            </div>
            <div style="font-size:1.5rem; opacity:0.3;">=</div>
            <div style="text-align:center; flex:1;">
               <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase;">Pasivos</div>
               <div style="font-family:monospace; font-weight:800; font-size:1.1rem;">${formatCLP(balance.totalPasivos)}</div>
            </div>
            <div style="font-size:1.5rem; opacity:0.3;">+</div>
            <div style="text-align:center; flex:1;">
               <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase;">Patrimonio</div>
               <div style="font-family:monospace; font-weight:800; font-size:1.1rem;">${formatCLP(balance.totalPatrimonio)}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <h4 style="margin:0; font-size:1rem;"><i class="fas fa-file-invoice-dollar" style="color:#f59e0b; margin-right:8px;"></i>Resumen IVA — ${mesActual}</h4>
          </div>
          <div style="display:grid; gap:0.5rem; font-size:0.85rem;">
            <div style="display:flex; justify-content:space-between;">
              <span style="opacity:0.7;">Débito (Ventas)</span>
              <span style="font-family:monospace;">${formatCLP(iva.debitoFiscal)}</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="opacity:0.7;">Crédito (Compras)</span>
              <span style="font-family:monospace; color:#ef4444;">- ${formatCLP(iva.creditoFiscal)}</span>
            </div>
            <hr style="opacity:0.1; margin:4px 0;">
            <div style="display:flex; justify-content:space-between; font-weight:800; font-size:1rem;">
              <span>IVA ${iva.ivaPorPagar >= 0 ? 'a Pagar' : 'a Favor'}</span>
              <span style="color:${iva.ivaPorPagar >= 0 ? '#ef4444' : '#10b981'}; font-family:monospace;">${formatCLP(Math.abs(iva.ivaPorPagar))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
