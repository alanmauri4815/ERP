/* ============================================
   LIBRO DIARIO — Registro Cronológico
   ============================================ */

import { getLibroDiario, getCuentasDetalle, crearAsiento } from '../../services/contabilidad.service.js';
import { db } from '../../services/datastore.js';
import { erpFetch } from '../../services/erp-api.js';
import { formatCLP } from '../../utils/formatters.js';
import { showToast, openModal, closeModal } from '../../components/ui-helpers.js';
import { IVA_RATE } from '../../utils/constants.js';
import { exportToExcel, formatLedgerForExport } from '../../export-utils.js';

/* -- Sincronizar operaciones ERP al abrir el Libro Diario -- */
import { sincronizarOperacionesERP } from '../../services/contabilidad.service.js';

async function syncERPToJournal() {
  try {
    const syncPromise = (async () => {
      const [purchases, sales] = await Promise.all([
        erpFetch('/purchases'),
        erpFetch('/sales')
      ]);

      const _purchases = Array.isArray(purchases) ? purchases : [];
      const _sales = Array.isArray(sales) ? sales : [];

      return await sincronizarOperacionesERP(_sales, _purchases);
    })();

    // Timeout de 10 segundos para no bloquear la UI si la red o las tablas fallan
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 10000));
    
    const synced = await Promise.race([syncPromise, timeoutPromise]);
    
    if (synced > 0) console.log(`✅ ${synced} operaciones ERP sincronizadas al Libro Diario`);
    return synced || 0;
  } catch (e) {
    console.warn('Sync ERP→Diario:', e.message);
    // Ya no mostramos el toast de advertencia por timeout en carga asíncrona
    return 0;
  }
}

