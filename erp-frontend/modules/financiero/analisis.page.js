/* ============================================
   ANÁLISIS FINANCIERO — Ratios & Evaluación
   Migrado y complementado desde SC al ERP
   ============================================ */

import { getBalanceGeneral, getEstadoResultados } from '../../services/contabilidad.service.js';
import { erpFetch } from '../../services/erp-api.js';
import { formatCLP, formatNumber, formatPercent } from '../../utils/formatters.js';
import { showToast, openModal, getSelectedPeriodo } from '../../components/ui-helpers.js';

export async function renderAnalisisFinanciero(container) {
  container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted);">
    <div class="spinner" style="margin:0 auto 1rem;"></div>
    Generando Análisis Financiero...
  </div>`;

  const { string: periodo } = getSelectedPeriodo();

  const [bg, er, rawPurchases, rawSales] = await Promise.all([
    getBalanceGeneral(periodo),
    getEstadoResultados(periodo),
    erpFetch('/purchases'),
    erpFetch('/sales')
  ]);

  if (!bg || !er) {
    container.innerHTML = `<div class="empty-state">No hay datos suficientes para el análisis.</div>`;
    return;
  }

  const purchases = Array.isArray(rawPurchases) ? rawPurchases : [];
  const sales = Array.isArray(rawSales) ? rawSales : [];

  // 1. Calcular Cuentas por Cobrar y Pagar Pendientes
  // En el ERP usamos paid_amount vs total
  const cxcPendientes = sales.filter(v => (parseFloat(v.total) || 0) > (parseFloat(v.paid_amount) || 0));
  const cxpPendientes = purchases.filter(c => (parseFloat(c.total) || 0) > (parseFloat(c.paid_amount) || 0));

  const totalCxC = cxcPendientes.reduce((s, v) => s + (parseFloat(v.total) - parseFloat(v.paid_amount || 0)), 0);
  const totalCxP = cxpPendientes.reduce((s, c) => s + (parseFloat(c.total) - parseFloat(c.paid_amount || 0)), 0);

  // 2. Calcular Ratios Profesionales
  // Activo Corriente (1.1.x) / Pasivo Corriente (2.1.x)
  const activoCorriente = bg.activos.filter(a => a.codigo.startsWith('1.1')).reduce((s, a) => s + a.saldo, 0);
  const pasivoCorriente = bg.pasivos.filter(p => p.codigo.startsWith('2.1')).reduce((s, p) => s + p.saldo, 0);
  const existencias = bg.activos.filter(a => a.codigo === '1.1.09').reduce((s, a) => s + a.saldo, 0);

  const ratios = {
    liquidezCorriente: pasivoCorriente > 0 ? activoCorriente / pasivoCorriente : 0,
    pruebaAcida: pasivoCorriente > 0 ? (activoCorriente - existencias) / pasivoCorriente : 0,
    endeudamiento: bg.totalActivos > 0 ? (bg.totalPasivos / bg.totalActivos) * 100 : 0,
    roe: bg.totalPatrimonio > 0 ? (er.utilidadNeta / bg.totalPatrimonio) * 100 : 0,
    roa: bg.totalActivos > 0 ? (er.utilidadNeta / bg.totalActivos) * 100 : 0,
    margenNeto: er.totalIngresos > 0 ? (er.utilidadNeta / er.totalIngresos) * 100 : 0,
    margenBruto: er.totalIngresos > 0 ? (er.utilidadBruta / er.totalIngresos) * 100 : 0,
  };

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Análisis Financiero & Ratios</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin-top:4px;">Rendimiento, Liquidez y Endeudamiento del negocio</p>
      </div>
      <button class="btn btn-primary" id="btn-evaluacion">
        <i class="fas fa-calculator"></i> Evaluación de Proyecto (VAN/TIR)
      </button>
    </div>

    <!-- Ratios de Liquidez -->
    <h3 style="margin-bottom:1rem;color:var(--text-primary);font-size:1.1rem;display:flex;align-items:center;">
      <i class="fas fa-droplet" style="color:#60a5fa;margin-right:8px;"></i> Ratios de Liquidez
    </h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;margin-bottom:2rem;">
      ${renderRatioCard('Liquidez Corriente', ratios.liquidezCorriente, 'veces', 'Activo Corriente / Pasivo Corriente', ratios.liquidezCorriente >= 1.5 ? 'success' : ratios.liquidezCorriente >= 1 ? 'warning' : 'danger', 'fa-tachometer-alt')}
      ${renderRatioCard('Prueba Ácida', ratios.pruebaAcida, 'veces', '(AC - Existencias) / PC', ratios.pruebaAcida >= 1 ? 'success' : 'danger', 'fa-flask')}
      ${renderRatioCard('Endeudamiento', ratios.endeudamiento, '%', 'Total Pasivos / Total Activos', ratios.endeudamiento <= 50 ? 'success' : ratios.endeudamiento <= 70 ? 'warning' : 'danger', 'fa-scale-balanced')}
    </div>

    <!-- Gestión de Tesorería -->
    <h3 style="margin-bottom:1rem;color:var(--text-primary);font-size:1.1rem;display:flex;align-items:center;">
      <i class="fas fa-money-bill-transfer" style="color:#8b5cf6;margin-right:8px;"></i> Gestión de Tesorería
    </h3>
    <div class="grid-2 animate-fade" style="gap:1.5rem;margin-bottom:2rem;">
      <!-- CxC -->
      <div class="card" style="padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h4 style="color:#10b981;font-size:0.95rem;margin:0;"><i class="fas fa-arrow-right-to-bracket"></i> Facturas por Cobrar</h4>
          <strong style="color:#10b981;font-size:1.1rem;">${formatCLP(totalCxC)}</strong>
        </div>
        <div style="max-height:220px;overflow-y:auto;border:1px solid rgba(255,255,255,0.05);border-radius:6px;">
          <table style="width:100%;font-size:0.75rem;border-collapse:collapse;">
            <thead style="position:sticky;top:0;background:var(--surface-light);z-index:1;">
              <tr>
                <th style="padding:6px 10px;text-align:left;">Cliente</th>
                <th style="padding:6px 10px;text-align:left;">N°</th>
                <th style="padding:6px 10px;text-align:right;">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              ${cxcPendientes.slice(0, 10).map(v => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:6px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${v.customer_name}</td>
                  <td style="padding:6px 10px;font-family:monospace;">${v.document_number}</td>
                  <td style="padding:6px 10px;text-align:right;font-family:monospace;">${formatCLP(parseFloat(v.total) - (parseFloat(v.paid_amount) || 0))}</td>
                </tr>
              `).join('')}
              ${cxcPendientes.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:15px;opacity:0.5;">Sin facturas pendientes</td></tr>' : ''}
              ${cxcPendientes.length > 10 ? `<tr><td colspan="3" style="text-align:center;padding:6px;font-size:10px;opacity:0.5;">Y ${cxcPendientes.length - 10} más...</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- CxP -->
      <div class="card" style="padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h4 style="color:#ef4444;font-size:0.95rem;margin:0;"><i class="fas fa-arrow-right-from-bracket"></i> Cuentas por Pagar</h4>
          <strong style="color:#ef4444;font-size:1.1rem;">${formatCLP(totalCxP)}</strong>
        </div>
        <div style="max-height:220px;overflow-y:auto;border:1px solid rgba(255,255,255,0.05);border-radius:6px;">
          <table style="width:100%;font-size:0.75rem;border-collapse:collapse;">
            <thead style="position:sticky;top:0;background:var(--surface-light);z-index:1;">
              <tr>
                <th style="padding:6px 10px;text-align:left;">Proveedor</th>
                <th style="padding:6px 10px;text-align:left;">N°</th>
                <th style="padding:6px 10px;text-align:right;">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              ${cxpPendientes.slice(0, 10).map(c => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:6px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${c.vendor_name}</td>
                  <td style="padding:6px 10px;font-family:monospace;">${c.document_number}</td>
                  <td style="padding:6px 10px;text-align:right;font-family:monospace;">${formatCLP(parseFloat(c.total) - (parseFloat(c.paid_amount) || 0))}</td>
                </tr>
              `).join('')}
              ${cxpPendientes.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:15px;opacity:0.5;">Sin deudas pendientes</td></tr>' : ''}
              ${cxpPendientes.length > 10 ? `<tr><td colspan="3" style="text-align:center;padding:6px;font-size:10px;opacity:0.5;">Y ${cxpPendientes.length - 10} más...</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Ratios de Rentabilidad -->
    <h3 style="margin-bottom:1rem;color:var(--text-primary);font-size:1.1rem;display:flex;align-items:center;">
      <i class="fas fa-chart-line" style="color:#10b981;margin-right:8px;"></i> Ratios de Rentabilidad
    </h3>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem;">
      ${renderRatioCardMini('ROE', ratios.roe, '%', 'Utilidad / Patrimonio', ratios.roe > 0 ? 'success' : 'danger', 'fa-percentage')}
      ${renderRatioCardMini('ROA', ratios.roa, '%', 'Utilidad / Activos', ratios.roa > 0 ? 'success' : 'danger', 'fa-chart-pie')}
      ${renderRatioCardMini('Margen Bruto', ratios.margenBruto, '%', 'Util. Bruta / Ingresos', ratios.margenBruto > 20 ? 'success' : 'warning', 'fa-percent')}
      ${renderRatioCardMini('Margen Neto', ratios.margenNeto, '%', 'Util. Neta / Ingresos', ratios.margenNeto > 0 ? 'success' : 'danger', 'fa-bullseye')}
    </div>

    <!-- Patrimonio & Salud -->
    <div class="grid-2">
      <div class="card" style="padding:1.5rem;">
        <h3 style="margin-bottom:1.5rem;font-size:1rem;"><i class="fas fa-chart-pie" style="color:var(--secondary)"></i> Composición Patrimonial</h3>
        <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:1.5rem;align-items:center;">
          <div style="font-size:3rem;text-align:center;">⚖️</div>
          <div style="display:grid;gap:0.75rem;font-size:0.85rem;">
            <div style="display:flex;justify-content:space-between"><span>Activos Totales</span><strong>${formatCLP(bg.totalActivos)}</strong></div>
            <div style="display:flex;justify-content:space-between"><span>Pasivos Totales</span><strong>${formatCLP(bg.totalPasivos)}</strong></div>
            <div style="display:flex;justify-content:space-between"><span>Patrimonio Neto</span><strong>${formatCLP(bg.totalPatrimonio)}</strong></div>
            <hr style="opacity:0.1;margin:4px 0;">
            <div style="display:flex;justify-content:space-between;font-weight:700;color:#10b981">
              <span>Fondo de Maniobra (Neto)</span>
              <strong>${formatCLP(activoCorriente - pasivoCorriente)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="padding:1.5rem;">
        <h3 style="margin-bottom:1rem;font-size:1rem;"><i class="fas fa-heart-pulse" style="color:#ef4444"></i> Salud Financiera</h3>
        <p style="opacity:0.6;font-size:0.8rem;margin-bottom:1rem;">Resumen de operatividad basado en el Balance clasificado.</p>
        <div style="background:rgba(255,255,255,0.03);padding:1.25rem;border-radius:10px;margin-bottom:1rem;">
           <span style="font-size:0.8rem;color:var(--text-muted);">Margen Neto Operacional:</span>
           <div style="font-size:1.75rem;font-weight:700;color:var(--secondary);margin-top:4px;">
              ${ratios.margenNeto.toFixed(1)}%
           </div>
        </div>
        <div style="font-size:0.8rem;padding:0.75rem;border-left:3px solid var(--secondary);background:rgba(255,255,255,0.02);">
           Determina qué porcentaje de las ventas se convierte en utilidad líquida tras descontar todos los costos y gastos.
        </div>
      </div>
    </div>

    <!-- Evaluación de Proyectos Result Container -->
    <div id="evaluacion-container" style="margin-top:2rem;"></div>
  `;

  // Event Listeners
  container.querySelector('#btn-evaluacion').addEventListener('click', () => {
    openEvaluacionModal(container.querySelector('#evaluacion-container'));
  });
}

function renderRatioCard(label, value, unit, formula, status, icon) {
  const color = status === 'success' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';
  const bgColor = status === 'success' ? 'rgba(16,185,129,0.1)' : status === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';

  return `
    <div class="card" style="padding:1.25rem;display:flex;flex-direction:column;gap:0.5rem;transition:transform 0.2s;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="width:40px;height:40px;border-radius:10px;background:${bgColor};color:${color};display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
          <i class="fas ${icon}"></i>
        </div>
        <span style="font-size:0.65rem;font-family:monospace;padding:2px 8px;background:rgba(255,255,255,0.05);border-radius:4px;color:var(--text-muted);">${formula}</span>
      </div>
      <div style="margin-top:0.5rem;">
        <div style="font-size:1.75rem;font-weight:800;color:${color}">${formatNumber(value, 2)}<small style="font-size:0.9rem;margin-left:4px;opacity:0.7;">${unit}</small></div>
        <div style="font-size:0.85rem;font-weight:600;margin-top:2px;">${label}</div>
      </div>
    </div>
  `;
}

function renderRatioCardMini(label, value, unit, formula, status, icon) {
  const color = status === 'success' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';
  return `
    <div class="card" style="padding:1rem;display:flex;flex-direction:column;gap:0.25rem;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:0.25rem;">
        <i class="fas ${icon}" style="color:${color};font-size:0.9rem;"></i>
        <div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.02em;">${label}</div>
      </div>
      <div style="font-size:1.25rem;font-weight:700;">${formatNumber(value, 1)}${unit}</div>
      <div style="font-size:0.65rem;color:var(--text-muted);font-family:monospace;">${formula}</div>
    </div>
  `;
}

function openEvaluacionModal(resultContainer) {
  const modal = openModal('Evaluación de Proyecto — VAN / TIR / Payback', `
    <div style="display:grid;gap:1.5rem;">
      <p style="font-size:0.85rem;opacity:0.7;">Calcula la rentabilidad de una inversión en base a flujos de caja proyectados.</p>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group">
          <label style="display:block;margin-bottom:0.5rem;font-size:0.85rem;font-weight:600;">Inversión Inicial ($)</label>
          <input type="number" id="eval-inversion" class="form-control" placeholder="Ej: 10.000.000" style="width:100%;">
        </div>
        <div class="form-group">
          <label style="display:block;margin-bottom:0.5rem;font-size:0.85rem;font-weight:600;">Tasa de Descuento (%)</label>
          <input type="number" id="eval-tasa" class="form-control" value="10" min="0" max="100" step="0.5" style="width:100%;">
        </div>
      </div>
      
      <div class="form-group">
        <label style="display:block;margin-bottom:0.5rem;font-size:0.85rem;font-weight:600;">Flujos de Caja Anuales (separados por coma)</label>
        <textarea id="eval-flujos" class="form-control" rows="3" placeholder="Ej: 2000000, 3500000, 4000000, 5000000" style="width:100%;font-family:monospace;"></textarea>
        <div style="font-size:0.75rem;margin-top:4px;color:var(--text-muted);"><i class="fas fa-info-circle"></i> Ingresa un valor por cada año de proyección.</div>
      </div>
    </div>
  `, `
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
    <button class="btn btn-primary" id="btn-calc-eval">
      <i class="fas fa-calculator"></i> Calcular Rentabilidad
    </button>
  `, 'modal-lg');

  document.getElementById('modal-cancel').onclick = () => modal.close();

  modal.footerEl.querySelector('#btn-calc-eval').addEventListener('click', () => {
    const inversion = parseFloat(document.getElementById('eval-inversion').value) || 0;
    const tasa = parseFloat(document.getElementById('eval-tasa').value) / 100 || 0.1;
    const flujosStr = document.getElementById('eval-flujos').value;

    if (!inversion || !flujosStr) {
      showToast('Completa todos los campos', 'warning');
      return;
    }

    const flujos = flujosStr.split(',').map(f => parseFloat(f.trim()) || 0);

    // ─── VAN Calculation ───
    let van = -inversion;
    flujos.forEach((f, i) => {
      van += f / Math.pow(1 + tasa, i + 1);
    });

    // ─── TIR Calculation (Newton-Raphson) ───
    let tir = 0.1;
    for (let iter = 0; iter < 100; iter++) {
      let npv = -inversion;
      let dnpv = 0;
      flujos.forEach((f, i) => {
        npv += f / Math.pow(1 + tir, i + 1);
        dnpv -= (i + 1) * f / Math.pow(1 + tir, i + 2);
      });
      if (Math.abs(dnpv) < 1e-10) break;
      tir = tir - npv / dnpv;
      if (Math.abs(npv) < 0.01) break;
    }

    // ─── Payback Calculation ───
    let acumulado = -inversion;
    let payback = null;
    for (let i = 0; i < flujos.length; i++) {
      let antes = acumulado;
      acumulado += flujos[i];
      if (acumulado >= 0) {
        payback = i + (Math.abs(antes) / flujos[i]);
        break;
      }
    }

    modal.close();

    resultContainer.innerHTML = `
      <div class="animate-fade" style="margin-top:2rem;">
        <h3 style="margin-bottom:1.25rem;font-size:1.1rem;"><i class="fas fa-chart-bar" style="color:var(--accent-primary);margin-right:8px;"></i>Resultado de Evaluación</h3>
        
        <div class="grid-3" style="gap:1.5rem;margin-bottom:2rem;">
          <div class="card" style="padding:1.5rem;border-left:4px solid ${van >= 0 ? '#10b981' : '#ef4444'}">
            <div style="font-size:0.8rem;color:var(--text-muted);font-weight:600;margin-bottom:4px;">VAN (Valor Actual Neto)</div>
            <div style="font-size:1.6rem;font-weight:800;color:${van >= 0 ? '#10b981' : '#ef4444'}">${formatCLP(Math.round(van))}</div>
            <div style="font-size:0.75rem;margin-top:8px;font-weight:600;display:flex;align-items:center;gap:4px;color:${van >= 0 ? '#10b981' : '#ef4444'}">
              <i class="fas ${van >= 0 ? 'fa-check-circle' : 'fa-times-circle'}"></i> 
              ${van >= 0 ? 'Proyecto Rentable' : 'Proyecto no aconsejado'}
            </div>
          </div>
          
          <div class="card" style="padding:1.5rem;border-left:4px solid ${tir > tasa ? '#10b981' : '#f59e0b'}">
            <div style="font-size:0.8rem;color:var(--text-muted);font-weight:600;margin-bottom:4px;">TIR (Tasa Interna de Retorno)</div>
            <div style="font-size:1.6rem;font-weight:800;">${formatNumber(tir * 100, 2)}%</div>
            <div style="font-size:0.75rem;margin-top:8px;opacity:0.7;">Tasa de descuento: ${formatNumber(tasa * 100, 1)}%</div>
          </div>
          
          <div class="card" style="padding:1.5rem;border-left:4px solid #60a5fa">
            <div style="font-size:0.8rem;color:var(--text-muted);font-weight:600;margin-bottom:4px;">Payback (Retorno)</div>
            <div style="font-size:1.6rem;font-weight:800;">${payback !== null ? formatNumber(payback, 1) : 'N/A'} <small style="font-size:0.9rem;opacity:0.6;">años</small></div>
            <div style="font-size:0.75rem;margin-top:8px;opacity:0.7;">Tiempo para recuperar inversión</div>
          </div>
        </div>

        <div class="card" style="padding:0;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead style="background:var(--surface-light);">
              <tr>
                <th style="padding:12px;text-align:left;">Año</th>
                <th style="padding:12px;text-align:right;">Flujo Neto</th>
                <th style="padding:12px;text-align:right;">Flujo Descontado</th>
                <th style="padding:12px;text-align:right;">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:10px 12px;"><span style="background:var(--accent);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;">0</span></td>
                <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#ef4444;">- ${formatCLP(inversion)}</td>
                <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#ef4444;">- ${formatCLP(inversion)}</td>
                <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#ef4444;">- ${formatCLP(inversion)}</td>
              </tr>
              ${flujos.map((f, i) => {
      const fd = f / Math.pow(1 + tasa, i + 1);
      // Simple accumulated flow for presentation
      let acum = -inversion;
      for (let j = 0; j <= i; j++) acum += flujos[j];

      return `
                  <tr style="border-top:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:10px 12px;"><span style="background:var(--secondary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;">${i + 1}</span></td>
                    <td style="padding:10px 12px;text-align:right;font-family:monospace;color:${f >= 0 ? '#10b981' : '#ef4444'};">${formatCLP(Math.round(f))}</td>
                    <td style="padding:10px 12px;text-align:right;font-family:monospace;">${formatCLP(Math.round(fd))}</td>
                    <td style="padding:10px 12px;text-align:right;font-family:monospace;color:${acum >= 0 ? '#10b981' : '#ef4444'};">${formatCLP(Math.round(acum))}</td>
                  </tr>
                `;
    }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Smooth scroll to results
    setTimeout(() => {
      resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  });
}
