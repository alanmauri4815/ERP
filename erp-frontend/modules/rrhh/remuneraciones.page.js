import { getTrabajadores, calcularLiquidacion, db } from '../../services/contabilidad.service.js';
import { showToast, openModal } from '../../components/ui-helpers.js';

export async function renderRemuneraciones(container) {
  container.innerHTML = `<div class="skeleton-loader">Sincronizando Nómina de Trabajadores...</div>`;

  try {
    const trabajadores = await getTrabajadores();

    container.innerHTML = `
            <div class="section-header">
                <div>
                    <h2 class="section-title">Gestión de Remuneraciones</h2>
                    <p style="color:var(--text-muted); font-size: 13px;">Nómina activa y cálculo de previred automático</p>
                </div>
                <div class="section-actions">
                    <button class="btn btn-primary" id="btn-nuevo-trabajador">+ Nuevo Trabajador</button>
                    <button class="btn btn-secondary" id="btn-mes-cerrar">Cierre Mensual</button>
                </div>
            </div>

            <div class="card" style="margin-top:20px;">
                <table class="table" style="width:100%">
                    <thead>
                        <tr>
                            <th>Nombre Completo</th>
                            <th>RUT</th>
                            <th>Sueldo Base</th>
                            <th>AFP / Salud</th>
                            <th>Estado</th>
                            <th style="text-align:right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${trabajadores.map(t => `
                            <tr>
                                <td style="font-weight:bold;">${t.nombre}</td>
                                <td>${t.rut}</td>
                                <td>$${parseInt(t.sueldo_base).toLocaleString()}</td>
                                <td><small>${t.afp || 'Fonasa'} / ${t.salud}</small></td>
                                <td><span class="badge badge-success">Activo</span></td>
                                <td style="text-align:right;">
                                    <button class="btn-sm" onclick="window.generarLiquidacion('${t.id}')">📂 Liquidar</button>
                                </td>
                            </tr>
                        `).join('')}
                        ${trabajadores.length === 0 ? '<tr><td colspan="6" style="text-align:center; opacity:0.5; padding:2rem;">No hay trabajadores en la nómina.</td></tr>' : ''}
                    </tbody>
                </table>
            </div>

            <div id="liquidaciones-historial" style="margin-top:30px;">
                <!-- Aquí aparecerán las liquidaciones calculadas -->
            </div>
        `;

    setupRemuEvents(container);

  } catch (err) {
    container.innerHTML = `<div class="error-msg">Error: ${err.message}</div>`;
  }
}

function setupRemuEvents(container) {
  // 1. Evento Nuevo Trabajador
  container.querySelector('#btn-nuevo-trabajador').onclick = () => {
    const content = `
            <form id="form-trabajador" style="padding:15px; display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group" style="grid-column: span 2;">
                    <label>Nombre Completo</label>
                    <input type="text" name="nombre" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>RUT</label>
                    <input type="text" name="rut" class="form-control" placeholder="12.345.678-9" required>
                </div>
                <div class="form-group">
                    <label>Sueldo Base ($)</label>
                    <input type="number" name="sueldo_base" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Institución de AFP</label>
                    <select name="afp" class="form-control">
                        <option value="Provida">Provida</option>
                        <option value="Habitat">Habitat</option>
                        <option value="Capital">Capital</option>
                        <option value="Modelo">Modelo</option>
                        <option value="Cuprum">Cuprum</option>
                        <option value="PlanVital">PlanVital</option>
                        <option value="Uno">Uno</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Comisión AFP (%)</label>
                    <input type="number" step="0.01" name="afp_tasa" class="form-control" value="11.45">
                </div>
                <div class="form-group">
                    <label>Salud</label>
                    <select name="salud" class="form-control">
                        <option value="Fonasa">Fonasa (7%)</option>
                        <option value="Isapre">Isapre (Pactado)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Cargas Familiares</label>
                    <input type="number" name="cargas_familiares" class="form-control" value="0">
                </div>
                <div class="modal-footer" style="grid-column: span 2; margin-top:10px;">
                    <button type="submit" class="btn btn-primary" style="width:100%">Contratar e Ingresar a Nómina</button>
                </div>
            </form>
        `;
    openModal('Ingresar Nuevo Trabajador', content);

    document.getElementById('form-trabajador').onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      try {
        const { db } = await import('../../services/datastore.js');
        await db.insert('trabajadores', data);
        showToast('Trabajador ingresado correctamente', 'success');
        renderRemuneraciones(container);
      } catch (err) { alert(err.message); }
    };
  };

  // 2. Función Global para Liquidar (se expone a window para el onclick del table)
  window.generarLiquidacion = async (id) => {
    const t = (await getTrabajadores()).find(x => x.id === id);
    const liq = await calcularLiquidacion(t, '2026-03');

    const previewHtml = `
            <div style="background:white; color:black; padding:30px; border:1px solid #ddd; font-family:'Courier New';">
                <center><h3>LIQUIDACIÓN DE SUELDO</h3></center>
                <hr>
                <p><b>TRABAJADOR:</b> ${t.nombre}</ <p><b>RUT:</b> ${t.rut}</p>
                <p><b>PERIODO:</b> MARZO 2026</p>
                <hr>
                <table style="width:100%">
                    <tr><td>Sueldo Base</td><td align="right">$${liq.sueldo_base.toLocaleString()}</td></tr>
                    <tr><td>Gratificación (25%)</td><td align="right">$${liq.gratificacion.toLocaleString()}</td></tr>
                    <tr style="font-weight:bold;"><td>TOTAL IMPONIBLE</td><td align="right">$${liq.total_imponible.toLocaleString()}</td></tr>
                    <tr><td colspan="2"><hr></td></tr>
                    <tr><td>AFP (${t.afp_tasa}%)</td><td align="right">-$${liq.descuento_afp.toLocaleString()}</td></tr>
                    <tr><td>Salud (Fonasa 7%)</td><td align="right">-$${liq.descuento_salud.toLocaleString()}</td></tr>
                    <tr><td colspan="2"><hr></td></tr>
                    <tr style="font-size:1.4rem; font-weight:bold;"><td>ALCANZE LÍQUIDO</td><td align="right">$${liq.alcance_liquido.toLocaleString()}</td></tr>
                </table>
                <div style="margin-top:50px; border-top:1px solid #000; display:inline-block; width:200px; text-align:center;">Firma Trabajador</div>
            </div>
            <button class="btn btn-primary" style="width:100%; margin-top:1rem;" id="confirmar-liq">Confirmar y Contabilizar</button>
        `;
    openModal('Previsualizar Liquidación', previewHtml);

    document.getElementById('confirmar-liq').onclick = async () => {
      const { db } = await import('../../services/datastore.js');
      await db.insert('liquidaciones', liq);
      showToast('Liquidación guardada y contabilizada', 'success');
    };
  };
}
