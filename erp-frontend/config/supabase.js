/* ============================================
   CONFIGURACIÓN SUPABASE
   ============================================ */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl.includes('TU_PROYECTO_AQUI')) {
    console.warn('⚠️ Supabase URL no configurada correctamente en el archivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
