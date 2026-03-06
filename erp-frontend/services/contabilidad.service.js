/* ============================================
   CONTABILIDAD SERVICE — Motor de Reportes v4.0
   ============================================ */

import { db } from './datastore.js';
export { db };
import {
    IVA_RATE,
    RETENCION_HONORARIOS_RATE,
    NATURALEZA_CUENTA,
    TASA_SALUD_FONASA,
    TASA_AFC_TRABAJADOR,
    SUELDO_MINIMO,
    METODOS_PAGO,
    ESTADOS_PAGO
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

export async function crearAsiento({ fecha, glosa, lineas, periodo, tipo_origen = 'manual', referencia_id = null, numero = null }) {
    const totalDebe = lineas.reduce((sum, l) => sum + (l.debe || 0), 0);
    const totalHaber = lineas.reduce((sum, l) => sum + (l.haber || 0), 0);
    if (Math.abs(totalDebe - totalHaber) > 1) throw new Error(`Partida doble no cuadra: $${totalDebe} vs $${totalHaber}`);
    const asiento = await db.insert('asientos', { fecha, glosa, periodo: periodo || fecha.substring(0, 7), tipo_origen, referencia_id, numero });
    for (const linea of lineas) {
        await db.insert('asiento_movimientos', { asiento_id: asiento.id, cuenta_codigo: linea.cuenta_codigo, debe: linea.debe || 0, haber: linea.haber || 0, centro_costo_id: linea.centro_costo_id || null });
    }
    return asiento;
}

export async function getLibroDiario(periodo) {
    const [asientos, movimientos] = await Promise.all([db.getAll('asientos'), db.getAll('asiento_movimientos')]);
    const filtered = (periodo && periodo !== 'force') ? asientos.filter(a => a.periodo === periodo) : asientos;
    return filtered.map(a => ({ ...a, lineas: movimientos.filter(m => m.asiento_id === a.id) })).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

export async function getLibroMayor(cuentaCodigo, periodo) {
    const movimientos = await db.getAll('asiento_movimientos');
    const asientos = await db.getAll('asientos');

    // 1. Filtrar movimientos de esta cuenta
    const todosMovsCuenta = movimientos
        .filter(m => m.cuenta_codigo === cuentaCodigo)
        .map(m => ({ ...m, asiento: asientos.find(a => a.id === m.asiento_id) }));

    // 2. Calcular Saldo Anterior (arrastre)
    let saldoAnterior = 0;
    if (periodo) {
        saldoAnterior = todosMovsCuenta
            .filter(m => m.asiento && m.asiento.periodo < periodo)
            .reduce((s, m) => s + (m.debe || 0) - (m.haber || 0), 0);
    }

    // 3. Movimientos del periodo actual
    const delPeriodo = todosMovsCuenta
        .filter(m => !periodo || (m.asiento && m.asiento.periodo === periodo))
        .sort((a, b) => (a.asiento?.fecha || '').localeCompare(b.asiento?.fecha || ''));

    return { movimientos: delPeriodo, saldoAnterior };
}

export async function eliminarAsiento(asientoId) {
    // 1. Eliminar movimientos asociados
    const movimientos = await db.getAll('asiento_movimientos');
    const movsToDelete = movimientos.filter(m => m.asiento_id === asientoId);
    for (const mov of movsToDelete) {
        await db.delete('asiento_movimientos', mov.id);
    }
    // 2. Eliminar el asiento
    return await db.delete('asientos', asientoId);
}

export async function eliminarRegistroAuxiliar(tabla, id, tipoOrigen) {
    // 1. Buscar el asiento asociado
    const asientos = await db.getAll('asientos');
    const asientoAsoc = asientos.find(a => a.referencia_id === id && a.tipo_origen === tipoOrigen);

    if (asientoAsoc) {
        await eliminarAsiento(asientoAsoc.id);
    }

    // 2. Eliminar el registro del libro auxiliar
    return await db.delete(tabla, id);
}

/* ---------------- COMPRAS Y VENTAS ---------------- */

export async function registrarCompra(data) {
    const { fecha, rut, nombre, razon_social, glosa, neto, exento = 0, centro_costo_id, metodo_pago = 'efectivo', cuotas = 1 } = data;
    const finalNombre = nombre || razon_social || 'Proveedor Desconocido';
    const netoVal = parseInt(neto);
    const iva = Math.round(netoVal * IVA_RATE);
    const total = netoVal + iva + parseInt(exento);

    // En contabilidad empresarial siempre se devenga el gasto primero
    const esCredito = metodo_pago === 'credito';
    const total_pagado = esCredito ? 0 : total;
    const saldo_pendiente = total - total_pagado;
    const estado_pago = saldo_pendiente <= 0 ? ESTADOS_PAGO.PAGADO : (total_pagado > 0 ? ESTADOS_PAGO.PARCIAL : ESTADOS_PAGO.PENDIENTE);

    const compra = await db.insert('libro_compras', {
        ...data,
        nombre: finalNombre,
        neto: netoVal,
        iva,
        total,
        total_pagado,
        saldo_pendiente,
        metodo_pago,
        estado_pago,
        cuotas
    });

    // 1. Asiento de Compra (Devengo)
    await crearAsiento({
        fecha, glosa: `Compra: ${finalNombre} - ${glosa}`, tipo_origen: 'compra', referencia_id: compra.id,
        numero: data.numero,
        lineas: [
            { cuenta_codigo: '5.1.01', debe: netoVal + parseInt(exento), haber: 0, centro_costo_id },
            { cuenta_codigo: '1.1.06', debe: iva, haber: 0 },
            { cuenta_codigo: '2.1.01', debe: 0, haber: total } // Pasivo: Cuentas por Pagar
        ]
    });

    // 2. Si no es crédito, registrar el Pago (Contado)
    if (!esCredito) {
        const metodo = METODOS_PAGO.find(m => m.id === metodo_pago);
        await crearAsiento({
            fecha, glosa: `Pago Factura Compra: ${finalNombre} (${metodo.nombre})`, tipo_origen: 'pago_compra', referencia_id: compra.id,
            lineas: [
                { cuenta_codigo: '2.1.01', debe: total, haber: 0 }, // Elimina el pasivo
                { cuenta_codigo: metodo.cuenta, debe: 0, haber: total } // Sale de Caja/Banco
            ]
        });
    }

    return compra;
}

export async function registrarVenta(data) {
    const { fecha, rut, nombre, razon_social, glosa, neto, exento = 0, metodo_pago = 'efectivo', cuotas = 1 } = data;
    const finalNombre = nombre || razon_social || 'Cliente Desconocido';
    const netoVal = parseInt(neto);
    const iva = Math.round(netoVal * IVA_RATE);
    const total = netoVal + iva + parseInt(exento);

    const esCredito = metodo_pago === 'credito';
    const total_pagado = esCredito ? 0 : total;
    const saldo_pendiente = total - total_pagado;
    const estado_pago = saldo_pendiente <= 0 ? ESTADOS_PAGO.PAGADO : (total_pagado > 0 ? ESTADOS_PAGO.PARCIAL : ESTADOS_PAGO.PENDIENTE);

    const venta = await db.insert('libro_ventas', {
        ...data,
        nombre: finalNombre,
        neto: netoVal,
        iva,
        total,
        total_pagado,
        saldo_pendiente,
        metodo_pago,
        estado_pago,
        cuotas
    });

    // 1. Asiento de Venta (Reconocimiento del Ingreso y Deuda)
    await crearAsiento({
        fecha, glosa: `Venta: ${finalNombre} - ${glosa}`, tipo_origen: 'venta', referencia_id: venta.id,
        numero: data.numero,
        lineas: [
            { cuenta_codigo: '1.1.03', debe: total, haber: 0 }, // Activo: Cuentas por Cobrar
            { cuenta_codigo: '2.1.02', debe: 0, haber: iva },
            { cuenta_codigo: '4.1.01', debe: 0, haber: netoVal + parseInt(exento) }
        ]
    });

    // 2. Si es al contado, registrar la Cobranza
    if (!esCredito) {
        const metodo = METODOS_PAGO.find(m => m.id === metodo_pago);
        await crearAsiento({
            fecha, glosa: `Cobro Factura Venta: ${finalNombre} (${metodo.nombre})`, tipo_origen: 'pago_venta', referencia_id: venta.id,
            lineas: [
                { cuenta_codigo: metodo.cuenta, debe: total, haber: 0 }, // Entra a Caja/Banco
                { cuenta_codigo: '1.1.03', debe: 0, haber: total } // Salda la cuenta por cobrar
            ]
        });
    }

    return venta;
}

/**
 * REGISTRAR ABONO (ERP Clearing Logic)
 * Permite pagar parcialmente una factura de compra o recolectar un abono de una venta.
 */
export async function registrarAbono({ tipo, docId, monto, fecha, metodo_pago, glosa = '' }) {
    const tabla = tipo === 'compra' ? 'libro_compras' : 'libro_ventas';
    const doc = await db.getById(tabla, docId);
    if (!doc) throw new Error('Documento no encontrado');

    const nuevoTotalPagado = (doc.total_pagado || 0) + parseInt(monto);
    const nuevoSaldo = doc.total - nuevoTotalPagado;

    if (nuevoSaldo < -1) throw new Error(`El abono ($${monto}) excede el saldo pendiente ($${doc.saldo_pendiente})`);

    await db.update(tabla, docId, {
        total_pagado: nuevoTotalPagado,
        saldo_pendiente: Math.max(0, nuevoSaldo),
        estado_pago: nuevoSaldo <= 0 ? ESTADOS_PAGO.PAGADO : ESTADOS_PAGO.PARCIAL
    });

    const metodo = METODOS_PAGO.find(m => m.id === metodo_pago);
    if (!metodo) throw new Error('Método de pago no válido');

    // Registro Contable del Abono
    if (tipo === 'compra') {
        // Debitar el pasivo, acreditar la caja/banco
        await crearAsiento({
            fecha,
            glosa: `Abono Compra Doc ${doc.numero}: ${doc.nombre} - ${glosa}`,
            tipo_origen: 'pago_compra',
            referencia_id: doc.id,
            lineas: [
                { cuenta_codigo: '2.1.01', debe: monto, haber: 0 },
                { cuenta_codigo: metodo.cuenta, debe: 0, haber: monto }
            ]
        });
    } else {
        // Debitar la caja/banco, acreditar el activo (Cta por cobrar)
        await crearAsiento({
            fecha,
            glosa: `Abono Venta Doc ${doc.numero}: ${doc.nombre} - ${glosa}`,
            tipo_origen: 'pago_venta',
            referencia_id: doc.id,
            lineas: [
                { cuenta_codigo: metodo.cuenta, debe: monto, haber: 0 },
                { cuenta_codigo: '1.1.03', debe: 0, haber: monto }
            ]
        });
    }
}

export async function registrarHonorario(data) {
    const { fecha, rut, profesional, nombre, glosa, bruto, numero, centro_costo_id } = data;
    const finalNombre = profesional || nombre;
    const brutoVal = parseInt(bruto);
    const retencion = Math.round(brutoVal * RETENCION_HONORARIOS_RATE);
    const liquido = brutoVal - retencion;

    const honorario = await db.insert('honorarios', {
        ...data,
        nombre: finalNombre,
        profesional: finalNombre,
        retencion,
        liquido
    });
    await crearAsiento({
        fecha, glosa: `Honorario: ${finalNombre} - ${glosa}`, tipo_origen: 'honorario', referencia_id: honorario.id,
        numero: numero,
        lineas: [
            { cuenta_codigo: '6.2.02', debe: brutoVal, haber: 0, centro_costo_id }, // Honorarios Profesionales
            { cuenta_codigo: '2.1.03', debe: 0, haber: retencion }, // Retenciones Honorarios
            { cuenta_codigo: '1.1.01', debe: 0, haber: liquido } // Caja y Efectivo
        ]
    });
    return honorario;
}

export async function getResumenIVA(periodo) {
    const [compras, ventas] = await Promise.all([db.getAll('libro_compras'), db.getAll('libro_ventas')]);

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
            { cuenta_codigo: '6.1.01', debe: totalImponible, haber: 0 }, // Sueldos y Salarios
            { cuenta_codigo: '6.2.03', debe: haberesNoImponibles - asigFamiliar, haber: 0 }, // Otros Gastos (Asignaciones)
            { cuenta_codigo: '2.1.05', debe: 0, haber: descAFP + descSalud + descCesantia - asigFamiliar }, // Leyes Sociales por Pagar
            { cuenta_codigo: '1.1.05', debe: 0, haber: totalAnticipos }, // Anticipos
            { cuenta_codigo: '2.1.04', debe: 0, haber: liquidoAPagar } // Remuneraciones por Pagar
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

export async function getBalance8Columnas(periodo = null) {
    const [cuentas, asientos, movimientos] = await Promise.all([
        getCuentasDetalle(),
        db.getAll('asientos'),
        db.getAll('asiento_movimientos')
    ]);

    // Enriquecer movimientos con la fecha del asiento padre
    const movsConFecha = movimientos.map(m => {
        const asiento = asientos.find(a => a.id === m.asiento_id);
        return { ...m, fecha: asiento ? asiento.fecha : '' };
    });

    return cuentas.map(c => {
        let movs = movsConFecha.filter(m => m.cuenta_codigo === c.codigo);
        if (periodo) {
            // Filtrar acumulado hasta el periodo dado
            movs = movs.filter(m => m.fecha && m.fecha.substring(0, 7) <= periodo);
        }
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

export async function getBalanceGeneral(periodo = null) {
    const data = await getBalance8Columnas(periodo);
    const activos = data.filter(c => c.activo > 0).map(c => ({ ...c, saldo: c.activo }));
    const pasivos = data.filter(c => c.tipo === 'pasivo' && c.pasivo > 0).map(c => ({ ...c, saldo: c.pasivo }));
    const patrimonio = data.filter(c => c.tipo === 'patrimonio' && c.pasivo > 0).map(c => ({ ...c, saldo: c.pasivo }));
    const totalActivos = activos.reduce((s, c) => s + c.saldo, 0);
    const totalPasivos = pasivos.reduce((s, c) => s + c.saldo, 0);
    const totalPatrimonio = patrimonio.reduce((s, c) => s + c.saldo, 0);
    return { activos, pasivos, patrimonio, totalActivos, totalPasivos, totalPatrimonio, cuadra: Math.abs(totalActivos - (totalPasivos + totalPatrimonio)) < 1 };
}

export async function getEstadoResultados(periodo = null) {
    const data = await getBalance8Columnas(periodo);
    const ingresos = data.filter(c => c.tipo === 'ingreso').map(c => ({ ...c, saldo: c.ganancia }));
    const costos = data.filter(c => c.tipo === 'costo').map(c => ({ ...c, saldo: c.perdida }));
    const gastos = data.filter(c => c.tipo === 'gasto').map(c => ({ ...c, saldo: c.perdida }));
    const totalIngresos = ingresos.reduce((s, c) => s + c.saldo, 0);
    const totalCostos = costos.reduce((s, c) => s + c.saldo, 0);
    const totalGastos = gastos.reduce((s, c) => s + c.saldo, 0);
    return { ingresos, costos, gastos, totalIngresos, totalCostos, totalGastos, utilidadBruta: totalIngresos - totalCostos, utilidadNeta: totalIngresos - totalCostos - totalGastos };
}

/* ---------------- ACTIVO FIJO ---------------- */

export async function generarDepreciacionMes(periodo) {
    const activos = await db.getAll('activo_fijo');
    const movimientosExistentes = await db.getAll('activo_movimientos');

    let totalDepreciacion = 0;
    let cantidad = 0;

    for (const activo of activos) {
        if (activo.estado !== 'Activo') continue;

        // Verificar si ya se depreció este mes
        const yaDepreciado = movimientosExistentes.some(m =>
            m.activo_id === activo.id &&
            m.periodo === periodo &&
            m.tipo === 'depreciacion'
        );
        if (yaDepreciado) continue;

        // Calcular cuota mensual: Valor / Vida Útil
        const cuota = Math.round(activo.valor_compra / activo.vida_util_meses);

        // Registrar movimiento de activo fijo
        const mov = await db.insert('activo_movimientos', {
            activo_id: activo.id,
            tipo: 'depreciacion',
            monto: cuota,
            periodo,
            fecha: `${periodo}-28`
        });

        // Generar Asiento Contable
        await crearAsiento({
            fecha: `${periodo}-28`,
            glosa: `Depreciación Mensual: ${activo.nombre} (${activo.codigo})`,
            tipo_origen: 'depreciacion',
            referencia_id: mov.id,
            lineas: [
                { cuenta_codigo: '6.2.04', debe: cuota, haber: 0, centro_costo_id: activo.centro_costo_id }, // Gasto Depreciación
                { cuenta_codigo: '1.2.99', debe: 0, haber: cuota } // Depreciación Acumulada (Correctora de Activo)
            ]
        });

        totalDepreciacion += cuota;
        cantidad++;
    }

    return { cantidad, totalDepreciacion };
}
/* ---------------- TESORERÍA Y BANCOS ---------------- */

export async function registrarAporteCapital({ fecha, socio, monto, cuenta_destino }) {
    const aporte = await db.insert('aportes_capital', { fecha, socio, monto, metodo_pago: cuenta_destino });

    await crearAsiento({
        fecha,
        glosa: `Aporte de Capital: ${socio}`,
        tipo_origen: 'aporte_capital',
        referencia_id: aporte.id,
        lineas: [
            { cuenta_codigo: cuenta_destino, debe: monto, haber: 0 }, // Entra a Caja o Banco
            { cuenta_codigo: '3.1.01', debe: 0, haber: monto }   // Capital Social
        ]
    });
    return aporte;
}

export async function registrarPrestamoBancario({ entidad, monto, cuotas, tasa, fecha, cuenta_banco }) {
    const prestamo = await db.insert('prestamos', {
        nombre_entidad: entidad,
        monto_principal: monto,
        total_cuotas: cuotas,
        tasa_interes_anual: tasa,
        fecha_inicio: fecha,
        banco_cuenta: cuenta_banco
    });

    // 1. Asiento de Recepción del Préstamo
    await crearAsiento({
        fecha,
        glosa: `Recepción Préstamo Bancario: ${entidad}`,
        tipo_origen: 'prestamo',
        referencia_id: prestamo.id,
        lineas: [
            { cuenta_codigo: cuenta_banco, debe: monto, haber: 0 },
            { cuenta_codigo: '2.1.06', debe: 0, haber: monto } // Préstamos Bancarios CP (Simplificado a CP por ahora)
        ]
    });

    // 2. Generar Tabla de Amortización (Lineal simple p/ ejemplo)
    const interesMensual = (tasa / 100) / 12;
    const cuotaMensual = Math.round((monto * interesMensual) / (1 - Math.pow(1 + interesMensual, -cuotas)));

    let saldoPendiente = monto;
    for (let i = 1; i <= cuotas; i++) {
        const interes = Math.round(saldoPendiente * interesMensual);
        const capital = cuotaMensual - interes;
        saldoPendiente -= capital;

        await db.insert('prestamos_cuotas', {
            prestamo_id: prestamo.id,
            num_cuota: i,
            fecha_vencimiento: new Date(new Date(fecha).setMonth(new Date(fecha).getMonth() + i)).toISOString().split('T')[0],
            capital,
            interes,
            total_cuota: cuotaMensual,
            estado: 'pendiente'
        });
    }

    return prestamo;
}

export async function pagarCuotaPrestamo({ cuotaId, fecha, cuenta_banco }) {
    const cuota = await db.getById('prestamos_cuotas', cuotaId);
    if (!cuota) throw new Error('Cuota no encontrada');

    // Registrar el Asiento del Pago
    const asiento = await crearAsiento({
        fecha,
        glosa: `Pago Cuota ${cuota.num_cuota} Préstamo - Amortización e Interés`,
        tipo_origen: 'pago_prestamo',
        referencia_id: cuota.id,
        lineas: [
            { cuenta_codigo: '2.1.06', debe: cuota.capital, haber: 0 }, // Reduce deuda
            { cuenta_codigo: '6.3.01', debe: cuota.interes, haber: 0 }, // Gasto financiero
            { cuenta_codigo: cuenta_banco, debe: 0, haber: cuota.total_cuota } // Pago efectivo
        ]
    });

    await db.update('prestamos_cuotas', cuotaId, { estado: 'pagado', asiento_id: asiento.id });
}

export async function importarCartola(movimientos) {
    for (const mov of movimientos) {
        await db.insert('bancos_cartola', mov);
    }
}

export async function conciliarMovimiento(cartolaId, asientoId) {
    await db.update('bancos_cartola', cartolaId, {
        conciliado: true,
        asiento_id: asientoId
    });
}

/* ---------------- HONORARIOS QUERIES ---------------- */

export async function getHonorarios(periodo = null) {
    let items = await db.getAll('honorarios');
    if (periodo) {
        items = items.filter(h => h.fecha && h.fecha.startsWith(periodo));
    }
    return items;
}

/* ---------------- TRABAJADORES QUERIES ---------------- */

export async function getTrabajadores() {
    return await db.getAll('trabajadores');
}

export async function calcularLiquidacion(trabajador, periodo) {
    const sueldo_base = parseFloat(trabajador.sueldo_base) || 0;
    const gratificacion = Math.round(sueldo_base * 0.25);
    const total_imponible = sueldo_base + gratificacion;

    const afp_tasa = parseFloat(trabajador.afp_tasa || 11.45) / 100;
    const descuento_afp = Math.round(total_imponible * afp_tasa);
    const descuento_salud = Math.round(total_imponible * TASA_SALUD_FONASA);
    const descuento_afc = Math.round(total_imponible * TASA_AFC_TRABAJADOR);

    const total_descuentos = descuento_afp + descuento_salud + descuento_afc;
    const alcance_liquido = total_imponible - total_descuentos;

    return {
        trabajador_id: trabajador.id,
        nombre: trabajador.nombre,
        rut: trabajador.rut,
        periodo,
        sueldo_base,
        gratificacion,
        total_imponible,
        descuento_afp,
        descuento_salud,
        descuento_afc,
        total_descuentos,
        alcance_liquido
    };
}

/* ---------------- PUENTE ERP → CONTABILIDAD ---------------- */

export async function sincronizarOperacionesERP(ventasERP = [], comprasERP = []) {
    let count = 0;

    // Get existing accounting entries to avoid duplicates
    const existingEntries = await db.getAll('asientos');
    const existingRefs = new Set(existingEntries.map(e => `${e.tipo_origen}_${e.referencia_id}`));

    // Sync Sales
    for (const venta of ventasERP) {
        const key = `erp_venta_${venta.id}`;
        if (existingRefs.has(key)) continue;

        try {
            const total = parseFloat(venta.total) || 0;
            const neto = Math.round(total / (1 + IVA_RATE));
            const iva = total - neto;

            await crearAsiento({
                fecha: venta.date || venta.created_at?.substring(0, 10) || new Date().toISOString().substring(0, 10),
                glosa: `Venta ERP #${venta.id} - ${venta.client_name || 'Cliente'}`,
                periodo: (venta.date || venta.created_at?.substring(0, 7) || new Date().toISOString().substring(0, 7)),
                tipo_origen: 'erp_venta',
                referencia_id: venta.id,
                lineas: [
                    { cuenta_codigo: '1.1.01', debe: total, haber: 0 },
                    { cuenta_codigo: '4.1.01', debe: 0, haber: neto },
                    { cuenta_codigo: '2.1.02', debe: 0, haber: iva }
                ]
            });
            count++;
        } catch (e) {
            console.warn(`Sync venta ${venta.id} falló:`, e.message);
        }
    }

    // Sync Purchases
    for (const compra of comprasERP) {
        const key = `erp_compra_${compra.id}`;
        if (existingRefs.has(key)) continue;

        try {
            const total = parseFloat(compra.total) || 0;
            const neto = Math.round(total / (1 + IVA_RATE));
            const iva = total - neto;

            await crearAsiento({
                fecha: compra.date || compra.created_at?.substring(0, 10) || new Date().toISOString().substring(0, 10),
                glosa: `Compra ERP #${compra.id} - ${compra.provider_name || 'Proveedor'}`,
                periodo: (compra.date || compra.created_at?.substring(0, 7) || new Date().toISOString().substring(0, 7)),
                tipo_origen: 'erp_compra',
                referencia_id: compra.id,
                lineas: [
                    { cuenta_codigo: '5.1.01', debe: neto, haber: 0 },
                    { cuenta_codigo: '1.1.06', debe: iva, haber: 0 },
                    { cuenta_codigo: '2.1.01', debe: 0, haber: total }
                ]
            });
            count++;
        } catch (e) {
            console.warn(`Sync compra ${compra.id} falló:`, e.message);
        }
    }

    return count;
}
