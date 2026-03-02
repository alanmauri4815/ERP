/* ============================================
   UTILIDADES — Formateo y Validación
   ============================================ */

/**
 * Formatea un número como moneda chilena (CLP)
 */
export function formatCLP(amount) {
    if (amount == null || isNaN(amount)) return '$0';
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

/**
 * Formatea un número con separador de miles chileno
 */
export function formatNumber(num, decimals = 0) {
    if (num == null || isNaN(num)) return '0';
    return new Intl.NumberFormat('es-CL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(num);
}

/**
 * Formatea UF (con 2 decimales)
 */
export function formatUF(value) {
    if (value == null || isNaN(value)) return 'UF 0,00';
    return `UF ${formatNumber(value, 2)}`;
}

/**
 * Formatea fecha en formato chileno dd/mm/yyyy
 */
export function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

/**
 * Formatea fecha corta (dd/mm)
 */
export function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
}

/**
 * Formatea un porcentaje
 */
export function formatPercent(value, decimals = 1) {
    if (value == null || isNaN(value)) return '0%';
    return `${formatNumber(value * 100, decimals)}%`;
}

/**
 * Valida RUT chileno (con módulo 11)
 */
export function validarRUT(rut) {
    if (!rut || typeof rut !== 'string') return false;
    rut = rut.replace(/\./g, '').replace(/-/g, '').trim().toUpperCase();
    if (rut.length < 2) return false;

    const body = rut.slice(0, -1);
    const dv = rut.slice(-1);

    if (!/^\d+$/.test(body)) return false;

    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i]) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const expectedDV = 11 - (sum % 11);
    let calculated;
    if (expectedDV === 11) calculated = '0';
    else if (expectedDV === 10) calculated = 'K';
    else calculated = expectedDV.toString();

    return dv === calculated;
}

/**
 * Formatea un RUT chileno (XX.XXX.XXX-X)
 */
export function formatRUT(rut) {
    if (!rut) return '';
    rut = rut.replace(/\./g, '').replace(/-/g, '').trim();
    if (rut.length < 2) return rut;

    const body = rut.slice(0, -1);
    const dv = rut.slice(-1);

    const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formatted}-${dv}`;
}

/**
 * Genera un ID único
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Parsea string de moneda chilena a número
 */
export function parseCLP(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    return parseInt(str.replace(/[^0-9-]/g, ''), 10) || 0;
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD
 */
export function today() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Debounce
 */
export function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

/**
 * Deep clone
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Calcula el neto a partir del total (con IVA 19%)
 */
export function calcularNeto(total) {
    return Math.round(total / 1.19);
}

/**
 * Calcula el IVA a partir del neto
 */
export function calcularIVA(neto) {
    return Math.round(neto * 0.19);
}
