/* =========================================================
   MÓDULO: TOMA DE INVENTARIO (FÍSICO VS SISTEMA)
   ========================================================= */

import { erpFetch } from '../../services/erp-api.js';

export async function renderTomaInventario(containerId = 'main-content') {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Estado local del módulo
    let currentTab = 'mp'; // 'mp', 'pt' o 'history'
    let data = [];
    let history = [];
    let physicalStocks = {}; // code -> quantity

    async function loadData() {
        container.innerHTML = `
            <div style="height: 300px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 1rem; opacity: 0.6">
                <div class="spinner"></div>
                <p>Cargando datos...</p>
            </div>
        `;

        try {
            if (currentTab === 'mp') {
                data = await erpFetch('/raw-materials');
            } else if (currentTab === 'pt') {
                data = await erpFetch('/products');
            } else {
                history = await erpFetch('/inventory/takes');
            }
            render();
        } catch (e) {
            container.innerHTML = `<div class="alert alert-danger">Error: ${e.message}</div>`;
        }
    }

    function render() {
        container.innerHTML = `
            <div id="accounting-container" class="animate-fade">
                <header class="section-header">
                    <div>
                        <h1 class="section-title">Gestión de Inventarios</h1>
                        <p style="opacity:0.7; font-size:0.9rem">Ajuste de existencias y auditoría de tomas físicas.</p>
                    </div>
                    <div style="display: flex; gap: 0.5rem">
                         <button id="btn-sync-all" class="btn btn-secondary">
                            <i class="fas fa-sync"></i> Recargar
                        </button>
                    </div>
                </header>

                <div class="tabs">
                    <button class="tab ${currentTab === 'mp' ? 'active' : ''}" id="tab-mp">Insumos (MP)</button>
                    <button class="tab ${currentTab === 'pt' ? 'active' : ''}" id="tab-pt">Productos (PT)</button>
                    <button class="tab ${currentTab === 'history' ? 'active' : ''}" id="tab-history">Historial de Tomas</button>
                </div>

                ${currentTab === 'history' ? renderHistory() : renderTaking()}
            </div>
        `;

        attachEvents();
    }

    function renderTaking() {
        return `
            <div class="data-table-wrapper">
                <div class="data-table-toolbar">
                    <div style="display:flex; align-items:center; gap:1rem; flex:1">
                        <i class="fas fa-search" style="opacity:0.5"></i>
                        <input type="text" id="inv-search" placeholder="Buscar por nombre o código..." 
                            style="background:transparent; border:none; color:var(--text); width:100%; outline:none">
                    </div>
                </div>
                
                <table class="data-table" style="width: 100%">
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Nombre</th>
                            <th class="text-right">Stock Sistema</th>
                            <th class="text-right" style="background: rgba(59, 130, 246, 0.05)">Stock Físico Real</th>
                            <th class="text-right">Diferencia</th>
                            <th class="text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody id="inventory-body">
                        ${renderRows(data)}
                    </tbody>
                </table>
            </div>

            <div style="margin-top: 2rem; display: flex; justify-content: flex-end; gap: 1rem">
                <button id="btn-process-adjust" class="btn btn-primary" style="padding: 0.8rem 2rem">
                    <i class="fas fa-save"></i> Procesar Ajuste y Registrar Toma
                </button>
            </div>
        `;
    }

    function renderHistory() {
        if (!history || history.length === 0) return '<div class="card" style="text-align:center; padding:3rem; opacity:0.5">No hay registros de tomas previas</div>';

        return `
            <div class="data-table-wrapper">
                <table class="data-table" style="width: 100%">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Fecha</th>
                            <th>Categoría</th>
                            <th>Items</th>
                            <th class="text-right">Valor Variación</th>
                            <th>Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.map(t => `
                            <tr>
                                <td class="cell-mono">#${t.id.toString().slice(-4)}</td>
                                <td>${t.date}</td>
                                <td><span class="badge ${t.category === 'mp' ? 'badge-info' : 'badge-success'}">${t.category.toUpperCase()}</span></td>
                                <td>${t.total_items} productos</td>
                                <td class="text-right ${t.total_variation_value < 0 ? 'cell-negative' : 'cell-positive'}">
                                    $${Math.round(t.total_variation_value).toLocaleString('es-CL')}
                                </td>
                                <td>
                                    <button class="btn btn-ghost btn-sm" onclick="window.viewTakeDetails('${t.id}')">
                                        <i class="fas fa-eye"></i> Detalle
                                    </button>
                                    <button class="btn btn-ghost btn-sm" onclick="window.revertTake('${t.id}')" style="color:var(--danger)">
                                        <i class="fas fa-undo"></i> Revertir
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    window.viewTakeDetails = function(id) {
        const take = history.find(t => t.id == id);
        if (!take) return;

        const body = `
            <div class="data-table-wrapper">
                <table class="data-table" style="width: 100%; font-size: 0.8rem">
                    <thead>
                        <tr>
                            <th>Ítem</th>
                            <th class="text-right">Sistema</th>
                            <th class="text-right">Físico</th>
                            <th class="text-right">Diff</th>
                            <th class="text-right">Costo Unit.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${take.items.map(i => `
                            <tr>
                                <td>${i.item_name}<br><small class="cell-mono">${i.item_code}</small></td>
                                <td class="text-right">${(i.system_stock || 0).toFixed(2)}</td>
                                <td class="text-right" style="font-weight:600">${(i.physical_stock || 0).toFixed(2)}</td>
                                <td class="text-right ${i.difference < 0 ? 'cell-negative' : 'cell-positive'}">
                                    ${i.difference > 0 ? '+' : ''}${(i.difference || 0).toFixed(2)}
                                </td>
                                <td class="text-right">$${Math.round(i.unit_cost || 0).toLocaleString('es-CL')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        const modalBody = document.getElementById('modal-body');
        const modalTitle = document.getElementById('modal-title');
        const modal = document.getElementById('modal-overlay');
        
        if (modalBody && modalTitle && modal) {
            modalTitle.textContent = `Detalle de Toma de Inventario #${id.toString().slice(-4)}`;
            modalBody.innerHTML = body;
            const footer = document.getElementById('modal-footer');
            if (footer) footer.innerHTML = `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Cerrar</button>`;
            modal.classList.remove('hidden');
        }
    }

    window.revertTake = async function(id) {
        if (!confirm('¿Está seguro de REVERTIR esta toma de inventario?\n\n- Se restaurará el stock previo (deshaciendo el ajuste).\n- Se eliminará el asiento contable asociado.\n- Se borrará este registro del historial.')) {
            return;
        }

        try {
            const res = await erpFetch(`/inventory/takes/${id}`, { method: 'DELETE' });
            if (res && res.success) {
                alert('Toma revertida con éxito.');
                loadData();
            } else {
                throw new Error(res?.error || 'Error al revertir');
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    }

    function renderRows(items) {
        if (!items || items.length === 0) return '<tr><td colspan="6" style="text-align:center; padding:2rem; opacity:0.5">No hay ítems registrados</td></tr>';

        return items.map(item => {
            const systemStock = parseFloat(item.stock) || 0;
            const physicalStock = physicalStocks[item.code] !== undefined ? physicalStocks[item.code] : systemStock;
            const diff = physicalStock - systemStock;
            const diffClass = diff < 0 ? 'cell-negative' : (diff > 0 ? 'cell-positive' : '');

            return `
                <tr data-code="${item.code}">
                    <td class="cell-mono"><strong>${item.code}</strong></td>
                    <td>${item.name}</td>
                    <td class="text-right" style="font-weight:600">${systemStock.toFixed(2)}</td>
                    <td class="text-right" style="width: 150px; background: rgba(59, 130, 246, 0.05)">
                        <input type="number" step="0.01" class="physical-input" data-code="${item.code}" 
                            value="${physicalStock}" 
                            style="width: 100%; border:1px solid var(--border); background:var(--surface-light); color:var(--text); text-align:right; border-radius:4px; padding:2px 5px">
                    </td>
                    <td class="text-right ${diffClass}" id="diff-${item.code}">
                        ${diff > 0 ? '+' : ''}${diff.toFixed(2)}
                    </td>
                    <td class="text-right">
                         <button class="btn btn-ghost btn-sm" onclick="this.closest('tr').querySelector('input').value = ${systemStock}; this.closest('tr').querySelector('input').dispatchEvent(new Event('input'))" title="Resetear">
                            <i class="fas fa-undo"></i>
                         </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function attachEvents() {
        const tabMP = document.getElementById('tab-mp');
        const tabPT = document.getElementById('tab-pt');
        const tabHis = document.getElementById('tab-history');

        if (tabMP) tabMP.onclick = () => { currentTab = 'mp'; physicalStocks = {}; loadData(); };
        if (tabPT) tabPT.onclick = () => { currentTab = 'pt'; physicalStocks = {}; loadData(); };
        if (tabHis) tabHis.onclick = () => { currentTab = 'history'; loadData(); };

        if (currentTab === 'history') {
             const syncBtn = document.getElementById('btn-sync-all');
             if (syncBtn) syncBtn.onclick = () => loadData();
             return;
        }

        const search = document.getElementById('inv-search');
        if (search) {
            search.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = data.filter(i => i.code.toLowerCase().includes(term) || i.name.toLowerCase().includes(term));
                const body = document.getElementById('inventory-body');
                if (body) body.innerHTML = renderRows(filtered);
                attachInputEvents();
            };
        }

        const syncBtn = document.getElementById('btn-sync-all');
        if (syncBtn) syncBtn.onclick = () => loadData();

        const adjustBtn = document.getElementById('btn-process-adjust');
        if (adjustBtn) adjustBtn.onclick = handleProcessAdjust;

        attachInputEvents();
    }

    function attachInputEvents() {
        document.querySelectorAll('.physical-input').forEach(input => {
            input.oninput = (e) => {
                const code = e.target.dataset.code;
                const val = parseFloat(e.target.value) || 0;
                physicalStocks[code] = val;
                
                const item = data.find(i => i.code === code);
                const systemStock = parseFloat(item.stock) || 0;
                const diff = val - systemStock;
                
                const diffEl = document.getElementById(`diff-${code}`);
                if (diffEl) {
                    diffEl.textContent = (diff > 0 ? '+' : '') + diff.toFixed(2);
                    diffEl.className = `text-right ${diff < 0 ? 'cell-negative' : (diff > 0 ? 'cell-positive' : '')}`;
                }
            };
        });
    }

    async function handleProcessAdjust() {
        const adjustments = [];
        Object.entries(physicalStocks).forEach(([code, physical]) => {
            const item = data.find(i => i.code === code);
            const system = parseFloat(item.stock) || 0;
            const diff = physical - system;
            
            if (Math.abs(diff) > 0.001) {
                adjustments.push({
                    code,
                    type: currentTab, 
                    name: item.name,
                    old_stock: system,
                    new_stock: physical,
                    difference: diff,
                    unit_cost: parseFloat(item.cost_unit || item.cost_net || 0)
                });
            }
        });

        if (adjustments.length === 0) {
            alert('No hay diferencias de stock para ajustar.');
            return;
        }

        if (!confirm(`¿Está seguro de procesar ${adjustments.length} ajustes de inventario?\nEsto actualizará el stock y generará un registro histórico.`)) {
            return;
        }

        try {
            const res = await erpFetch('/inventory/adjust', {
                method: 'POST',
                body: JSON.stringify({
                    items: adjustments,
                    category: currentTab,
                    date: new Date().toISOString().split('T')[0]
                })
            });

            if (res && res.success) {
                alert('Ajuste de inventario procesado con éxito.');
                physicalStocks = {};
                loadData();
            } else {
                throw new Error(res?.error || 'Error al procesar el ajuste');
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    }

    loadData();
}
