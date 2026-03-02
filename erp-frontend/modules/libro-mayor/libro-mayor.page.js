/* ============================================
   LIBRO MAYOR — Vista por Cuenta (Supabase)
   ============================================ */

import { getLibroMayor, getCuentasDetalle } from '../../services/contabilidad.service.js';
import { formatCLP } from '../../utils/formatters.js';

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
    await renderMovimientosMayor(select.value, container.querySelector('#mayor-content'));
  });
}

async function renderMovimientosMayor(codigo, container) {
  container.innerHTML = `<div class="skeleton-loader">Consultando movimientos en Supabase...</div>`;

  const movimientos = await getLibroMayor(codigo);

  if (movimientos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-folder-open"></i>
        <h3>Sin movimientos</h3>
        <p>Esta cuenta no registra operaciones en el sistema todavía.</p>
      </div>
    `;
    return;
  }

  // Calcular saldos acumulados (en el cliente para mayor precisión visual)
  let saldoAcumulado = 0;
  const movsConSaldo = movimientos.map(m => {
    saldoAcumulado += (m.debe || 0) - (m.haber || 0);
    return { ...m, saldoAcumulado };
  });

  container.innerHTML = `
    <div class="card animate-fade-in" style="margin-bottom:var(--space-xl);">
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
          ${movsConSaldo.map(m => `
            <tr>
              <td>${m.fecha}</td>
              <td>${m.glosa}</td>
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
