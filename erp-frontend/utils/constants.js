/* ============================================
   CONSTANTES — Legislación Chilena / SII / TGR
   ============================================ */

// IVA y Retenciones
export const IVA_RATE = 0.19;
export const RETENCION_HONORARIOS_RATE = 0.1375; // 13.75% para 2025-2026 en Chile

// Impuesto de Primera Categoría
export const TASA_PRIMERA_CATEGORIA = {
  GENERAL: 0.27,     // Régimen general (Semi-Integrado)
  PRO_PYME: 0.25,    // Régimen Pro-Pyme
};

// Tramos Impuesto Global Complementario / 2a Categoría 2026
export const TRAMOS_RENTA = [
  { desde: 0, hasta: 13.5, tasa: 0, rebaja: 0 },
  { desde: 13.5, hasta: 30, tasa: 0.04, rebaja: 0.54 },
  { desde: 30, hasta: 50, tasa: 0.08, rebaja: 1.74 },
  { desde: 50, hasta: 70, tasa: 0.135, rebaja: 4.49 },
  { desde: 70, hasta: 90, tasa: 0.23, rebaja: 11.14 },
  { desde: 90, hasta: 120, tasa: 0.304, rebaja: 17.8 },
  { desde: 120, hasta: 310, tasa: 0.35, rebaja: 23.32 },
  { desde: 310, hasta: Infinity, tasa: 0.40, rebaja: 38.82 },
];

export const PPM_TASA_BASE = 0.01;

// Tipos de documento tributario
export const TIPOS_DOCUMENTO = [
  { codigo: 33, nombre: 'Factura Electrónica' },
  { codigo: 34, nombre: 'Factura No Afecta o Exenta Electrónica' },
  { codigo: 39, nombre: 'Boleta Electrónica' },
  { codigo: 41, nombre: 'Boleta Exenta Electrónica' },
  { codigo: 56, nombre: 'Nota de Débito Electrónica' },
  { codigo: 61, nombre: 'Nota de Crédito Electrónica' },
  { codigo: 52, nombre: 'Guía de Despacho Electrónica' },
  { codigo: 110, nombre: 'Factura de Exportación Electrónica' },
];

export const TIPOS_CUENTA = {
  ACTIVO: 'activo',
  PASIVO: 'pasivo',
  PATRIMONIO: 'patrimonio',
  INGRESO: 'ingreso',
  COSTO: 'costo',
  GASTO: 'gasto',
};

export const NATURALEZA_CUENTA = {
  activo: 'deudora',
  pasivo: 'acreedora',
  patrimonio: 'acreedora',
  ingreso: 'acreedora',
  costo: 'deudora',
  gasto: 'deudora',
};

