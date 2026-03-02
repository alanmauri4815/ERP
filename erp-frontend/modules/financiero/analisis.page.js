/* ============================================
   ANÁLISIS FINANCIERO — Ratios & Evaluación
   ============================================ */

import { getBalanceGeneral, getEstadoResultados } from '../../services/contabilidad.service.js';
import { db } from '../../services/datastore.js';
import { formatCLP, formatNumber, formatPercent } from '../../utils/formatters.js';
import { showToast, openModal } from '../../components/ui-helpers.js';

export function renderAnalisisFinanciero(container) {
    const bg = getBalanceGeneral();
    const er = getEstadoResultados();

    // Calculate ratios
    const activoCorriente = bg.activos.filter(a => a.codigo.startsWith('1.1')).reduce((s, a) => s + a.saldo, 0);
    const pasivoCorriente = bg.pasivos.filter(p => p.codigo.startsWith('2.1')).reduce((s, p) => s + p.saldo, 0);
    const existencias = bg.activos.filter(a => a.codigo === '1.1.08').reduce((s, a) => s + a.saldo, 0);

    const ratios = {
        liquidezCorriente: pasivoCorriente > 0 ? activoCorriente / pasivoCorriente : 0,
        pruebaAcida: pasivoCorriente > 0 ? (activoCorriente - existencias) / pasivoCorriente : 0,
        endeudamiento: bg.totalActivos > 0 ? bg.totalPasivos / bg.totalActivos : 0,
        roe: bg.totalPatrimonio > 0 ? er.utilidadNeta / bg.totalPatrimonio : 0,
        roa: bg.totalActivos > 0 ? er.utilidadNeta / bg.totalActivos : 0,
        margenNeto: er.totalIngresos > 0 ? er.utilidadNeta / er.totalIngresos : 0,
        margenBruto: er.totalIngresos > 0 ? er.utilidadBruta / er.totalIngresos : 0,
    };

    container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Análisis Financiero</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">
          Ratios financieros y evaluación económica de proyectos
        </p>
      </div>
      <button class="btn btn-primary" id="btn-evaluacion">
        <i class="fas fa-calculator"></i> Evaluación de Proyecto (VAN/TIR)
      </button>
    </div>

    <!-- Ratios de Liquidez -->
    <h3 style="margin-bottom:var(--space-md);color:var(--text-primary);"><i class="fas fa-droplet" style="color:var(--status-info);margin-right:8px;"></i>Ratios de Liquidez</h3>
    <div class="grid-3 animate-fade-in" style="margin-bottom:var(--space-2xl);">
      ${renderRatioCard('Liquidez Corriente', ratios.liquidezCorriente, 'veces', 'Activo Corriente / Pasivo Corriente', ratios.liquidezCorriente >= 1.5 ? 'green' : ratios.liquidezCorriente >= 1 ? 'yellow' : 'red', 'fa-tachometer-alt')}
      ${renderRatioCard('Prueba Ácida', ratios.pruebaAcida, 'veces', '(AC - Existencias) / PC', ratios.pruebaAcida >= 1 ? 'green' : 'red', 'fa-flask')}
      ${renderRatioCard('Endeudamiento', ratios.endeudamiento, '%×100', 'Total Pasivos / Total Activos', ratios.endeudamiento <= 0.5 ? 'green' : ratios.endeudamiento <= 0.7 ? 'yellow' : 'red', 'fa-scale-balanced')}
    </div>

    <!-- Ratios de Rentabilidad -->
    <h3 style="margin-bottom:var(--space-md);color:var(--text-primary);"><i class="fas fa-chart-line" style="color:var(--status-success);margin-right:8px;"></i>Ratios de Rentabilidad</h3>
    <div class="grid-4 animate-fade-in" style="margin-bottom:var(--space-2xl);animation-delay:0.1s;">
      ${renderRatioCard('ROE', ratios.roe * 100, '%', 'Utilidad / Patrimonio', ratios.roe > 0 ? 'green' : 'red', 'fa-percentage')}
      ${renderRatioCard('ROA', ratios.roa * 100, '%', 'Utilidad / Activos', ratios.roa > 0 ? 'green' : 'red', 'fa-chart-pie')}
      ${renderRatioCard('Margen Bruto', ratios.margenBruto * 100, '%', 'Util. Bruta / Ingresos', ratios.margenBruto > 0.3 ? 'green' : 'yellow', 'fa-percent')}
      ${renderRatioCard('Margen Neto', ratios.margenNeto * 100, '%', 'Util. Neta / Ingresos', ratios.margenNeto > 0 ? 'green' : 'red', 'fa-bullseye')}
    </div>

    <!-- Evaluación de Proyectos -->
    <div id="evaluacion-container"></div>
  `;

    container.querySelector('#btn-evaluacion').addEventListener('click', () => {
        openEvaluacionModal(container.querySelector('#evaluacion-container'));
    });
}

function renderRatioCard(label, value, unit, formula, color, icon) {
    const colorVar = color === 'green' ? '--status-success' : color === 'yellow' ? '--status-warning' : '--status-error';
    return `
    <div class="stat-card">
      <div class="stat-icon ${color}"><i class="fas ${icon}"></i></div>
      <div class="stat-value" style="color:var(${colorVar});">${formatNumber(value, 2)}<span style="font-size:var(--font-size-sm);opacity:0.7;margin-left:4px;">${unit}</span></div>
      <div class="stat-label">${label}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;font-family:var(--font-mono);">${formula}</div>
    </div>
  `;
}

function openEvaluacionModal(resultContainer) {
    const modal = openModal('Evaluación de Proyecto — VAN / TIR / Payback', `
    <div class="form-row">
      <div class="form-group">
        <label>Inversión Inicial ($)</label>
        <input type="number" id="eval-inversion" placeholder="Ej: 10000000" min="0" />
      </div>
      <div class="form-group">
        <label>Tasa de Descuento (%)</label>
        <input type="number" id="eval-tasa" value="10" min="0" max="100" step="0.5" />
      </div>
    </div>
    <div class="form-group">
      <label>Flujos de Caja Anuales (separados por coma)</label>
      <input type="text" id="eval-flujos" placeholder="Ej: 2000000, 3000000, 4000000, 5000000, 5000000" />
      <div class="form-help">Ingresa los flujos netos de cada año separados por comas</div>
    </div>
  `, `
    <button class="btn btn-ghost" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Cancelar</button>
    <button class="btn btn-primary" id="btn-calc-eval">
      <i class="fas fa-calculator"></i> Calcular
    </button>
  `, 'modal-lg');

    modal.footerEl.querySelector('#btn-calc-eval').addEventListener('click', () => {
        const inversion = parseFloat(modal.bodyEl.querySelector('#eval-inversion').value) || 0;
        const tasa = parseFloat(modal.bodyEl.querySelector('#eval-tasa').value) / 100 || 0.1;
        const flujosStr = modal.bodyEl.querySelector('#eval-flujos').value;

        if (!inversion || !flujosStr) {
            showToast('Completa todos los campos', 'warning');
            return;
        }

        const flujos = flujosStr.split(',').map(f => parseFloat(f.trim()) || 0);

        // VAN
        let van = -inversion;
        flujos.forEach((f, i) => {
            van += f / Math.pow(1 + tasa, i + 1);
        });

        // TIR (Newton-Raphson)
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

        // Payback
        let acumulado = -inversion;
        let payback = null;
        for (let i = 0; i < flujos.length; i++) {
            acumulado += flujos[i];
            if (acumulado >= 0) {
                const fraccion = (acumulado - flujos[i] < 0) ? Math.abs(acumulado - flujos[i]) / flujos[i] : 0;
                payback = i + fraccion;
                break;
            }
        }

        modal.close();

        resultContainer.innerHTML = `
      <div class="animate-fade-in">
        <h3 style="margin-bottom:var(--space-lg);"><i class="fas fa-chart-bar" style="color:var(--accent-primary);margin-right:8px;"></i>Resultado de Evaluación</h3>
        <div class="grid-3" style="margin-bottom:var(--space-xl);">
          <div class="stat-card">
            <div class="stat-icon ${van >= 0 ? 'green' : 'red'}"><i class="fas fa-money-bill-trend-up"></i></div>
            <div class="stat-value" style="color:var(${van >= 0 ? '--status-success' : '--status-error'});">${formatCLP(Math.round(van))}</div>
            <div class="stat-label">VAN (Valor Actual Neto)</div>
            <span class="stat-change ${van >= 0 ? 'up' : 'down'}">
              ${van >= 0 ? 'Proyecto Rentable' : 'Proyecto No Rentable'}
            </span>
          </div>
          <div class="stat-card">
            <div class="stat-icon ${tir > tasa ? 'green' : 'red'}"><i class="fas fa-percentage"></i></div>
            <div class="stat-value" style="color:var(${tir > tasa ? '--status-success' : '--status-error'});">${formatNumber(tir * 100, 2)}%</div>
            <div class="stat-label">TIR (Tasa Interna de Retorno)</div>
            <span class="stat-change ${tir > tasa ? 'up' : 'down'}">
              vs Tasa: ${formatNumber(tasa * 100, 1)}%
            </span>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue"><i class="fas fa-clock"></i></div>
            <div class="stat-value">${payback !== null ? formatNumber(payback, 1) : 'N/A'}</div>
            <div class="stat-label">Payback (años)</div>
            <span class="stat-change ${payback !== null && payback <= flujos.length ? 'up' : 'down'}">
              ${payback !== null ? `Recupera en ${formatNumber(payback, 1)} años` : 'No se recupera'}
            </span>
          </div>
        </div>

        <!-- Cash flow table -->
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Año</th>
                <th style="text-align:right;">Flujo Neto</th>
                <th style="text-align:right;">Flujo Descontado</th>
                <th style="text-align:right;">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span class="badge badge-primary">0</span></td>
                <td class="cell-mono cell-negative" style="text-align:right;">- ${formatCLP(inversion)}</td>
                <td class="cell-mono cell-negative" style="text-align:right;">- ${formatCLP(inversion)}</td>
                <td class="cell-mono cell-negative" style="text-align:right;">- ${formatCLP(inversion)}</td>
              </tr>
              ${flujos.map((f, i) => {
            const fd = f / Math.pow(1 + tasa, i + 1);
            const acum = -inversion + flujos.slice(0, i + 1).reduce((s, fl, j) => s + fl / Math.pow(1 + tasa, j + 1), 0);
            return `
                  <tr>
                    <td><span class="badge badge-info">${i + 1}</span></td>
                    <td class="cell-mono ${f >= 0 ? 'cell-positive' : 'cell-negative'}" style="text-align:right;">${formatCLP(Math.round(f))}</td>
                    <td class="cell-mono" style="text-align:right;">${formatCLP(Math.round(fd))}</td>
                    <td class="cell-mono ${acum >= 0 ? 'cell-positive' : 'cell-negative'}" style="text-align:right;">${formatCLP(Math.round(acum))}</td>
                  </tr>
                `;
        }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    });
}
