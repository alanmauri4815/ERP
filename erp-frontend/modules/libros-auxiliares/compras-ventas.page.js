/* ============================================
   LIBROS DE COMPRAS Y VENTAS (Supabase)
   ============================================ */

import { registrarCompra, registrarVenta, getResumenIVA } from '../../services/contabilidad.service.js';
import { db } from '../../services/datastore.js';
import { formatCLP } from '../../utils/formatters.js';
import { showToast, openModal, closeModal } from '../../components/ui-helpers.js';
import { TIPOS_DOCUMENTO } from '../../utils/constants.js';

export async function renderLibroCompras(container) {
  await renderAuxiliar(container, 'libro_compras', 'Libro de Compras', 'Registro de facturas recibidas');
}

export async function renderLibroVentas(container) {
  await renderAuxiliar(container, 'libro_ventas', 'Libro de Ventas', 'Registro de facturas emitidas');
}

async function renderAuxiliar(container, tipo, titulo, subtitulo) {
  const now = new Date();
  const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  container.innerHTML = `<div class="skeleton-loader">Cargando registros...</div>`;

  const items = await db.getAll(tipo);
  const resumen = await getResumenIVA(periodo);

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">${titulo}</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">${subtitulo}</p>
      </div>
      <button class="btn btn-primary" id="btn-nuevo-doc">
        <i class="fas fa-plus"></i> Registrar ${tipo.includes('compras') ? 'Compra' : 'Venta'}
      </button>
    </div>

    <!-- Resumen IVA Mensual -->
    <div class="grid-4 animate-fade-in" style="margin-bottom:var(--space-xl);">
      <div class="card" style="padding:var(--space-md);">
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Documentos del Mes</div>
        <div style="font-size:var(--font-size-xl);font-weight:bold;">${tipo === 'compras' ? resumen.cantidadCompras : resumen.cantidadVentas}</div>
      </div>
      <div class="card" style="padding:var(--space-md);">
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Total Neto</div>
        <div style="font-size:var(--font-size-xl);font-weight:bold;">${formatCLP(tipo === 'compras' ? resumen.totalComprasNeto : resumen.totalVentasNeto)}</div>
      </div>
      <div class="card" style="padding:var(--space-md);">
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Total IVA</div>
        <div style="font-size:var(--font-size-xl);font-weight:bold;">${formatCLP(tipo === 'compras' ? resumen.creditoFiscal : resumen.debitoFiscal)}</div>
      </div>
    </div>

    <div class="card animate-fade-in" style="padding:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>N° Doc</th>
            <th>RUT</th>
            <th>Razón Social</th>
            <th style="text-align:right;">Neto</th>
            <th style="text-align:right;">IVA</th>
            <th style="text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.fecha}</td>
              <td><span class="badge badge-neutral">${item.tipo_dte}</span></td>
              <td class="cell-mono">${item.numero}</td>
              <td class="cell-mono">${item.rut}</td>
              <td>${item.nombre}</td>
              <td class="cell-mono" style="text-align:right;">${formatCLP(item.neto)}</td>
              <td class="cell-mono" style="text-align:right;">${formatCLP(item.iva)}</td>
              <td class="cell-mono" style="text-align:right;font-weight:bold;">${formatCLP(item.total)}</td>
            </tr>
          `).join('')}
          ${items.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:var(--space-2xl);color:var(--text-muted);">No hay documentos registrados</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#btn-nuevo-doc').addEventListener('click', () => openDocModal(tipo, container));
}

function openDocModal(tipo, container) {
  const title = tipo === 'compras' ? 'Registrar Compra' : 'Registrar Venta';

  const content = `
    <form id="form-doc">
      <div class="form-row">
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" class="form-control" name="fecha" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Tipo Documento</label>
          <select class="form-control" name="tipo_dte" required>
            ${TIPOS_DOCUMENTO.map(d => `<option value="${d.codigo}">${d.nombre}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Número Documento</label>
          <input type="text" class="form-control" name="numero" placeholder="Ej: 1234" required>
        </div>
        <div class="form-group">
          <label>RUT ${tipo.includes('compras') ? 'Proveedor' : 'Cliente'}</label>
          <input type="text" class="form-control" name="rut" placeholder="Ej: 76.123.456-7" required>
        </div>
      </div>
      <div class="form-group">
        <label>Nombre / Razón Social</label>
        <input type="text" class="form-control" name="nombre" placeholder="Ej: Empresa SPA" required>
      </div>
      <div class="form-group">
        <label>Monto Neto (CLP)</label>
        <input type="number" class="form-control" name="neto" placeholder="0" required>
      </div>
      <div class="form-group">
        <label>Glosa Contable</label>
        <input type="text" class="form-control" name="glosa" placeholder="Opcional...">
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar Documento</button>
      </div>
    </form>
  `;

  openModal(title, content);

  document.getElementById('form-doc').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    data.neto = parseInt(data.neto);

    try {
      if (tipo === 'compras') {
        await registrarCompra(data);
      } else {
        await registrarVenta(data);
      }

      showToast('Documento registrado con éxito en Supabase y Libro Diario', 'success');
      closeModal();
      // Recargar la página actual
      if (tipo.includes('compras')) await renderLibroCompras(container);
      else await renderLibroVentas(container);

    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}
