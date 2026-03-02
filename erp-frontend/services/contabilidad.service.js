import { db } from './datastore.js';
export { db };


// --- Constantes del Sistema (Valores Chile 2024-2025) ---
const IVA_RATE = 0.19;
const RETENCION_HONORARIOS = 0.1375;
const TASA_SALUD_FONASA = 0.07;
const SUELDO_MINIMO = 500000;
const TASA_AFC_TRABAJADOR = 0.006; // Ejemplo Ley de 40 Horas

const NATURALEZA_CUENTA = {
    'activo': 'deudora',
    'pasivo': 'acreedora',
    'patrimonio': 'acreedora',
    'ingreso': 'acreedora',
    'gasto': 'deudora',
    'costo': 'deudora'
};

/* --- MOTOR DE LIBRO DIARIO Y ASIENTOS --- */

export async function crearAsiento({ fecha, glosa, lineas, periodo, tipo_origen = 'manual', referencia_id = null }) {
    const totalDebe = lineas.reduce((sum, l) => sum + (parseInt(l.debe) || 0), 0);
    const totalHaber = lineas.reduce((sum, l) => sum + (parseInt(l.haber) || 0), 0);

    if (Math.abs(totalDebe - totalHaber) > 1) {
        throw new Error(`Partida doble no cuadra: Total Debe $${totalDebe} vs Total Haber $${totalHaber}`);
    }

    // 1. Insertar Cabecera
    const asiento = await db.insert('asientos', {
        fecha,
        glosa,
        periodo: periodo || fecha.substring(0, 7),
        tipo_origen,
        referencia_id
    });

    // 2. Insertar Movimientos
    for (const linea of lineas) {
        await db.insert('asiento_movimientos', {
            asiento_id: asiento.id,
            cuenta_codigo: linea.cuenta_codigo,
            debe: parseFloat(linea.debe) || 0,
            haber: parseFloat(linea.haber) || 0,
            centro_costo_id: linea.centro_costo_id || null
        });
    }

    return asiento;
}

/* --- MOTOR DE HONORARIOS (Retención 13.75%) --- */

export async function registrarHonorario(data) {
    const bruto = parseInt(data.bruto);
    const retencion = Math.round(bruto * RETENCION_HONORARIOS);
    const liquido = bruto - retencion;

    const honorario = await db.insert('honorarios', {
        ...data,
        bruto,
        retencion,
        liquido
    });

    // Auditoría Contable Automática
    await crearAsiento({
        fecha: data.fecha,
        glosa: `Honorario: ${data.profesional} - ${data.glosa || 'Boleta de Honorarios'}`,
        tipo_origen: 'honorario',
        referencia_id: honorario.id,
        lineas: [
            { cuenta_codigo: '6.1.02', debe: bruto, haber: 0 }, // Gasto Honorarios
            { cuenta_codigo: '2.1.03', debe: 0, haber: retencion }, // Retención SII
            { cuenta_codigo: '1.1.01', debe: 0, haber: liquido } // Caja/Banco
        ]
    });

    return honorario;
}

/* --- MOTOR DE REMUNERACIONES PRO (Chile) --- */

export async function calcularLiquidacion(trabajador, periodo) {
    const sueldoBase = parseInt(trabajador.sueldo_base);
    const gratificacion = Math.min(Math.round(sueldoBase * 0.25), 182000); // Tope 4.75 IMM / 12 (Referencia)
    const imponible = sueldoBase + gratificacion;

    const descAFP = Math.round(imponible * (parseFloat(trabajador.afp_tasa || 11.45) / 100));
    const descSalud = Math.round(imponible * TASA_SALUD_FONASA);
    const liquido = imponible - descAFP - descSalud;

    const liq = {
        trabajador_id: trabajador.id,
        periodo,
        sueldo_base: sueldoBase,
        gratificacion,
        total_imponible: imponible,
        descuento_afp: descAFP,
        descuento_salud: descSalud,
        alcance_liquido: liquido
    };

    return liq;
}

/* --- MOTOR DE REPORTES (Tributario & Balances) --- */

export async function getResumenIVA(periodo) {
    const [compras, ventas] = await Promise.all([db.getAll('libro_compras'), db.getAll('libro_ventas')]);

    const cMes = compras.filter(c => c.fecha.startsWith(periodo));
    const vMes = ventas.filter(v => v.fecha.startsWith(periodo));

    const totalVentasNeto = vMes.reduce((s, v) => s + (v.neto || 0), 0);
    const debitoFiscal = Math.round(totalVentasNeto * IVA_RATE);

    const totalComprasNeto = cMes.reduce((s, c) => s + (c.neto || 0), 0);
    const creditoFiscal = Math.round(totalComprasNeto * IVA_RATE);

    return {
        totalVentasNeto,
        debitoFiscal,
        totalComprasNeto,
        creditoFiscal,
        ivaPorPagar: debitoFiscal - creditoFiscal
    };
}

