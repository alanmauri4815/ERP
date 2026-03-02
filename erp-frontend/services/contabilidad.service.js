/* ============================================
   CONTABILIDAD SERVICE — Motor de Reportes v4.0
   ============================================ */

import { db } from './datastore.js';
import {
    IVA_RATE,
    RETENCION_HONORARIOS_RATE,
    NATURALEZA_CUENTA,
    TASA_SALUD_FONASA,
    TASA_AFC_TRABAJADOR,
    SUELDO_MINIMO
} from '../utils/constants.js';
import { getIndicadoresHoy } from './indicadores.service.js';

const TRAMOS_FAMILIAR = [
    { tope: 539328, monto: 21463 },
    { tope: 787746, monto: 13171 },
    { tope: 1228614, monto: 4162 },
    { tope: Infinity, monto: 0 }
];

export async function initPlanCuentas(planDefault) {
    const existing = await db.getAll('plan_cuentas');
    if (existing.length > 0) return existing;
    for (const c of planDefault) {
        await db.insert('plan_cuentas', { codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, nivel: c.nivel, padre_id: c.padre || null });
    }
    return await db.getAll('plan_cuentas');
}

/* ---------------- ASIENTOS Y DIARIO ---------------- */

export async function crearAsiento({ fecha, glosa, lineas, periodo, tipo_origen = 'manual', referencia_id = null }) {
    const totalDebe = lineas.reduce((sum, l) => sum + (l.debe || 0), 0);
    const totalHaber = lineas.reduce((sum, l) => sum + (l.haber || 0), 0);
    if (Math.abs(totalDebe - totalHaber) > 1) throw new Error(`Partida doble no cuadra: $${totalDebe} vs $${totalHaber}`);
    const asiento = await db.insert('asientos', { fecha, glosa, periodo: periodo || fecha.substring(0, 7), tipo_origen, referencia_id });
    for (const linea of lineas) {
        await db.insert('asiento_movimientos', { asiento_id: asiento.id, cuenta_codigo: linea.cuenta_codigo, debe: linea.debe || 0, haber: linea.haber || 0, centro_costo_id: linea.centro_costo_id || null });
    }
    return asiento;
}