// PLAN DE CUENTAS COMPLETO (Estructura Profesional Chile)
export const PLAN_CUENTAS_DEFAULT = [
  // 1. ACTIVOS
  { codigo: '1', nombre: 'ACTIVOS', tipo: 'activo', nivel: 1, padre: null },
  { codigo: '1.1', nombre: 'Activo Corriente', tipo: 'activo', nivel: 2, padre: '1' },
  { codigo: '1.1.01', nombre: 'Caja y Efectivo', tipo: 'activo', nivel: 3, padre: '1.1' },
  { codigo: '1.1.02', nombre: 'Bancos', tipo: 'activo', nivel: 3, padre: '1.1' },
  { codigo: '1.1.03', nombre: 'Cuentas por Cobrar Clientes', tipo: 'activo', nivel: 3, padre: '1.1' },
  { codigo: '1.1.04', nombre: 'Documentos por Cobrar', tipo: 'activo', nivel: 3, padre: '1.1' },
  { codigo: '1.1.05', nombre: 'Anticipos a Proveedores', tipo: 'activo', nivel: 3, padre: '1.1' },
  { codigo: '1.1.06', nombre: 'IVA Crédito Fiscal', tipo: 'activo', nivel: 3, padre: '1.1' },
  { codigo: '1.1.07', nombre: 'PPM Pagos Provisionales', tipo: 'activo', nivel: 3, padre: '1.1' },
  { codigo: '1.1.08', nombre: 'Remanente de IVA', tipo: 'activo', nivel: 3, padre: '1.1' },
  { codigo: '1.1.09', nombre: 'Existencias de Mercaderías', tipo: 'activo', nivel: 3, padre: '1.1' },

  { codigo: '1.2', nombre: 'Activo No Corriente (Inmovilizado)', tipo: 'activo', nivel: 2, padre: '1' },
  { codigo: '1.2.01', nombre: 'Terrenos', tipo: 'activo', nivel: 3, padre: '1.2' },
  { codigo: '1.2.02', nombre: 'Edificios e Instalaciones', tipo: 'activo', nivel: 3, padre: '1.2' },
  { codigo: '1.2.03', nombre: 'Maquinaria y Equipos', tipo: 'activo', nivel: 3, padre: '1.2' },
  { codigo: '1.2.04', nombre: 'Vehículos', tipo: 'activo', nivel: 3, padre: '1.2' },
  { codigo: '1.2.05', nombre: 'Equipos de Computación', tipo: 'activo', nivel: 3, padre: '1.2' },
  { codigo: '1.2.06', nombre: 'Muebles y Útiles', tipo: 'activo', nivel: 3, padre: '1.2' },
  { codigo: '1.2.99', nombre: '(-) Depreciación Acumulada', tipo: 'activo', nivel: 3, padre: '1.2' },

  // 2. PASIVOS
  { codigo: '2', nombre: 'PASIVOS', tipo: 'pasivo', nivel: 1, padre: null },
  { codigo: '2.1', nombre: 'Pasivo Corriente', tipo: 'pasivo', nivel: 2, padre: '2' },
  { codigo: '2.1.01', nombre: 'Cuentas por Pagar Proveedores', tipo: 'pasivo', nivel: 3, padre: '2.1' },
  { codigo: '2.1.02', nombre: 'IVA Débito Fiscal', tipo: 'pasivo', nivel: 3, padre: '2.1' },
  { codigo: '2.1.03', nombre: 'Retenciones Honorarios (13.75%)', tipo: 'pasivo', nivel: 3, padre: '2.1' },
  { codigo: '2.1.04', nombre: 'Remuneraciones por Pagar', tipo: 'pasivo', nivel: 3, padre: '2.1' },
  { codigo: '2.1.05', nombre: 'Leyes Sociales por Pagar (Previred)', tipo: 'pasivo', nivel: 3, padre: '2.1' },
  { codigo: '2.1.06', nombre: 'Préstamos Bancarios CP', tipo: 'pasivo', nivel: 3, padre: '2.1' },
  { codigo: '2.1.07', nombre: 'Impuesto Renta por Pagar', tipo: 'pasivo', nivel: 3, padre: '2.1' },
  { codigo: '2.1.08', nombre: 'Provisiones y Otros Pasivos', tipo: 'pasivo', nivel: 3, padre: '2.1' },

  { codigo: '2.2', nombre: 'Pasivo No Corriente', tipo: 'pasivo', nivel: 2, padre: '2' },
  { codigo: '2.2.01', nombre: 'Préstamos Bancarios Largo Plazo', tipo: 'pasivo', nivel: 3, padre: '2.2' },
  { codigo: '2.2.02', nombre: 'Hipotecas por Pagar', tipo: 'pasivo', nivel: 3, padre: '2.2' },

  // 3. PATRIMONIO
  { codigo: '3', nombre: 'PATRIMONIO', tipo: 'patrimonio', nivel: 1, padre: null },
  { codigo: '3.1', nombre: 'Capital Pagado', tipo: 'patrimonio', nivel: 2, padre: '3' },
  { codigo: '3.1.01', nombre: 'Capital Social', tipo: 'patrimonio', nivel: 3, padre: '3.1' },
  { codigo: '3.2', nombre: 'Resultados Acumulados', tipo: 'patrimonio', nivel: 2, padre: '3' },
  { codigo: '3.2.01', nombre: 'Utilidades Retenidas', tipo: 'patrimonio', nivel: 3, padre: '3.2' },
  { codigo: '3.2.02', nombre: 'Resultados Ejercicios Anteriores', tipo: 'patrimonio', nivel: 3, padre: '3.2' },
  { codigo: '3.3', nombre: 'Resultado del Ejercicio', tipo: 'patrimonio', nivel: 2, padre: '3' },
  { codigo: '3.3.01', nombre: 'Utilidad o Pérdida del Ejercicio', tipo: 'patrimonio', nivel: 3, padre: '3.3' },
  { codigo: '3.4', nombre: 'Corrección Monetaria Patrimonio', tipo: 'patrimonio', nivel: 2, padre: '3' },
  { codigo: '3.4.01', nombre: 'Revalorización de Capital', tipo: 'patrimonio', nivel: 3, padre: '3.4' },

  // 4. INGRESOS
  { codigo: '4', nombre: 'INGRESOS', tipo: 'ingreso', nivel: 1, padre: null },
  { codigo: '4.1', nombre: 'Ingresos por Ventas/Servicios', tipo: 'ingreso', nivel: 2, padre: '4' },
  { codigo: '4.1.01', nombre: 'Ventas Afectas', tipo: 'ingreso', nivel: 3, padre: '4.1' },
  { codigo: '4.1.02', nombre: 'Ventas Exentas', tipo: 'ingreso', nivel: 3, padre: '4.1' },
  { codigo: '4.1.03', nombre: 'Ingresos por Servicios', tipo: 'ingreso', nivel: 3, padre: '4.1' },
  { codigo: '4.2', nombre: 'Otros Ingresos Fuera de Explotación', tipo: 'ingreso', nivel: 2, padre: '4' },
  { codigo: '4.2.01', nombre: 'Intereses Ganados', tipo: 'ingreso', nivel: 3, padre: '4.2' },
  { codigo: '4.2.02', nombre: 'Corrección Monetaria Saldo Acreedor', tipo: 'ingreso', nivel: 3, padre: '4.2' },

  // 5. COSTOS
  { codigo: '5', nombre: 'COSTOS DE EXPLOTACIÓN', tipo: 'costo', nivel: 1, padre: null },
  { codigo: '5.1', nombre: 'Costo de Ventas y Servicios', tipo: 'costo', nivel: 2, padre: '5' },
  { codigo: '5.1.01', nombre: 'Costo de Mercaderías Vendidas', tipo: 'costo', nivel: 3, padre: '5.1' },
  { codigo: '5.1.02', nombre: 'Costo de Insumos / Producción', tipo: 'costo', nivel: 3, padre: '5.1' },

  // 6. GASTOS
  { codigo: '6', nombre: 'GASTOS', tipo: 'gasto', nivel: 1, padre: null },
  { codigo: '6.1', nombre: 'Gastos de Remuneraciones', tipo: 'gasto', nivel: 2, padre: '6' },
  { codigo: '6.1.01', nombre: 'Sueldos y Salarios', tipo: 'gasto', nivel: 3, padre: '6.1' },
  { codigo: '6.1.02', nombre: 'Gratificaciones', tipo: 'gasto', nivel: 3, padre: '6.1' },
  { codigo: '6.1.03', nombre: 'Cotizaciones Previsionales (Aporte Patronal)', tipo: 'gasto', nivel: 3, padre: '6.1' },

  { codigo: '6.2', nombre: 'Gastos de Administración', tipo: 'gasto', nivel: 2, padre: '6' },
  { codigo: '6.2.01', nombre: 'Arriendos', tipo: 'gasto', nivel: 3, padre: '6.2' },
  { codigo: '6.2.02', nombre: 'Honorarios Profesionales', tipo: 'gasto', nivel: 3, padre: '6.2' },
  { codigo: '6.2.03', nombre: 'Servicios Básicos (Luz, Agua, Gas)', tipo: 'gasto', nivel: 3, padre: '6.2' },
  { codigo: '6.2.04', nombre: 'Depreciación del Ejercicio', tipo: 'gasto', nivel: 3, padre: '6.2' },
  { codigo: '6.2.05', nombre: 'Seguros', tipo: 'gasto', nivel: 3, padre: '6.2' },
  { codigo: '6.2.06', nombre: 'Artículos de Oficina y Aseo', tipo: 'gasto', nivel: 3, padre: '6.2' },

  { codigo: '6.3', nombre: 'Otros Gastos y Gastos Financieros', tipo: 'gasto', nivel: 2, padre: '6' },
  { codigo: '6.3.01', nombre: 'Intereses Pagados', tipo: 'gasto', nivel: 3, padre: '6.3' },
  { codigo: '6.3.02', nombre: 'Comisiones Bancarias', tipo: 'gasto', nivel: 3, padre: '6.3' },
  { codigo: '6.3.03', nombre: 'Corrección Monetaria Saldo Deudor', tipo: 'gasto', nivel: 3, padre: '6.3' },
  { codigo: '6.3.04', nombre: 'Impuestos y Multas', tipo: 'gasto', nivel: 3, padre: '6.3' },
];

