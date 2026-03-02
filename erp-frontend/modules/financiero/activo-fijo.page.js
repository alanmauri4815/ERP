/* ============================================
   ACTIVO FIJO — Control e Inventario (Supabase)
   ============================================ */

import { db } from '../../services/datastore.js';
import { generarDepreciacionMes } from '../../services/contabilidad.service.js';
import { formatCLP } from '../../utils/formatters.js';
import { showToast, openModal, closeModal } from '../../components/ui-helpers.js';
import { VIDAS_UTILES_SII } from '../../utils/constants.js';

export async function renderActivoFijo(container) {
  container.innerHTML = `<div class="skeleton-loader">Cargando inventario de activos...</div>`;

  const [activos, centros, movimientos] = await Promise.all([
    db.getAll('activo_fijo'),
    db.getAll('centros_costo'),
    db.getAll('activo_movimientos')
  ]);

  const totalInversion = activos.reduce((s, a) => s + a.valor_compra, 0);
  const totalDepAcumulada = movimientos.filter(m => m.tipo === 'depreciacion').reduce((s, m) => s + m.monto, 0);

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Control de Activo Fijo</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">Gestión de bienes capitalizables y depreciación SII</p>
      </div>
      <div style="display:flex; gap:var(--space-md);">
        <button class="btn btn-secondary" id="btn-depreciar">
          <i class="fas fa-calculator"></i> Procesar Depreciación Mes
        </button>
        <button class="btn btn-primary" id="btn-nuevo-activo">
          <i class="fas fa-plus"></i> Incorporar Activo
        </button>
      </div>
    </div>

    <div class="grid-4 animate-fade-in" style="margin-bottom:var(--space-2xl);">
      <div class="stat-card">
        <div class="stat-label">Valor Libro Total</div>
        <div class="stat-value">${formatCLP(totalInversion - totalDepAcumulada)}</div>
        <div class="stat-label" style="font-size:10px; margin-top:4px;">Inversión: ${formatCLP(totalInversion)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Depreciación Acumulada</div>
        <div class="stat-value" style="color:var(--status-error);">${formatCLP(totalDepAcumulada)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Activos en Inventario</div>
        <div class="stat-value">${activos.length}</div>
      </div>
    </div>

    <div class="card animate-fade-in" style="padding:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Bien / Activo</th>
            <th style="text-align:right;">Valor Compra</th>
            <th style="text-align:right;">Dep. Acumulada</th>
            <th style="text-align:right;">Valor Libro</th>
            <th>C. Costo</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${activos.map(a => {
    const depA = movimientos
      .filter(m => m.activo_id === a.id && m.tipo === 'depreciacion')
      .reduce((s, m) => s + m.monto, 0);

    return `
              <tr>
                <td class="cell-mono">${a.codigo}</td>
                <td>
                  <div style="font-weight:600;">${a.nombre}</div>
                  <div style="font-size:10px; color:var(--text-muted);">${a.categoria}</div>
                </td>
                <td class="cell-mono" style="text-align:right;">${formatCLP(a.valor_compra)}</td>
                <td class="cell-mono" style="text-align:right; color:var(--status-error);">${formatCLP(depA)}</td>
                <td class="cell-mono" style="text-align:right; font-weight:bold;">${formatCLP(a.valor_compra - depA)}</td>
                <td><span class="badge badge-neutral">${centros.find(c => c.id === a.centro_costo_id)?.codigo || '-'}</span></td>
                <td><span class="badge badge-success">${a.estado}</span></td>
              </tr>
            `;
  }).join('')}
          ${activos.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:var(--space-2xl);color:var(--text-muted);">No se han registrado activos fijos</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;

  // Event Listeners
  container.querySelector('#btn-nuevo-activo').addEventListener('click', () => openActivoModal(centros, container));

  container.querySelector('#btn-depreciar').addEventListener('click', async () => {
    const periodo = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    if (!confirm(`¿Desea procesar la depreciación legal de todos los activos para el período ${periodo}?`)) return;

    try {
      const result = await generarDepreciacionMes(periodo);
      if (result.cantidad > 0) {
        showToast(`Se depreciaron ${result.cantidad} activos por un total de ${formatCLP(result.totalDepreciacion)}`, 'success');
        await renderActivoFijo(container);
      } else {
        showToast('No hay activos pendientes de depreciación para este período.', 'info');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function openActivoModal(centros, container) {
  const content = `
    <form id="form-activo">
      <div class="form-row">
        <div class="form-group">
          <label>Código Interno</label>
          <input type="text" class="form-control" name="codigo" placeholder="Ej: VEH-001" required>
        </div>
        <div class="form-group">
          <label>Categoría SII</label>
          <select class="form-control" name="categoria" id="sel-categoria" required>
            ${VIDAS_UTILES_SII.map(v => `<option value="${v.categoria}" data-vida="${v.vidaUtil * 12}">${v.categoria}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Nombre del Bien</label>
        <input type="text" class="form-control" name="nombre" placeholder="Ej: Camioneta Reparto 2026" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha de Adquisición</label>
          <input type="date" class="form-control" name="fecha_adquisicion" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
            <label>Vida Útil Estimada (Meses)</label>
            <input type="number" class="form-control" name="vida_util_meses" id="input-vida" required>
            <small class="form-help">Sugerido por SII para esta categoría.</small>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Valor Neto de Compra (CLP)</label>
          <input type="number" class="form-control" name="valor_compra" required>
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
        <button type="submit" class="btn btn-primary">Incorporar al Inventario</button>
      </div>
    </form>
  `;

  openModal('Incorporar Nuevo Activo Fijo', content);

  const selCat = document.getElementById('sel-categoria');
  const inputVida = document.getElementById('input-vida');

  const updateVida = () => {
    const selected = selCat.options[selCat.selectedIndex];
    inputVida.value = selected.dataset.vida;
  };
  selCat.addEventListener('change', updateVida);
  updateVida();

  document.getElementById('form-activo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    data.valor_compra = parseInt(data.valor_compra);
    data.vida_util_meses = parseInt(data.vida_util_meses);

    try {
      await db.insert('activo_fijo', data);
      showToast('Activo fijo incorporado correctamente', 'success');
      closeModal();
      await renderActivoFijo(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