export async function getLibroDiario(periodo) {
    const [asientos, movimientos] = await Promise.all([
        db.getAll('asientos'),
        db.getAll('asiento_movimientos')
    ]);

    let filtered = asientos;
    if (periodo && periodo !== 'todos') {
        filtered = asientos.filter(a => a.periodo === periodo);
    }

    return filtered.map(a => ({
        ...a,
        lineas: movimientos.filter(m => m.asiento_id === a.id)
    })).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export async function getLibroMayor(cuentaCodigo, periodo) {
    const movimientos = await db.getAll('asiento_movimientos');
    const asientos = await db.getAll('asientos');
    return movimientos
        .filter(m => m.cuenta_codigo === cuentaCodigo)
        .map(m => ({ ...m, asiento: asientos.find(a => a.id === m.asiento_id) }))
        .filter(m => !periodo || (m.asiento && m.asiento.periodo === periodo))
        .sort((a, b) => (a.asiento?.fecha || '').localeCompare(b.asiento?.fecha || ''));
}

/* ---------------- COMPRAS Y VENTAS ---------------- */

export async function registrarCompra(data) {
    const { fecha, rut, nombre, glosa, neto, exento = 0, centro_costo_id } = data;
    const netoVal = parseInt(neto);
    const iva = Math.round(netoVal * IVA_RATE);
    const total = netoVal + iva + parseInt(exento);

    const compra = await db.insert('compras', { ...data, iva, total });
    await crearAsiento({
        fecha, glosa: `Compra: ${nombre} - ${glosa}`, tipo_origen: 'compra', referencia_id: compra.id,
        lineas: [
            { cuenta_codigo: '6.1.03', debe: netoVal + parseInt(exento), haber: 0, centro_costo_id },
            { cuenta_codigo: '1.1.03', debe: iva, haber: 0 },
            { cuenta_codigo: '2.1.01', debe: 0, haber: total }
        ]
    });
    return compra;
}

export async function registrarVenta(data) {
    const { fecha, rut, nombre, glosa, neto, exento = 0 } = data;
    const netoVal = parseInt(neto);
    const iva = Math.round(netoVal * IVA_RATE);
    const total = netoVal + iva + parseInt(exento);

    const venta = await db.insert('ventas', { ...data, iva, total });
    await crearAsiento({
        fecha, glosa: `Venta: ${nombre} - ${glosa}`, tipo_origen: 'venta', referencia_id: venta.id,
        lineas: [
            { cuenta_codigo: '1.1.02', debe: total, haber: 0 },
            { cuenta_codigo: '2.1.02', debe: 0, haber: iva },
            { cuenta_codigo: '5.1.01', debe: 0, haber: netoVal + parseInt(exento) }
        ]
    });
    return venta;
}

export async function registrarHonorario(data) {
    const { fecha, rut, profesional, glosa, bruto } = data;
    const brutoVal = parseInt(bruto);
    const retencion = Math.round(brutoVal * RETENCION_HONORARIOS_RATE);
    const liquido = brutoVal - retencion;

    const honorario = await db.insert('honorarios', { ...data, retencion, liquido });
    await crearAsiento({
        fecha, glosa: `Honorario: ${profesional} - ${glosa}`, tipo_origen: 'honorario', referencia_id: honorario.id,
        lineas: [
            { cuenta_codigo: '6.1.02', debe: brutoVal, haber: 0 },
            { cuenta_codigo: '2.1.03', debe: 0, haber: retencion },
            { cuenta_codigo: '1.1.01', debe: 0, haber: liquido }
        ]
    });
    return honorario;
}

export async function getResumenIVA(periodo) {
    const [compras, ventas] = await Promise.all([db.getAll('compras'), db.getAll('ventas')]);

    // Filtrar por periodo (YYYY-MM)
    const cMes = compras.filter(c => c.fecha.startsWith(periodo));
    const vMes = ventas.filter(v => v.fecha.startsWith(periodo));

    const totalComprasNeto = cMes.reduce((s, c) => s + c.neto, 0);
    const creditoFiscal = cMes.reduce((s, c) => s + c.iva, 0);
    const totalVentasNeto = vMes.reduce((s, v) => s + v.neto, 0);
    const debitoFiscal = vMes.reduce((s, v) => s + v.iva, 0);

    return {
        cantidadCompras: cMes.length,
        totalComprasNeto,
        creditoFiscal,
        cantidadVentas: vMes.length,
        totalVentasNeto,
        debitoFiscal,
        ivaPorPagar: debitoFiscal - creditoFiscal
    };
}

/* ---------------- REMUNERACIONES ---------------- */

export async function registrarAnticipo({ trabajador_id, monto, fecha, glosa }) {
    const periodo = fecha.substring(0, 7);
    const anticipo = await db.insert('anticipos', { trabajador_id, monto: parseInt(monto), fecha, glosa, periodo, estado: 'pendiente' });
    await crearAsiento({
        fecha, glosa: `Anticipo Sueldo - ${glosa}`, tipo_origen: 'anticipo', referencia_id: anticipo.id,
        lineas: [
            { cuenta_codigo: '1.1.05', debe: parseInt(monto), haber: 0 },
            { cuenta_codigo: '1.1.01', debe: 0, haber: parseInt(monto) }
        ]
    });
    return anticipo;
}

export async function procesarRemuneracion(data) {
    const { trabajador_id, periodo, movilizacion = 0, colacion = 0, horas_extras_cantidad = 0, bonos_imponibles = 0, bonos_no_imponibles = 0, aguinaldos_imponibles = 0 } = data;
    const trabajador = await db.getById('trabajadores', trabajador_id);
    const sueldoBase = parseInt(trabajador.sueldo_base);
    const jornada = trabajador.jornada_semanal || 40;

    const valorHoraOrdinaria = (sueldoBase / 30) * (7 / jornada);
    const hExtMonto = Math.round(valorHoraOrdinaria * 1.5 * parseFloat(horas_extras_cantidad));

    const baseParaGratif = sueldoBase + hExtMonto + parseInt(bonos_imponibles) + parseInt(aguinaldos_imponibles);
    const gratificacion = trabajador.tipo_gratificacion === 'Art 50' ? Math.min(Math.round(baseParaGratif * 0.25), Math.round((4.75 * SUELDO_MINIMO) / 12)) : 0;
    const totalImponible = baseParaGratif + gratificacion;

    const tramo = TRAMOS_FAMILIAR.find(t => totalImponible <= t.tope);
    const asigFamiliar = (tramo ? tramo.monto : 0) * (trabajador.cargas_familiares || 0);

    const descAFP = Math.round(totalImponible * trabajador.afp_tasa);
    const descCesantia = Math.round(totalImponible * TASA_AFC_TRABAJADOR);
    const indicadores = await getIndicadoresHoy();
    const discSaludBase = Math.round(totalImponible * TASA_SALUD_FONASA);
    const descSalud = trabajador.salud === 'Fonasa' ? discSaludBase : Math.max(Math.round(trabajador.plan_isapre_uf * (indicadores.uf || 38000)), discSaludBase);

    const todosAnticipos = await db.getAll('anticipos');
    const anticiposPendientes = todosAnticipos.filter(a => a.trabajador_id === trabajador.id && a.periodo === periodo && a.estado === 'pendiente');
    const totalAnticipos = anticiposPendientes.reduce((s, a) => s + a.monto, 0);

    const totalDescuentos = descAFP + descSalud + descCesantia + totalAnticipos;
    const haberesNoImponibles = parseInt(movilizacion) + parseInt(colacion) + parseInt(bonos_no_imponibles) + asigFamiliar;
    const liquidoAPagar = (totalImponible + haberesNoImponibles) - totalDescuentos;

    const liq = await db.insert('liquidaciones', {
        trabajador_id, periodo, sueldo_base: sueldoBase, gratificacion,
        total_imponible: totalImponible, movilizacion, colacion,
        horas_extras_monto: hExtMonto, horas_extras_cantidad,
        bonos_imponibles, aguinaldos_imponibles,
        asignacion_familiar: asigFamiliar, descuento_afp: descAFP,
        descuento_salud: descSalud, descuento_cesantia: descCesantia,
        anticipos_monto: totalAnticipos, alcanze_liquido: liquidoAPagar
    });

    for (const a of anticiposPendientes) { await db.update('anticipos', a.id, { estado: 'descontado' }); }

    await crearAsiento({
        fecha: `${periodo}-28`, glosa: `Remuneraciones ${periodo} - ${trabajador.nombre}`, tipo_origen: 'remuneraciones', referencia_id: liq.id,
        lineas: [
            { cuenta_codigo: '6.1.01', debe: totalImponible, haber: 0 },
            { cuenta_codigo: '6.1.05', debe: haberesNoImponibles - asigFamiliar, haber: 0 },
            { cuenta_codigo: '2.1.05', debe: 0, haber: descAFP + descSalud + descCesantia - asigFamiliar },
            { cuenta_codigo: '1.1.05', debe: 0, haber: totalAnticipos },
            { cuenta_codigo: '2.1.04', debe: 0, haber: liquidoAPagar }
        ]
    });
    return liq;
}

/* ---------------- REPORTES Y BALANCE ---------------- */

export async function getCuentas() {
    return await db.getAll('plan_cuentas');
}

export async function getCuentasDetalle() {
    const cuentas = await getCuentas();
    return cuentas.filter(c => c.nivel === 3);
}

export async function getBalance8Columnas() {
    const [cuentas, movimientos] = await Promise.all([getCuentasDetalle(), db.getAll('asiento_movimientos')]);
    return cuentas.map(c => {
        const movs = movimientos.filter(m => m.cuenta_codigo === c.codigo);
        const suma_debe = movs.reduce((s, m) => s + m.debe, 0);
        const suma_haber = movs.reduce((s, m) => s + m.haber, 0);
        const nat = NATURALEZA_CUENTA[c.tipo];
        const saldo_deudor = nat === 'deudora' ? Math.max(0, suma_debe - suma_haber) : 0;
        const saldo_acreedor = nat === 'acreedora' ? Math.max(0, suma_haber - suma_debe) : 0;
        let activo = 0, pasivo = 0, perdida = 0, ganancia = 0;
        if (c.tipo === 'activo') activo = saldo_deudor;
        if (c.tipo === 'pasivo' || c.tipo === 'patrimonio') pasivo = saldo_acreedor;
        if (c.tipo === 'gasto' || c.tipo === 'costo') perdida = saldo_deudor;
        if (c.tipo === 'ingreso') ganancia = saldo_acreedor;
        return { codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, suma_debe, suma_haber, saldo_deudor, saldo_acreedor, activo, pasivo, perdida, ganancia };
    }).filter(c => c.suma_debe > 0 || c.suma_haber > 0);
}

export async function getBalanceGeneral() {
    const data = await getBalance8Columnas();
    const activos = data.filter(c => c.activo > 0).map(c => ({ ...c, saldo: c.activo }));
    const pasivos = data.filter(c => c.tipo === 'pasivo' && c.pasivo > 0).map(c => ({ ...c, saldo: c.pasivo }));
    const patrimonio = data.filter(c => c.tipo === 'patrimonio' && c.pasivo > 0).map(c => ({ ...c, saldo: c.pasivo }));
    const totalActivos = activos.reduce((s, c) => s + c.saldo, 0);
    const totalPasivos = pasivos.reduce((s, c) => s + c.saldo, 0);
    const totalPatrimonio = patrimonio.reduce((s, c) => s + c.saldo, 0);
    return { activos, pasivos, patrimonio, totalActivos, totalPasivos, totalPatrimonio, cuadra: Math.abs(totalActivos - (totalPasivos + totalPatrimonio)) < 1 };
}

export async function getEstadoResultados() {
    const data = await getBalance8Columnas();
    const ingresos = data.filter(c => c.tipo === 'ingreso').map(c => ({ ...c, saldo: c.ganancia }));
    const costos = data.filter(c => c.tipo === 'costo').map(c => ({ ...c, saldo: c.perdida }));
    const gastos = data.filter(c => c.tipo === 'gasto').map(c => ({ ...c, saldo: c.perdida }));
    const totalIngresos = ingresos.reduce((s, c) => s + c.saldo, 0);
    const totalCostos = costos.reduce((s, c) => s + c.saldo, 0);
    const totalGastos = gastos.reduce((s, c) => s + c.saldo, 0);
    return { ingresos, costos, gastos, totalIngresos, totalCostos, totalGastos, utilidadBruta: totalIngresos - totalCostos, utilidadNeta: totalIngresos - totalCostos - totalGastos };
}
