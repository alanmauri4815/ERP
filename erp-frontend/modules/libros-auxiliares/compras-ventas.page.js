/* ============================================
   LIBROS DE COMPRAS Y VENTAS — Datos desde ERP
   Con tracking de pagos (Devengado/Parcial/Pagado)
   ============================================ */

import { erpFetch } from '../../services/erp-api.js';
import { crearAsiento } from '../../services/contabilidad.service.js';
import { db } from '../../services/datastore.js';
import { formatCLP } from '../../utils/formatters.js';
import { showToast, openModal, closeModal } from '../../components/ui-helpers.js';
import { IVA_RATE } from '../../utils/constants.js';

export async function renderLibroCompras(container) {
  await renderAuxiliar(container, 'compras', 'Libro de Compras', 'Registro de facturas recibidas — datos del módulo de Compras ERP');
}

export async function renderLibroVentas(container) {
  await renderAuxiliar(container, 'ventas', 'Libro de Ventas', 'Registro de facturas emitidas — datos del módulo de Ventas ERP');
}

async function renderAuxiliar(container, tipo, titulo, subtitulo) {
  container.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--text-muted);">
    <div class="spinner" style="margin:0 auto 1rem;"></div>
    Cargando ${titulo} desde el ERP...
  </div>`;

  try {
    const endpoint = tipo === 'compras' ? '/purchases' : '/sales';
    const rawData = await erpFetch(endpoint);

    if (!rawData) {
      container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted);">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:1rem;display:block;opacity:0.5;"></i>
        No se pudo conectar con el servidor ERP. Verifica tu conexión.
      </div>`;
      return;
    }

    const items = Array.isArray(rawData) ? rawData : [];

    // Calculate totals
    let totalNeto = 0, totalIVA = 0, totalBruto = 0, totalPagado = 0, totalPendiente = 0;
    items.forEach(item => {
      const total = parseFloat(item.total) || 0;
      const neto = parseFloat(item.net) || Math.round(total / (1 + IVA_RATE));
      const iva = parseFloat(item.iva) || (total - neto);
      const pagado = parseFloat(item.paid_amount) || 0;
      totalNeto += neto;
      totalIVA += iva;
      totalBruto += total;
      totalPagado += pagado;
      totalPendiente += (total - pagado);
    });



    container.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title">${titulo}</h2>
          <p style="color:var(--text-muted);font-size:0.85rem;margin-top:4px;">${subtitulo}</p>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <span style="font-size:0.8rem;color:var(--text-muted);"><i class="fas fa-sync-alt"></i> ${items.length} registros</span>
        </div>
      </div>

      <!-- KPI Cards -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;margin-bottom:1.5rem;">
        <div class="card" style="padding:1rem;">
          <div style="font-size:0.75rem;color:var(--text-muted);">Documentos</div>
          <div style="font-size:1.5rem;font-weight:bold;">${items.length}</div>
        </div>
        <div class="card" style="padding:1rem;">
          <div style="font-size:0.75rem;color:var(--text-muted);">Total Neto</div>
          <div style="font-size:1.15rem;font-weight:bold;">${formatCLP(totalNeto)}</div>
        </div>
        <div class="card" style="padding:1rem;">
          <div style="font-size:0.75rem;color:var(--text-muted);">IVA (19%)</div>
          <div style="font-size:1.15rem;font-weight:bold;color:var(--accent,#60a5fa);">${formatCLP(totalIVA)}</div>
        </div>
        <div class="card" style="padding:1rem;">
          <div style="font-size:0.75rem;color:var(--text-muted);">Total Pagado</div>
          <div style="font-size:1.15rem;font-weight:bold;color:#10b981;">${formatCLP(totalPagado)}</div>
        </div>
        <div class="card" style="padding:1rem;">
          <div style="font-size:0.75rem;color:var(--text-muted);">Saldo Pendiente</div>
          <div style="font-size:1.15rem;font-weight:bold;color:${totalPendiente > 0 ? '#ef4444' : '#10b981'};">${formatCLP(Math.max(0, totalPendiente))}</div>
        </div>
      </div>

      <!-- Table -->
      <div class="card" style="padding:0;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead>
            <tr>
              <th style="padding:0.75rem 0.6rem;text-align:left;font-size:0.7rem;text-transform:uppercase;color:var(--text-muted);background:var(--surface-light);">Fecha</th>
              <th style="padding:0.75rem 0.6rem;text-align:left;font-size:0.7rem;text-transform:uppercase;color:var(--text-muted);background:var(--surface-light);">N° Doc</th>
              <th style="padding:0.75rem 0.6rem;text-align:left;font-size:0.7rem;text-transform:uppercase;color:var(--text-muted);background:var(--surface-light);">${tipo === 'compras' ? 'Proveedor' : 'Cliente'}</th>
              <th style="padding:0.75rem 0.6rem;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-muted);background:var(--surface-light);">Total</th>
              <th style="padding:0.75rem 0.6rem;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-muted);background:var(--surface-light);">Pagado</th>
              <th style="padding:0.75rem 0.6rem;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-muted);background:var(--surface-light);">Saldo</th>
              <th style="padding:0.75rem 0.6rem;text-align:center;font-size:0.7rem;text-transform:uppercase;color:var(--text-muted);background:var(--surface-light);">Estado</th>
              <th style="padding:0.75rem 0.6rem;text-align:center;font-size:0.7rem;text-transform:uppercase;color:var(--text-muted);background:var(--surface-light);">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${items.length === 0 ? `
              <tr><td colspan="8" style="text-align:center;padding:3rem;color:var(--text-muted);opacity:0.6;">
                <i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:0.5rem;"></i>
                No hay ${tipo === 'compras' ? 'compras' : 'ventas'} registradas
              </td></tr>
            ` : items.map(item => renderRow(item, tipo)).join('')}
          </tbody>
          ${items.length > 0 ? `
          <tfoot>
            <tr style="background:var(--surface-light);font-weight:bold;">
              <td colspan="3" style="padding:0.75rem 0.6rem;">TOTALES</td>
              <td style="padding:0.75rem 0.6rem;text-align:right;font-family:monospace;">${formatCLP(totalBruto)}</td>
              <td style="padding:0.75rem 0.6rem;text-align:right;font-family:monospace;color:#10b981;">${formatCLP(totalPagado)}</td>
              <td style="padding:0.75rem 0.6rem;text-align:right;font-family:monospace;color:#ef4444;">${formatCLP(Math.max(0, totalPendiente))}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>` : ''}
        </table>
      </div>
    `;

    // Attach abono button handlers
    container.querySelectorAll('.btn-abono').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const docTotal = parseFloat(btn.dataset.total);
        const docPaid = parseFloat(btn.dataset.paid);
        const docName = btn.dataset.name;
        const docRef = btn.dataset.ref;
        openAbonoModal(tipo, id, docTotal, docPaid, docName, docRef, container);
      });
    });

  } catch (err) {
    console.error('Error renderAuxiliar:', err);
    container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--danger);">
      <i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:1rem;display:block;"></i>
      Error al cargar: ${err.message}
    </div>`;
  }
}