export async function getBalance8Columnas() {
    const [cuentas, movimientos] = await Promise.all([
        db.getAll('plan_cuentas'),
        db.getAll('asiento_movimientos')
    ]);

    // Solo cuentas de detalle (nivel 3 o las que no tengan hijos)
    const cuentasDetalle = cuentas.filter(c => c.nivel >= 3);

    return cuentasDetalle.map(c => {
        const movs = movimientos.filter(m => m.cuenta_codigo === c.codigo);
        const sumaDebe = movs.reduce((s, m) => s + m.debe, 0);
        const sumaHaber = movs.reduce((s, m) => s + m.haber, 0);

        const nat = NATURALEZA_CUENTA[c.tipo] || 'deudora';
        const saldoDeudor = nat === 'deudora' ? Math.max(0, sumaDebe - sumaHaber) : 0;
        const saldoAcreedor = nat === 'acreedora' ? Math.max(0, sumaHaber - sumaDebe) : 0;

        let activo = 0, pasivo = 0, perdida = 0, ganancia = 0;
        if (c.tipo === 'activo') activo = saldoDeudor;
        if (c.tipo === 'pasivo' || c.tipo === 'patrimonio') pasivo = saldoAcreedor;
        if (c.tipo === 'gasto' || c.tipo === 'costo') perdida = saldoDeudor;
        if (c.tipo === 'ingreso') ganancia = saldoAcreedor;

        return {
            codigo: c.codigo,
            nombre: c.nombre,
            tipo: c.tipo,
            suma_debe: sumaDebe,
            suma_haber: sumaHaber,
            saldo_deudor: saldoDeudor,
            saldo_acreedor: saldoAcreedor,
            activo,
            pasivo,
            perdida,
            ganancia
        };
    }).filter(c => c.suma_debe > 0 || c.suma_haber > 0);
}

export async function getEstadoResultados() {
    const data = await getBalance8Columnas();
    const ingresos = data.reduce((s, c) => s + c.ganancia, 0);
    const costos = data.reduce((s, c) => s + (c.tipo === 'costo' ? c.perdida : 0), 0);
    const gastos = data.reduce((s, c) => s + (c.tipo === 'gasto' ? c.perdida : 0), 0);

    return {
        totalIngresos: ingresos,
        totalCostos: costos,
        totalGastos: gastos,
        utilidadBruta: ingresos - costos,
        utilidadNeta: ingresos - costos - gastos
    };
}

export async function getBalanceGeneral() {
    const data = await getBalance8Columnas();
    const totalActivos = data.reduce((s, c) => s + c.activo, 0);
    const totalPasivos = data.reduce((s, c) => s + (c.tipo === 'pasivo' ? c.pasivo : 0), 0);
    const totalPatrimonio = data.reduce((s, c) => s + (c.tipo === 'patrimonio' ? c.pasivo : 0), 0);

    return {
        activos: data.filter(c => c.activo > 0).map(c => ({ ...c, saldo: c.activo })),
        pasivos: data.filter(c => c.tipo === 'pasivo' && c.pasivo > 0).map(c => ({ ...c, saldo: c.pasivo })),
        patrimonio: data.filter(c => c.tipo === 'patrimonio' && c.pasivo > 0).map(c => ({ ...c, saldo: c.pasivo })),
        totalActivos,
        totalPasivos,
        totalPatrimonio,
        cuadra: Math.abs(totalActivos - (totalPasivos + totalPatrimonio)) < 5
    };
}

/* --- OTROS HELPERS --- */

export async function getHonorarios() { return await db.getAll('honorarios'); }
export async function getTrabajadores() { return await db.getAll('trabajadores'); }
export async function getCuentas() { return await db.getAll('plan_cuentas'); }

export async function getCuentasDetalle() {
    const cuentas = await getCuentas();
    return cuentas.filter(c => c.nivel >= 3 || !cuentas.some(h => String(h.padre_id || '').trim() === String(c.codigo).trim()));
}

export async function getLibroDiario(periodo = 'todos') {
    const [asientos, movimientos] = await Promise.all([
        db.getAll('asientos'),
        db.getAll('asiento_movimientos')
    ]);

    let filteredAsientos = asientos;
    if (periodo !== 'todos' && periodo !== 'force') {
        filteredAsientos = asientos.filter(a => a.periodo === periodo);
    }

    return filteredAsientos.map(a => ({
        ...a,
        lineas: movimientos.filter(m => String(m.asiento_id) === String(a.id))
    })).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}
