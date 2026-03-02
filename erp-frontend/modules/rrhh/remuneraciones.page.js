/* ============================================
   REMUNERACIONES — Gestión de Personal (Supabase)
   ============================================ */

import { db } from '../../services/datastore.js';
import { procesarRemuneracion, registrarAnticipo } from '../../services/contabilidad.service.js';
import { formatCLP } from '../../utils/formatters.js';
import { showToast, openModal, closeModal } from '../../components/ui-helpers.js';
import { AFPS } from '../../utils/constants.js';

export async function renderRemuneraciones(container) {
  container.innerHTML = `<div class="skeleton-loader">Sincronizando nómina...</div>`;

  const [trabajadores, centros, liquidaciones, anticipos] = await Promise.all([
    db.getAll('trabajadores'),
    db.getAll('centros_costo'),
    db.getAll('liquidaciones'),
    db.getAll('anticipos')
  ]);

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Remuneraciones y RR.HH.</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">Legislación Chilena Vigente (Ley 40 Horas)</p>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-secondary" id="btn-registrar-anticipo">
            <i class="fas fa-hand-holding-dollar"></i> Registrar Anticipo
        </button>
        <button class="btn btn-primary" id="btn-nuevo-trabajador">
            <i class="fas fa-user-plus"></i> Nuevo Trabajador
        </button>
      </div>
    </div>

    <div class="card animate-fade-in" style="padding:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th>RUT</th>
            <th>Trabajador / Cargo</th>
            <th style="text-align:right;">Sueldo Base</th>
            <th>Jornada</th>
            <th>Pendientes</th>
            <th>Vacaciones</th>
            <th style="text-align:right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${trabajadores.map(t => {
    const anticiposPend = anticipos.filter(a => a.trabajador_id === t.id && a.estado === 'pendiente').reduce((s, a) => s + a.monto, 0);
    return `
            <tr>
              <td class="cell-mono">${t.rut}</td>
              <td>
                <div style="font-weight:600;">${t.nombre}</div>
                <div style="font-size:10px; color:var(--text-muted);">${t.cargo || 'Personal'}</div>
              </td>
              <td class="cell-mono" style="text-align:right;">${formatCLP(t.sueldo_base)}</td>
              <td><span class="badge badge-info">${t.jornada_semanal || 40} hrs</span></td>
              <td style="text-align:center;">
                ${anticiposPend > 0 ? `<span class="badge badge-error" title="Anticipos del mes">-${formatCLP(anticiposPend)}</span>` : '<span class="badge badge-neutral">$0</span>'}
              </td>
              <td><span class="badge badge-success">${(t.dias_vacaciones_acumulados || 0).toFixed(2)} d</span></td>
              <td style="text-align:right;">
                <button class="btn btn-sm btn-primary btn-generar-liq" data-id="${t.id}" title="Liquidar Mes">
                    <i class="fas fa-coins"></i> Feb 26
                </button>
                <button class="btn btn-sm btn-secondary btn-ver-liqs" data-id="${t.id}" title="Ver Historial">
                    <i class="fas fa-list"></i>
                </button>
              </td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Eventos
  container.querySelector('#btn-nuevo-trabajador').addEventListener('click', () => openTrabajadorModal(centros, container));
  container.querySelector('#btn-registrar-anticipo').addEventListener('click', () => openAnticipoModal(trabajadores, container));

  container.querySelectorAll('.btn-generar-liq').forEach(btn => {
    btn.addEventListener('click', () => {
      const trabajador = trabajadores.find(t => t.id === btn.dataset.id);
      openLiquidacionModal(trabajador, container);
    });
  });

  container.querySelectorAll('.btn-ver-liqs').forEach(btn => {
    btn.addEventListener('click', () => {
      const trabajador = trabajadores.find(t => t.id === btn.dataset.id);
      const liqsTrabajador = liquidaciones.filter(l => l.trabajador_id === trabajador.id);
      showHistorialModal(trabajador, liqsTrabajador);
    });
  });
}

function openAnticipoModal(trabajadores, container) {
  const content = `
        <form id="form-anticipo">
            <div class="form-group">
                <label>Trabajador</label>
                <select class="form-control" name="trabajador_id" required>
                    ${trabajadores.map(t => `<option value="${t.id}">${t.rut} - ${t.nombre}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Monto Anticipo ($)</label><input type="number" class="form-control" name="monto" required></div>
                <div class="form-group"><label>Fecha Entrega</label><input type="date" class="form-control" name="fecha" value="${new Date().toISOString().split('T')[0]}" required></div>
            </div>
            <div class="form-group"><label>Glosa / Descripción</label><input type="text" class="form-control" name="glosa" placeholder="Ej: Anticipo 15 de quincena" required></div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Registrar y generar egreso</button>
            </div>
        </form>
    `;
  openModal('Entrega de Anticipo', content);
  document.getElementById('form-anticipo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await registrarAnticipo(data);
      showToast('Anticipo registrado con éxito', 'success');
      closeModal();
      await renderRemuneraciones(container);
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function openLiquidacionModal(trabajador, container) {
  const content = `
    <div style="background:var(--bg-tertiary); padding:var(--space-md); border-radius:var(--radius-sm); border-left:4px solid var(--accent-primary); margin-bottom:var(--space-lg);">
        <p>Cierre de Remuneración: <strong>${trabajador.nombre}</strong></p>
        <p style="font-size:10px; color:var(--text-muted);">Sueldo Base: ${formatCLP(trabajador.sueldo_base)} | Jornada: ${trabajador.jornada_semanal} hrs</p>
    </div>
    <form id="form-liq">
      <input type="hidden" name="trabajador_id" value="${trabajador.id}">
      <input type="hidden" name="periodo" value="2026-02">
      
      <div class="nav-section-title">Haberes Imponibles Adicionales</div>
      <div class="form-row">
        <div class="form-group">
            <label>N° Horas Extras</label>
            <input type="number" step="0.5" class="form-control" name="horas_extras_cantidad" value="0">
        </div>
        <div class="form-group"><label>Aguinaldos / Bonos Extraordinarios</label><input type="number" class="form-control" name="aguinaldos_imponibles" value="0"></div>
      </div>
      
      <div class="nav-section-title">Asignaciones No Imponibles</div>
      <div class="form-row">
        <div class="form-group"><label>Movilización</label><input type="number" class="form-control" name="movilizacion" value="65000"></div>
        <div class="form-group"><label>Colación</label><input type="number" class="form-control" name="colacion" value="65000"></div>
      </div>
      
      <div style="background:var(--bg-surface); padding:10px; border:1px dashed var(--border-secondary); font-size:11px; margin-top:10px;">
        * El sistema descontará automáticamente cualquier anticipo registrado este mes.
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Procesar Sueldo Legal</button>
      </div>
    </form>
  `;

  openModal('Procesar Liquidación Mensual', content);

  document.getElementById('form-liq').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await procesarRemuneracion(data);
      showToast('Liquidación procesada correctamente', 'success');
      closeModal();
      await renderRemuneraciones(container);
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function showHistorialModal(trabajador, liquidaciones) {
  const content = `
        <table class="data-table">
            <thead><tr><th>Mes</th><th style="text-align:right;">Líquido</th><th>Acción</th></tr></thead>
            <tbody>
                ${liquidaciones.map(l => `
                    <tr><td>${l.periodo}</td><td style="text-align:right;"><strong>${formatCLP(l.alcanze_liquido)}</strong></td><td><button class="btn btn-sm btn-secondary" onclick="window.printLiquidacionExtra('${l.id}')">Ver PDF</button></td></tr>
                `).join('')}
                ${liquidaciones.length === 0 ? '<tr><td colspan="3" style="text-align:center;">Sin historial</td></tr>' : ''}
            </tbody>
        </table>
    `;
  openModal(`Historial: ${trabajador.nombre}`, content);
}

function openTrabajadorModal(centros, container) {
  const content = `
    <form id="form-trabajador">
      <div class="form-row">
        <div class="form-group"><label>RUT</label><input type="text" class="form-control" name="rut" placeholder="12.345.678-9" required></div>
        <div class="form-group"><label>Nombre Completo</label><input type="text" class="form-control" name="nombre" required></div>
      </div>
      <div class="form-row">
        <div class="form-group">
            <label>Jornada Semanal (Horas)</label>
            <select class="form-control" name="jornada_semanal">
                <option value="40">40 Horas (Ley actual)</option>
                <option value="44">44 Horas</option>
                <option value="45">45 Horas</option>
            </select>
        </div>
        <div class="form-group"><label>Sueldo Base (CLP)</label><input type="number" class="form-control" name="sueldo_base" required></div>
      </div>
      <div class="form-row">
        <div class="form-group">
            <label>Tipo Gratificación</label>
            <select class="form-control" name="tipo_gratificacion">
                <option value="Art 50">Art. 50 (Mensual 25% con tope)</option>
                <option value="No paga">No Paga / Exento</option>
            </select>
        </div>
        <div class="form-group"><label>Cargas Familiares</label><input type="number" class="form-control" name="cargas_familiares" value="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>AFP</label>
          <select class="form-control" name="afp_selector" id="sel-afp">
            ${AFPS.map(a => `<option value="${a.nombre}" data-tasa="${a.tasa * 100}">${a.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Salud</label>
          <select class="form-control" name="salud" id="sel-salud">
            <option value="Fonasa">Fonasa (7%)</option>
            <option value="Isapre">Isapre (UF)</option>
          </select>
        </div>
      </div>
      <div id="isapre-fields" style="display:none;" class="form-group">
          <label>Plan Isapre (UF)</label>
          <input type="number" step="0.0001" class="form-control" name="plan_isapre_uf" value="0">
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar Trabajador</button>
      </div>
    </form>
  `;

  openModal('Ficha de Contratación', content);

  const selSalud = document.getElementById('sel-salud');
  selSalud.addEventListener('change', () => { document.getElementById('isapre-fields').style.display = selSalud.value === 'Isapre' ? 'block' : 'none'; });

  document.getElementById('form-trabajador').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const selAfp = document.getElementById('sel-afp');

    const finalData = {
      rut: data.rut, nombre: data.nombre, cargo: 'Personal', fecha_ingreso: new Date().toISOString().split('T')[0],
      sueldo_base: parseInt(data.sueldo_base),
      jornada_semanal: parseInt(data.jornada_semanal),
      tipo_gratificacion: data.tipo_gratificacion,
      cargas_familiares: parseInt(data.cargas_familiares),
      afp: data.afp_selector, afp_tasa: parseFloat(selAfp.options[selAfp.selectedIndex].dataset.tasa) / 100,
      salud: data.salud, plan_isapre_uf: parseFloat(data.plan_isapre_uf || 0),
      centro_costo_id: (await db.getAll('centros_costo'))[0]?.id || null,
      dias_vacaciones_acumulados: 0
    };

    try {
      await db.insert('trabajadores', finalData);
      showToast('Trabajador incorporado', 'success');
      closeModal();
      await renderRemuneraciones(container);
    } catch (err) { showToast(err.message, 'error'); }
  });
}

window.printLiquidacionExtra = async (id) => {
  const liq = await db.getById('liquidaciones', id);
  const trab = await db.getById('trabajadores', liq.trabajador_id);
  const win = window.open('', '_blank');

  win.document.write(`
        <html><head><title>Liquidación Pro - ${trab.nombre}</title>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #333; line-height: 1.4; }
            .header { border-bottom: 2px solid #333; margin-bottom: 20px; display:flex; justify-content:space-between; padding-bottom: 10px; }
            .table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
            .table th, .table td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            .table th { background: #f8f8f8; }
            .total-row { background: #f0f4ff; font-weight: bold; }
            .right { text-align: right; }
            .footer { margin-top: 60px; display: flex; justify-content: space-around; }
            .sig { border-top: 1px solid #000; width: 220px; text-align: center; padding-top: 10px; font-size: 11px; }
        </style></head>
        <body>
            <div class="header">
                <div><strong>ContaChile ERP</strong><br>Sistema de Gestión Contable</div>
                <div class="right"><strong>PERIODO: ${liq.periodo}</strong></div>
            </div>
            
            <h2 style="text-align:center;">Liquidación de Remuneraciones</h2>
            
            <table class="table">
                <tr><td><strong>Nombre:</strong> ${trab.nombre}</td><td><strong>RUT:</strong> ${trab.rut}</td></tr>
                <tr><td><strong>AFP:</strong> ${trab.afp}</td><td><strong>Sistema Salud:</strong> ${trab.salud}</td></tr>
                <tr><td><strong>Cargas Fam::</strong> ${trab.cargas_familiares || 0}</td><td><strong>Jornada:</strong> ${trab.jornada_semanal || 40} hrs</td></tr>
            </table>

            <table class="table">
                <thead><tr><th>HABERES IMPONIBLES</th><th class="right">MONTO</th><th>DESCUENTOS PREVISIONALES</th><th class="right">MONTO</th></tr></thead>
                <tbody>
                    <tr><td>Sueldo Base</td><td class="right">${formatCLP(liq.sueldo_base)}</td><td>Previsión (${trab.afp})</td><td class="right">${formatCLP(liq.descuento_afp)}</td></tr>
                    <tr><td>Gratificación Art. 50</td><td class="right">${formatCLP(liq.gratificacion)}</td><td>Salud (${trab.salud})</td><td class="right">${formatCLP(liq.descuento_salud)}</td></tr>
                    <tr><td>Horas Extras (${liq.horas_extras_cantidad || 0} hrs)</td><td class="right">${formatCLP(liq.horas_extras_monto || 0)}</td><td>Seguro Cesantía AFC</td><td class="right">${formatCLP(liq.descuento_cesantia)}</td></tr>
                    <tr><td>Aguinaldos / Bonos Imponibles</td><td class="right">${formatCLP(liq.aguinaldos_imponibles || 0)}</td><td>-</td><td class="right">-</td></tr>
                    <tr class="total-row"><td>TOTAL IMPONIBLE</td><td class="right">${formatCLP(liq.total_imponible)}</td><td>TOTAL DESCUENTOS LEY</td><td class="right">${formatCLP(liq.descuento_afp + liq.descuento_salud + liq.descuento_cesantia)}</td></tr>
                </tbody>
            </table>

            <table class="table">
                <thead><tr><th>HABERES NO IMPONIBLES</th><th class="right">MONTO</th><th>OTROS DESCUENTOS / ANTICIPOS</th><th class="right">MONTO</th></tr></thead>
                <tbody>
                    <tr><td>Asignación de Movilización</td><td class="right">${formatCLP(liq.movilizacion)}</td><td><strong>Anticipos de Sueldo</strong></td><td class="right"><strong>${formatCLP(liq.anticipos_monto || 0)}</strong></td></tr>
                    <tr><td>Asignación de Colación</td><td class="right">${formatCLP(liq.colacion)}</td><td>Préstamos / Otros</td><td class="right">$0</td></tr>
                    <tr><td>Asignación Familiar</td><td class="right">${formatCLP(liq.asignacion_familiar || 0)}</td><td>-</td><td class="right">-</td></tr>
                </tbody>
            </table>

            <div style="background:#f0f4ff; padding:20px; border:1px solid #6366f1; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-top:30px;">
                <div style="font-size:11px; max-width:60%;">Certifico que recibí de mi empleador el monto neto indicado en esta liquidación, a mi entera satisfacción.</div>
                <div style="font-size:24px; font-weight:bold; color:#6366f1;">LÍQUIDO A PAGAR: ${formatCLP(liq.alcanze_liquido)}</div>
            </div>

            <div class="footer">
                <div class="sig">Firma Empleador</div>
                <div class="sig">Firma Trabajador</div>
            </div>
        </body></html>
    `);
  win.document.close();
};