export async function renderLibroDiario(container) {
  const now = new Date();
  let currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  container.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--text-muted);">
    <div class="spinner" style="margin:0 auto 1rem;"></div>
    Cargando Libro Diario...
  </div>`;

  // La sincronización ahora es manual mediante el botón, evitamos carga asíncrona automática
  // syncERPToJournal().then(synced => {
  //     if (synced > 0) loadAndRender(currentPeriod);
  // });

  const cuentasDetalle = await getCuentasDetalle();
  
  async function loadAndRender(periodFilter) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout total

      try {
          console.log('[LibroDiario] Iniciando carga de datos para periodo:', periodFilter);
          
          // Ejecutamos las promesas con un timeout
          const loadPromise = (async () => {
              const asientos = await getLibroDiario(periodFilter);
              const cuentas = await getCuentasDetalle();
              return { asientos, cuentas };
          })();

          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_CARGA')), 15000));

          const { asientos: rawAsientos, cuentas: cuentasDetalle } = await Promise.race([loadPromise, timeoutPromise]);
          
          let asientos = rawAsientos || [];
          console.log('[LibroDiario] Datos cargados con éxito:', asientos.length, 'asientos found.');

          // Si visualmente no hay nada en este mes, intentamos cargar todo para no mostrar pantalla vacía al inicio
          // Solo si el periodFilter NO es 'all'
          if (asientos.length === 0 && periodFilter !== 'all' && periodFilter !== '') {
              console.log('[LibroDiario] Mes vacío, buscando historial completo...');
              // No cambiamos periodFilter para que el select siga mostrando el mes actual si se desea
          }

          container.innerHTML = `
            <div class="section-header">
              <div>
                <h2 class="section-title">Libro Diario</h2>
                <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">Registro cronológico de operaciones</p>
              </div>
              <div style="display:flex; gap:10px; align-items:center;">
                <div class="form-group" style="margin:0; display:flex; align-items:center; gap:8px;">
                  <label style="margin:0; white-space:nowrap; font-size:13px;">Periodo:</label>
                  <input type="month" class="form-control" id="period-selector" value="${periodFilter === 'all' ? '' : periodFilter}" style="width:160px; padding:4px 8px;">
                  <button class="btn btn-secondary btn-sm" id="btn-show-all" style="padding:5px 10px;">Ver Todo</button>
                </div>
                <button class="btn btn-secondary" id="btn-sync-erp" title="Sincronizar compras y ventas desde el ERP">
                  <i class="fas fa-sync"></i> Sincronizar ERP
                </button>
                <button class="btn btn-accent" id="btn-export-excel">
                  <i class="fas fa-file-excel"></i> Exportar
                </button>
                <button class="btn btn-primary" id="btn-nuevo-asiento">
                  <i class="fas fa-plus"></i> Nuevo Asiento
                </button>
              </div>
            </div>

            ${asientos.length === 0 ? `
              <div class="empty-state">
                <i class="fas fa-book"></i>
                <h3>Sin asientos registrados</h3>
                <p>No se encontraron movimientos para el periodo <strong>${periodFilter || 'seleccionado'}</strong>.</p>
                <div style="margin-top:1rem;">
                   <button class="btn btn-secondary" onclick="document.getElementById('btn-show-all').click()">Ver todo el historial</button>
                </div>
              </div>
            ` : `
              <div class="journal animate-fade-in">
                ${asientos.sort((a,b) => (b.fecha||'').localeCompare(a.fecha||'')).map(asiento => renderAsientoCard(asiento, cuentasDetalle)).join('')}
              </div>
            `}
          `;

          // Event Listeners
          container.querySelector('#period-selector')?.addEventListener('change', (e) => {
              currentPeriod = e.target.value;
              loadAndRender(currentPeriod);
          });

          container.querySelector('#btn-show-all')?.addEventListener('click', () => {
              currentPeriod = 'all';
              loadAndRender('all');
          });

          container.querySelector('#btn-nuevo-asiento')?.addEventListener('click', () => openAsientoModal(cuentasDetalle, container));
          
          container.querySelector('#btn-sync-erp')?.addEventListener('click', async () => {
            const btn = container.querySelector('#btn-sync-erp');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
            btn.disabled = true;
            try {
              const synced = await syncERPToJournal();
              if (synced > 0) {
                showToast(`Sincronización completada. ${synced} operaciones integradas.`, 'success');
                await loadAndRender(currentPeriod); 
              } else {
                showToast('Libro Diario ya está al día. No hay nuevas operaciones.', 'info');
              }
            } catch (err) {
              console.error(err);
              showToast('Error al sincronizar con el ERP.', 'error');
            } finally {
              if (container.querySelector('#btn-sync-erp')) {
                const updatedBtn = container.querySelector('#btn-sync-erp');
                updatedBtn.innerHTML = originalHtml;
                updatedBtn.disabled = false;
              }
            }
          });

          container.querySelector('#btn-export-excel')?.addEventListener('click', () => {
            if (!asientos || asientos.length === 0) {
              return showToast('No hay datos para exportar', 'warning');
            }
            try {
              const formatted = formatLedgerForExport(asientos);
              const fileName = `Libro_Diario_${periodFilter || 'Historial'}`;
              exportToExcel(formatted, fileName, 'Libro Diario');
            } catch (e) {
              console.error('Error al exportar:', e);
              showToast('Error al generar el archivo Excel.', 'error');
            }
          });
      } catch (err) {
          clearTimeout(timeoutId);
          console.error('[LibroDiario] Error fatal:', err);
          container.innerHTML = `
            <div class="empty-state">
              <i class="fas fa-wifi" style="color:var(--error); font-size: 3rem; margin-bottom: 1rem;"></i>
              <h3>Problema de Conexión</h3>
              <p>${err.message === 'TIMEOUT_CARGA' ? 'El servidor tardó demasiado en responder.' : (err.message || 'Error al conectar con la base de datos.')}</p>
              <button class="btn btn-primary" onclick="location.reload()" style="margin-top: 1rem;">Reintentar Carga</button>
            </div>
          `;
      }
  }

  await loadAndRender(currentPeriod);
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