/* ---------- RENDER TABLE ROW ---------- */

function renderRow(item, tipo) {
  const total = parseFloat(item.total) || 0;
  const pagado = parseFloat(item.paid_amount) || 0;
  const saldo = Math.max(0, total - pagado);
  const pctPaid = total > 0 ? Math.min(100, Math.round((pagado / total) * 100)) : 0;

  const nombre = tipo === 'compras'
    ? (item.provider_name || 'Sin Proveedor')
    : (item.client_name || 'Consumidor Final');
  const docNum = item.document_number || '-';

  // Status badge
  const status = item.payment_status || (pagado >= total ? 'pagado' : (pagado > 0 ? 'parcial' : 'pendiente'));
  const statusConfig = {
    pagado: { label: 'Pagado', bg: '#10b98122', color: '#10b981', icon: '✓' },
    parcial: { label: 'Parcial', bg: '#f59e0b22', color: '#f59e0b', icon: '◐' },
    pendiente: { label: 'Pendiente', bg: '#ef444422', color: '#ef4444', icon: '○' }
  };
  const st = statusConfig[status] || statusConfig.pendiente;

  // Progress bar color
  const barColor = status === 'pagado' ? '#10b981' : (status === 'parcial' ? '#f59e0b' : '#ef4444');

  return `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:0.6rem;">${item.date || '-'}</td>
      <td style="padding:0.6rem;font-family:monospace;">
        <small style="opacity:0.6;font-weight:bold;">${(item.document_type || (tipo === 'compras' ? 'FAC' : 'BOL')).toUpperCase().substring(0,3)}</small> 
        ${docNum}
      </td>
      <td style="padding:0.6rem;font-weight:500;">${nombre}</td>
      <td style="padding:0.6rem;text-align:right;font-family:monospace;font-weight:bold;">${formatCLP(total)}</td>
      <td style="padding:0.6rem;text-align:right;font-family:monospace;color:#10b981;">${formatCLP(pagado)}</td>
      <td style="padding:0.6rem;text-align:right;font-family:monospace;color:${saldo > 0 ? '#ef4444' : '#10b981'};font-weight:${saldo > 0 ? '600' : '400'};">
        ${formatCLP(saldo)}
      </td>
      <td style="padding:0.6rem;text-align:center;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <span style="background:${st.bg};color:${st.color};padding:2px 10px;border-radius:12px;font-size:0.7rem;font-weight:600;">
            ${st.icon} ${st.label}
          </span>
          <div style="width:60px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
            <div style="width:${pctPaid}%;height:100%;background:${barColor};border-radius:2px;transition:width 0.3s;"></div>
          </div>
          <span style="font-size:0.6rem;color:var(--text-muted);">${pctPaid}%</span>
        </div>
      </td>
      <td style="padding:0.6rem;text-align:center;">
        ${status !== 'pagado' ? `
          <button class="btn-abono" data-id="${item.id}" data-total="${total}" data-paid="${pagado}" data-name="${nombre}" data-ref="${docNum}"
            style="background:var(--primary);color:white;border:none;padding:4px 12px;border-radius:6px;font-size:0.75rem;cursor:pointer;font-weight:600;">
            <i class="fas fa-dollar-sign"></i> Abonar
          </button>
        ` : `<span style="font-size:0.75rem;color:#10b981;">✓ Completo</span>`}
      </td>
    </tr>
  `;
}

