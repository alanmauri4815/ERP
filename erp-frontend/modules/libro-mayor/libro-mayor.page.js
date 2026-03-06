/* ============================================
   LIBRO MAYOR — Vista por Cuenta (Supabase)
   ============================================ */

import { getLibroMayor, getCuentasDetalle } from '../../services/contabilidad.service.js';
import { formatCLP } from '../../utils/formatters.js';
import { getSelectedPeriodo } from '../../components/ui-helpers.js';

export async function renderLibroMayor(container) {
  const cuentasDetalle = await getCuentasDetalle();

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Libro Mayor</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">Movimientos detallados por cuenta</p>
      </div>
      <div class="form-group" style="margin-bottom:0; min-width:300px;">
        <select class="form-control" id="select-cuenta-mayor">
          <option value="">Seleccione una cuenta...</option>
          ${cuentasDetalle.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true })).map(c => `
            <option value="${c.codigo}">${c.codigo} - ${c.nombre}</option>
          `).join('')}
        </select>
      </div>
    </div>

    <div id="mayor-content">
      <div class="empty-state">
        <i class="fas fa-search"></i>
        <h3>Seleccione una cuenta</h3>
        <p>Elija una cuenta del plan para visualizar sus movimientos contables.</p>
      </div>
    </div>
  `;

  const select = container.querySelector('#select-cuenta-mayor');
  select.addEventListener('change', async () => {
    if (!select.value) return;
    const { string: periodo } = getSelectedPeriodo();
    await renderMovimientosMayor(select.value, periodo, container.querySelector('#mayor-content'));
  });
}

async function renderMovimientosMayor(codigo, periodo, container) {
  container.innerHTML = `<div class="skeleton-loader">Consultando movimientos en Supabase...</div>`;

  const { movimientos, saldoAnterior } = await getLibroMayor(codigo, periodo);

  if (movimientos.length === 0 && saldoAnterior === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-folder-open"></i>
        <h3>Sin movimientos</h3>
        <p>Esta cuenta no registra operaciones en el sistema todavía.</p>
      </div>
    `;
    return;
  }

  // Calcular saldos acumulados partiendo del saldo anterior
  let saldoAcumulado = saldoAnterior;
  const movsConSaldo = movimientos.map(m => {
    saldoAcumulado += (m.debe || 0) - (m.haber || 0);
    return { ...m, saldoAcumulado };
  });

  // Calcular totales
  const totalDebe = movimientos.reduce((s, m) => s + (m.debe || 0), 0);
  const totalHaber = movimientos.reduce((s, m) => s + (m.haber || 0), 0);

  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:var(--space-md);gap:var(--space-md);">
      <button class="btn btn-secondary" onclick="window.print()">
        <i class="fas fa-print"></i> Imprimir Mayor
      </button>
    </div>

    <div class="card animate-fade-in" style="margin-bottom:var(--space-xl);" id="mayor-printable">
      <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:var(--space-lg);margin-bottom:var(--space-xl);padding:var(--space-md);background:var(--bg-tertiary);border-radius:var(--radius-sm);">
        <div style="text-align:center;border-right:1px solid var(--border-primary);">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Debe (Periodo)</div>
          <div style="font-family:var(--font-mono);font-weight:bold;color:var(--status-info);">${formatCLP(totalDebe)}</div>
        </div>
        <div style="text-align:center;border-right:1px solid var(--border-primary);">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Haber (Periodo)</div>
          <div style="font-family:var(--font-mono);font-weight:bold;color:var(--status-error);">${formatCLP(totalHaber)}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Saldo Final</div>
          <div style="font-family:var(--font-mono);font-weight:bold;">${formatCLP(saldoAcumulado)}</div>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Glosa / Detalle</th>
            <th style="text-align:right;">Debe</th>
            <th style="text-align:right;">Haber</th>
            <th style="text-align:right;">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:var(--bg-secondary);font-style:italic;opacity:0.8;">
            <td>-</td>
            <td>SALDO ANTERIOR (Arrastre)</td>
            <td style="text-align:right;">-</td>
            <td style="text-align:right;">-</td>
            <td class="cell-mono" style="text-align:right;">${formatCLP(saldoAnterior)}</td>
          </tr>
          ${movsConSaldo.map(m => `
            <tr>
              <td>${m.asiento?.fecha || '-'}</td>
              <td>${m.asiento?.glosa || 'Sin glosa'}</td>
              <td class="cell-mono" style="text-align:right;">${m.debe > 0 ? formatCLP(m.debe) : '-'}</td>
              <td class="cell-mono" style="text-align:right;">${m.haber > 0 ? formatCLP(m.haber) : '-'}</td>
              <td class="cell-mono" style="text-align:right; font-weight:bold;">${formatCLP(m.saldoAcumulado)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
