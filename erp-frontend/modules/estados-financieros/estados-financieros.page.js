/* ============================================
   ESTADOS FINANCIEROS — Balance General & EERR
   ============================================ */

import { getBalanceGeneral, getEstadoResultados, getBalance8Columnas } from '../../services/contabilidad.service.js';
import { formatCLP } from '../../utils/formatters.js';

/* ---------- BALANCE GENERAL ---------- */

export async function renderBalanceGeneral(container) {
  container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted);"><div class="spinner" style="margin:0 auto 1rem;"></div>Cargando Balance General...</div>`;
  const bg = await getBalanceGeneral();

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Balance General</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">
          Estado de Situación Financiera — Activos = Pasivos + Patrimonio
        </p>
      </div>
      <span class="badge ${bg.cuadra ? 'badge-success' : 'badge-error'}" style="font-size:var(--font-size-sm);padding:6px 16px;">
        <i class="fas ${bg.cuadra ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        ${bg.cuadra ? 'Balance Cuadrado' : 'Balance Descuadrado'}
      </span>
    </div>

    ${bg.activos.length === 0 && bg.pasivos.length === 0 ? `
      <div class="empty-state">
        <i class="fas fa-scale-balanced"></i>
        <h3>Sin datos para el balance</h3>
        <p>Registra asientos contables para generar el Balance General.</p>
      </div>
    ` : `
      <div class="grid-2 animate-fade-in" style="gap:var(--space-2xl);">
        <!-- ACTIVOS -->
        <div>
          <div class="card" style="border-left: 3px solid var(--status-info);">
            <h3 style="color:var(--status-info);margin-bottom:var(--space-lg);font-size:var(--font-size-lg);">
              <i class="fas fa-coins"></i> ACTIVOS
            </h3>
            ${renderCuentasGroup(bg.activos)}
            <div style="border-top:2px solid var(--border-primary);margin-top:var(--space-lg);padding-top:var(--space-md);display:flex;justify-content:space-between;">
              <strong style="font-size:var(--font-size-md);">TOTAL ACTIVOS</strong>
              <strong class="cell-mono" style="font-size:var(--font-size-lg);color:var(--status-info);">${formatCLP(bg.totalActivos)}</strong>
            </div>
          </div>
        </div>

        <!-- PASIVOS + PATRIMONIO -->
        <div>
          <div class="card" style="border-left: 3px solid var(--status-error);margin-bottom:var(--space-lg);">
            <h3 style="color:var(--status-error);margin-bottom:var(--space-lg);font-size:var(--font-size-lg);">
              <i class="fas fa-building-columns"></i> PASIVOS
            </h3>
            ${renderCuentasGroup(bg.pasivos)}
            <div style="border-top:2px solid var(--border-primary);margin-top:var(--space-lg);padding-top:var(--space-md);display:flex;justify-content:space-between;">
              <strong>Total Pasivos</strong>
              <strong class="cell-mono" style="color:var(--status-error);">${formatCLP(bg.totalPasivos)}</strong>
            </div>
          </div>

          <div class="card" style="border-left: 3px solid var(--accent-primary);">
            <h3 style="color:var(--accent-primary);margin-bottom:var(--space-lg);font-size:var(--font-size-lg);">
              <i class="fas fa-landmark"></i> PATRIMONIO
            </h3>
            ${renderCuentasGroup(bg.patrimonio)}
            <div style="border-top:2px solid var(--border-primary);margin-top:var(--space-lg);padding-top:var(--space-md);display:flex;justify-content:space-between;">
              <strong>Total Patrimonio</strong>
              <strong class="cell-mono" style="color:var(--accent-primary);">${formatCLP(bg.totalPatrimonio)}</strong>
            </div>
          </div>

          <div class="card" style="margin-top:var(--space-lg);background:var(--bg-tertiary);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-size:var(--font-size-md);">TOTAL PASIVOS + PATRIMONIO</strong>
              <strong class="cell-mono" style="font-size:var(--font-size-lg);">
                ${formatCLP(bg.totalPasivos + bg.totalPatrimonio)}
              </strong>
            </div>
          </div>
        </div>
      </div>
    `}
  `;
}

/* ---------- ESTADO DE RESULTADOS ---------- */

export async function renderEstadoResultados(container) {
  container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted);"><div class="spinner" style="margin:0 auto 1rem;"></div>Cargando Estado de Resultados...</div>`;
  const er = await getEstadoResultados();

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Estado de Resultados</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">
          Ingresos — Costos — Gastos = Utilidad / Pérdida
        </p>
      </div>
      <span class="badge ${er.utilidadNeta >= 0 ? 'badge-success' : 'badge-error'}" style="font-size:var(--font-size-sm);padding:6px 16px;">
        <i class="fas ${er.utilidadNeta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
        ${er.utilidadNeta >= 0 ? 'Utilidad' : 'Pérdida'}: ${formatCLP(Math.abs(er.utilidadNeta))}
      </span>
    </div>

    ${er.ingresos.length === 0 && er.costos.length === 0 && er.gastos.length === 0 ? `
      <div class="empty-state">
        <i class="fas fa-chart-pie"></i>
        <h3>Sin datos de resultados</h3>
        <p>Registra ingresos y gastos para generar el Estado de Resultados.</p>
      </div>
    ` : `
      <div class="card animate-fade-in" style="max-width:800px;">
        <!-- INGRESOS -->
        <div style="margin-bottom:var(--space-xl);">
          <h3 style="color:var(--status-success);margin-bottom:var(--space-md);">
            <i class="fas fa-arrow-down"></i> Ingresos Operacionales
          </h3>
          ${renderCuentasGroup(er.ingresos)}
          <div style="display:flex;justify-content:space-between;padding:var(--space-sm) 0;border-top:1px solid var(--border-primary);margin-top:var(--space-sm);">
            <strong>Total Ingresos</strong>
            <strong class="cell-mono cell-positive">${formatCLP(er.totalIngresos)}</strong>
          </div>
        </div>

        <!-- COSTOS -->
        <div style="margin-bottom:var(--space-xl);">
          <h3 style="color:var(--status-warning);margin-bottom:var(--space-md);">
            <i class="fas fa-minus"></i> Costo de Ventas
          </h3>
          ${er.costos.length > 0 ? renderCuentasGroup(er.costos) : '<p style="color:var(--text-muted);font-size:var(--font-size-sm);">Sin costos registrados</p>'}
          <div style="display:flex;justify-content:space-between;padding:var(--space-sm) 0;border-top:1px solid var(--border-primary);margin-top:var(--space-sm);">
            <strong>Total Costos</strong>
            <strong class="cell-mono cell-negative">- ${formatCLP(er.totalCostos)}</strong>
          </div>
        </div>

        <!-- MARGEN BRUTO -->
        <div style="background:var(--bg-tertiary);padding:var(--space-md) var(--space-lg);border-radius:var(--radius-sm);margin-bottom:var(--space-xl);display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:var(--font-size-md);">UTILIDAD BRUTA</strong>
          <strong class="cell-mono ${er.utilidadBruta >= 0 ? 'cell-positive' : 'cell-negative'}" style="font-size:var(--font-size-lg);">${formatCLP(er.utilidadBruta)}</strong>
        </div>

        <!-- GASTOS -->
        <div style="margin-bottom:var(--space-xl);">
          <h3 style="color:var(--status-error);margin-bottom:var(--space-md);">
            <i class="fas fa-minus"></i> Gastos de Operación
          </h3>
          ${er.gastos.length > 0 ? renderCuentasGroup(er.gastos) : '<p style="color:var(--text-muted);font-size:var(--font-size-sm);">Sin gastos registrados</p>'}
          <div style="display:flex;justify-content:space-between;padding:var(--space-sm) 0;border-top:1px solid var(--border-primary);margin-top:var(--space-sm);">
            <strong>Total Gastos</strong>
            <strong class="cell-mono cell-negative">- ${formatCLP(er.totalGastos)}</strong>
          </div>
        </div>

        <!-- RESULTADO NETO -->
        <div style="background:var(--gradient-primary);padding:var(--space-lg) var(--space-xl);border-radius:var(--radius-md);display:flex;justify-content:space-between;align-items:center;color:white;">
          <div>
            <div style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);">
              ${er.utilidadNeta >= 0 ? 'UTILIDAD NETA' : 'PÉRDIDA NETA'}
            </div>
            <div style="font-size:var(--font-size-xs);opacity:0.8;">Resultado del ejercicio</div>
          </div>
          <div style="font-family:var(--font-mono);font-size:var(--font-size-2xl);font-weight:var(--font-weight-bold);">
            ${formatCLP(Math.abs(er.utilidadNeta))}
          </div>
        </div>
      </div>
    `}
  `;
}

/* ---------- BALANCE DE COMPROBACIÓN ---------- */

export async function renderBalanceComprobacion(container) {
  const bal8 = await getBalance8Columnas();

  // Totales de las 8 columnas
  const totalSumaDebe = bal8.reduce((s, c) => s + c.suma_debe, 0);
  const totalSumaHaber = bal8.reduce((s, c) => s + c.suma_haber, 0);
  const totalSaldoDebe = bal8.reduce((s, c) => s + c.saldo_deudor, 0);
  const totalSaldoHaber = bal8.reduce((s, c) => s + c.saldo_acreedor, 0);
  const totalActivo = bal8.reduce((s, c) => s + c.activo, 0);
  const totalPasivo = bal8.reduce((s, c) => s + c.pasivo, 0);
  const totalPerdida = bal8.reduce((s, c) => s + c.perdida, 0);
  const totalGanancia = bal8.reduce((s, c) => s + c.ganancia, 0);

  // Cálculos de Utilidad/Pérdida
  const difInventario = totalActivo - totalPasivo;
  const difResultado = totalGanancia - totalPerdida;

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Balance de 8 Columnas</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">
          Balance Tributario — Sumas, Saldos, Inventario y Resultado del Ejercicio
        </p>
      </div>
      <button class="btn btn-secondary" onclick="window.print()">
        <i class="fas fa-print"></i> Imprimir Reporte
      </button>
    </div>

    ${bal8.length === 0 ? `
      <div class="empty-state">
        <i class="fas fa-clipboard-check"></i>
        <h3>Sin movimientos contables</h3>
        <p>El balance se genera a partir de los asientos registrados.</p>
      </div>
    ` : `
      <div class="data-table-wrapper animate-fade-in" style="overflow-x:auto;">
        <table class="data-table" style="font-size: 11px;">
          <thead>
            <tr>
              <th rowspan="2">Cuenta</th>
              <th colspan="2" style="text-align:center; background:var(--bg-tertiary);">SUMAS</th>
              <th colspan="2" style="text-align:center;">SALDOS</th>
              <th colspan="2" style="text-align:center; background:var(--bg-tertiary);">INVENTARIO</th>
              <th colspan="2" style="text-align:center;">RESULTADO</th>
            </tr>
            <tr>
              <th style="text-align:right;">Debe</th>
              <th style="text-align:right;">Haber</th>
              <th style="text-align:right;">Deudor</th>
              <th style="text-align:right;">Acreedor</th>
              <th style="text-align:right;">Activo</th>
              <th style="text-align:right;">Pasivo</th>
              <th style="text-align:right;">Pérdida</th>
              <th style="text-align:right;">Ganancia</th>
            </tr>
          </thead>
          <tbody>
            ${bal8.map(c => `
              <tr>
                <td><strong>${c.nombre}</strong><br><small style="color:var(--text-muted);">${c.codigo}</small></td>
                <td class="cell-mono" style="text-align:right;">${formatCLP(c.suma_debe)}</td>
                <td class="cell-mono" style="text-align:right;">${formatCLP(c.suma_haber)}</td>
                <td class="cell-mono" style="text-align:right; color:var(--status-info);">${c.saldo_deudor > 0 ? formatCLP(c.saldo_deudor) : '-'}</td>
                <td class="cell-mono" style="text-align:right; color:var(--status-error);">${c.saldo_acreedor > 0 ? formatCLP(c.saldo_acreedor) : '-'}</td>
                <td class="cell-mono" style="text-align:right; font-weight:600;">${c.activo > 0 ? formatCLP(c.activo) : '-'}</td>
                <td class="cell-mono" style="text-align:right;">${c.pasivo > 0 ? formatCLP(c.pasivo) : '-'}</td>
                <td class="cell-mono" style="text-align:right; color:var(--status-error);">${c.perdida > 0 ? formatCLP(c.perdida) : '-'}</td>
                <td class="cell-mono" style="text-align:right; color:var(--status-success);">${c.ganancia > 0 ? formatCLP(c.ganancia) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot style="background:var(--bg-surface); font-weight:bold; border-top:2px solid var(--border-primary);">
            <tr>
              <td>TOTALES PARCIALES</td>
              <td style="text-align:right;">${formatCLP(totalSumaDebe)}</td>
              <td style="text-align:right;">${formatCLP(totalSumaHaber)}</td>
              <td style="text-align:right;">${formatCLP(totalSaldoDebe)}</td>
              <td style="text-align:right;">${formatCLP(totalSaldoHaber)}</td>
              <td style="text-align:right;">${formatCLP(totalActivo)}</td>
              <td style="text-align:right;">${formatCLP(totalPasivo)}</td>
              <td style="text-align:right;">${formatCLP(totalPerdida)}</td>
              <td style="text-align:right;">${formatCLP(totalGanancia)}</td>
            </tr>
            <tr style="color:var(--accent-primary); background:var(--bg-tertiary);">
              <td>UTILIDAD / PÉRDIDA DEL EJERCICIO</td>
              <td colspan="4"></td>
              <td style="text-align:right;">${difInventario < 0 ? formatCLP(Math.abs(difInventario)) : '-'}</td>
              <td style="text-align:right;">${difInventario > 0 ? formatCLP(difInventario) : '-'}</td>
              <td style="text-align:right;">${difResultado > 0 ? formatCLP(difResultado) : '-'}</td>
              <td style="text-align:right;">${difResultado < 0 ? formatCLP(Math.abs(difResultado)) : '-'}</td>
            </tr>
            <tr style="background:var(--bg-surface); font-size:12px; border-top:1px solid var(--border-primary);">
              <td>TOTALES IGUALES</td>
              <td colspan="4" style="text-align:center;">---</td>
              <td style="text-align:right;">${formatCLP(Math.max(totalActivo, totalPasivo + (difInventario > 0 ? difInventario : 0)))}</td>
              <td style="text-align:right;">${formatCLP(Math.max(totalPasivo, totalActivo + (difInventario < 0 ? Math.abs(difInventario) : 0)))}</td>
              <td style="text-align:right;">${formatCLP(Math.max(totalPerdida, totalGanancia + (difResultado < 0 ? Math.abs(difResultado) : 0)))}</td>
              <td style="text-align:right;">${formatCLP(Math.max(totalGanancia, totalPerdida + (difResultado > 0 ? difResultado : 0)))}</td>
            </tr>
          </tfoot>
        </table>
        
        <div class="table-footer" style="margin-top:var(--space-lg);">
          <div style="display:flex; gap:10px;">
            <span class="badge ${Math.abs(totalSumaDebe - totalSumaHaber) < 1 ? 'badge-success' : 'badge-error'}">
                Sumas: ${Math.abs(totalSumaDebe - totalSumaHaber) < 1 ? 'Cuadradas' : 'Descuadradas'}
            </span>
            <span class="badge ${Math.abs(difInventario - difResultado) < 1 ? 'badge-success' : 'badge-error'}">
                Resultado: ${Math.abs(difInventario - difResultado) < 1 ? '✓ Reporte Cuadrado' : '✗ Error en Cuadratura'}
            </span>
          </div>
          <span style="font-weight:600; color:var(--accent-primary);">
            Utilidad Neta: ${formatCLP(difResultado)}
          </span>
        </div>
      </div>
    `}
  `;
}

/* ---------- HELPERS ---------- */

function renderCuentasGroup(cuentas) {
  if (cuentas.length === 0) return '<p style="color:var(--text-muted);font-size:var(--font-size-sm);">Sin cuentas con saldo</p>';
  return cuentas.map(c => `
    <div style="display:flex;justify-content:space-between;padding:var(--space-xs) 0;font-size:var(--font-size-sm);">
      <span>
        <span class="cell-mono" style="color:var(--text-muted);margin-right:8px;">${c.codigo}</span>
        ${c.nombre}
      </span>
      <span class="cell-mono" style="font-weight:var(--font-weight-medium);">${formatCLP(c.saldo)}</span>
    </div>
  `).join('');
}

// Export unificado para main.js
export function renderEstadosFinancieros(container) {
  renderBalanceComprobacion(container);
}
