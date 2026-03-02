/* ============================================
   LIBRO DE HONORARIOS (Supabase)
   ============================================ */

import { registrarHonorario } from '../../services/contabilidad.service.js';
import { db } from '../../services/datastore.js';
import { formatCLP } from '../../utils/formatters.js';
import { showToast, openModal, closeModal } from '../../components/ui-helpers.js';

export async function renderLibroHonorarios(container) {
    container.innerHTML = `<div class="skeleton-loader">Cargando Libro de Honorarios...</div>`;

    const [items, centros] = await Promise.all([
        db.getAll('honorarios'),
        db.getAll('centros_costo')
    ]);

    container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Libro de Honorarios</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">Registro de boletas de servicios de terceros</p>
      </div>
      <button class="btn btn-primary" id="btn-nuevo-honorario">
        <i class="fas fa-plus"></i> Registrar Boleta
      </button>
    </div>

    <div class="card animate-fade-in" style="padding:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>N° Boleta</th>
            <th>RUT</th>
            <th>Nombre Profesionial</th>
            <th style="text-align:right;">Bruto</th>
            <th style="text-align:right;">Retención (13.75%)</th>
            <th style="text-align:right;">Líquido</th>
            <th>C. Costo</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.fecha}</td>
              <td class="cell-mono">${item.numero}</td>
              <td class="cell-mono">${item.rut}</td>
              <td>${item.nombre}</td>
              <td class="cell-mono" style="text-align:right;">${formatCLP(item.bruto)}</td>
              <td class="cell-mono" style="text-align:right; color:var(--status-error);">${formatCLP(item.retencion)}</td>
              <td class="cell-mono" style="text-align:right; font-weight:bold; color:var(--status-success);">${formatCLP(item.liquido)}</td>
              <td><span class="badge badge-info">${centros.find(c => c.id === item.centro_costo_id)?.codigo || '-'}</span></td>
            </tr>
          `).join('')}
          ${items.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:var(--space-2xl);color:var(--text-muted);">Sin boletas registradas</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;

    container.querySelector('#btn-nuevo-honorario').addEventListener('click', () => openHonorarioModal(centros, container));
}

function openHonorarioModal(centros, container) {
    const content = `
    <form id="form-honorario">
      <div class="form-row">
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" class="form-control" name="fecha" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>N° Boleta</label>
          <input type="text" class="form-control" name="numero" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>RUT Profesional</label>
          <input type="text" class="form-control" name="rut" placeholder="12.345.678-9" required>
        </div>
        <div class="form-group">
          <label>Nombre Profesional</label>
          <input type="text" class="form-control" name="nombre" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Monto Bruto (CLP)</label>
          <input type="number" class="form-control" name="bruto" required>
        </div>
        <div class="form-group">
          <label>Centro de Costo</label>
          <select class="form-control" name="centro_costo_id">
            ${centros.map(c => `<option value="${c.id}">${c.codigo} - ${c.nombre}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar Boleta</button>
      </div>
    </form>
  `;

    openModal('Registrar Nueva Boleta de Honorarios', content);

    document.getElementById('form-honorario').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.bruto = parseInt(data.bruto);

        try {
            await registrarHonorario(data);
            showToast('Boleta registrada y asiento generado con éxito', 'success');
            closeModal();
            await renderLibroHonorarios(container);
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}