/* ---------- ABONO MODAL ---------- */

function openAbonoModal(tipo, docId, docTotal, docPaid, docName, docRef, container) {
  const saldoPendiente = Math.max(0, docTotal - docPaid);
  const tipoLabel = tipo === 'compras' ? 'Compra' : 'Venta';
  const accionLabel = tipo === 'compras' ? 'Pago' : 'Cobro';

  const content = `
    <div style="padding:1rem;">
      <div style="background:var(--surface-light);padding:1rem;border-radius:8px;margin-bottom:1.5rem;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.85rem;">
          <div><span style="color:var(--text-muted);">${tipoLabel}:</span> <strong>${docName}</strong></div>
          <div><span style="color:var(--text-muted);">N° Doc:</span> <strong>${docRef}</strong></div>
          <div><span style="color:var(--text-muted);">Total:</span> <strong>${formatCLP(docTotal)}</strong></div>
          <div><span style="color:var(--text-muted);">Pagado:</span> <strong style="color:#10b981;">${formatCLP(docPaid)}</strong></div>
        </div>
        <div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border);text-align:center;">
          <span style="font-size:1.1rem;font-weight:bold;color:#ef4444;">Saldo Pendiente: ${formatCLP(saldoPendiente)}</span>
        </div>
      </div>

      <form id="form-abono">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <div>
            <label style="display:block;margin-bottom:4px;font-size:0.8rem;color:var(--text-muted);">Monto del ${accionLabel} ($)</label>
            <input type="number" name="amount" class="form-control" value="${saldoPendiente}" min="1" max="${saldoPendiente}" required
              style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);">
          </div>
          <div>
            <label style="display:block;margin-bottom:4px;font-size:0.8rem;color:var(--text-muted);">Método de Pago</label>
            <select name="payment_method" class="form-control"
              style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);">
              <option value="transferencia">Transferencia Bancaria</option>
              <option value="efectivo">Efectivo / Caja</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div>
            <label style="display:block;margin-bottom:4px;font-size:0.8rem;color:var(--text-muted);">Fecha del ${accionLabel}</label>
            <input type="date" name="date" class="form-control" value="${new Date().toISOString().substring(0, 10)}" required
              style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);">
          </div>
          <div>
            <label style="display:block;margin-bottom:4px;font-size:0.8rem;color:var(--text-muted);">Glosa / Descripción</label>
            <input type="text" name="description" class="form-control" placeholder="Ej: Cuota 2/3"
              style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);">
          </div>
        </div>

        <div style="display:flex;gap:0.75rem;margin-top:1.5rem;">
          <button type="button" onclick="document.getElementById('modal-overlay')?.classList.add('hidden')"
            style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;">
            Cancelar
          </button>
          <button type="submit" id="btn-confirm-abono"
            style="flex:2;padding:10px;border-radius:8px;border:none;background:var(--primary);color:white;font-weight:bold;cursor:pointer;">
            Registrar ${accionLabel} y Contabilizar
          </button>
        </div>
      </form>
    </div>
  `;

  openModal(`Registrar ${accionLabel} — ${docName}`, content);

  document.getElementById('form-abono').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-confirm-abono');
    btn.disabled = true;
    btn.textContent = 'Procesando...';

    const formData = new FormData(e.target);
    const paymentEndpoint = tipo === 'compras'
      ? `/purchases/${docId}/payment`
      : `/sales/${docId}/payment`;

    try {
      const result = await erpFetch(paymentEndpoint, {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(formData.get('amount')),
          payment_method: formData.get('payment_method'),
          date: formData.get('date'),
          description: formData.get('description')
        })
      });

      if (result && result.success) {
        showToast(result.message, 'success');
        closeModal();
        // Refresh the view
        if (tipo === 'compras') {
          await renderLibroCompras(container);
        } else {
          await renderLibroVentas(container);
        }
      } else {
        showToast(result?.error || 'Error al registrar el pago', 'error');
        btn.disabled = false;
        btn.textContent = `Registrar ${accionLabel} y Contabilizar`;
      }
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = `Registrar ${accionLabel} y Contabilizar`;
    }
  };
}


