import { getBalanceGeneral, getEstadoResultados } from '../../services/contabilidad.service.js';

export async function renderAnalisisFinanciero(container) {
  container.innerHTML = `<div class="skeleton-loader">Generando Análisis de Ratios...</div>`;

  const bg = await getBalanceGeneral();
  const er = await getEstadoResultados();

  // Ratios
  const liquidity = bg.totalPasivos > 0 ? (bg.totalActivos / bg.totalPasivos) : 0;
  const returnOnAssets = bg.totalActivos > 0 ? (er.utilidadNeta / bg.totalActivos) * 100 : 0;
  const debtRatio = bg.totalActivos > 0 ? (bg.totalPasivos / bg.totalActivos) * 100 : 0;

  container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 class="section-title">Análisis Financiero & Ratios</h2>
                <p style="color:var(--text-muted); font-size: 13px;">Rendimiento, Liquidez y Endeudamiento del negocio</p>
            </div>
        </div>

        <div class="grid-3 animate-fade" style="margin-top:20px;">
            <div class="card stat-card">
                <div class="label"><i class="fas fa-droplet" style="color:var(--accent)"></i> Liquidez Corriente</div>
                <div class="value" style="color:${liquidity >= 1.5 ? 'var(--success)' : 'var(--danger)'}">${liquidity.toFixed(2)}</div>
                <div style="font-size:0.8rem; opacity:0.6;">Meta: > 1.5</div>
                <small>Activos / Pasivos</small>
            </div>
            <div class="card stat-card">
                <div class="label"><i class="fas fa-percent" style="color:var(--secondary)"></i> ROA (Rentabilidad Activos)</div>
                <div class="value">${returnOnAssets.toFixed(1)}%</div>
                <div style="font-size:0.8rem; opacity:0.6;">Utilidad sobre Inversión</div>
            </div>
            <div class="card stat-card">
                <div class="label"><i class="fas fa-scale-balanced" style="color:var(--accent)"></i> Endeudamiento</div>
                <div class="value">${debtRatio.toFixed(1)}%</div>
                <div style="font-size:0.8rem; opacity:0.6;">Pasivos / Activos Totales</div>
            </div>
        </div>

        <div class="grid-2" style="margin-top:20px;">
          <div class="card">
            <h3><i class="fas fa-chart-pie" style="color:var(--secondary)"></i> Composición Patrimonial</h3>
            <div style="display:grid; grid-template-columns:1fr 1.5fr; gap:1.5rem; padding: 1.5rem; align-items:center;">
              <div style="font-size:2.5rem; text-align:center;">⚖️</div>
              <div style="display:grid; gap:0.5rem;">
                <div style="display:flex; justify-content:space-between"><span>Activos Totales</span><strong>$${bg.totalActivos.toLocaleString()}</strong></div>
                <div style="display:flex; justify-content:space-between"><span>Pasivos Totales</span><strong>$${bg.totalPasivos.toLocaleString()}</strong></div>
                <div style="display:flex; justify-content:space-between"><span>Patrimonio Neto</span><strong>$${bg.totalPatrimonio.toLocaleString()}</strong></div>
                <hr style="opacity:0.1">
                <div style="display:flex; justify-content:space-between; font-weight:700; color:var(--success)">
                  <span>Situación de Caja (Neto)</span>
                  <strong>$${(bg.totalActivos - bg.totalPasivos - bg.totalPatrimonio).toLocaleString()}</strong>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <h3><i class="fas fa-tachometer-alt" style="color:var(--accent)"></i> Salud Financiera</h3>
            <p style="opacity:0.6; font-size:0.9rem; margin-bottom:1rem;">Resumen de operatividad basado en el Balance clasificado.</p>
            <div style="background:var(--surface-light); padding:1rem; border-radius:0.5rem; margin-bottom:1rem;">
               <strong>Margen Neto Operacional:</strong>
               <div style="font-size:1.4rem; font-weight:600; color:var(--secondary)">
                  ${er.totalIngresos > 0 ? ((er.utilidadNeta / er.totalIngresos) * 100).toFixed(1) : 0}%
               </div>
            </div>
            <div style="font-size:0.85rem; padding:0.5rem; border-left:4px solid var(--secondary); background:rgba(0,0,0,0.1)">
               Este indicador revela cuánto centavo por cada peso vendido queda como utilidad neta después de gastos.
            </div>
          </div>
        </div>
    `;
}
