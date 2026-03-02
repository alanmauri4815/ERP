import { db } from './datastore.js';

// Constantes Legales Chile 2024-2025
const IVA_RATE = 0.19;
const RETENCION_HONORARIOS = 0.1375;
const TASA_SALUD_FONASA = 0.07;

export async function getCuentas() {
    return await db.getAll('plan_cuentas');
}

/* --- MOTOR DE HONORARIOS --- */
export async function registrarHonorario(data) {
    const bruto = parseInt(data.bruto);
    const retencion = Math.round(bruto * RETENCION_HONORARIOS);
    const liquido = bruto - retencion;

    const record = {
        ...data,
        bruto,
        retencion,
        liquido
    };

    return await db.insert('honorarios', record);
}

/* --- MOTOR DE REMUNERACIONES --- */
export async function calcularLiquidacion(trabajador, periodo) {
    const sueldoBase = parseInt(trabajador.sueldo_base);

    // Gratificación Legal (25% con tope 4.75 IMM)
    const gratificacion = Math.min(Math.round(sueldoBase * 0.25), 182000); // Ejemplo tope

    const imponible = sueldoBase + gratificacion;
    const descAFP = Math.round(imponible * (trabajador.afp_tasa / 100));
    const descSalud = Math.round(imponible * TASA_SALUD_FONASA);

    const liquido = imponible - descAFP - descSalud + parseInt(trabajador.movilizacion || 0) + parseInt(trabajador.colacion || 0);

    return {
        trabajador_id: trabajador.id,
        periodo,
        sueldo_base: sueldoBase,
        gratificacion,
        total_imponible: imponible,
        descuento_afp: descAFP,
        descuento_salud: descSalud,
        alcance_liquido: liquido
    };
}

export async function getHonorarios() {
    return await db.getAll('honorarios');
}

export async function getTrabajadores() {
    return await db.getAll('trabajadores');
}
