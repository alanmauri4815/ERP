import * as XLSX from 'xlsx';

/**
 * Exporta datos a un archivo Excel
 * @param {Array} data - Array de objetos con los datos a exportar
 * @param {string} filename - Nombre del archivo (sin extensión)
 * @param {string} sheetName - Nombre de la hoja de Excel
 */
export function exportToExcel(data, filename = 'export', sheetName = 'Datos') {
    // Crear un nuevo libro de trabajo
    const wb = XLSX.utils.book_new();

    // Convertir los datos a una hoja de trabajo
    const ws = XLSX.utils.json_to_sheet(data);

    // Agregar la hoja al libro
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Generar el archivo y descargarlo
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Exporta múltiples conjuntos de datos a diferentes hojas del mismo archivo Excel
 * @param {Array} datasets - Array de objetos {data, sheetName}
 * @param {string} filename - Nombre del archivo (sin extensión)
 */
export function exportMultipleSheetsToExcel(datasets, filename = 'export') {
    const wb = XLSX.utils.book_new();

    datasets.forEach(({ data, sheetName }) => {
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Formatea datos de productos para exportación
 * @param {Array} products - Array de productos
 * @returns {Array} Productos formateados para Excel
 */
export function formatProductsForExport(products) {
    return products.map(p => ({
        'Código': p.code,
        'Nombre': p.name,
        'Tipo': p.type,
        'Stock': p.stock,
        'Precio Neto': p.price_net,
        'IVA (19%)': p.iva || 0,
        'Precio Venta': p.price_sale,
        'Costo Unitario': p.cost_unit || p.cost_net,
        'Atributo': p.color || '-',
        'Tamaño': p.size || '-'
    }));
}

/**
 * Formatea datos de materias primas para exportación
 * @param {Array} materials - Array de materias primas
 * @returns {Array} Materias primas formateadas para Excel
 */
export function formatMaterialsForExport(materials) {
    return materials.map(m => ({
        'Código': m.code,
        'Nombre': m.name,
        'Tipo': m.type,
        'Unidad': m.unit,
        'Stock': m.stock,
        'Costo Neto': m.cost_net,
        'Atributo': m.color || '-',
        'Tamaño': m.size || '-'
    }));
}

/**
 * Formatea datos de ventas para exportación
 * @param {Array} sales - Array de ventas con items
 * @returns {Array} Ventas formateadas para Excel
 */
export function formatSalesForExport(sales) {
    const formatted = [];
    sales.forEach(sale => {
        if (sale.items && sale.items.length > 0) {
            sale.items.forEach(item => {
                formatted.push({
                    'ID Venta': sale.id,
                    'Fecha': sale.date,
                    'Cliente': sale.client,
                    'Producto': item.product_code,
                    'Cantidad': item.quantity,
                    'Precio': item.price,
                    'Subtotal': item.quantity * item.price,
                    'Total Venta': sale.total,
                    'Estado': sale.status
                });
            });
        } else {
            formatted.push({
                'ID Venta': sale.id,
                'Fecha': sale.date,
                'Cliente': sale.client,
                'Producto': '-',
                'Cantidad': '-',
                'Precio': '-',
                'Subtotal': '-',
                'Total Venta': sale.total,
                'Estado': sale.status
            });
        }
    });
    return formatted;
}

/**
 * Formatea datos de compras para exportación
 * @param {Array} purchases - Array de compras con items
 * @returns {Array} Compras formateadas para Excel
 */
export function formatPurchasesForExport(purchases) {
    const formatted = [];
    purchases.forEach(purchase => {
        if (purchase.items && purchase.items.length > 0) {
            purchase.items.forEach(item => {
                formatted.push({
                    'ID Compra': purchase.id,
                    'Fecha': purchase.date,
                    'Proveedor': purchase.provider,
                    'Materia Prima': item.mp_code,
                    'Cantidad': item.quantity,
                    'Precio': item.price,
                    'Subtotal': item.quantity * item.price,
                    'Total Compra': purchase.total,
                    'Estado': purchase.status
                });
            });
        } else {
            formatted.push({
                'ID Compra': purchase.id,
                'Fecha': purchase.date,
                'Proveedor': purchase.provider,
                'Materia Prima': '-',
                'Cantidad': '-',
                'Precio': '-',
                'Subtotal': '-',
                'Total Compra': purchase.total,
                'Estado': purchase.status
            });
        }
    });
    return formatted;
}

/**
 * Formatea datos de producción para exportación
 * @param {Array} production - Array de producción
 * @returns {Array} Producción formateada para Excel
 */
export function formatProductionForExport(production) {
    return production.map(p => ({
        'ID': p.id,
        'Fecha': p.date,
        'Producto': p.product_code,
        'Cantidad': p.quantity,
        'Estado': p.status
    }));
}
/**
 * Formatea datos del libro diario para exportación
 * @param {Array} ledger - Array de asientos contables
 * @returns {Array} Libro diario formateado para Excel
 */
export function formatLedgerForExport(ledger) {
    const typeLabels = {
        'compra_pull': 'Compra PULL',
        'compra_push': 'Compra PUSH',
        'venta_pull': 'Venta PULL',
        'venta_push': 'Venta PUSH',
        'gasto': 'GASTO',
        'transferencia': 'TRANSFERENCIA',
        'consumo': 'PRODUCCIÓN'
    };
    const formatted = [];
    ledger.forEach(entry => {
        const typeLabel = typeLabels[entry.entry_type] || entry.entry_type.toUpperCase();
        entry.lines.forEach(line => {
            formatted.push({
                'Fecha': entry.date,
                'Tipo': typeLabel,
                'Descripción': entry.description,
                'Documento': entry.document_number || '-',
                'Código Cuenta': line.account_code,
                'Cuenta': line.account_name,
                'Glosa Línea': line.glosa || '-',
                'Debe': line.debit || 0,
                'Haber': line.credit || 0
            });
        });
    });
    return formatted;
}
