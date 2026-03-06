/* ============================================
   LIBRO DIARIO — Registro Cronológico
   ============================================ */

import { getLibroDiario, getCuentasDetalle, crearAsiento } from '../../services/contabilidad.service.js';
import { db } from '../../services/datastore.js';
import { erpFetch } from '../../services/erp-api.js';
import { formatCLP } from '../../utils/formatters.js';
import { showToast, openModal, closeModal } from '../../components/ui-helpers.js';
import { IVA_RATE } from '../../utils/constants.js';

/* -- Sincronizar operaciones ERP al abrir el Libro Diario -- */
async function syncERPToJournal() {
  try {
    const [purchases, sales] = await Promise.all([
      erpFetch('/purchases'),
      erpFetch('/sales')
    ]);

    const existingEntries = await db.getAll('asientos').catch(() => []);
    const existingRefs = new Set(existingEntries.map(e => `${e.tipo_origen}_${e.referencia_id}`));

    let synced = 0;
    const allItems = [
      ...(Array.isArray(purchases) ? purchases.map(p => ({ ...p, _tipo: 'compras' })) : []),
      ...(Array.isArray(sales) ? sales.map(s => ({ ...s, _tipo: 'ventas' })) : [])
    ];

    for (const item of allItems) {
      const tipoOrigen = item._tipo === 'compras' ? 'erp_compra' : 'erp_venta';
      const key = `${tipoOrigen}_${item.id}`;
      if (existingRefs.has(key)) continue;

      const total = parseFloat(item.total) || 0;
      if (total === 0) continue;

      const neto = parseFloat(item.net) || Math.round(total / (1 + IVA_RATE));
      const iva = total - neto;
      const fecha = item.date || new Date().toISOString().substring(0, 10);
      const periodo = fecha.substring(0, 7);

      try {
        if (item._tipo === 'compras') {
          const docNum = item.document_number ? `Fact. ${item.document_number}` : 'S/N';
          const desc = item.description || (item.items?.length ? `${item.items.length} ítems` : '');
          const glosaCompra = `Compra ${docNum} — ${item.provider_name || 'Proveedor'}${desc ? ' — ' + desc : ''}`;
          await crearAsiento({
            fecha, periodo,
            glosa: glosaCompra,
            tipo_origen: tipoOrigen,
            referencia_id: item.id,
            lineas: [
              { cuenta_codigo: '5.1.01', debe: neto, haber: 0 },
              { cuenta_codigo: '1.1.06', debe: iva, haber: 0 },
              { cuenta_codigo: '2.1.01', debe: 0, haber: total }
            ]
          });
        } else {
          const docNumV = item.document_number ? `Boleta/Fact. ${item.document_number}` : (item.items?.length ? `${item.items.length} productos` : 'S/N');
          const clienteV = item.client_name || 'Consumidor Final';
          const glosaVenta = `Venta ${docNumV} — ${clienteV}`;
          await crearAsiento({
            fecha, periodo,
            glosa: glosaVenta,
            tipo_origen: tipoOrigen,
            referencia_id: item.id,
            lineas: [
              { cuenta_codigo: '1.1.01', debe: total, haber: 0 },
              { cuenta_codigo: '4.1.01', debe: 0, haber: neto },
              { cuenta_codigo: '2.1.02', debe: 0, haber: iva }
            ]
          });
        }
        synced++;
      } catch (e) {
        console.warn(`Sync ${tipoOrigen} #${item.id}:`, e.message);
      }
    }

    if (synced > 0) console.log(`✅ ${synced} operaciones ERP sincronizadas al Libro Diario`);
  } catch (e) {
    console.warn('Sync ERP→Diario:', e.message);
  }
}

export async function renderLibroDiario(container) {
  const now = new Date();
  const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  container.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--text-muted);">
    <div class="spinner" style="margin:0 auto 1rem;"></div>
    Sincronizando operaciones ERP y cargando Libro Diario...
  </div>`;

  // First sync ERP purchases/sales to journal
  await syncERPToJournal();

  const cuentasDetalle = await getCuentasDetalle();
  let asientos = await getLibroDiario(periodo);

  // Mostrar todo si el mes actual está vacío
  if (asientos.length === 0) {
    asientos = await getLibroDiario('force');
  }

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Libro Diario</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">Registro cronológico de operaciones manuales y automáticas</p>
      </div>
      <button class="btn btn-primary" id="btn-nuevo-asiento">
        <i class="fas fa-plus"></i> Nuevo Asiento Manual
      </button>
    </div>

    ${asientos.length === 0 ? `
      <div class="empty-state">
        <i class="fas fa-book"></i>
        <h3>Sin asientos registrados</h3>
        <p>No hay movimientos para el período seleccionado.</p>
      </div>
    ` : `
      <div class="journal animate-fade-in">
        ${asientos.map(asiento => renderAsientoCard(asiento, cuentasDetalle)).join('')}
      </div>
    `}
  `;

  container.querySelector('#btn-nuevo-asiento')?.addEventListener('click', () => openAsientoModal(cuentasDetalle, container));
}

