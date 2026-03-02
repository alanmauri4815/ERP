/* ============================================
   INDICADORES ECONÓMICOS — mindicador.cl API
   UF, UTM, IPC, Dólar
   ============================================ */

const API_BASE = 'https://mindicador.cl/api';

/**
 * Obtiene los indicadores del día actual
 */
export async function getIndicadoresHoy() {
    try {
        const response = await fetch(API_BASE);
        if (!response.ok) throw new Error('Error al obtener indicadores');
        const data = await response.json();
        return {
            uf: data.uf?.valor || null,
            utm: data.utm?.valor || null,
            dolar: data.dolar?.valor || null,
            euro: data.euro?.valor || null,
            ipc: data.ipc?.valor || null,
            fecha: data.fecha || new Date().toISOString(),
        };
    } catch (err) {
        console.warn('No se pudieron obtener indicadores:', err.message);
        return { uf: null, utm: null, dolar: null, euro: null, ipc: null, fecha: null };
    }
}

/**
 * Obtiene un indicador específico por fecha
 * @param {string} tipo - uf, utm, ipc, dolar, euro
 * @param {string} fecha - dd-mm-yyyy
 */
export async function getIndicadorPorFecha(tipo, fecha) {
    try {
        const response = await fetch(`${API_BASE}/${tipo}/${fecha}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.serie?.[0]?.valor || null;
    } catch {
        return null;
    }
}

/**
 * Obtiene serie histórica de un indicador para un año
 * @param {string} tipo - uf, utm, ipc, dolar
 * @param {number} anio - Año
 */
export async function getSerieAnual(tipo, anio) {
    try {
        const response = await fetch(`${API_BASE}/${tipo}/${anio}`);
        if (!response.ok) return [];
        const data = await response.json();
        return (data.serie || []).map(s => ({
            fecha: s.fecha,
            valor: s.valor,
        }));
    } catch {
        return [];
    }
}

/**
 * Calcula factor de corrección monetaria entre dos fechas
 * basado en variación IPC
 */
export async function calcularFactorCM(fechaInicio, fechaFin) {
    const mesInicio = fechaInicio.substring(0, 7); // YYYY-MM
    const mesFin = fechaFin.substring(0, 7);

    if (mesInicio === mesFin) return 1;

    try {
        const [anioI, mesI] = mesInicio.split('-').map(Number);
        const [anioF, mesF] = mesFin.split('-').map(Number);

        // Get IPC values
        const serieIPC = await getSerieAnual('ipc', anioI);
        const serieIPC2 = anioI !== anioF ? await getSerieAnual('ipc', anioF) : serieIPC;

        // Simplified: use ratio of accumulated IPC
        let factor = 1;
        const allIPC = [...serieIPC, ...serieIPC2].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        for (const ipc of allIPC) {
            const ipcDate = new Date(ipc.fecha);
            const ipcYM = `${ipcDate.getFullYear()}-${String(ipcDate.getMonth() + 1).padStart(2, '0')}`;
            if (ipcYM > mesInicio && ipcYM <= mesFin) {
                factor *= (1 + ipc.valor / 100);
            }
        }

        return factor;
    } catch {
        return 1;
    }
}

/**
 * Actualiza los indicadores en el topbar
 */
export function updateIndicadoresUI(indicadores) {
    const ufEl = document.querySelector('#ind-uf span:last-child');
    const utmEl = document.querySelector('#ind-utm span:last-child');
    const dolarEl = document.querySelector('#ind-dolar span:last-child');

    if (ufEl && indicadores.uf) {
        ufEl.textContent = `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(indicadores.uf)}`;
    }
    if (utmEl && indicadores.utm) {
        utmEl.textContent = `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(indicadores.utm)}`;
    }
    if (dolarEl && indicadores.dolar) {
        dolarEl.textContent = `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(indicadores.dolar)}`;
    }
}