export async function getLibroMayor(cuenta_codigo) {
    const [asientos, movimientos] = await Promise.all([
        db.getAll('asientos'),
        db.getAll('asiento_movimientos')
    ]);

    const movsCuenta = movimientos.filter(m => m.cuenta_codigo === cuenta_codigo);

    return movsCuenta.map(m => {
        const asiento = asientos.find(a => String(a.id) === String(m.asiento_id));
        return {
            ...m,
            fecha: asiento?.fecha || '-',
            glosa: asiento?.glosa || '-'
        };
    }).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

export async function registrarCompra(data) {
    const neto = Math.round(parseFloat(data.neto) || 0);
    const iva = Math.round(neto * IVA_RATE);
    const total = neto + iva;

    const compra = await db.insert('libro_compras', {
        fecha: data.fecha,
        tipo_dte: data.tipo_dte,
        numero: data.numero,
        rut: data.rut,
        nombre: data.nombre,
        neto: parseFloat(neto),
        iva: parseFloat(iva),
        total: parseFloat(total),
        glosa: data.glosa || `Compra Doc ${data.numero}`,
        referencia_id: String(data.referencia_id || '')
    });

    // Contabilización Automática
    await crearAsiento({
        fecha: data.fecha,
        glosa: `Registro Compra: ${data.nombre} - Doc ${data.numero}`,
        tipo_origen: 'compra',
        referencia_id: String(compra.id),
        lineas: [
            { cuenta_codigo: '1.1.09', debe: neto, haber: 0 }, // Existencias (Estandard ContaChile)
            { cuenta_codigo: '1.1.06', debe: iva, haber: 0 },  // IVA Crédito Fiscal
            { cuenta_codigo: '2.1.01', debe: 0, haber: total } // Proveedores
        ]
    });

    return compra;
}

export async function registrarVenta(data) {
    const neto = Math.round(parseFloat(data.neto) || 0);
    const iva = Math.round(neto * IVA_RATE);
    const total = neto + iva;

    const venta = await db.insert('libro_ventas', {
        fecha: data.fecha,
        tipo_dte: data.tipo_dte,
        numero: data.numero,
        rut: data.rut,
        nombre: data.nombre,
        neto: parseFloat(neto),
        iva: parseFloat(iva),
        total: parseFloat(total),
        glosa: data.glosa || `Venta Doc ${data.numero}`,
        referencia_id: String(data.referencia_id || '')
    });

    // Contabilización Automática
    await crearAsiento({
        fecha: data.fecha,
        glosa: `Registro Venta: ${data.nombre} - Doc ${data.numero}`,
        tipo_origen: 'venta',
        referencia_id: String(venta.id),
        lineas: [
            { cuenta_codigo: '1.1.01', debe: total, haber: 0 }, // Caja/Banco
            { cuenta_codigo: '4.1.01', debe: 0, haber: neto },  // Ventas Afectas
            { cuenta_codigo: '2.1.02', debe: 0, haber: iva }   // IVA Débito Fiscal
        ]
    });

    return venta;
}

const VIDA_UTIL_MESES = {
    'Vehículos': 84,
    'Maquinaría': 120,
    'Equipos de Computación': 36,
    'Muebles y Útiles': 84
};

export async function sincronizarOperacionesERP(hSales, hPurch) {
    const existingCompras = await db.getAll('libro_compras');
    const existingVentas = await db.getAll('libro_ventas');

    let syncedCount = 0;

    // 1. Sincronizar Compras (Raw Materials)
    for (const p of hPurch) {
        if (!p || !p.id) continue;
        const alreadySynced = existingCompras.some(c => String(c.referencia_id) === String(p.id));
        if (!alreadySynced) {
            const fechaStr = p.date || p.created_at || new Date().toISOString();
            const totalCompra = parseFloat(p.total) || 0;
            const netCompra = parseFloat(p.net) || Math.round(totalCompra / 1.19);

            await registrarCompra({
                fecha: fechaStr.split('T')[0],
                tipo_dte: '33',
                numero: String(p.id),
                rut: p.provider_rut || '76.000.000-1',
                nombre: p.provider_name || 'Proveedor ERP',
                neto: netCompra,
                glosa: `Sincronizado desde ERP: Compra #${p.id}`,
                referencia_id: String(p.id)
            });
            syncedCount++;
        }
    }

    // 2. Sincronizar Ventas (Products)
    for (const s of hSales) {
        if (!s || !s.id) continue;
        const alreadySynced = existingVentas.some(v => String(v.referencia_id) === String(s.id));
        if (!alreadySynced) {
            const fechaStr = s.date || s.created_at || new Date().toISOString();
            const totalVenta = parseFloat(s.total) || 0;
            const neto = Math.round(totalVenta / 1.19);

            await registrarVenta({
                fecha: fechaStr.split('T')[0],
                tipo_dte: '33',
                numero: String(s.id),
                rut: s.client_rut || '6.666.666-6',
                nombre: s.client_name || 'Cliente ERP',
                neto: neto,
                glosa: `Sincronizado desde ERP: Venta #${s.id}`,
                referencia_id: String(s.id)
            });
            syncedCount++;
        }
    }

    return syncedCount;
}

export async function procesarDepreciacionMensual(periodo) {
    const activos = await db.getAll('activo_fijo');
    let totalDep = 0;

    for (const a of activos) {
        const mesesVida = VIDA_UTIL_MESES[a.categoria] || 60;
        const depMensual = Math.round(parseInt(a.valor_compra) / mesesVida);
        totalDep += depMensual;
    }

    if (totalDep > 0) {
        await crearAsiento({
            fecha: `${periodo}-28`,
            glosa: `Depreciación Mensual Activos Fijos - ${periodo}`,
            tipo_origen: 'depreciacion',
            lineas: [
                { cuenta_codigo: '6.1.03', debe: totalDep, haber: 0 },
                { cuenta_codigo: '1.2.01', debe: 0, haber: totalDep }
            ]
        });
    }

    return totalDep;
}


