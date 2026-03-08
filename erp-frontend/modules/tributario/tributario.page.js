/* ============================================
   TRIBUTARIO — F29 Mensual, F22 Anual
   ============================================ */

import { getResumenIVA, getEstadoResultados } from '../../services/contabilidad.service.js';
import { formatCLP } from '../../utils/formatters.js';

const PPM_TASA_BASE = 0.0125;
const TASA_1CAT_PROPYME = 0.25;

export async function renderTributario(container) {
    container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted);">
    <div class="spinner" style="margin:0 auto 1rem;"></div>
    Calculando impuestos...
  </div>`;

    const now = new Date();
    const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const mesNombre = now.toLocaleString('es-CL', { month: 'long' });
    const anio = now.getFullYear();

    const [iva, er] = await Promise.all([
        getResumenIVA(periodo),
        getEstadoResultados()
    ]);

    const ppmBase = Math.round(iva.totalVentasNeto * PPM_TASA_BASE);
    const totalF29 = Math.max(0, iva.ivaPorPagar) + ppmBase;
    const rli = Math.max(0, er.utilidadNeta);
    const impuesto1Cat = Math.round(rli * TASA_1CAT_PROPYME);

    container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Gestión Tributaria (SII)</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin-top:4px;">
          Formularios y cálculos tributarios — IVA, PPM, Impuesto Renta
        </p>
      </div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:0;margin-bottom:1.5rem;border-bottom:2px solid var(--border,#333);">
      <button class="trib-tab active" data-tab="f29"
        style="padding:10px 24px;border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:0.9rem;font-weight:600;border-bottom:2px solid transparent;margin-bottom:-2px;">
        F29 Mensual
      </button>
      <button class="trib-tab" data-tab="f22"
        style="padding:10px 24px;border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:0.9rem;font-weight:600;border-bottom:2px solid transparent;margin-bottom:-2px;">
        F22 Anual
      </button>
    </div>

    <!-- ═══════════ F29 MENSUAL ═══════════ -->
    <div id="trib-f29" class="trib-content">
      <div class="card" style="max-width:900px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
          <h3 style="font-size:1.1rem;">
            <i class="fas fa-file-lines" style="color:var(--primary,#60a5fa);margin-right:8px;"></i>
            Formulario 29 — Declaración Mensual
          </h3>
          <span style="background:var(--primary,#60a5fa);color:white;padding:4px 14px;border-radius:12px;font-size:0.8rem;font-weight:600;text-transform:capitalize;">
            ${mesNombre} ${anio}
          </span>
        </div>

        <!-- IVA -->
        <div style="margin-bottom:2rem;">
          <h4 style="color:var(--primary,#60a5fa);margin-bottom:0.75rem;font-size:0.9rem;">
            <i class="fas fa-receipt"></i> Impuesto al Valor Agregado (IVA)
          </h4>
          <div style="background:var(--surface-light,#1e293b);border-radius:8px;padding:1.25rem;">
            <div style="display:grid;grid-template-columns:1fr auto;gap:0.6rem;font-size:0.85rem;">
              <span>Ventas Netas del período</span>
              <span style="text-align:right;font-family:monospace;">${formatCLP(iva.totalVentasNeto)}</span>

              <span>Débito Fiscal (19% sobre ventas)</span>
              <span style="text-align:right;font-family:monospace;">${formatCLP(iva.debitoFiscal)}</span>

              <span style="border-top:1px solid var(--border,#333);padding-top:8px;">Compras Netas del período</span>
              <span style="text-align:right;font-family:monospace;border-top:1px solid var(--border,#333);padding-top:8px;">${formatCLP(iva.totalComprasNeto)}</span>

              <span>Crédito Fiscal (19% sobre compras)</span>
              <span style="text-align:right;font-family:monospace;">- ${formatCLP(iva.creditoFiscal)}</span>
            </div>
            <div style="border-top:2px solid var(--border,#333);margin-top:0.75rem;padding-top:0.75rem;display:flex;justify-content:space-between;align-items:center;">
              <strong>IVA ${iva.ivaPorPagar >= 0 ? 'a Pagar' : 'Remanente a Favor'}</strong>
              <strong style="font-family:monospace;font-size:1.3rem;color:${iva.ivaPorPagar >= 0 ? '#ef4444' : '#10b981'};">
                ${formatCLP(Math.abs(iva.ivaPorPagar))}
              </strong>
            </div>
          </div>
        </div>

        <!-- PPM -->
        <div style="margin-bottom:2rem;">
          <h4 style="color:#f59e0b;margin-bottom:0.75rem;font-size:0.9rem;">
            <i class="fas fa-coins"></i> Pagos Provisionales Mensuales (PPM)
          </h4>
          <div style="background:var(--surface-light,#1e293b);border-radius:8px;padding:1.25rem;">
            <div style="display:grid;grid-template-columns:1fr auto;gap:0.6rem;font-size:0.85rem;">
              <span>Base imponible (ventas netas)</span>
              <span style="text-align:right;font-family:monospace;">${formatCLP(iva.totalVentasNeto)}</span>
              <span>Tasa PPM vigente</span>
              <span style="text-align:right;font-family:monospace;">1,25%</span>
            </div>
            <div style="border-top:2px solid var(--border,#333);margin-top:0.75rem;padding-top:0.75rem;display:flex;justify-content:space-between;align-items:center;">
              <strong>PPM a Pagar</strong>
              <strong style="font-family:monospace;font-size:1.3rem;color:#f59e0b;">${formatCLP(ppmBase)}</strong>
            </div>
          </div>
        </div>

        <!-- Total F29 -->
        <div style="background:linear-gradient(135deg,var(--primary,#3b82f6),#6366f1);padding:1.25rem 1.5rem;border-radius:10px;color:white;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:1.1rem;font-weight:bold;">Total a Pagar F29</div>
            <div style="font-size:0.75rem;opacity:0.8;text-transform:capitalize;">IVA + PPM correspondiente a ${mesNombre} ${anio}</div>
          </div>
          <div style="font-family:monospace;font-size:1.8rem;font-weight:bold;">
            ${formatCLP(totalF29)}
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ F22 ANUAL ═══════════ -->
    <div id="trib-f22" class="trib-content" style="display:none;">
      <div class="card" style="max-width:900px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
          <h3 style="font-size:1.1rem;">
            <i class="fas fa-file-contract" style="color:#a78bfa;margin-right:8px;"></i>
            Formulario 22 — Declaración Anual de Renta
          </h3>
          <span style="background:#a78bfa;color:white;padding:4px 14px;border-radius:12px;font-size:0.8rem;font-weight:600;">
            AT ${anio}
          </span>
        </div>

        <div style="background:var(--surface-light,#1e293b);border-radius:8px;padding:1.25rem;">
          <div style="display:grid;grid-template-columns:1fr auto;gap:0.6rem;font-size:0.85rem;">
            <span>Ingresos Totales</span>
            <span style="text-align:right;font-family:monospace;">${formatCLP(er.totalIngresos)}</span>

            <span>Costo de Ventas</span>
            <span style="text-align:right;font-family:monospace;color:#ef4444;">- ${formatCLP(er.totalCostos)}</span>

            <span style="font-weight:600;padding-top:8px;border-top:1px solid var(--border,#333);">Utilidad Bruta</span>
            <span style="text-align:right;font-family:monospace;font-weight:600;padding-top:8px;border-top:1px solid var(--border,#333);">
              ${formatCLP(er.utilidadBruta)}
            </span>

            <span>Gastos Necesarios para Producir la Renta</span>
            <span style="text-align:right;font-family:monospace;color:#ef4444;">- ${formatCLP(er.totalGastos)}</span>

            <span style="font-weight:bold;padding-top:8px;border-top:1px solid var(--border,#333);">Renta Líquida Imponible</span>
            <span style="text-align:right;font-family:monospace;font-weight:bold;padding-top:8px;border-top:1px solid var(--border,#333);">
              ${formatCLP(rli)}
            </span>

            <span>Tasa Impuesto 1ª Categoría (Régimen Pro-Pyme)</span>
            <span style="text-align:right;font-family:monospace;">25,0%</span>
          </div>

          <div style="border-top:2px solid var(--border,#333);margin-top:0.75rem;padding-top:0.75rem;display:flex;justify-content:space-between;align-items:center;">
            <strong style="font-size:1rem;">Impuesto 1ª Categoría</strong>
            <strong style="font-family:monospace;font-size:1.5rem;color:#ef4444;">
              ${formatCLP(impuesto1Cat)}
            </strong>
          </div>
        </div>

        <div style="margin-top:1rem;padding:0.75rem 1rem;background:rgba(96,165,250,0.1);border-radius:8px;font-size:0.8rem;color:var(--primary,#60a5fa);">
          <i class="fas fa-info-circle"></i> Este es un cálculo simplificado. La declaración real requiere ajustes por corrección monetaria, depreciación tributaria, y otros agregados/deducciones.
        </div>
      </div>
    </div>
  `;

    // Tab switching
    container.querySelectorAll('.trib-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.trib-tab').forEach(t => {
                t.classList.remove('active');
                t.style.borderBottomColor = 'transparent';
                t.style.color = 'var(--text-muted)';
            });
            container.querySelectorAll('.trib-content').forEach(c => c.style.display = 'none');

            tab.classList.add('active');
            tab.style.borderBottomColor = 'var(--primary,#60a5fa)';
            tab.style.color = 'var(--text,white)';
            container.querySelector(`#trib-${tab.dataset.tab}`).style.display = '';
        });

        // Set initial active style
        if (tab.classList.contains('active')) {
            tab.style.borderBottomColor = 'var(--primary,#60a5fa)';
            tab.style.color = 'var(--text,white)';
        }
    });
}
