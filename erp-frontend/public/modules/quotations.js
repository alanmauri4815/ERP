/**
 * Módulo de Cotizaciones
 * Gestiona la visualización, creación y edición de cotizaciones.
 */

const QUOTE_STATUS_LABELS = {
    draft: 'Borrador',
    sent: 'Enviada',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    production: 'En Producción',
    cancelled: 'Cancelada'
};

const QUOTE_STATUS_COLORS = {
    draft: '#94a3b8',
    sent: '#3b82f6',
    approved: '#10b981',
    rejected: '#ef4444',
    production: '#8b5cf6',
    cancelled: '#64748b'
};

const QUOTE_TRANSITIONS = {
    draft: ['sent', 'cancelled'],
    sent: ['approved', 'rejected', 'cancelled'],
    approved: ['production', 'cancelled', 'draft'],
    rejected: ['sent', 'draft'],
    production: ['approved', 'sent', 'cancelled'],
    cancelled: ['draft']
};

window.initializeQuotations = () => {
    // Definición de la vista en el objeto global views
    if (window.views) {
        window.views.quotations = () => {
            const filtered = state.quoteStatusFilter === 'all'
                ? state.quotations
                : state.quotations.filter(q => q.status === state.quoteStatusFilter);

            const statusCounts = {};
            state.quotations.forEach(q => {
                const s = q.status || 'draft';
                statusCounts[s] = (statusCounts[s] || 0) + 1;
            });

            return `
            <header class="animate-fade">
                <div style="display:flex; align-items:center; gap:1rem">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <h1>Cotizaciones</h1>
                </div>
                <div style="display: flex; gap: 0.5rem">
                    ${currentUser.role === 'superadmin' ? `
                        <button onclick="window.bulkPromoteQuotes()" style="background: var(--accent); color: white;" title="Sincronizar cotizaciones antiguas a productos">🚀 Sincronización Histórica</button>
                        <button onclick="window.syncHistoryItems()" style="background: var(--primary); color: white;" title="Vincular ventas y producciones viejas con los nuevos códigos">📦 Vincular Historial</button>
                    ` : ''}
                    <button onclick="window.openQuotationModal()">+ Nueva Cotización</button>
                </div>
            </header>

            <div class="card animate-fade" style="padding: 0.8rem 1.2rem; margin-bottom: 1rem; display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center">
                <button onclick="window.filterQuoteStatus('all')" style="padding:0.4rem 0.9rem; border-radius:20px; font-size:0.82rem; font-weight:600; border:none; cursor:pointer; transition:all 0.2s; ${state.quoteStatusFilter === 'all' ? 'background:var(--primary); color:white' : 'background:var(--surface-light); color:var(--text-muted)'}">
                    Todos (${state.quotations.length})
                </button>
                ${Object.entries(QUOTE_STATUS_LABELS).map(([key, label]) => {
                    const count = statusCounts[key] || 0;
                    if (count === 0 && key !== state.quoteStatusFilter) return '';
                    const isActive = state.quoteStatusFilter === key;
                    return `<button onclick="window.filterQuoteStatus('${key}')" style="padding:0.4rem 0.9rem; border-radius:20px; font-size:0.82rem; font-weight:600; border:none; cursor:pointer; transition:all 0.2s; ${isActive ? `background:${QUOTE_STATUS_COLORS[key]}; color:white` : `background:var(--surface-light); color:${QUOTE_STATUS_COLORS[key]}`}">
                        ${label} (${count})
                    </button>`;
                }).join('')}
            </div>

            <div class="card animate-fade">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Cliente</th>
                                <th>Nombre Proyecto</th>
                                <th style="text-align:right">Costo Interno</th>
                                <th style="text-align:right">Precio Venta (IVA Inc)</th>
                                <th style="text-align:center">Prob. Éxito</th>
                                <th style="text-align:center">Estado</th>
                                <th style="text-align:center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.length === 0 ? '<tr><td colspan="8" style="text-align:center; padding:3rem; opacity:0.5">No hay cotizaciones en este filtro</td></tr>' :
                            filtered.map(q => {
                                const status = q.status || 'draft';
                                const transitions = QUOTE_TRANSITIONS[status] || [];
                                return `
                                    <tr>
                                        <td>${q.created_at ? new Date(q.created_at).toLocaleDateString() : '-'}</td>
                                        <td>${q.clients?.name || 'Varios'}</td>
                                        <td><strong>${q.name || '-'}</strong></td>
                                        <td style="text-align:right">$${Math.round(q.total_net_cost || 0).toLocaleString()}</td>
                                        <td style="text-align:right; font-weight:bold; color:var(--primary)">$${Math.round(q.total_price_gross || 0).toLocaleString()}</td>
                                        <td style="text-align:center">
                                            ${q.success_probability ? `<span style="font-weight:bold; color:${q.success_probability > 50 ? '#10b981' : (q.success_probability > 20 ? '#f59e0b' : '#ef4444')}">${Math.round(q.success_probability)}%</span>` : '-'}
                                        </td>
                                        <td style="text-align:center">
                                            <span style="display:inline-block; padding:0.25rem 0.7rem; border-radius:12px; font-size:0.78rem; font-weight:700; background:${QUOTE_STATUS_COLORS[status]}22; color:${QUOTE_STATUS_COLORS[status]}; border:1px solid ${QUOTE_STATUS_COLORS[status]}44">
                                                ${QUOTE_STATUS_LABELS[status] || status}
                                            </span>
                                        </td>
                                        <td style="text-align:center">
                                            <div style="display:flex; gap:0.3rem; justify-content:center; flex-wrap:wrap">
                                                <button class="btn-sm" onclick="window.viewQuotation('${q.id}')">👁️ Ver</button>
                                                ${status !== 'rejected' && status !== 'cancelled' ? `<button class="btn-sm" style="background:var(--accent)" onclick="window.editQuotation('${q.id}')">✏️</button>` : ''}
                                                ${transitions.length > 0 ? `
                                                    <select onchange="if(this.value) window.changeQuoteStatus('${q.id}', this.value); this.value='';" style="padding:0.25rem 0.4rem; font-size:0.78rem; border-radius:6px; border:1px solid var(--border); background:var(--surface-light); color:var(--text); cursor:pointer; max-width:120px">
                                                        <option value="">⚡ Estado...</option>
                                                        ${transitions.map(t => `<option value="${t}">${QUOTE_STATUS_LABELS[t]}</option>`).join('')}
                                                    </select>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            `;
        }
    }
};

window.openQuotationModal = () => {
    document.getElementById('quotation-modal').style.display = 'flex';
    document.getElementById('quote-modal-title').textContent = 'Nueva Cotización';
    document.getElementById('quote-id').value = '';
    document.getElementById('quote-name').value = '';
    document.getElementById('quote-client').value = '';
    document.getElementById('quote-rut').value = '';
    document.getElementById('quote-address').value = '';
    document.getElementById('quote-description-proposal').value = '';
    document.getElementById('quote-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('quote-delivery-time').value = '';
    document.getElementById('quote-external-id').value = '';

    if (state.quotations && state.quotations.length > 0) {
        const ids = state.quotations
            .map(q => parseInt(q.external_quote_id))
            .filter(id => !isNaN(id));
        if (ids.length > 0) {
            document.getElementById('quote-external-id').value = Math.max(...ids) + 1;
        } else {
            document.getElementById('quote-external-id').value = '1';
        }
    } else {
        document.getElementById('quote-external-id').value = '1';
    }

    document.getElementById('quote-purchase-order').value = '';
    document.getElementById('quote-utility').value = '30';
    document.getElementById('quote-budget').value = '0';
    document.getElementById('quote-probability').textContent = '-%';
    document.getElementById('btn-save-quote').disabled = false;
    document.getElementById('btn-save-quote').textContent = '💾 Guardar Cotización';

    window.quotationItems = [];
    window.quotationProducts = [
        { id: 'p' + Date.now(), name: '', quantity: 1 }
    ];
    window.quotationImages = [];
    window.renderQuoteImagePreviews();
    window.renderQuotationProducts();
    window.renderQuotationItems();
    window.calculateQuotation();
};

window.editQuotation = async (id) => {
    const q = await apiFetch(`/quotations/${id}`);
    if (!q) return;

    window.openQuotationModal();
    document.getElementById('quote-modal-title').textContent = 'Editar Cotización';
    document.getElementById('quote-id').value = q.id;
    document.getElementById('quote-name').value = q.name || '';
    document.getElementById('quote-client').value = q.client_id || '';
    document.getElementById('quote-rut').value = q.rut || '';
    document.getElementById('quote-address').value = q.address || '';
    document.getElementById('quote-description-proposal').value = q.description_proposal || '';
    document.getElementById('quote-date').value = q.quote_date ? q.quote_date.split('T')[0] : '';
    document.getElementById('quote-delivery-time').value = q.delivery_time || '';
    document.getElementById('quote-external-id').value = q.external_quote_id || '';
    document.getElementById('quote-purchase-order').value = q.purchase_order_id || '';
    document.getElementById('quote-utility').value = q.utility_percentage || 0;
    document.getElementById('quote-budget').value = q.budget || 0;

    window.quotationProducts = q.products_list || [
        { id: 'p' + Date.now(), name: q.name, quantity: q.quantity || 1 }
    ];

    window.quotationItems = (q.items || []).map(it => ({
        type: it.item_type || 'material',
        calculation_type: it.calculation_type || 'unit',
        linked_to: it.linked_to || 'general',
        description: it.description,
        document_type: (it.price_gross == 1) ? 'boleta' : 'factura',
        unit_value_net: it.unit_cost,
        quantity: it.quantity,
        item_code: it.item_code // Preserve catalog link
    }));

    window.quotationImages = q.images || [];
    window.currentQuotationStatus = q.status || 'draft'; // Guardar estado actual
    window.renderQuoteImagePreviews();
    window.renderQuotationProducts();
    window.renderQuotationItems();
    window.calculateQuotation();
};

window.saveQuotation = async () => {
    const btn = document.getElementById('btn-save-quote');
    const quoteId = document.getElementById('quote-id').value;
    const clientId = document.getElementById('quote-client').value;
    const name = document.getElementById('quote-name').value;
    const rut = document.getElementById('quote-rut').value;
    const address = document.getElementById('quote-address').value;
    const descProposal = document.getElementById('quote-description-proposal').value;
    const quoteDate = document.getElementById('quote-date').value;
    const deliveryTime = document.getElementById('quote-delivery-time').value;
    const externalQuoteId = document.getElementById('quote-external-id').value;
    const purchaseOrderId = document.getElementById('quote-purchase-order').value;

    if (!clientId || !name) return alert('Por favor complete Cliente y Nombre');

    let method = quoteId ? 'PUT' : 'POST';
    let endpoint = quoteId ? `/quotations/${quoteId}` : '/quotations';
    let finalExternalId = externalQuoteId;

    // Lógica de Versionado para Super Admin
    if (quoteId && currentUser.role === 'superadmin' && (window.currentQuotationStatus === 'sent' || window.currentQuotationStatus === 'production')) {
        const createNewVersion = confirm(`Esta cotización ya tiene estado "${QUOTE_STATUS_LABELS[window.currentQuotationStatus]}". \n\n¿Deseas guardarla como una NUEVA VERSIÓN para no sobreescribir la original?`);
        
        if (createNewVersion) {
            method = 'POST'; // Forzar creación de nuevo registro
            endpoint = '/quotations';
            
            // Calcular versión (Ej: 58 -> 58V2 -> 58V3)
            const baseId = externalQuoteId.split('V')[0];
            const versions = state.quotations
                .map(q => q.external_quote_id || '')
                .filter(id => id.startsWith(baseId))
                .map(id => {
                    const match = id.match(/V(\d+)$/);
                    return match ? parseInt(match[1]) : 1;
                });
            const nextVer = Math.max(...versions, 1) + 1;
            finalExternalId = `${baseId}V${nextVer}`;
            alert(`Se creará la versión: ${finalExternalId}`);
        }
    }

    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const body = {
        client_id: clientId,
        name: name,
        rut: rut,
        address: address,
        description_proposal: descProposal,
        images: window.quotationImages,
        quote_date: quoteDate,
        delivery_time: deliveryTime,
        external_quote_id: finalExternalId,
        purchase_order_id: purchaseOrderId,
        quantity: window.quotationProducts.reduce((sum, p) => sum + (parseFloat(p.quantity) || 0), 0),
        utility_percentage: parseFloat(document.getElementById('quote-utility').value),
        products_list: window.quotationProducts,
        ...window.currentQuoteCalcs,
        items: window.quotationItems
            .filter(it => it.quantity > 0)
            .map(it => {
                const projectTotal = window.getItemProjectTotal(it);
                return {
                    item_type: it.type,
                    calculation_type: it.calculation_type,
                    linked_to: it.linked_to,
                    description: it.description,
                    quantity: it.quantity,
                    unit_cost: it.unit_value_net,
                    total_cost: Math.round(projectTotal),
                    price_gross: (it.document_type === 'boleta') ? 1 : 0,
                    item_code: it.item_code
                };
            })
    };

    try {
        const res = await apiFetch(endpoint, { method, body: JSON.stringify(body) });

        if (res && res.success) {
            alert(res.message || 'Cotización guardada correctamente');
            document.getElementById('quotation-modal').style.display = 'none';
            fetchData();
        } else {
            btn.disabled = false;
            btn.textContent = '💾 Guardar Cotización';
            alert('Error: No se pudo guardar la cotización. Podría ser que las imágenes son muy pesadas o hay un problema de conexión.');
        }
    } catch (err) {
        console.error('Save error:', err);
        btn.disabled = false;
        btn.textContent = '💾 Guardar Cotización';
        alert('Error al guardar la cotización');
    }
};

window.calculateQuotation = () => {
    const utilityPerc = parseFloat(document.getElementById('quote-utility').value) || 0;
    let totalCostGlobal = 0;
    let factNetGlobal = 0;
    let bolIVAGlobal = 0;

    const products = {};
    window.quotationProducts.forEach(p => {
        products[p.id] = { ...p, cost: 0, net: 0, iva: 0 };
    });

    let generalFixedCost = 0;
    let generalFixedNet = 0;
    let generalFixedIVA = 0;

    window.quotationItems.forEach(item => {
        const raw = (parseFloat(item.unit_value_net) || 0) * (parseFloat(item.quantity) || 0);
        const isFixed = item.calculation_type === 'fixed';
        let lineCost = raw;
        let lineIVA = 0;
        if (item.document_type === 'boleta') {
            lineCost = raw * 1.19;
            lineIVA = raw * 0.19;
        }

        if (item.linked_to === 'general') {
            if (isFixed) {
                generalFixedCost += lineCost;
                generalFixedNet += (item.document_type === 'factura' ? raw : 0);
                generalFixedIVA += lineIVA;
            } else {
                const totalQty = window.quotationProducts.reduce((sum, p) => sum + (parseFloat(p.quantity) || 0), 0);
                generalFixedCost += lineCost * totalQty;
                generalFixedNet += (item.document_type === 'factura' ? raw * totalQty : 0);
                generalFixedIVA += lineIVA * totalQty;
            }
        } else {
            const p = Object.values(products).find(x => String(x.id) === String(item.linked_to));
            if (p) {
                if (isFixed) {
                    p.cost += lineCost;
                    p.net += (item.document_type === 'factura' ? raw : 0);
                    p.iva += lineIVA;
                } else {
                    const prodQty = parseFloat(p.quantity) || 0;
                    p.cost += lineCost * prodQty;
                    p.net += (item.document_type === 'factura' ? raw * prodQty : 0);
                    p.iva += lineIVA * prodQty;
                }
            }
        }
    });

    let totalNetoVisual = 0;
    const totalQty = window.quotationProducts.reduce((sum, p) => sum + (parseFloat(p.quantity) || 0), 0);

    Object.values(products).forEach(p => {
        const share = totalQty > 0 ? (parseFloat(p.quantity) / totalQty) : 0;
        const pTotalCost = p.cost + (generalFixedCost * share);
        const unitPriceNetRaw = (pTotalCost / (parseFloat(p.quantity) || 1)) * (1 + (utilityPerc / 100));
        const unitPriceNetRounded = Math.round(unitPriceNetRaw);
        const productSubtotalNet = unitPriceNetRounded * (parseFloat(p.quantity) || 0);
        totalNetoVisual += productSubtotalNet;
        p.unitPriceNet = unitPriceNetRounded;
        p.subtotalNet = productSubtotalNet;
        totalCostGlobal += pTotalCost;
        factNetGlobal += p.net + (generalFixedNet * share);
        bolIVAGlobal += p.iva + (generalFixedIVA * share);
    });

    const priceNet = totalNetoVisual;
    const iva = Math.round(priceNet * 0.19);
    const priceGross = priceNet + iva;

    const budget = parseFloat(document.getElementById('quote-budget').value) || 0;
    let probPercent = 0;
    if (budget > 0) {
        const rawProb = -1.6 * (priceGross / budget) + 1.7;
        probPercent = Math.max(0, Math.min(100, rawProb * 100));
    }
    const probEl = document.getElementById('quote-probability');
    if (probEl) {
        probEl.textContent = budget > 0 ? `${Math.round(probPercent)}%` : '-%';
        probEl.style.color = probPercent > 50 ? '#10b981' : (probPercent > 20 ? '#f59e0b' : '#ef4444');
    }

    document.getElementById('res-cost-net').textContent = `$${Math.round(factNetGlobal).toLocaleString()}`;
    document.getElementById('res-cost-iva').textContent = `$${Math.round(bolIVAGlobal).toLocaleString()}`;
    document.getElementById('res-cost-total').textContent = `$${Math.round(totalCostGlobal).toLocaleString()}`;
    document.getElementById('res-ctu').textContent = `$${Math.round(totalCostGlobal / (totalQty || 1)).toLocaleString()}`;
    document.getElementById('res-price-net').textContent = `$${Math.round(priceNet).toLocaleString()}`;
    document.getElementById('res-price-iva').textContent = `$${Math.round(iva).toLocaleString()}`;
    document.getElementById('res-price-total').textContent = `$${Math.round(priceGross).toLocaleString()}`;
    document.getElementById('res-pvp').textContent = `$${Math.round(priceGross / (totalQty || 1)).toLocaleString()}`;
    
    const utilityAmount = priceNet - totalCostGlobal;
    const utilityEl = document.getElementById('res-utility-clp');
    if (utilityEl) {
        utilityEl.textContent = `$${Math.round(utilityAmount).toLocaleString()}`;
    }

    window.currentQuoteCalcs = {
        total_net_cost: totalCostGlobal,
        total_price_net: priceNet,
        total_iva: iva,
        total_price_gross: priceGross,
        budget: budget,
        success_probability: probPercent
    };
};

window.getItemProjectTotal = (item) => {
    const raw = (parseFloat(item.unit_value_net) || 0) * (parseFloat(item.quantity) || 0);
    const isFixed = item.calculation_type === 'fixed';
    let lineCost = raw;
    if (item.document_type === 'boleta') lineCost = raw * 1.19;

    if (item.linked_to === 'general') {
        if (isFixed) return Math.round(lineCost);
        const totalQty = window.quotationProducts.reduce((sum, p) => sum + (parseFloat(p.quantity) || 0), 0);
        return Math.round(lineCost * totalQty);
    } else {
        const p = window.quotationProducts.find(x => String(x.id) === String(item.linked_to));
        if (p) {
            if (isFixed) return Math.round(lineCost);
            return Math.round(lineCost * (parseFloat(p.quantity) || 0));
        }
    }
    return Math.round(lineCost);
};

window.changeQuoteStatus = async (id, newStatus) => {
    const label = QUOTE_STATUS_LABELS[newStatus] || newStatus;
    if (!confirm(`¿Cambiar estado a "${label}"?`)) return;
    try {
        const res = await apiFetch(`/quotations/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus })
        });
        if (res && res.success) {
            alert(`✅ ${res.message}`);
            fetchData();
        } else {
            alert('Error: ' + (res?.error || 'Error desconocido'));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
};

window.filterQuoteStatus = (status) => {
    state.quoteStatusFilter = status;
    renderView('quotations');
};

window.addQuotationItem = () => {
    window.quotationItems.push({
        type: 'material',
        calculation_type: 'unit',
        linked_to: 'general',
        description: '',
        document_type: 'factura',
        unit_value_net: 0,
        quantity: 1
    });
    window.renderQuotationItems();
};

window.renderQuotationItems = () => {
    const tbody = document.getElementById('quote-items-body');
    if (!tbody) return;

    tbody.innerHTML = window.quotationItems.map((item, index) => `
        <tr>
            <td>
                <select class="form-input-sm" onchange="window.updateQuoteItem(${index}, 'linked_to', this.value)">
                    <option value="general" ${item.linked_to === 'general' ? 'selected' : ''}>General</option>
                    ${window.quotationProducts.map(p => `<option value="${p.id}" ${item.linked_to === p.id ? 'selected' : ''}>${p.name || 'Sin nombre'}</option>`).join('')}
                </select>
            </td>
            <td>
                <select class="form-input-sm" onchange="window.updateQuoteItem(${index}, 'type', this.value)">
                    <option value="material" ${item.type === 'material' ? 'selected' : ''}>Material</option>
                    <option value="service" ${item.type === 'service' ? 'selected' : ''}>Servicio</option>
                    <option value="labor" ${item.type === 'labor' ? 'selected' : ''}>Mano Obra</option>
                    <option value="other" ${item.type === 'other' ? 'selected' : ''}>Otro</option>
                </select>
            </td>
            <td>
                <select class="form-input-sm" onchange="window.updateQuoteItem(${index}, 'calculation_type', this.value)">
                    <option value="unit" ${item.calculation_type === 'unit' ? 'selected' : ''}>Unitario</option>
                    <option value="fixed" ${item.calculation_type === 'fixed' ? 'selected' : ''}>Fijo</option>
                </select>
            </td>
            <td>
                <input type="text" class="form-input-sm" list="raw-materials-list" value="${item.description}" placeholder="Descripción ítem..." oninput="window.updateQuoteItem(${index}, 'description', this.value)">
            </td>
            <td>
                <select class="form-input-sm" onchange="window.updateQuoteItem(${index}, 'document_type', this.value)">
                    <option value="factura" ${item.document_type === 'factura' ? 'selected' : ''}>Factura</option>
                    <option value="boleta" ${item.document_type === 'boleta' ? 'selected' : ''}>Boleta</option>
                </select>
            </td>
            <td>
                <input type="number" class="form-input-sm" value="${item.unit_value_net}" style="text-align:right" oninput="window.updateQuoteItem(${index}, 'unit_value_net', this.value)">
            </td>
            <td>
                <input type="number" class="form-input-sm" value="${item.quantity}" style="text-align:center" oninput="window.updateQuoteItem(${index}, 'quantity', this.value)">
            </td>
            <td id="quote-item-subtotunit-${index}" style="text-align:right; font-weight:400; color: var(--text-muted)">
                $${Math.round((item.unit_value_net || 0) * (item.quantity || 0)).toLocaleString()}
            </td>
            <td id="quote-item-subtotal-${index}" style="text-align:right; font-weight:500">
                $${window.getItemProjectTotal(item).toLocaleString()}
            </td>
            <td>
                <button class="btn-sm" onclick="window.removeQuoteItem(${index})" style="background:none; color:var(--danger); border:none; padding:0">✕</button>
            </td>
        </tr>
    `).join('');
};

window.updateQuoteItem = (index, field, value) => {
    const item = window.quotationItems[index];
    item[field] = (field === 'unit_value_net' || field === 'quantity') ? parseFloat(value) || 0 : value;
    const stTd = document.getElementById(`quote-item-subtotunit-${index}`);
    if (stTd) stTd.textContent = `$${Math.round((item.unit_value_net || 0) * (item.quantity || 0)).toLocaleString()}`;
    const tTd = document.getElementById(`quote-item-subtotal-${index}`);
    if (tTd) tTd.textContent = `$${window.getItemProjectTotal(item).toLocaleString()}`;

    if (field === 'description' && item.type === 'material') {
        const rm = state.rawMaterials.find(x => x.name === value || x.code === value);
        if (rm) {
            item.unit_value_net = Math.round((rm.cost_net || 0) / (rm.batch_size || 1));
            window.renderQuotationItems();
        }
    }
    window.calculateQuotation();
};

window.handleQuoteDrop = (e) => {
    e.preventDefault();
    const dz = document.getElementById('quote-dropzone');
    dz.style.borderColor = 'var(--border)';
    dz.style.background = 'rgba(255,255,255,0.02)';
    window.handleQuoteFiles(e.dataTransfer.files);
};

window.handleQuoteFiles = async (files) => {
    if ((window.quotationImages || []).length >= 4) return alert('Máximo 4 imágenes por cotización');
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        if ((window.quotationImages || []).length >= 4) break;
        const b64 = await window.processQuoteImage(file);
        if (!window.quotationImages) window.quotationImages = [];
        window.quotationImages.push(b64);
    }
    window.renderQuoteImagePreviews();
};

window.processQuoteImage = (file) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                const max = 600;
                if (w > h) { if (w > max) { h *= max / w; w = max; } }
                else { if (h > max) { w *= max / h; h = max; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

window.renderQuoteImagePreviews = () => {
    const container = document.getElementById('quote-images-preview');
    const dzText = document.getElementById('dropzone-text');
    if (!container) return;
    container.innerHTML = (window.quotationImages || []).map((src, idx) => `
        <div style="position:relative; width:80px; height:80px; border-radius:8px; overflow:hidden; border:1px solid var(--border)">
            <img src="${src}" style="width:100%; height:100%; object-fit:cover">
            <button onclick="event.stopPropagation(); window.removeQuoteImage(${idx})" style="position:absolute; top:2px; right:2px; background:rgba(239, 68, 68, 0.8); color:white; border:none; border-radius:50%; width:18px; height:18px; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center">✕</button>
        </div>
    `).join('');
    if (dzText) dzText.style.display = (window.quotationImages || []).length > 0 ? 'none' : 'block';
};

window.removeQuoteImage = (idx) => {
    window.quotationImages.splice(idx, 1);
    window.renderQuoteImagePreviews();
};

window.addQuotationProduct = () => {
    window.quotationProducts.push({ id: 'p' + Date.now(), name: '', quantity: 1 });
    window.renderQuotationProducts();
    window.renderQuotationItems();
    window.calculateQuotation();
};

window.renderQuotationProducts = () => {
    const container = document.getElementById('quote-products-list');
    if (!container) return;
    container.innerHTML = window.quotationProducts.map((p, index) => `
        <div style="display:flex; gap:0.5rem; align-items:center">
            <input type="text" class="form-input-sm" placeholder="Nombre Producto" value="${p.name}" style="flex:2" oninput="window.updateQuotationProduct(${index}, 'name', this.value)">
            <input type="number" class="form-input-sm" placeholder="Cant" value="${p.quantity}" style="width:100px" oninput="window.updateQuotationProduct(${index}, 'quantity', this.value)">
            <button class="btn-sm" onclick="window.removeQuotationProduct(${index})" style="background:none; color:var(--danger)">✕</button>
        </div>
    `).join('');
};

window.updateQuotationProduct = (index, field, value) => {
    window.quotationProducts[index][field] = field === 'quantity' ? parseFloat(value) || 0 : value;
    window.renderQuotationItems();
    window.calculateQuotation();
};

window.removeQuotationProduct = (index) => {
    const pid = window.quotationProducts[index].id;
    window.quotationProducts.splice(index, 1);
    window.quotationItems.forEach(it => { if (it.linked_to === pid) it.linked_to = 'general'; });
    window.renderQuotationProducts();
    window.renderQuotationItems();
    window.calculateQuotation();
};

window.removeQuoteItem = (index) => {
    window.quotationItems.splice(index, 1);
    window.renderQuotationItems();
    window.calculateQuotation();
};

window.onQuoteClientChange = (cid) => {
    const client = state.clients.find(c => c.id == cid);
    if (client) {
        document.getElementById('quote-rut').value = client.rut || '';
        document.getElementById('quote-address').value = client.address || '';
    }
};
