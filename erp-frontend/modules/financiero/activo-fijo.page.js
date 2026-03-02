import { db } from '../../services/datastore.js';

export async function renderActivoFijo(container) {
  container.innerHTML = `<div class="skeleton-loader">Sincronizando Inventario de Activos...</div>`;

  const activos = await db.getAll('activo_fijo');
  const totalInversion = activos.reduce((s, a) => s + (parseInt(a.valor_compra) || 0), 0);

  container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 class="section-title">Control de Activo Fijo</h2>
                <p style="color:var(--text-muted); font-size: 13px;">Gestión de bienes capitalizables y depreciación legal (Chile)</p>
            </div>
            <div class="section-actions">
                <button class="btn btn-secondary" id="btn-depreciar">Procesar Depreciación Mes</button>
                <button class="btn btn-primary" id="btn-nuevo-activo">+ Incorporar Activo</button>
            </div>
        </div>

        <div class="grid-3 animate-fade" style="margin-top:20px;">
            <div class="card stat-card">
                <div class="label">Valor Libro Total</div>
                <div class="value">$${totalInversion.toLocaleString()}</div>
            </div>
            <div class="card stat-card">
                <div class="label">Activos en Inventario</div>
                <div class="value">${activos.length}</div>
            </div>
            <div class="card stat-card">
              <div class="label" style="color:var(--success)">Depreciación Acumulada</div>
              <div class="value" style="color:var(--success)">$0</div>
            </div>
        </div>

        <div class="card" style="margin-top:20px; padding:0;">
            <table class="table" style="width:100%">
                <thead>
                    <tr>
                        <th>Cód. Interno</th>
                        <th>Bien / Activo</th>
                        <th>Categoría SII</th>
                        <th style="text-align:right">V. Compra</th>
                        <th style="text-align:right">Dep. Acumulada</th>
                        <th style="text-align:right">Valor Libro</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${activos.map(a => `
                        <tr>
                            <td><code>${a.codigo}</code></td>
                            <td style="font-weight:600;">${a.nombre}</td>
                            <td><span class="badge badge-info">${a.categoria}</span></td>
                            <td style="text-align:right;">$${parseInt(a.valor_compra).toLocaleString()}</td>
                            <td style="text-align:right; color:var(--danger)">$0</td>
                            <td style="text-align:right; font-weight:700;">$${parseInt(a.valor_compra).toLocaleString()}</td>
                            <td><span class="badge badge-success">Activo</span></td>
                        </tr>
                    `).join('')}
                    ${activos.length === 0 ? '<tr><td colspan="7" style="text-align:center; opacity:0.5; padding:2rem;">No se han incorporado activos todavía.</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

  setupActivoEvents(container);
}

function setupActivoEvents(container) {
  container.querySelector('#btn-nuevo-activo').onclick = () => {
    const formHtml = `
            <form id="form-activo" style="padding:1rem; display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                <div class="form-group"><label>Código Interno</label><input type="text" class="form-control" name="codigo" required></div>
                <div class="form-group">
                  <label>Categoría SII</label>
                  <select class="form-control" name="categoria" required>
                    <option value="Vehículos">Vehículos (7 años)</option>
                    <option value="Maquinaría">Maquinaría (10 años)</option>
                    <option value="Equipos de Computación">Informática (3 años)</option>
                    <option value="Muebles y Útiles">Muebles (7 años)</option>
                  </select>
                </div>
                <div class="form-group" style="grid-column: span 2;"><label>Nombre del Bien</label><input type="text" class="form-control" name="nombre" required></div>
                <div class="form-group"><label>Fecha Compra</label><input type="date" class="form-control" name="fecha_adquisicion" required></div>
                <div class="form-group"><label>Valor Neto Compra ($)</label><input type="number" class="form-control" name="valor_compra" required></div>
                <div class="modal-footer" style="grid-column: span 2; margin-top:1rem;">
                    <button type="submit" class="btn btn-primary" style="width:100%">Incorporar al Patrimonio</button>
                </div>
            </form>
        `;
    import('../../components/ui-helpers.js').then(ui => {
      ui.openModal('Incorporar Nuevo Activo Fijo', formHtml);
      document.getElementById('form-activo').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        await db.insert('activo_fijo', data);
        ui.showToast('Activo incorporado con éxito', 'success');
        renderActivoFijo(container);
      };
    });
  };
}
