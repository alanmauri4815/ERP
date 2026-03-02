/* ============================================
   SUPABASE DATASTORE — Motor de Datos Real
   ============================================ */

import { supabase } from '../config/supabase.js';

class DataStore {
    constructor() {
        this.listeners = [];
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
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error(`Error al leer ${table}:`, error.message);
            return [];
        }
        return data;
    }

    async getById(table, id) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error(`Error al leer ${table} por ID:`, error.message);
            return null;
        }
        return data;
    }

    // --- Operaciones de Escritura (Create) ---
    async insert(table, item) {
        const { data, error } = await supabase
            .from(table)
            .insert([item])
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
        const { data, error } = await supabase
            .from(table)
            .update(updates)
            .eq('id', id)
            .select();

        if (error) {
            console.error(`Error al actualizar ${table}:`, error.message);
            throw error;
        }
        this.notify();
        return data[0];
    }

    // --- Operaciones de Eliminación (Delete) ---
    async delete(table, id) {
        const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', id);

        if (error) {
            console.error(`Error al eliminar en ${table}:`, error.message);
            throw error;
        }
        this.notify();
        return true;
    }

    // --- Consultas especiales ---
    async query(table, column, value) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq(column, value);

        if (error) {
            console.error(`Error en query sobre ${table}:`, error.message);
            return [];
        }
        return data;
    }
}

export const db = new DataStore();