export const VIDAS_UTILES_SII = [
  { categoria: 'Edificios', vidaUtil: 50, grupo: 'Inmuebles' },
  { categoria: 'Instalaciones', vidaUtil: 20, grupo: 'Inmuebles' },
  { categoria: 'Maquinaria industrial', vidaUtil: 15, grupo: 'Maquinaria' },
  { categoria: 'Equipos de producción', vidaUtil: 10, grupo: 'Maquinaria' },
  { categoria: 'Herramientas pesadas', vidaUtil: 8, grupo: 'Maquinaria' },
  { categoria: 'Herramientas livianas', vidaUtil: 3, grupo: 'Maquinaria' },
  { categoria: 'Vehículos de carga', vidaUtil: 7, grupo: 'Vehículos' },
  { categoria: 'Automóviles', vidaUtil: 7, grupo: 'Vehículos' },
  { categoria: 'Muebles y enseres', vidaUtil: 7, grupo: 'Mobiliario' },
  { categoria: 'Equipos de computación', vidaUtil: 6, grupo: 'Tecnología' },
  { categoria: 'Software', vidaUtil: 6, grupo: 'Tecnología' },
  { categoria: 'Envases y embalajes', vidaUtil: 4, grupo: 'Otros' },
];

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const TIPOS_ASIENTO = [
  { value: 'apertura', label: 'Apertura' },
  { value: 'operacion', label: 'Operación' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'cierre', label: 'Cierre' },
  { value: 'depreciacion', label: 'Depreciación' },
  { value: 'correccion_monetaria', label: 'Corrección Monetaria' },
];

export const ESTADO_PERIODO = {
  ABIERTO: 'abierto',
  CERRADO: 'cerrado',
};

// Parámetros Previsionales 2026
export const SUELDO_MINIMO = 510000;
export const TASA_SALUD_FONASA = 0.07; // 7%
export const TASA_AFC_TRABAJADOR = 0.006; // 0.6% (Contrato Indefinido)

export const AFPS = [
  { nombre: 'Capital', tasa: 0.1144 },
  { nombre: 'Cuprum', tasa: 0.1144 },
  { nombre: 'Habitat', tasa: 0.1127 },
  { nombre: 'PlanVital', tasa: 0.1116 },
  { nombre: 'ProVida', tasa: 0.1145 },
  { nombre: 'Modelo', tasa: 0.1058 },
  { nombre: 'Uno', tasa: 0.1069 },
];

