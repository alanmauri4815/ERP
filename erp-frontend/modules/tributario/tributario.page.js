import { getResumenIVA, getEstadoResultados } from '../../services/contabilidad.service.js';

export async function renderTributario(container) {
  container.innerHTML = `<div class="skeleton-loader">Calculando Impuestos Mensuales...</div>`;

  const now = new Date();
  const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const iva = await getResumenIVA(periodo);
  const er = await getEstadoResultados();
  const ppmBase = Math.round(iva.totalVentasNeto * 0.0125); // PPM 1.25%

  container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 class="section-title">Gestión Tributaria & Impuestos</h2>
                <p style="color:var(--text-muted); font-size: 13px;">Cálculos automáticos para Formulario 29 (SII Chile)</p>
            </div>
        </div>

        <div class="grid-2 animate-fade" style="margin-top:20px;">
            <div class="card">
                <header style="margin-bottom:1.5rem;">
                    <h3><i class="fas fa-receipt" style="color:var(--secondary)"></i> Resumen IVA - ${periodo}</h3>
                </header>
                <div style="display:grid; gap:0.8rem;">
                    <div style="display:flex; justify-content:space-between;"><span>Ventas Netas:</span><strong>$${iva.totalVentasNeto.toLocaleString()}</strong></div>
                    <div style="display:flex; justify-content:space-between; color:var(--secondary)"><span>Débito Fiscal (19%):</span><strong>$$${iva.debitoFiscal.toLocaleString()}</strong></div>
                    <hr style="opacity:0.1">
                    <div style="display:flex; justify-content:space-between;"><span>Compras Netas:</span><strong>$${iva.totalComprasNeto.toLocaleString()}</strong></div>
                    <div style="display:flex; justify-content:space-between; color:var(--accent)"><span>Crédito Fiscal (19%):</span><strong>$${iva.creditoFiscal.toLocaleString()}</strong></div>
                    <hr style="border:1px solid rgba(255,255,255,0.05)">
                    <div style="display:flex; justify-content:space-between; font-size:1.2rem; font-weight:700;">
                        <span>IVA a Pagar</span>
                        <span style="color:${iva.ivaPorPagar >= 0 ? 'var(--danger)' : 'var(--success)'}">$${Math.abs(iva.ivaPorPagar).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div class="card">
                <header style="margin-bottom:1.5rem;">
                    <h3><i class="fas fa-coins" style="color:var(--accent)"></i> PPM & Otros</h3>
                </header>
                <div style="display:grid; gap:0.8rem;">
                    <div style="display:flex; justify-content:space-between;"><span>Tasa PPM Vigente:</span><strong>1.25%</strong></div>
                    <div style="display:flex; justify-content:space-between;"><span>PPM Determinado:</span><strong>$${ppmBase.toLocaleString()}</strong></div>
                    <hr style="opacity:0.1">
                    <div style="background:var(--secondary); color:white; padding:1.2rem; border-radius:0.5rem; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-size:0.8rem; opacity:0.8;">Total Estimado F29</div>
                            <div style="font-size:1.6rem; font-weight:700;">$${(Math.max(0, iva.ivaPorPagar) + ppmBase).toLocaleString()}</div>
                        </div>
                        <i class="fas fa-file-invoice" style="font-size:2rem; opacity:0.3"></i>
                    </div>
                </div>
            </div>
        </div>

        <div class="card" style="margin-top:20px;">
           <h3><i class="fas fa-chart-line" style="color:var(--success)"></i> Proyección de Renta (F22)</h3>
           <p style="opacity:0.6; font-size:0.9rem; margin-bottom:1rem;">Cálculo basado en Estado de Resultados acumulado al día de hoy.</p>
           <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:1rem;">
                <div style="background:var(--surface-light); padding:1rem; border-radius:0.5rem;">
                    <small>Utilidad Bruta</small>
                    <div style="font-size:1.1rem; font-weight:600;">$${er.utilidadBruta.toLocaleString()}</div>
                </div>
                <div style="background:var(--surface-light); padding:1rem; border-radius:0.5rem;">
                    <small>Gastos Operacionales</small>
                    <div style="font-size:1.1rem; font-weight:600; color:var(--danger)">$${er.totalGastos.toLocaleString()}</div>
                </div>
                <div style="background:var(--primary); padding:1rem; border-radius:0.5rem; color:white;">
                    <small>Utilidad Neta Estimada</small>
                    <div style="font-size:1.1rem; font-weight:600;">$${er.utilidadNeta.toLocaleString()}</div>
                </div>
           </div>
        </div>
    `;
}
