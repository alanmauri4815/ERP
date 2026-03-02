import { getHonorarios, registrarHonorario } from '../../services/contabilidad.service.js';
import { showToast, openModal } from '../../components/ui-helpers.js';

export async function renderHonorarios(container) {
  container.innerHTML = `<div class="skeleton-loader">Cargando Libro de Honorarios Profesional...</div>`;

  try {
    const honorarios = await getHonorarios();
    const totalRetencion = honorarios.reduce((sum, h) => sum + h.retencion, 0);
    const totalBruto = honorarios.reduce((sum, h) => sum + h.bruto, 0);

    container.innerHTML = `
            <div class="section-header">
                <div>
                    <h2 class="section-title">Libro de Honorarios (Boletas)</h2>
                    <p style="color:var(--text-muted); font-size: 13px;">Gestión de retención SII Actualizada (13.75%)</p>
                </div>
                <div class="section-actions">
                    <button class="btn btn-primary" id="btn-nuevo-honorario">+ Registrar Boleta</button>
                    <button class="btn btn-secondary" id="btn-export-honorarios">Exportar DJ 1879</button>
                </div>
            </div>

            <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 20px;">
                <div class="kpi-card">
                  <span class="label">Total Bruto Semestral</span>
                  <div class="value" style="color:#60a5fa;">$${totalBruto.toLocaleString('es-CL')}</div>
                </div>
                <div class="kpi-card">
                  <span class="label">Total Retención SII</span>
                  <div class="value" style="color:#ef4444;">$${totalRetencion.toLocaleString('es-CL')}</div>
                  <small>Formulario 29</small>
                </div>
                <div class="kpi-card">
                  <span class="label">Total por Pagar (Neto)</span>
                  <div class="value" style="color:#10b981;">$${(totalBruto - totalRetencion).toLocaleString('es-CL')}</div>
                </div>
            </div>

            <div class="card">
                <table class="table" style="width:100%">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>RUT</th>
                            <th>Profesional</th>
                            <th>Glosa</th>
                            <th style="text-align:right">Bruto</th>
                            <th style="text-align:right">Retención (13.75%)</th>
                            <th style="text-align:right">Líquido</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${honorarios.map(h => `
                            <tr>
                                <td>${h.fecha}</td>
                                <td>${h.rut}</td>
                                <td style="font-weight:bold;">${h.profesional}</td>
                                <td>${h.glosa || '-'}</td>
                                <td style="text-align:right;">$${parseInt(h.bruto).toLocaleString()}</td>
                                <td style="text-align:right; color:#ef4444;">$${parseInt(h.retencion).toLocaleString()}</td>
                                <td style="text-align:right; color:#10b981; font-weight:700;">$${parseInt(h.liquido).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

    setupHonorariosEvents(container);

  } catch (err) {
    showToast('Error al cargar honorarios', 'error');
    container.innerHTML = `<div class="error-msg">Error: ${err.message}</div>`;
  }
}

function setupHonorariosEvents(container) {
  container.querySelector('#btn-nuevo-honorario').onclick = () => {
    const formHtml = `
            <form id="form-honorario" style="padding:1rem;">
                <div class="form-group">
                    <label>Fecha de Emisión</label>
                    <input type="date" class="form-control" name="fecha" value="${new Date().toISOString().substring(0, 10)}" required>
                </div>
                <div class="form-group">
                    <label>RUT del Profesional</label>
                    <input type="text" class="form-control" name="rut" placeholder="Ej: 12.345.678-9" required>
                </div>
                <div class="form-group">
                    <label>Nombre del Profesional</label>
                    <input type="text" class="form-control" name="profesional" required>
                </div>
                <div class="form-group">
                    <label>Monto Bruto ($)</label>
                    <input type="number" class="form-control" name="bruto" id="input-bruto" required>
                    <small id="calc-preview" style="color:#94a3b8;">La retención se calculará automáticamente.</small>
                </div>
                <div class="form-group">
                    <label>Glosa o Servicio</label>
                    <input type="text" class="form-control" name="glosa">
                </div>
                <div class="modal-footer" style="margin-top:1rem;">
                    <button type="submit" class="btn btn-primary" style="width:100%">Registrar en Libro y Generar Asiento</button>
                </div>
            </form>
        `;

    openModal('Registrar Nueva Boleta de Honorarios', formHtml);

    document.getElementById('form-honorario').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Procesando...';

      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);

      try {
        await registrarHonorario(data);
        showToast('Boleta registrada con éxito', 'success');
        // Realizar redeploy/refresh
        renderHonorarios(container);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Registrar en Libro';
      }
    };
  };
}
