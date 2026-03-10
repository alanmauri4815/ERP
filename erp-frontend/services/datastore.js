/* ============================================
   SUPABASE DATASTORE — Motor de Datos Real
   Multi-Tenant: filtra por empresa_id
   ============================================ */

import { supabase } from '../config/supabase.js';

class DataStore {
    constructor() {
        this.listeners = [];
        this._empresa_id = null;
    }

    // --- Multi-Tenant: obtener empresa_id del usuario logueado ---
    get empresa_id() {
        if (this._empresa_id) return this._empresa_id;
        try {
            const user = JSON.parse(localStorage.getItem('erp_user'));
            return user?.empresa_id || 1;
        } catch {
            return 1;
        }
    }

    set empresa_id(val) {
        this._empresa_id = val;
    }

    // --- Suscripciones para actualizar la UI ---
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    notify() {
        this.listeners.forEach(callback => callback());
    }

    // --- Operaciones de Lectura (Read) ---
    async getAll(table) {
        let query = supabase.from(table).select('*');
        const tableName = table ? String(table).trim().toLowerCase() : '';

        // El plan de cuentas es global (compartido), el resto es multi-tenant
        if (tableName !== 'plan_cuentas' && tableName !== 'plan-cuentas') {
            query = query.eq('empresa_id', this.empresa_id);
        } else {
            console.info(`[DataStore] Acceso GLOBAL detectado para tabla: ${tableName}`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
            console.error(`Error al leer ${table}:`, error.message);
            return [];
        }
        return data || [];
    }

    async getById(table, id) {
        let query = supabase.from(table).select('*').eq('id', id);
        const tableName = table ? String(table).trim().toLowerCase() : '';
        
        if (tableName !== 'plan_cuentas') {
            query = query.eq('empresa_id', this.empresa_id);
        }
        
        const { data, error } = await query.single();

        if (error) {
            console.error(`Error al leer ${table} por ID:`, error.message);
            return null;
        }
        return data;
    }

    // --- Operaciones de Escritura (Create) ---
    async insert(table, item) {
        const tableName = table ? String(table).trim().toLowerCase() : '';
        // Inyectar empresa_id automáticamente si la tabla no es global
        const itemToInsert = (tableName === 'plan_cuentas') ? item : { ...item, empresa_id: this.empresa_id };
        
        const { data, error } = await supabase
            .from(table)
            .insert([itemToInsert])
            .select();

        if (error) {
            console.error(`Error al insertar en ${table}:`, error.message);
            throw error;
        }
        this.notify();
        return data[0];
    }

    // --- Operaciones de Actualización (Update) ---
    async update(table, id, updates) {
        let query = supabase.from(table).update(updates).eq('id', id);
        const tableName = table ? String(table).trim().toLowerCase() : '';
        
        if (tableName !== 'plan_cuentas') {
            query = query.eq('empresa_id', this.empresa_id);
        }
        
        const { data, error } = await query.select();

        if (error) {
            console.error(`Error al actualizar ${table}:`, error.message);
            throw error;
        }
        this.notify();
        return data[0];
    }

    // --- Operaciones de Eliminación (Delete) ---
    async delete(table, id) {
        let query = supabase.from(table).delete().eq('id', id);
        const tableName = table ? String(table).trim().toLowerCase() : '';
        
        if (tableName !== 'plan_cuentas') {
            query = query.eq('empresa_id', this.empresa_id);
        }
        
        const { error } = await query;

        if (error) {
            console.error(`Error al eliminar en ${table}:`, error.message);
            throw error;
        }
        this.notify();
        return true;
    }

    // --- Consultas especiales ---
    async query(table, column, value) {
        let query = supabase.from(table).select('*').eq(column, value);
        const tableName = table ? String(table).trim().toLowerCase() : '';
        
        if (tableName !== 'plan_cuentas') {
            query = query.eq('empresa_id', this.empresa_id);
        }
        
        const { data, error } = await query;

        if (error) {
            console.error(`Error en query sobre ${table}:`, error.message);
            return [];
        }
        return data;
    }
}

export const db = new DataStore();
