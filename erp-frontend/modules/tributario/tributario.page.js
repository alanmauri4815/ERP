/* ============================================
   TRIBUTARIO — F29, IVA, PPM
   ============================================ */

import { getResumenIVA, getEstadoResultados } from '../../services/contabilidad.service.js';
import { db } from '../../services/datastore.js';
import { formatCLP, formatNumber, formatPercent } from '../../utils/formatters.js';
import { PPM_TASA_BASE, TASA_PRIMERA_CATEGORIA, MESES } from '../../utils/constants.js';
import { showToast } from '../../components/ui-helpers.js';

export function renderTributario(container) {
    const now = new Date();
    const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const mesActual = MESES[now.getMonth()];
    const iva = getResumenIVA(periodo);
    const er = getEstadoResultados();

    // PPM calculation
    const ppmBase = Math.round(iva.totalVentasNeto * PPM_TASA_BASE);

    container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Gestión Tributaria</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">
          Formularios y cálculos tributarios SII — IVA, PPM, Impuesto Renta
        </p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs" id="tributario-tabs">
      <div class="tab active" data-tab="f29">F29 Mensual</div>
      <div class="tab" data-tab="f22">F22 Anual</div>
      <div class="tab" data-tab="balance8">Balance 8 Columnas</div>
    </div>

    <!-- F29 -->
    <div id="tab-f29" class="tab-content animate-fade-in">
      <div class="card" style="max-width:900px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-xl);">
          <h3 style="font-size:var(--font-size-lg);">
            <i class="fas fa-file-lines" style="color:var(--accent-primary);margin-right:8px;"></i>
            Formulario 29 — Declaración Mensual
          </h3>
          <span class="badge badge-info" style="padding:6px 14px;">${mesActual} ${now.getFullYear()}</span>
        </div>

        <!-- IVA Section -->
        <div style="margin-bottom:var(--space-2xl);">
          <h4 style="color:var(--status-info);margin-bottom:var(--space-md);">
            <i class="fas fa-receipt"></i> Impuesto al Valor Agregado (IVA)
          </h4>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:var(--space-lg);">
            <div style="display:grid;grid-template-columns:1fr auto;gap:var(--space-md);font-size:var(--font-size-sm);">
              <span>Ventas Netas del período</span>
              <span class="cell-mono" style="text-align:right;">${formatCLP(iva.totalVentasNeto)}</span>

              <span>Débito Fiscal (19% sobre ventas)</span>
              <span class="cell-mono" style="text-align:right;">${formatCLP(iva.debitoFiscal)}</span>

              <span style="border-top:1px solid var(--border-primary);padding-top:var(--space-sm);">Compras Netas del período</span>
              <span class="cell-mono" style="text-align:right;border-top:1px solid var(--border-primary);padding-top:var(--space-sm);">${formatCLP(iva.totalComprasNeto)}</span>

              <span>Crédito Fiscal (19% sobre compras)</span>
              <span class="cell-mono" style="text-align:right;">- ${formatCLP(iva.creditoFiscal)}</span>
            </div>
            <div style="border-top:2px solid var(--border-primary);margin-top:var(--space-md);padding-top:var(--space-md);display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-size:var(--font-size-md);">IVA ${iva.ivaPorPagar >= 0 ? 'a Pagar' : 'Remanente a Favor'}</strong>
              <strong class="cell-mono ${iva.ivaPorPagar >= 0 ? 'cell-negative' : 'cell-positive'}" style="font-size:var(--font-size-xl);">
                ${formatCLP(Math.abs(iva.ivaPorPagar))}
              </strong>
            </div>
          </div>
        </div>

        <!-- PPM Section -->
        <div style="margin-bottom:var(--space-2xl);">
          <h4 style="color:var(--status-warning);margin-bottom:var(--space-md);">
            <i class="fas fa-coins"></i> Pagos Provisionales Mensuales (PPM)
          </h4>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:var(--space-lg);">
            <div style="display:grid;grid-template-columns:1fr auto;gap:var(--space-md);font-size:var(--font-size-sm);">
              <span>Base imponible (ventas netas)</span>
              <span class="cell-mono" style="text-align:right;">${formatCLP(iva.totalVentasNeto)}</span>

              <span>Tasa PPM vigente</span>
              <span class="cell-mono" style="text-align:right;">${formatPercent(PPM_TASA_BASE)}</span>
            </div>
            <div style="border-top:2px solid var(--border-primary);margin-top:var(--space-md);padding-top:var(--space-md);display:flex;justify-content:space-between;align-items:center;">
              <strong>PPM a Pagar</strong>
              <strong class="cell-mono" style="font-size:var(--font-size-xl);color:var(--status-warning);">${formatCLP(ppmBase)}</strong>
            </div>
          </div>
        </div>

        <!-- Total F29 -->
        <div style="background:var(--gradient-primary);padding:var(--space-xl);border-radius:var(--radius-md);color:white;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);">Total a Pagar F29</div>
              <div style="font-size:var(--font-size-xs);opacity:0.8;">IVA + PPM correspondiente a ${mesActual}</div>
            </div>
            <div style="font-family:var(--font-mono);font-size:var(--font-size-3xl);font-weight:var(--font-weight-bold);">
              ${formatCLP(Math.max(0, iva.ivaPorPagar) + ppmBase)}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- F22 Annual -->
    <div id="tab-f22" class="tab-content" style="display:none;">
      <div class="card" style="max-width:900px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-xl);">
          <h3 style="font-size:var(--font-size-lg);">
            <i class="fas fa-file-contract" style="color:var(--accent-secondary);margin-right:8px;"></i>
            Formulario 22 — Declaración Anual de Renta
          </h3>
          <span class="badge badge-primary" style="padding:6px 14px;">AT ${now.getFullYear()}</span>
        </div>

        <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:var(--space-lg);">
          <div style="display:grid;grid-template-columns:1fr auto;gap:var(--space-md);font-size:var(--font-size-sm);">
            <span>Ingresos Totales</span>
            <span class="cell-mono" style="text-align:right;">${formatCLP(er.totalIngresos)}</span>

            <span>Costo de Ventas</span>
            <span class="cell-mono cell-negative" style="text-align:right;">- ${formatCLP(er.totalCostos)}</span>

            <span style="font-weight:var(--font-weight-semibold);padding-top:var(--space-sm);border-top:1px solid var(--border-primary);">Utilidad Bruta</span>
            <span class="cell-mono" style="text-align:right;font-weight:var(--font-weight-semibold);padding-top:var(--space-sm);border-top:1px solid var(--border-primary);">${formatCLP(er.utilidadBruta)}</span>

            <span>Gastos Necesarios para Producir la Renta</span>
            <span class="cell-mono cell-negative" style="text-align:right;">- ${formatCLP(er.totalGastos)}</span>

            <span style="font-weight:var(--font-weight-bold);padding-top:var(--space-sm);border-top:1px solid var(--border-primary);">Renta Líquida Imponible</span>
            <span class="cell-mono" style="text-align:right;font-weight:var(--font-weight-bold);padding-top:var(--space-sm);border-top:1px solid var(--border-primary);">${formatCLP(Math.max(0, er.utilidadNeta))}</span>

            <span>Tasa Impuesto 1ª Categoría (Régimen Pro-Pyme)</span>
            <span class="cell-mono" style="text-align:right;">${formatPercent(TASA_PRIMERA_CATEGORIA.PRO_PYME)}</span>
          </div>

          <div style="border-top:2px solid var(--border-primary);margin-top:var(--space-md);padding-top:var(--space-md);display:flex;justify-content:space-between;align-items:center;">
            <strong style="font-size:var(--font-size-md);">Impuesto 1ª Categoría</strong>
            <strong class="cell-mono" style="font-size:var(--font-size-xl);color:var(--status-error);">
              ${formatCLP(Math.round(Math.max(0, er.utilidadNeta) * TASA_PRIMERA_CATEGORIA.PRO_PYME))}
            </strong>
          </div>
        </div>

        <div style="margin-top:var(--space-lg);padding:var(--space-md);background:var(--status-info-bg);border-radius:var(--radius-sm);font-size:var(--font-size-sm);color:var(--status-info);">
          <i class="fas fa-info-circle"></i> Este es un cálculo simplificado. La declaración real requiere ajustes por corrección monetaria, depreciación tributaria, y otros agregados/deducciones.
        </div>
      </div>
    </div>

    <!-- Balance 8 Columnas -->
    <div id="tab-balance8" class="tab-content" style="display:none;">
      <div class="card">
        <h3 style="margin-bottom:var(--space-lg);">
          <i class="fas fa-table" style="color:var(--accent-primary);margin-right:8px;"></i>
          Balance de 8 Columnas
        </h3>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-bottom:var(--space-xl);">
          Balance clasificado: Sumas + Saldos + Inventario + Resultados
        </p>
        <div class="empty-state">
          <i class="fas fa-hammer"></i>
          <h3>En construcción</h3>
          <p>El Balance de 8 columnas será implementado en la próxima fase.</p>
        </div>
      </div>
    </div>
  `;

    // Tab switching
    container.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            container.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            tab.classList.add('active');
            const target = tab.dataset.tab;
            container.querySelector(`#tab-${target}`).style.display = '';
        });
    });
}
