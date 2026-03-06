/* ============================================
   TESORERÍA Y BANCOS — Gestión de Flujo y Préstamos
   ============================================ */

import { db } from '../../services/datastore.js';
import {
    registrarAporteCapital,
    registrarPrestamoBancario,
    pagarCuotaPrestamo,
    getCuentasDetalle
} from '../../services/contabilidad.service.js';
import { formatCLP } from '../../utils/formatters.js';
import { showToast, openModal, closeModal, getSelectedPeriodo } from '../../components/ui-helpers.js';

export async function renderTesoreria(container) {
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 class="section-title">Tesorería y Gestión Bancaria</h2>
                <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px;">Control de bancos, conciliación, aportes y préstamos</p>
            </div>
            <div style="display:flex; gap:12px;">
                <button class="btn btn-secondary" id="btn-aporte-capital">
                    <i class="fas fa-users"></i> Aporte Capital
                </button>
                <button class="btn btn-primary" id="btn-nuevo-prestamo">
                    <i class="fas fa-hand-holding-usd"></i> Nuevo Préstamo
                </button>
            </div>
        </div>

        <div class="tabs-container" style="margin-bottom:var(--space-xl);">
            <div class="tab-item active" data-tab="resumen">Resumen Bancos</div>
            <div class="tab-item" data-tab="prestamos">Préstamos y Créditos</div>
            <div class="tab-item" data-tab="conciliacion">Conciliación Bancaria</div>
        </div>

        <div id="tesoreria-content">
            <!-- Contenido dinámico -->
        </div>
    `;

    const tabs = container.querySelectorAll('.tab-item');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderTab(tab.dataset.tab, container.querySelector('#tesoreria-content'));
        });
    });

    container.querySelector('#btn-aporte-capital').addEventListener('click', () => openAporteModal(container));
    container.querySelector('#btn-nuevo-prestamo').addEventListener('click', () => openPrestamoModal(container));

    // Render inicial
    await renderTab('resumen', container.querySelector('#tesoreria-content'));
}

async function renderTab(tab, container) {
    container.innerHTML = `<div class="skeleton-loader">Cargando datos de ${tab}...</div>`;
    const { string: periodo } = getSelectedPeriodo();

    if (tab === 'resumen') {
        const cuentasBancos = (await db.getAll('plan_cuentas')).filter(c => c.codigo.startsWith('1.1.02') && c.nivel === 3);
        const movimientos = await db.getAll('asiento_movimientos');
        const asientos = await db.getAll('asientos');

        container.innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap:20px;">
                ${cuentasBancos.map(cuenta => {
            const movs = movimientos.filter(m => m.cuenta_codigo === cuenta.codigo);
            const saldo = movs.reduce((s, m) => s + m.debe - m.haber, 0);
            return `
                        <div class="card animate-fade-in">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                                <div>
                                    <h4 style="margin:0; font-size:14px; opacity:0.8;">${cuenta.codigo}</h4>
                                    <h3 style="margin:0;">${cuenta.nombre}</h3>
                                </div>
                                <i class="fas fa-university" style="font-size:24px; color:var(--primary-color); opacity:0.5;"></i>
                            </div>
                            <div style="font-size:24px; font-family:var(--font-mono); font-weight:bold; margin:20px 0;">
                                ${formatCLP(saldo)}
                            </div>
                            <div style="border-top:1px solid var(--border-primary); padding-top:12px; display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted);">
                                <span>Estado: Activa</span>
                                <span>Últ. Mov: ${periodo}</span>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    if (tab === 'prestamos') {
        const prestamos = await db.getAll('prestamos');
        container.innerHTML = `
            <div class="card">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Entidad</th>
                            <th>Monto Inicial</th>
                            <th>Cuotas</th>
                            <th>Tasa Anual</th>
                            <th>Fecha Inicio</th>
                            <th style="text-align:center;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${prestamos.map(p => `
                            <tr>
                                <td><strong>${p.nombre_entidad}</strong></td>
                                <td class="cell-mono">${formatCLP(p.monto_principal)}</td>
                                <td>${p.total_cuotas}</td>
                                <td>${p.tasa_interes_anual}%</td>
                                <td>${p.fecha_inicio}</td>
                                <td style="text-align:center;">
                                    <button class="btn btn-secondary btn-sm ver-amortizacion" data-id="${p.id}">
                                        <i class="fas fa-list-ol"></i> Ver Cuotas
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                        ${prestamos.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">No hay préstamos registrados</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        `;

        container.querySelectorAll('.ver-amortizacion').forEach(btn => {
            btn.addEventListener('click', () => openAmortizacionModal(btn.dataset.id));
        });
    }

    if (tab === 'conciliacion') {
        container.innerHTML = `
            <div class="card animate-fade-in" style="text-align:center; padding:60px;">
                <i class="fas fa-sync" style="font-size:48px; color:var(--primary-color); opacity:0.3; margin-bottom:20px;"></i>
                <h3>Módulo de Conciliación Bancaria</h3>
                <p style="color:var(--text-muted); max-width:500px; margin: 0 auto 24px;">
                    Carga tu cartola bancaria para compararla con los registros contables y asegurar que el saldo de bancos sea idéntico al de tu banco real.
                </p>
                <div style="display:flex; justify-content:center; gap:16px;">
                    <button class="btn btn-primary" id="btn-subir-cartola">
                        <i class="fas fa-upload"></i> Cargar Cartola (.csv / .xls)
                    </button>
                </div>
            </div>
        `;
    }
}

async function openAporteModal(container) {
    const cuentasBancos = await getCuentasDetalle();
    const content = `
        <form id="form-aporte">
            <div class="form-group">
                <label>Nombre del Socio / Aportante</label>
                <input type="text" name="socio" class="form-control" required placeholder="Ej: Juan Pérez">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Monto del Aporte</label>
                    <input type="number" name="monto" class="form-control" required placeholder="0">
                </div>
                <div class="form-group">
                    <label>Fecha</label>
                    <input type="date" name="fecha" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                </div>
            </div>
            <div class="form-group">
                <label>Cuenta de Destino</label>
                <select name="cuenta" class="form-control" required>
                    ${cuentasBancos.filter(c => c.codigo.startsWith('1.1.01') || c.codigo.startsWith('1.1.02')).map(c =>
        `<option value="${c.codigo}">${c.codigo} - ${c.nombre}</option>`
    ).join('')}
                </select>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Registrar Aporte</button>
            </div>
        </form>
    `;

    openModal('Registrar Aporte de Capital', content);

    document.getElementById('form-aporte').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());

        try {
            await registrarAporteCapital({
                fecha: data.fecha,
                socio: data.socio,
                monto: parseInt(data.monto),
                cuenta_destino: data.cuenta
            });
            showToast('Aporte de capital registrado con éxito', 'success');
            closeModal();
            renderTab('resumen', document.querySelector('#tesoreria-content'));
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

async function openPrestamoModal(container) {
    const cuentasBancos = await getCuentasDetalle();
    const content = `
        <form id="form-prestamo">
            <div class="form-group">
                <label>Entidad Financiera (Banco)</label>
                <input type="text" name="entidad" class="form-control" required placeholder="Ej: Banco de Chile">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Monto Solicitado</label>
                    <input type="number" name="monto" class="form-control" required placeholder="0">
                </div>
                <div class="form-group">
                    <label>N° de Cuotas</label>
                    <input type="number" name="cuotas" class="form-control" required value="12" min="1">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Tasa Anual (%)</label>
                    <input type="number" name="tasa" class="form-control" required value="4.5" step="0.1">
                </div>
                <div class="form-group">
                    <label>Fecha Recepción</label>
                    <input type="date" name="fecha" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                </div>
            </div>
            <div class="form-group">
                <label>Cuenta de Abono (Donde llega el dinero)</label>
                <select name="cuenta_banco" class="form-control" required>
                    ${cuentasBancos.filter(c => c.codigo.startsWith('1.1.02')).map(c =>
        `<option value="${c.codigo}">${c.codigo} - ${c.nombre}</option>`
    ).join('')}
                </select>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Registrar Préstamo</button>
            </div>
        </form>
    `;

    openModal('Solicitar / Registrar Préstamo', content);

    document.getElementById('form-prestamo').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());

        try {
            await registrarPrestamoBancario({
                entidad: data.entidad,
                monto: parseInt(data.monto),
                cuotas: parseInt(data.cuotas),
                tasa: parseFloat(data.tasa),
                fecha: data.fecha,
                cuenta_banco: data.cuenta_banco
            });
            showToast('Préstamo bancario registrado y tabla de amortización generada', 'success');
            closeModal();
            renderTab('prestamos', document.querySelector('#tesoreria-content'));
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

async function openAmortizacionModal(prestamoId) {
    const allCuotas = await db.getAll('prestamos_cuotas');
    const cuotas = allCuotas.filter(c => c.prestamo_id === prestamoId).sort((a, b) => a.num_cuota - b.num_cuota);
    const cuentasBancos = await getCuentasDetalle();
    const bancoDefecto = '1.1.02'; // Cuenta Banco por defecto

    const content = `
        <div style="max-height: 500px; overflow-y: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>N°</th>
                        <th>Vencimiento</th>
                        <th style="text-align:right;">Capital</th>
                        <th style="text-align:right;">Interés</th>
                        <th style="text-align:right;">Cuota Total</th>
                        <th>Estado</th>
                        <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${cuotas.map(c => `
                        <tr>
                            <td>${c.num_cuota}</td>
                            <td>${c.fecha_vencimiento}</td>
                            <td class="cell-mono" style="text-align:right;">${formatCLP(c.capital)}</td>
                            <td class="cell-mono" style="text-align:right;">${formatCLP(c.interes)}</td>
                            <td class="cell-mono" style="text-align:right; font-weight:bold;">${formatCLP(c.total_cuota)}</td>
                            <td>
                                <span class="badge ${c.estado === 'pagado' ? 'badge-success' : 'badge-warning'}">
                                    ${c.estado.toUpperCase()}
                                </span>
                            </td>
                            <td>
                                ${c.estado === 'pendiente' ? `
                                    <button class="btn btn-primary btn-sm btn-pagar-cuota" data-id="${c.id}">
                                        Pagar
                                    </button>
                                ` : '-'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    openModal('Tabla de Amortización', content);

    const payButtons = document.querySelectorAll('.btn-pagar-cuota');
    payButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const cuotaId = btn.dataset.id;
            try {
                // Por simplicidad, usamos la fecha de hoy y el banco principal
                await pagarCuotaPrestamo({
                    cuotaId,
                    fecha: new Date().toISOString().split('T')[0],
                    cuenta_banco: bancoDefecto
                });
                showToast('Pago de cuota registrado con éxito', 'success');
                closeModal();
                // No llamamos a renderTab aquí porque no tenemos el container original fácilmente, 
                // pero como el modal se cierra, el usuario verá la tabla actualizada al volver a abrirla o si refrescamos la vista.
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });
}