function renderAsientoCard(asiento, cuentas) {
  return `
    <div class="card journal-card" style="margin-bottom: var(--space-lg);">
      <div class="journal-card-header" style="background: var(--bg-tertiary); padding: var(--space-md); border-radius: var(--radius-sm) var(--radius-sm) 0 0; border-bottom: 1px solid var(--border-primary); display: flex; justify-content: space-between; align-items: center;">
        <div>
            <span class="badge badge-primary" style="font-family: var(--font-mono);"># ${asiento.id.substring(0, 8)}</span>
            <strong style="margin-left: 10px;">${asiento.fecha}</strong>
        </div>
        <div style="font-style: italic; font-size: 13px; color: var(--text-muted);">${asiento.glosa}</div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Cuenta</th>
            <th style="text-align:right;">Debe</th>
            <th style="text-align:right;">Haber</th>
          </tr>
        </thead>
        <tbody>
          ${asiento.lineas.map(linea => {
    const c = cuentas.find(acc => acc.codigo === linea.cuenta_codigo);
    return `
            <tr>
              <td>
                <div style="font-weight: 600;">${c ? c.nombre : linea.cuenta_codigo}</div>
                <div style="font-size: 10px; color: var(--text-muted);">${linea.cuenta_codigo}</div>
              </td>
              <td class="cell-mono" style="text-align:right;">${linea.debe > 0 ? formatCLP(linea.debe) : '-'}</td>
              <td class="cell-mono" style="text-align:right;">${linea.haber > 0 ? formatCLP(linea.haber) : '-'}</td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function openAsientoModal(cuentas, container) {
  const content = `
    <form id="form-asiento-manual">
      <div class="form-row">
        <div class="form-group"><label>Fecha</label><input type="date" class="form-control" name="fecha" value="${new Date().toISOString().split('T')[0]}" required></div>
        <div class="form-group"><label>Glosa General</label><input type="text" class="form-control" name="glosa" placeholder="Ej: Aporte inicial de capital" required></div>
      </div>
      
      <div id="movimientos-container" style="margin-top: var(--space-lg);">
        <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 40px; gap:10px; margin-bottom:10px; font-weight:bold; font-size:12px;">
            <div>Cuenta Contable</div>
            <div>Debe ($)</div>
            <div>Haber ($)</div>
            <div></div>
        </div>
        <!-- Aquí se insertan las líneas -->
      </div>
      
      <button type="button" class="btn btn-secondary btn-sm" id="btn-add-line" style="margin-top: 10px;">
        <i class="fas fa-plus"></i> Agregar Línea
      </button>

      <div style="margin-top: 20px; padding: 15px; background: var(--bg-tertiary); border-radius: var(--radius-sm); display:flex; justify-content: space-between; align-items: center;">
        <div>
            <span id="label-cuadre" class="badge badge-error">Descuadre: $0</span>
        </div>
        <div style="text-align: right;">
            <div>Total Debe: <span id="total-debe">$0</span></div>
            <div>Total Haber: <span id="total-haber">$0</span></div>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="btn-submit-asiento" disabled>Guardar Asiento</button>
      </div>
    </form>
  `;

  openModal('Contabilización Manual', content);

  const containerMovs = document.getElementById('movimientos-container');
  const btnAdd = document.getElementById('btn-add-line');
  const btnSubmit = document.getElementById('btn-submit-asiento');

  const addLine = () => {
    const div = document.createElement('div');
    div.className = 'asiento-line';
    div.style = 'display:grid; grid-template-columns: 2fr 1fr 1fr 40px; gap:10px; margin-bottom:10px;';
    div.innerHTML = `
        <select class="form-control sel-cuenta" required>
            <option value="">-- Seleccionar --</option>
            ${cuentas.map(c => `<option value="${c.codigo}">${c.codigo} - ${c.nombre}</option>`).join('')}
        </select>
        <input type="number" class="form-control inp-debe" value="0" min="0">
        <input type="number" class="form-control inp-haber" value="0" min="0">
        <button type="button" class="btn btn-sm btn-error btn-remove" style="padding: 0;"><i class="fas fa-times"></i></button>
    `;
    containerMovs.appendChild(div);

    div.querySelector('.btn-remove').onclick = () => { div.remove(); updateTotals(); };
    div.querySelectorAll('input').forEach(i => i.oninput = updateTotals);
  };

  const updateTotals = () => {
    let tDebe = 0, tHaber = 0;
    document.querySelectorAll('.inp-debe').forEach(i => tDebe += parseInt(i.value || 0));
    document.querySelectorAll('.inp-haber').forEach(i => tHaber += parseInt(i.value || 0));

    document.getElementById('total-debe').innerText = formatCLP(tDebe);
    document.getElementById('total-haber').innerText = formatCLP(tHaber);

    const diff = tDebe - tHaber;
    const label = document.getElementById('label-cuadre');
    if (Math.abs(diff) < 1 && tDebe > 0) {
      label.innerText = '✓ Cuadrado';
      label.className = 'badge badge-success';
      btnSubmit.disabled = false;
    } else {
      label.innerText = `Descuadre: ${formatCLP(Math.abs(diff))}`;
      label.className = 'badge badge-error';
      btnSubmit.disabled = true;
    }
  };

  btnAdd.onclick = addLine;
  addLine(); addLine(); // Empezar con 2 líneas

  document.getElementById('form-asiento-manual').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const lineas = [];
    document.querySelectorAll('.asiento-line').forEach(line => {
      const cuenta = line.querySelector('.sel-cuenta').value;
      const debe = parseInt(line.querySelector('.inp-debe').value || 0);
      const haber = parseInt(line.querySelector('.inp-haber').value || 0);
      if (debe > 0 || haber > 0) {
        lineas.push({ cuenta_codigo: cuenta, debe, haber });
      }
    });

    try {
      await crearAsiento({
        fecha: formData.get('fecha'),
        glosa: formData.get('glosa'),
        lineas
      });
      showToast('Asiento contable registrado', 'success');
      closeModal();
      await renderLibroDiario(container);
    } catch (err) { showToast(err.message, 'error'); }
  };
}
